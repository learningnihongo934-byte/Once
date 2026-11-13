import { Span, syntaxError } from './errors';

export type TokType = 'num' | 'str' | 'id' | 'op' | 'poss' | 'nl' | 'eof';

/** A piece of a string: plain text, or the source of a `{...}` expression inside it. */
export type StrPart = string | { src: string; line: number; col: number };

export interface Token {
  t: TokType;
  v: string;
  n?: number;
  parts?: StrPart[];
  line: number;
  col: number;
  len: number;
}

const OPS2 = ['<=', '>=', '!=', '=='];
const OPS1 = '+-*/^%()[]{},:.=<>';
const OPEN = '([{';
const CLOSE = ')]}';
const QUOTES_OPEN = '"“';
const QUOTES_CLOSE = '"”';

export function span(t: Token): Span {
  return { line: t.line, col: t.col, len: t.len };
}

/**
 * Turns source text into tokens. Newlines matter (they end statements) except
 * inside brackets and right after a comma, so long lists can wrap.
 * `lineOffset`/`colOffset` place tokens of a `{...}` piece inside a string.
 */
export function lex(src: string, lineOffset = 0, colOffset = 0): Token[] {
  const toks: Token[] = [];
  let i = 0, line = 1 + lineOffset, col = 1 + colOffset;
  let depth = 0;
  const push = (t: TokType, v: string, l: number, c: number, len: number, extra: Partial<Token> = {}) =>
    toks.push({ t, v, line: l, col: c, len, ...extra });
  const last = () => toks[toks.length - 1];

  while (i < src.length) {
    const ch = src[i];

    if (ch === '\n') {
      const prev = last();
      if (depth === 0 && prev && prev.t !== 'nl' && !(prev.t === 'op' && prev.v === ',')) push('nl', '\n', line, col, 1);
      i++; line++; col = 1;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') { i++; col++; continue; }
    if (ch === '-' && src[i + 1] === '-') {
      while (i < src.length && src[i] !== '\n') { i++; col++; }
      continue;
    }

    const sl = line, sc = col;

    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9]/.test(src[j])) j++;
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] ?? '')) {
        j++;
        while (j < src.length && /[0-9]/.test(src[j])) j++;
      }
      const text = src.slice(i, j);
      push('num', text, sl, sc, j - i, { n: parseFloat(text) });
      col += j - i; i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j);
      push('id', word, sl, sc, j - i);
      col += j - i; i = j;
      continue;
    }

    if ((ch === "'" || ch === '’') && src[i + 1] === 's' && !/[A-Za-z0-9_]/.test(src[i + 2] ?? '')) {
      const prev = last();
      if (prev && (prev.t === 'id' || (prev.t === 'op' && (prev.v === ')' || prev.v === ']')))) {
        push('poss', "'s", sl, sc, 2);
        i += 2; col += 2;
        continue;
      }
    }
    if (ch === "'" || ch === '‘' || ch === '’') {
      syntaxError({ line: sl, col: sc, len: 1 }, 'Text in Once goes inside double quotes, like "hello".',
        "Single quotes are only used for things like ball's x.");
    }

    if (QUOTES_OPEN.includes(ch)) {
      const parts: StrPart[] = [];
      let buf = '';
      i++; col++;
      let closed = false;
      while (i < src.length) {
        const c = src[i];
        if (QUOTES_CLOSE.includes(c)) { i++; col++; closed = true; break; }
        if (c === '\n') break;
        if (c === '\\') {
          const n = src[i + 1];
          const map: Record<string, string> = { n: '\n', t: '\t', '"': '"', '\\': '\\', '{': '{', '}': '}' };
          if (n !== undefined && map[n] !== undefined) { buf += map[n]; i += 2; col += 2; continue; }
          buf += c; i++; col++;
          continue;
        }
        if (c === '{') {
          if (buf) parts.push(buf);
          buf = '';
          const pl = line, pc = col + 1;
          let j = i + 1, d = 1, inStr = false;
          while (j < src.length && src[j] !== '\n') {
            const cj = src[j];
            if (inStr) { if (cj === '"') inStr = false; }
            else if (cj === '"') inStr = true;
            else if (cj === '{') d++;
            else if (cj === '}' && --d === 0) break;
            j++;
          }
          if (src[j] !== '}') {
            syntaxError({ line: pl, col: pc - 1, len: 1 }, 'This `{` inside the text is never closed with `}`.',
              'Inside text, {name} shows the value of name. To show a real brace, write \\{.');
          }
          const inner = src.slice(i + 1, j);
          if (!inner.trim()) syntaxError({ line: pl, col: pc - 1, len: 2 }, 'There is nothing inside these braces `{}`.', 'Put a name inside, like "score: {score}".');
          parts.push({ src: inner, line: pl, col: pc });
          col += j + 1 - i; i = j + 1;
          continue;
        }
        buf += c; i++; col++;
      }
      if (!closed) {
        syntaxError({ line: sl, col: sc, len: Math.max(1, col - sc) }, 'This text is missing its closing quote `"`.',
          'Text has to start and end on the same line.');
      }
      if (buf || parts.length === 0) parts.push(buf);
      push('str', '"', sl, sc, col - sc, { parts });
      continue;
    }

    const two = src.slice(i, i + 2);
    if (OPS2.includes(two)) {
      push('op', two, sl, sc, 2);
      i += 2; col += 2;
      continue;
    }
    if (OPS1.includes(ch)) {
      if (OPEN.includes(ch)) depth++;
      if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
      push('op', ch, sl, sc, 1);
      i++; col++;
      continue;
    }

    const hints: Record<string, string> = {
      ';': 'Once doesn\'t need semicolons. Each line is one step.',
      '&': 'Write `and` instead of `&&`.',
      '|': 'Write `or` instead of `||`.',
      '!': 'Write `not` instead of `!`.',
      '#': 'Comments in Once start with `--`.',
    };
    syntaxError({ line: sl, col: sc, len: 1 }, `I don't understand the character \`${ch}\` here.`, hints[ch]);
  }
  const prev = last();
  if (prev && prev.t !== 'nl') push('nl', '\n', line, col, 1);
  push('eof', '', line, col, 1);
  return toks;
}
