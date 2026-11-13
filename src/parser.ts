import { Clause, Expr, Program, Stmt } from './ast';
import { Span, closest, syntaxError } from './errors';
import { Token, lex, span } from './lexer';

export const RESERVED = new Set([
  'set', 'to', 'change', 'by', 'say', 'if', 'then', 'otherwise', 'else', 'end', 'repeat', 'times', 'while',
  'until', 'forever', 'for', 'each', 'in', 'from', 'give', 'back', 'stop', 'skip', 'wait', 'every', 'when',
  'draw', 'background', 'clear', 'play', 'add', 'remove', 'hide', 'show', 'new', 'and', 'or', 'not', 'is',
  'random', 'any', 'holding', 'true', 'false', 'nothing', 'mod', 'of', 'touches', 'contains',
]);

const STATEMENTS = ['say', 'set', 'change', 'if', 'repeat', 'for', 'to', 'give', 'stop', 'skip', 'wait', 'every',
  'when', 'draw', 'background', 'clear', 'play', 'add', 'remove', 'hide', 'show', 'new'];

/** Words people bring from other languages, and what Once says instead. */
const FROM_ELSEWHERE: Record<string, string> = {
  print: 'say', log: 'say', echo: 'say', puts: 'say', console: 'say', return: 'give back', def: 'to', function: 'to',
  func: 'to', fn: 'to', let: 'set', var: 'set', const: 'set', loop: 'repeat', elif: 'otherwise if', break: 'stop',
  continue: 'skip', sleep: 'wait', exit: 'the end', while: 'repeat while',
};

type Arity = [number, number];
type Schema = Record<string, Arity>;

const SHAPES: Record<string, Schema> = {
  circle: { at: [2, 2], size: [1, 1], color: [1, 1], outline: [0, 1] },
  box: { at: [2, 2], size: [1, 2], width: [1, 1], height: [1, 1], color: [1, 1], outline: [0, 1], angle: [1, 1] },
  line: { from: [2, 2], to: [2, 2], color: [1, 1], width: [1, 1] },
  text: { at: [2, 2], size: [1, 1], color: [1, 1] },
};
const PHYSICS: Schema = { moving: [2, 2], bouncy: [0, 1], solid: [0, 0], fixed: [0, 0], hidden: [0, 0] };
const KIND_ALIASES: Record<string, string> = { square: 'box', rectangle: 'box', rect: 'box', dot: 'circle', ball: 'circle', words: 'text', label: 'text' };
const NOTE_CLAUSES: Schema = { for: [1, 1], wave: [1, 1], volume: [1, 1] };
const SOUND_CLAUSES: Schema = { volume: [1, 1] };
const END_WORDS = new Set(['if', 'repeat', 'for', 'to', 'every', 'when', 'each']);
const VALUE_WORDS = new Set(['true', 'false', 'nothing', 'random', 'any', 'holding', 'not', 'new']);

export function parse(src: string): Program {
  const p = new Parser(lex(src));
  return p.program();
}

class Parser {
  i = 0;
  loops = 0;
  inFn = false;
  depth = 0;

  constructor(private toks: Token[]) {}

  // ---- token helpers ----
  peek(o = 0): Token { return this.toks[Math.min(this.i + o, this.toks.length - 1)]; }
  next(): Token { const t = this.peek(); if (t.t !== 'eof') this.i++; return t; }
  prev(): Token { return this.toks[Math.max(0, this.i - 1)]; }
  isWord(w: string, o = 0) { const t = this.peek(o); return t.t === 'id' && t.v === w; }
  isOp(op: string, o = 0) { const t = this.peek(o); return t.t === 'op' && t.v === op; }
  atLineEnd() { const t = this.peek(); return t.t === 'nl' || t.t === 'eof'; }
  eatWord(w: string) { if (this.isWord(w)) { this.i++; return true; } return false; }
  eatOp(op: string) { if (this.isOp(op)) { this.i++; return true; } return false; }

  expectWord(w: string, msg?: string, hint?: string): Token {
    if (this.isWord(w)) return this.next();
    const t = this.peek();
    syntaxError(span(t), msg ?? `I expected the word \`${w}\` here, but found ${describe(t)}.`, hint);
  }
  expectOp(op: string, msg?: string, hint?: string): Token {
    if (this.isOp(op)) return this.next();
    const t = this.peek();
    syntaxError(span(t), msg ?? `I expected \`${op}\` here, but found ${describe(t)}.`, hint);
  }

  spanFrom(start: Token): Span {
    const end = this.prev();
    if (end.line === start.line && end.col >= start.col) return { line: start.line, col: start.col, len: end.col + end.len - start.col };
    return span(start);
  }

  skipNl() { while (this.peek().t === 'nl') this.i++; }

  endLine() {
    const t = this.peek();
    if (t.t === 'nl') { this.skipNl(); return; }
    if (t.t === 'eof') return;
    let hint: string | undefined = 'Each step goes on its own line.';
    if (t.t === 'op' && t.v === ',') hint = 'There is one value too many here, or a comma that should not be there.';
    if (t.t === 'id' && t.v === 'then') hint = '`then` only goes right after the condition of an `if`.';
    syntaxError(span(t), `I expected the line to end here, but found ${describe(t)}.`, hint);
  }

  /** After a block's first line (if, repeat, ...) the steps start on the next line. */
  headerEnd(opener: Token) {
    const t = this.peek();
    if (t.t === 'nl' || t.t === 'eof') return;
    syntaxError(span(t), `I expected a new line after this \`${opener.v}\` line, but found ${describe(t)}.`,
      opener.v === 'if' ? 'Put the steps on the lines below, or write `then` to do one step on the same line.' : 'Put the steps on the lines below, and close them with `end`.');
  }

  name(what: string): Token {
    const t = this.peek();
    if (t.t !== 'id') syntaxError(span(t), `I expected a name for the ${what} here, but found ${describe(t)}.`);
    if (RESERVED.has(t.v)) syntaxError(span(t), `\`${t.v}\` is one of Once's own words, so it can't be used as a name.`, 'Pick another name, like `my' + t.v[0].toUpperCase() + t.v.slice(1) + '`.');
    return this.next();
  }

  // ---- program and blocks ----
  program(): Program {
    const body: Stmt[] = [];
    this.skipNl();
    while (this.peek().t !== 'eof') {
      body.push(this.statement());
      this.endLine();
    }
    return { body };
  }

  block(opener: Token, terminators: string[]): Stmt[] {
    const body: Stmt[] = [];
    this.depth++;
    this.skipNl();
    for (;;) {
      const t = this.peek();
      if (t.t === 'eof') {
        syntaxError(span(opener), `This \`${opener.v}\` on line ${opener.line} is never closed with \`end\`.`,
          'Every if, repeat, for each, to, every and when needs an `end` after its steps.');
      }
      if (t.t === 'id' && terminators.includes(t.v)) break;
      body.push(this.statement());
      this.endLine();
    }
    this.depth--;
    return body;
  }

  closeBlock(opener: Token) {
    this.expectWord('end', `I expected \`end\` to close the \`${opener.v}\` on line ${opener.line}.`);
    if (this.peek().t === 'id' && END_WORDS.has(this.peek().v)) this.next();
  }

  topLevelOnly(t: Token) {
    if (this.depth > 0) {
      syntaxError(span(t), `\`${t.v}\` has to stand on its own, not inside another block.`,
        `Move this \`${t.v} ... end\` out so it starts at the left edge of the story.`);
    }
  }

  // ---- statements ----
  statement(): Stmt {
    const t = this.peek();
    if (t.t !== 'id') return this.exprStatement();
    switch (t.v) {
      case 'set': {
        this.next();
        const target = this.target();
        if (this.isOp('=')) syntaxError(span(this.peek()), 'In Once, write `to` instead of `=`.', `Like this: set ${srcOf(target)} to ...`);
        this.expectWord('to', undefined, 'A set line looks like `set score to 0`.');
        const value = this.expr();
        return { k: 'set', target, value, s: this.spanFrom(t) };
      }
      case 'change': {
        this.next();
        const target = this.target();
        if (this.isWord('to')) syntaxError(span(this.peek()), '`change` adds an amount, so it uses `by`.', 'Write `change score by 1`, or use `set score to ...` to replace it.');
        this.expectWord('by', undefined, 'A change line looks like `change score by 1`.');
        const by = this.expr();
        return { k: 'change', target, by, s: this.spanFrom(t) };
      }
      case 'say': {
        this.next();
        if (this.atLineEnd()) syntaxError(span(t), '`say` needs something to say.', 'Like `say "hello"` or `say score`.');
        return { k: 'say', value: this.expr(), s: this.spanFrom(t) };
      }
      case 'if': return this.ifStatement();
      case 'repeat': return this.repeat();
      case 'for': return this.forEach();
      case 'to': return this.fnDef();
      case 'give': {
        this.next();
        this.expectWord('back', 'After `give`, write `back`, like `give back total`.');
        if (!this.inFn) syntaxError(this.spanFrom(t), '`give back` only works inside a `to ... end` block.', 'To end the whole story, write `the end`.');
        const value = this.atLineEnd() ? null : this.expr();
        return { k: 'give', value, s: this.spanFrom(t) };
      }
      case 'stop':
      case 'skip': {
        this.next();
        if (this.loops === 0) {
          syntaxError(span(t), `\`${t.v}\` only works inside a repeat or for each loop.`,
            t.v === 'stop' ? 'To end the whole story, write `the end`.' : undefined);
        }
        return { k: t.v as 'stop' | 'skip', s: span(t) };
      }
      case 'the':
        if (this.isWord('end', 1)) { this.next(); this.next(); return { k: 'theend', s: this.spanFrom(t) }; }
        break;
      case 'wait': {
        this.next();
        const e = this.expr();
        if (!this.eatWord('seconds') && !this.eatWord('second')) {
          if (this.peek().t === 'id' && /^(sec|secs|s|ms|frames?|minutes?)$/.test(this.peek().v)) {
            syntaxError(span(this.peek()), 'Waiting is counted in seconds.', 'Write `wait 0.5 seconds`.');
          }
        }
        return { k: 'wait', e, s: this.spanFrom(t) };
      }
      case 'every': return this.every();
      case 'when': return this.when();
      case 'draw': {
        this.next();
        const kind = this.kind(Object.keys(SHAPES), 'draw');
        const content = kind === 'text' ? this.expr() : null;
        const clauses = this.clauses(kind, SHAPES[kind]);
        return { k: 'draw', kind, content, clauses, s: this.spanFrom(t) };
      }
      case 'background': this.next(); return { k: 'background', e: this.expr(), s: this.spanFrom(t) };
      case 'clear': this.next(); return { k: 'clear', s: span(t) };
      case 'play': {
        this.next();
        if (this.eatWord('note')) {
          const e = this.expr();
          return { k: 'play', what: 'note', e, clauses: this.clauses('note', NOTE_CLAUSES), s: this.spanFrom(t) };
        }
        this.eatWord('sound');
        const e = this.expr();
        return { k: 'play', what: 'sound', e, clauses: this.clauses('sound', SOUND_CLAUSES), s: this.spanFrom(t) };
      }
      case 'add': {
        this.next();
        const value = this.expr();
        this.expectWord('to', undefined, 'Like `add 5 to scores`.');
        const target = this.postfix();
        return { k: 'add', value, target, s: this.spanFrom(t) };
      }
      case 'remove': {
        this.next();
        const value = this.expr();
        const from = this.eatWord('from') ? this.postfix() : null;
        return { k: 'remove', value, from, s: this.spanFrom(t) };
      }
      case 'hide':
      case 'show':
        this.next();
        return { k: t.v as 'hide' | 'show', e: this.expr(), s: this.spanFrom(t) };
      case 'end':
        syntaxError(span(t), 'There is an extra `end` here. Nothing is open for it to close.', 'Check that each `end` matches an if, repeat, for each, to, every or when above it.');
      case 'otherwise':
      case 'else':
        syntaxError(span(t), `This \`${t.v}\` isn't part of an \`if\`.`, 'An `otherwise` goes between an `if` and its `end`.');
      case 'then':
        syntaxError(span(t), '`then` only goes right after the condition of an `if`.');
      case 'while':
      case 'until':
        syntaxError(span(t), `Loops start with \`repeat\`. Write \`repeat ${t.v} ...\`.`);
      case 'times':
        syntaxError(span(t), '`times` goes after a number in a repeat, like `repeat 3 times`.');
    }
    return this.exprStatement();
  }

  exprStatement(): Stmt {
    const t = this.peek();
    if (t.t === 'id' && !RESERVED.has(t.v)) {
      const n = this.peek(1);
      const word = FROM_ELSEWHERE[t.v];
      if (word && (!(n.t === 'op' && (n.v === '(' || n.v === '.' || n.v === '[')) || word === 'say')) {
        syntaxError(span(t), `Once doesn't use \`${t.v}\`. Write \`${word}\` instead.`, word === 'say' ? 'Like `say "hello"`.' : undefined);
      }
      if (n.t === 'op' && n.v === '=') {
        syntaxError({ line: t.line, col: t.col, len: n.col + 1 - t.col }, 'To keep a value, start the line with `set`.', `Like this: set ${t.v} to ...`);
      }
      const startsValue = n.t === 'num' || n.t === 'str' || (n.t === 'id' && !['of', 'is', 'and', 'or', 'mod', 'touches', 'contains'].includes(n.v));
      if (startsValue) {
        const guess = closest(t.v, STATEMENTS);
        syntaxError(span(t), `I don't know how to \`${t.v}\`.`,
          guess ? `Did you mean \`${guess}\`?` : 'Lines start with a word like set, say, draw, if or repeat. To use your own instructions, write name(...).');
      }
    }
    const start = this.peek();
    const e = this.expr();
    if (e.k === 'call' || e.k === 'new') return { k: 'expr', e, s: this.spanFrom(start) };
    syntaxError(this.spanFrom(start), 'This line works something out, but doesn\'t do anything with it.',
      e.k === 'bin' && e.op === 'eq' && e.a.k === 'var'
        ? `To keep a value, write: set ${e.a.name} to ...`
        : 'Start the line with `say` to show it, or `set name to ...` to keep it.');
  }

  target(): Expr {
    const start = this.peek();
    if (start.t === 'id' && RESERVED.has(start.v) && !['item'].includes(start.v)) {
      syntaxError(span(start), `\`${start.v}\` is one of Once's own words, so it can't be used as a name.`);
    }
    const e = this.postfix();
    if (e.k !== 'var' && e.k !== 'prop' && e.k !== 'index') syntaxError(this.spanFrom(start), 'I can only set a name, a property like ball\'s x, or a list item.');
    return e;
  }

  ifStatement(): Stmt {
    const start = this.next();
    const cond = this.expr();
    if (this.eatWord('then') && !this.atLineEnd()) {
      const body = [this.statement()];
      return { k: 'if', branches: [{ cond, body }], els: null, s: this.spanFrom(start) };
    }
    const sp = this.spanFrom(start);
    this.headerEnd(start);
    const branches = [{ cond, body: this.block(start, ['otherwise', 'else', 'end']) }];
    let els: Stmt[] | null = null;
    while (this.isWord('otherwise') || this.isWord('else')) {
      const o = this.next();
      if (els) syntaxError(span(o), 'This `if` already has an `otherwise`, so this one can never happen.');
      if (this.eatWord('if')) {
        const c = this.expr();
        this.eatWord('then');
        this.headerEnd(start);
        branches.push({ cond: c, body: this.block(start, ['otherwise', 'else', 'end']) });
      } else {
        this.headerEnd(o);
        els = this.block(start, ['otherwise', 'else', 'end']);
      }
    }
    this.closeBlock(start);
    return { k: 'if', branches, els, s: sp };
  }

  repeat(): Stmt {
    const start = this.next();
    let mode: 'times' | 'while' | 'until' | 'forever';
    let e: Expr | null = null;
    if (this.eatWord('forever')) mode = 'forever';
    else if (this.eatWord('while')) { mode = 'while'; e = this.expr(); }
    else if (this.eatWord('until')) { mode = 'until'; e = this.expr(); }
    else {
      if (this.atLineEnd()) syntaxError(span(start), 'How many times should this repeat?', 'Write `repeat 10 times`, `repeat forever`, `repeat while ...` or `repeat until ...`.');
      e = this.expr();
      this.expectWord('times', undefined, 'Write it like `repeat 10 times`.');
      mode = 'times';
    }
    const sp = this.spanFrom(start);
    this.headerEnd(start);
    this.loops++;
    const body = this.block(start, ['end']);
    this.loops--;
    this.closeBlock(start);
    return { k: 'repeat', mode, e, body, s: sp };
  }

  forEach(): Stmt {
    const start = this.next();
    this.eatWord('each');
    const name = this.name('loop').v;
    let list: Expr | null = null, from: Expr | null = null, to: Expr | null = null, by: Expr | null = null;
    if (this.eatWord('in')) list = this.expr();
    else if (this.eatWord('from')) {
      from = this.expr();
      this.expectWord('to', undefined, 'Write it like `for each n from 1 to 10`.');
      to = this.expr();
      if (this.eatWord('by')) by = this.expr();
    } else {
      syntaxError(span(this.peek()), `After \`for each ${name}\`, write \`in\` and a list, or \`from\` and a number.`,
        `Like \`for each ${name} in balls\` or \`for each ${name} from 1 to 10\`.`);
    }
    const sp = this.spanFrom(start);
    this.headerEnd(start);
    this.loops++;
    const body = this.block(start, ['end']);
    this.loops--;
    this.closeBlock(start);
    return { k: 'foreach', name, list, from, to, by, body, s: sp };
  }

  fnDef(): Stmt {
    const start = this.next();
    this.topLevelOnly(start);
    const name = this.name('instructions').v;
    const params: string[] = [];
    this.eatWord('with');
    if (this.isOp('(')) syntaxError(span(this.peek()), 'Instructions list their inputs without brackets.', `Like \`to ${name} a and b\`.`);
    while (!this.atLineEnd()) {
      if (params.length) {
        if (!this.eatWord('and') && !this.eatOp(',')) syntaxError(span(this.peek()), 'Separate inputs with `and` or a comma.', `Like \`to ${name} a and b\`.`);
      }
      const p = this.name('input');
      if (params.includes(p.v)) syntaxError(span(p), `\`${p.v}\` is already an input of \`${name}\`.`);
      params.push(p.v);
    }
    const sp = this.spanFrom(start);
    const [loops, inFn] = [this.loops, this.inFn];
    this.loops = 0; this.inFn = true;
    const body = this.block(start, ['end']);
    this.loops = loops; this.inFn = inFn;
    this.closeBlock(start);
    return { k: 'fn', name, params, body, s: sp };
  }

  handlerBody(start: Token): Stmt[] {
    this.headerEnd(start);
    const [loops, inFn] = [this.loops, this.inFn];
    this.loops = 0; this.inFn = false;
    const body = this.block(start, ['end']);
    this.loops = loops; this.inFn = inFn;
    this.closeBlock(start);
    return body;
  }

  every(): Stmt {
    const start = this.next();
    this.topLevelOnly(start);
    if (this.eatWord('frame')) {
      const sp = this.spanFrom(start);
      return { k: 'every', mode: 'frame', e: null, body: this.handlerBody(start), s: sp };
    }
    if (this.atLineEnd()) syntaxError(span(start), 'Every what?', 'Write `every frame` or `every 2 seconds`.');
    const e = this.expr();
    if (!this.eatWord('seconds') && !this.eatWord('second')) syntaxError(span(this.peek()), 'After the number, write `seconds`.', 'Like `every 2 seconds`.');
    const sp = this.spanFrom(start);
    return { k: 'every', mode: 'seconds', e, body: this.handlerBody(start), s: sp };
  }

  when(): Stmt {
    const start = this.next();
    this.topLevelOnly(start);
    if (this.isWord('key') && this.peek(1).t !== 'poss' && !this.isWord('touches', 1)) {
      this.next();
      const a = this.postfix();
      this.expectWord('is', undefined, 'Write it like `when key "space" is pressed`.');
      this.expectWord('pressed', undefined, 'Write it like `when key "space" is pressed`.');
      const sp = this.spanFrom(start);
      return { k: 'when', ev: 'key', a, b: null, body: this.handlerBody(start), s: sp };
    }
    if (this.isWord('mouse') && this.isWord('is', 1)) {
      this.next(); this.next();
      this.expectWord('clicked', undefined, 'Write `when mouse is clicked`.');
      const sp = this.spanFrom(start);
      return { k: 'when', ev: 'click', a: null, b: null, body: this.handlerBody(start), s: sp };
    }
    const a = this.additive();
    this.expectWord('touches', undefined, 'A when line looks like `when key "space" is pressed`, `when mouse is clicked` or `when ball touches paddle`.');
    const b = this.additive();
    const sp = this.spanFrom(start);
    return { k: 'when', ev: 'touch', a, b, body: this.handlerBody(start), s: sp };
  }

  kind(allowed: string[], verb: string): string {
    const t = this.peek();
    if (t.t !== 'id') syntaxError(span(t), `What should I ${verb}? I expected a shape here, but found ${describe(t)}.`, `Shapes are: ${allowed.join(', ')}.`);
    const k = KIND_ALIASES[t.v] ?? t.v;
    if (!allowed.includes(k)) {
      const guess = closest(t.v, allowed);
      syntaxError(span(t), `I don't know how to ${verb} a \`${t.v}\`.`, guess ? `Did you mean \`${guess}\`?` : `Shapes are: ${allowed.join(', ')}.`);
    }
    this.next();
    return k;
  }

  startsValue(schema: Schema): boolean {
    const t = this.peek();
    if (t.t === 'num' || t.t === 'str') return true;
    if (t.t === 'op') return '(-[{'.includes(t.v);
    if (t.t === 'id') {
      if (t.v in schema) return false;
      if (VALUE_WORDS.has(t.v)) return true;
      return !RESERVED.has(t.v);
    }
    return false;
  }

  clauses(kind: string, schema: Schema): Clause[] {
    const out: Clause[] = [];
    while (this.peek().t === 'id' && !this.isWord('then')) {
      const t = this.next();
      const arity = Object.prototype.hasOwnProperty.call(schema, t.v) ? schema[t.v] : undefined;
      if (!arity) {
        const options = Object.keys(schema);
        const guess = closest(t.v, options);
        const what = kind === 'note' || kind === 'sound' ? `A ${kind}` : `A ${kind}`;
        syntaxError(span(t), `${what} doesn't have a \`${t.v}\` setting.`, guess ? `Did you mean \`${guess}\`?` : `It can have: ${options.join(', ')}.`);
      }
      const [min, max] = arity;
      const args: Expr[] = [];
      if (max > 0 && (min > 0 || this.startsValue(schema))) {
        args.push(this.expr());
        while (args.length < max && this.eatOp(',')) args.push(this.expr());
      }
      if (args.length < min) {
        const ex: Record<string, string> = { at: 'at 100, 50', from: 'from 10, 10', to: 'to 200, 80', moving: 'moving 3, -2' };
        syntaxError(this.spanFrom(t), `\`${t.v}\` needs ${min === 2 ? 'two numbers' : 'a value'}.`, ex[t.v] ? `Like \`${ex[t.v]}\`.` : undefined);
      }
      out.push({ name: t.v, args, s: this.spanFrom(t) });
    }
    return out;
  }

  // ---- expressions ----
  expr(): Expr { return this.or(); }

  or(): Expr {
    let a = this.and();
    while (this.isWord('or')) {
      const t = this.next();
      const b = this.and();
      a = { k: 'bin', op: 'or', a, b, s: join(a.s, b.s, t) };
    }
    return a;
  }

  and(): Expr {
    let a = this.not();
    while (this.isWord('and')) {
      const t = this.next();
      const b = this.not();
      a = { k: 'bin', op: 'and', a, b, s: join(a.s, b.s, t) };
    }
    return a;
  }

  not(): Expr {
    if (this.isWord('not')) {
      const t = this.next();
      const a = this.not();
      return { k: 'un', op: 'not', a, s: this.spanFrom(t) };
    }
    return this.compare();
  }

  compare(): Expr {
    const a = this.additive();
    const t = this.peek();
    let op: string | null = null;
    if (t.t === 'id' && t.v === 'is') {
      this.next();
      if (this.eatWord('not')) op = 'ne';
      else if (this.eatWord('above')) op = 'gt';
      else if (this.eatWord('below')) op = 'lt';
      else if (this.isWord('more') || this.isWord('greater') || this.isWord('bigger')) { this.next(); this.expectWord('than'); op = 'gt'; }
      else if (this.isWord('less') || this.isWord('fewer') || this.isWord('smaller')) { this.next(); this.expectWord('than'); op = 'lt'; }
      else if (this.isWord('at') && (this.isWord('least', 1) || this.isWord('most', 1))) { this.next(); op = this.next().v === 'least' ? 'ge' : 'le'; }
      else op = 'eq';
    } else if (t.t === 'op' && ['=', '==', '!=', '<', '>', '<=', '>='].includes(t.v)) {
      this.next();
      op = ({ '=': 'eq', '==': 'eq', '!=': 'ne', '<': 'lt', '>': 'gt', '<=': 'le', '>=': 'ge' } as Record<string, string>)[t.v];
    } else if (t.t === 'id' && (t.v === 'touches' || t.v === 'contains')) {
      this.next();
      op = t.v;
    }
    if (!op) return a;
    const b = this.additive();
    return { k: 'bin', op, a, b, s: join(a.s, b.s, t) };
  }

  additive(): Expr {
    let a = this.multiplicative();
    while (this.isOp('+') || this.isOp('-')) {
      const t = this.next();
      const b = this.multiplicative();
      a = { k: 'bin', op: t.v, a, b, s: join(a.s, b.s, t) };
    }
    return a;
  }

  multiplicative(): Expr {
    let a = this.unary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%') || this.isWord('mod')) {
      const t = this.next();
      const b = this.unary();
      a = { k: 'bin', op: t.v === '%' ? 'mod' : t.v, a, b, s: join(a.s, b.s, t) };
    }
    return a;
  }

  unary(): Expr {
    if (this.isOp('-')) {
      const t = this.next();
      const a = this.unary();
      if (a.k === 'num') return { k: 'num', v: -a.v, s: this.spanFrom(t) };
      return { k: 'un', op: 'neg', a, s: this.spanFrom(t) };
    }
    return this.power();
  }

  power(): Expr {
    const a = this.postfix();
    if (this.isOp('^')) {
      const t = this.next();
      const b = this.unary();
      return { k: 'bin', op: '^', a, b, s: join(a.s, b.s, t) };
    }
    return a;
  }

  postfix(): Expr {
    const start = this.peek();
    let e = this.primary();
    for (;;) {
      if (this.peek().t === 'poss' || (this.isOp('.') && this.peek(1).t === 'id')) {
        this.next();
        const n = this.peek();
        if (n.t !== 'id') syntaxError(span(n), `After 's, I expected the name of a property, but found ${describe(n)}.`, "Like ball's x.");
        this.next();
        e = { k: 'prop', obj: e, name: n.v, s: this.spanFrom(start) };
      } else if (this.isOp('[')) {
        this.next();
        const idx = this.expr();
        this.expectOp(']');
        e = { k: 'index', obj: e, idx, s: this.spanFrom(start) };
      } else if (this.isOp('(') && (e.k === 'var' || e.k === 'prop' || e.k === 'call' || e.k === 'index')) {
        this.next();
        const args: Expr[] = [];
        while (!this.isOp(')')) {
          if (this.peek().t === 'eof') this.expectOp(')');
          args.push(this.expr());
          if (!this.eatOp(',')) break;
        }
        this.expectOp(')', undefined, 'Values given to instructions are separated by commas, like add(1, 2).');
        e = { k: 'call', fn: e, args, s: this.spanFrom(start) };
      } else break;
    }
    return e;
  }

  primary(): Expr {
    const t = this.peek();
    if (t.t === 'num') { this.next(); return { k: 'num', v: t.n!, s: span(t) }; }
    if (t.t === 'str') {
      this.next();
      const parts = t.parts!.map((p) => {
        if (typeof p === 'string') return p;
        const sub = new Parser(lex(p.src, p.line - 1, p.col - 1));
        const e = sub.expr();
        if (sub.peek().t !== 'nl' && sub.peek().t !== 'eof') syntaxError(span(sub.peek()), `Inside {braces} I expected one value, but found ${describe(sub.peek())}.`);
        return e;
      });
      return { k: 'str', parts, s: span(t) };
    }
    if (t.t === 'op') {
      if (t.v === '(') {
        this.next();
        const e = this.expr();
        this.expectOp(')', `I expected \`)\` to close the \`(\` on line ${t.line}, but found ${describe(this.peek())}.`);
        return e;
      }
      if (t.v === '[') {
        this.next();
        const items: Expr[] = [];
        while (!this.isOp(']')) {
          if (this.peek().t === 'eof') break;
          items.push(this.expr());
          if (!this.eatOp(',')) break;
        }
        this.expectOp(']', `I expected \`]\` to close the list started on line ${t.line}, but found ${describe(this.peek())}.`, 'Items in a list are separated by commas.');
        return { k: 'list', items, s: this.spanFrom(t) };
      }
      if (t.v === '{') {
        this.next();
        const keys: string[] = [], vals: Expr[] = [];
        while (!this.isOp('}')) {
          const k = this.peek();
          if (k.t === 'id') keys.push(k.v);
          else if (k.t === 'str' && k.parts!.length === 1 && typeof k.parts![0] === 'string') keys.push(k.parts![0] as string);
          else break;
          this.next();
          this.expectOp(':', undefined, 'A record looks like {name: "Pip", age: 3}.');
          vals.push(this.expr());
          if (!this.eatOp(',')) break;
        }
        this.expectOp('}', `I expected \`}\` to close the record started on line ${t.line}, but found ${describe(this.peek())}.`, 'A record looks like {name: "Pip", age: 3}.');
        return { k: 'rec', keys, vals, s: this.spanFrom(t) };
      }
      if (t.v === '=' || t.v === '==') syntaxError(span(t), `I expected a value before \`${t.v}\`.`);
      syntaxError(span(t), `I expected a value here, but found ${describe(t)}.`);
    }
    if (t.t === 'id') {
      switch (t.v) {
        case 'true': case 'false': this.next(); return { k: 'bool', v: t.v === 'true', s: span(t) };
        case 'nothing': this.next(); return { k: 'nothing', s: span(t) };
        case 'random': {
          this.next();
          const lo = this.additive();
          this.expectWord('to', undefined, 'Write it like `random 1 to 6`.');
          const hi = this.additive();
          return { k: 'random', lo, hi, s: this.spanFrom(t) };
        }
        case 'any': {
          this.next();
          this.expectWord('of', undefined, 'Write it like `any of colors`, to pick one at random.');
          return { k: 'any', list: this.unary(), s: this.spanFrom(t) };
        }
        case 'holding': {
          this.next();
          return { k: 'un', op: 'holding', a: this.postfix(), s: this.spanFrom(t) };
        }
        case 'new': {
          this.next();
          const kind = this.kind(['circle', 'box', 'text'], 'make');
          const content = kind === 'text' ? this.expr() : null;
          const clauses = this.clauses(kind, { ...SHAPES[kind], ...PHYSICS });
          return { k: 'new', kind, content, clauses, s: this.spanFrom(t) };
        }
        case 'item': {
          const n = this.peek(1);
          if (n.t === 'num' || (n.t === 'op' && (n.v === '(' || n.v === '-')) || (n.t === 'id' && !RESERVED.has(n.v) && this.peek(2).t !== 'poss')) {
            this.next();
            const idx = this.additive();
            this.expectWord('of', undefined, 'Write it like `item 2 of names`.');
            const obj = this.unary();
            return { k: 'index', obj, idx, s: this.spanFrom(t) };
          }
          break;
        }
      }
      if (RESERVED.has(t.v)) {
        const hint = t.v === 'end' ? 'Maybe something is missing just before this `end`.' : undefined;
        syntaxError(span(t), `I expected a value here, but found the word \`${t.v}\`.`, hint);
      }
      this.next();
      if (this.isWord('of')) {
        this.next();
        const arg = this.unary();
        return { k: 'call', fn: { k: 'var', name: t.v, s: span(t) }, args: [arg], s: this.spanFrom(t) };
      }
      return { k: 'var', name: t.v, s: span(t) };
    }
    if (t.t === 'nl' || t.t === 'eof') syntaxError(span(t), 'This line ends too soon. I expected a value here.');
    syntaxError(span(t), `I expected a value here, but found ${describe(t)}.`);
  }
}

function join(a: Span, b: Span, t: Token): Span {
  if (a.line === b.line && b.col >= a.col) return { line: a.line, col: a.col, len: b.col + b.len - a.col };
  return span(t);
}

function describe(t: Token): string {
  switch (t.t) {
    case 'nl': return 'the end of the line';
    case 'eof': return 'the end of the story';
    case 'num': return `the number ${t.v}`;
    case 'str': return 'some text';
    case 'poss': return "'s";
    case 'op': return `\`${t.v}\``;
    default: return `the word \`${t.v}\``;
  }
}

function srcOf(e: Expr): string {
  if (e.k === 'var') return e.name;
  if (e.k === 'prop') return `${srcOf(e.obj)}'s ${e.name}`;
  return 'it';
}
