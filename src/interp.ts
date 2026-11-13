// Runs a parsed story. Every step is a generator, so `wait`, `repeat forever`
// and very long loops can pause and let the picture keep drawing.
import { Clause, Expr, Program, Stmt } from './ast';
import { OnceError, Span, closest, runtimeError } from './errors';
import { BUILTIN_NAMES, builtins } from './stdlib';
import {
  Builtin, COLOR_NAMES, EDGE, Edge, Fn, INK_COLOR, Rec, SOUNDS, Thing, Value, WAVES, equals, noteFreq, normKey,
  textOf, truthy, typeName,
} from './values';
import { HEIGHT, WIDTH, World } from './world';

export interface DrawCmd {
  kind: 'circle' | 'box' | 'line' | 'text';
  x: number; y: number; w: number; h: number; x2: number; y2: number;
  color: string; outline: number; angle: number; text: string; size: number; lineWidth: number;
}

export interface Host {
  graphics: boolean;
  say(text: string): void;
  drawPersistent(cmd: DrawCmd): void;
  clear(): void;
  playNote(freq: number, seconds: number, wave: string, volume: number): void;
  playSound(name: string, volume: number): void;
  holding(key: string): boolean;
  mouse(): { x: number; y: number; down: boolean };
  isColor?(c: string): boolean;
}

type Yield = { wait: number } | 'frame' | 'slice';
type Gen<T> = Generator<Yield, T, unknown>;
const BREAK = { sig: 'stop' } as const;
const CONTINUE = { sig: 'skip' } as const;
type Sig = undefined | typeof BREAK | typeof CONTINUE | { give: Value };

class EndOfStory {}

export class Env {
  vars = new Map<string, Value>();
  constructor(public parent: Env | null) {}
  find(name: string): Env | null {
    for (let e: Env | null = this; e; e = e.parent) if (e.vars.has(name)) return e;
    return null;
  }
  names(): Set<string> {
    const s = new Set<string>();
    for (let e: Env | null = this; e; e = e.parent) for (const k of e.vars.keys()) s.add(k);
    return s;
  }
}

interface Task { gen: Gen<Sig>; wakeAt: number; perFrame: boolean; forever: number; done: boolean }

interface Handler {
  stmt: Extract<Stmt, { k: 'every' } | { k: 'when' }>;
  running: Task | null;
  interval?: number;
  next?: number;
  touching?: Set<string>;
}

const SLICE = 50000;
const THING_PROPS = ['x', 'y', 'dx', 'dy', 'size', 'width', 'height', 'color', 'bouncy', 'solid', 'fixed', 'hidden', 'text', 'kind', 'angle', 'outline', 'speed'];

export class Runner {
  world = new World();
  globals = new Env(null);
  tasks: Task[] = [];
  handlers: Handler[] = [];
  frameDraws: DrawCmd[] = [];
  time = 0;
  frameNo = 0;
  steps = 0;
  depth = 0;
  current: Task | null = null;
  ended = false;
  error: OnceError | null = null;
  keyQueue: string[] = [];
  clicks = 0;
  /** How long a `repeat forever` pass waits. 0 means "until the next tick". */
  frameWait = 0;
  mouseRec = new Rec();

  constructor(public program: Program, public host: Host) {
    for (const [name, b] of builtins()) this.globals.vars.set(name, b);
    const g = this.globals.vars;
    g.set('width', WIDTH); g.set('height', HEIGHT); g.set('pi', Math.PI); g.set('edge', EDGE);
    g.set('gravity', 0); g.set('time', 0); g.set('frame', 0); g.set('mouse', this.mouseRec);
    this.mouseRec.m.set('x', 0); this.mouseRec.m.set('y', 0); this.mouseRec.m.set('down', false);
  }

  start() {
    for (const s of this.program.body) {
      if (s.k === 'fn') this.globals.vars.set(s.name, new Fn(s, this.globals));
      else if (s.k === 'every' || s.k === 'when') this.handlers.push({ stmt: s, running: null, touching: new Set() });
    }
    this.spawn(this.program.body, false, this.globals);
  }

  /** True when nothing is left to run and nothing will start by itself. */
  idle(): boolean {
    if (this.tasks.length || this.handlers.some((h) => h.stmt.k === 'every')) return false;
    const touch = this.handlers.some((h) => h.stmt.k === 'when' && h.stmt.ev === 'touch');
    const g = this.globals.vars.get('gravity');
    return !touch || !this.world.things.some((t) => !t.fixed && (t.dx || t.dy || (typeof g === 'number' && g !== 0)));
  }

  /** Seconds until something needs to run (for the command line). */
  nextWake(): number {
    let t = Infinity;
    for (const task of this.tasks) t = Math.min(t, task.wakeAt - this.time);
    for (const h of this.handlers) {
      if (h.stmt.k === 'every') t = Math.min(t, h.stmt.mode === 'frame' ? 1 / 60 : (h.next ?? this.time) - this.time);
    }
    return Math.max(0, t);
  }

  spawn(body: Stmt[], perFrame: boolean, env?: Env): Task {
    const task: Task = { gen: this.block(body, env ?? new Env(this.globals)), wakeAt: 0, perFrame, forever: 0, done: false };
    this.tasks.push(task);
    return task;
  }

  tick(dt: number) {
    if (this.ended) return;
    try {
      this.time += dt;
      this.frameNo++;
      const g = this.globals.vars;
      g.set('time', this.time); g.set('frame', this.frameNo);
      const m = this.host.mouse();
      this.mouseRec.m.set('x', m.x); this.mouseRec.m.set('y', m.y); this.mouseRec.m.set('down', m.down);
      this.frameDraws = [];

      const keys = this.keyQueue; this.keyQueue = [];
      const clicks = this.clicks; this.clicks = 0;
      for (const h of this.handlers) {
        const s = h.stmt;
        if (s.k === 'when' && s.ev === 'key' && keys.length) {
          const want = this.keyName(this.sync(this.eval(s.a!, this.globals)), s.a!.s);
          for (const k of keys) if (want === k || want === 'any') this.spawn(s.body, false);
        } else if (s.k === 'when' && s.ev === 'click') {
          for (let i = 0; i < clicks; i++) this.spawn(s.body, false);
        } else if (s.k === 'every' && s.mode === 'frame') {
          if (!h.running || h.running.done) h.running = this.spawn(s.body, true);
        } else if (s.k === 'every' && s.mode === 'seconds') {
          if (h.interval === undefined) {
            const v = this.sync(this.eval(s.e!, this.globals));
            if (typeof v !== 'number' || v <= 0) runtimeError(s.e!.s, `\`every\` needs a number of seconds above zero, but got ${typeName(v)}.`);
            h.interval = Math.max(v, 1 / 60);
            h.next = this.time + h.interval;
          }
          if (this.time >= h.next!) {
            this.spawn(s.body, false);
            h.next! += h.interval;
            if (h.next! < this.time) h.next = this.time + h.interval;
          }
        }
      }

      this.runTasks();
      this.world.gravity = this.numberVar('gravity');
      this.world.step();

      let spawned = false;
      for (const h of this.handlers) {
        const s = h.stmt;
        if (s.k !== 'when' || s.ev !== 'touch') continue;
        const as = this.thingsOf(this.sync(this.eval(s.a!, this.globals)), s.a!.s, true);
        const bv = this.sync(this.eval(s.b!, this.globals));
        const now = new Set<string>();
        if (bv instanceof Edge) {
          for (const a of as) if (this.world.touchesEdge(a)) now.add(`${a.id}:edge`);
        } else {
          const bs = this.thingsOf(bv, s.b!.s, true);
          for (const a of as) for (const b of bs) if (this.world.touches(a, b)) now.add(`${a.id}:${b.id}`);
        }
        for (const k of now) if (!h.touching!.has(k)) { this.spawn(s.body, false); spawned = true; }
        h.touching = now;
      }
      if (spawned) this.runTasks();
      this.tasks = this.tasks.filter((t) => !t.done);
    } catch (e) {
      this.fail(e);
    }
  }

  runTasks() {
    for (const task of [...this.tasks]) {
      if (task.done || task.wakeAt > this.time + 1e-9) continue;
      this.current = task;
      this.steps = 0;
      const r = task.gen.next();
      if (r.done) task.done = true;
      else if (r.value === 'frame') task.wakeAt = this.time + this.frameWait;
      else if (r.value === 'slice') task.wakeAt = this.time;
      else task.wakeAt = this.time + r.value.wait;
      if (this.ended) return;
    }
    this.current = null;
  }

  fail(e: unknown) {
    this.ended = true;
    this.tasks = [];
    if (e instanceof EndOfStory) return;
    if (e instanceof OnceError) { this.error = e; return; }
    if (e instanceof RangeError) {
      this.error = new OnceError('runtime', 'Some instructions keep calling themselves and never stop.', null, 'Make sure there is an `if` that gives back a value without calling again.');
      return;
    }
    this.error = new OnceError('runtime', 'Something went wrong inside Once itself: ' + (e instanceof Error ? e.message : String(e)), null);
  }

  /** Runs a generator that must not wait (conditions checked by the runner itself). */
  sync<T>(g: Gen<T>): T {
    for (;;) {
      const r = g.next();
      if (r.done) return r.value;
      if (r.value !== 'slice') runtimeError(null, 'This part of a `when` line can\'t wait or repeat forever.');
    }
  }

  numberVar(name: string): number {
    const v = this.globals.vars.get(name);
    if (typeof v !== 'number') runtimeError(null, `\`${name}\` has to be a number, but it is ${typeName(v ?? null)}.`);
    return v;
  }

  // ---- statements ----
  *block(stmts: Stmt[], env: Env): Gen<Sig> {
    for (const s of stmts) {
      const r = yield* this.exec(s, env);
      if (r) return r;
    }
    return undefined;
  }

  *exec(s: Stmt, env: Env): Gen<Sig> {
    if (++this.steps > SLICE) { this.steps = 0; yield 'slice'; }
    switch (s.k) {
      case 'set': {
        const v = yield* this.eval(s.value, env);
        yield* this.assign(s.target, v, env);
        return;
      }
      case 'change': {
        const cur = yield* this.eval(s.target, env);
        const by = yield* this.eval(s.by, env);
        if (typeof cur !== 'number' || typeof by !== 'number') {
          if (typeof cur === 'string') { yield* this.assign(s.target, cur + textOf(by), env); return; }
          runtimeError(s.s, `\`change\` adds numbers, but this is ${typeName(cur)} and ${typeName(by)}.`,
            Array.isArray(cur) ? 'To put something in a list, write `add ... to list`.' : undefined);
        }
        yield* this.assign(s.target, cur + by, env);
        return;
      }
      case 'say':
        this.host.say(textOf(yield* this.eval(s.value, env)));
        return;
      case 'if': {
        for (const br of s.branches) {
          if (truthy(yield* this.eval(br.cond, env))) return yield* this.block(br.body, env);
        }
        if (s.els) return yield* this.block(s.els, env);
        return;
      }
      case 'repeat': {
        if (s.mode === 'times') {
          const n = yield* this.eval(s.e!, env);
          if (typeof n !== 'number') runtimeError(s.e!.s, `\`repeat\` needs a number of times, but got ${typeName(n)}.`);
          for (let i = 0; i < Math.floor(n); i++) {
            const r = yield* this.block(s.body, env);
            if (r === BREAK) break;
            if (r && r !== CONTINUE) return r;
          }
          return;
        }
        if (s.mode === 'forever') {
          const task = this.current!;
          task.forever++;
          try {
            for (;;) {
              const r = yield* this.block(s.body, env);
              if (r === BREAK) break;
              if (r && r !== CONTINUE) return r;
              yield 'frame';
            }
          } finally {
            task.forever--;
          }
          return;
        }
        for (;;) {
          const c = truthy(yield* this.eval(s.e!, env));
          if (s.mode === 'while' ? !c : c) break;
          const r = yield* this.block(s.body, env);
          if (r === BREAK) break;
          if (r && r !== CONTINUE) return r;
        }
        return;
      }
      case 'foreach': {
        let items: Iterable<Value>;
        if (s.list) {
          const v = yield* this.eval(s.list, env);
          if (Array.isArray(v)) items = [...v];
          else if (typeof v === 'string') items = [...v];
          else if (v instanceof Rec) items = [...v.m.keys()];
          else {
            runtimeError(s.list.s, `\`for each\` needs a list to go through, but got ${typeName(v)}.`,
              typeof v === 'number' ? `To count, write \`for each ${s.name} from 1 to ${v}\`.` : undefined);
          }
        } else {
          const a = yield* this.eval(s.from!, env), b = yield* this.eval(s.to!, env);
          const by = s.by ? yield* this.eval(s.by, env) : (typeof a === 'number' && typeof b === 'number' && a > b ? -1 : 1);
          if (typeof a !== 'number') runtimeError(s.from!.s, `Counting needs numbers, but this is ${typeName(a)}.`);
          if (typeof b !== 'number') runtimeError(s.to!.s, `Counting needs numbers, but this is ${typeName(b)}.`);
          if (typeof by !== 'number' || by === 0) runtimeError(s.by?.s ?? s.s, '`by` needs a number that isn\'t zero.');
          const lo = a, hi = b, step = by;
          items = (function* () { for (let i = lo; step > 0 ? i <= hi + 1e-9 : i >= hi - 1e-9; i += step) yield i; })();
        }
        for (const item of items) {
          this.setVar(s.name, item, env);
          const r = yield* this.block(s.body, env);
          if (r === BREAK) break;
          if (r && r !== CONTINUE) return r;
        }
        return;
      }
      case 'fn':
      case 'every':
      case 'when':
        return;
      case 'give':
        return { give: s.value ? yield* this.eval(s.value, env) : null };
      case 'stop': return BREAK;
      case 'skip': return CONTINUE;
      case 'theend': throw new EndOfStory();
      case 'wait': {
        const n = yield* this.eval(s.e, env);
        if (typeof n !== 'number' || n < 0) runtimeError(s.e.s, `\`wait\` needs a number of seconds, but got ${typeName(n)}.`);
        yield { wait: n };
        return;
      }
      case 'draw': {
        const cmd = yield* this.drawCmd(s.kind as DrawCmd['kind'], s.content, s.clauses, env);
        if (!this.host.graphics) this.noGraphics(s.s);
        const t = this.current;
        if (t && (t.perFrame || t.forever > 0)) this.frameDraws.push(cmd);
        else this.host.drawPersistent(cmd);
        return;
      }
      case 'background':
        this.world.bg = this.color(yield* this.eval(s.e, env), s.e.s);
        return;
      case 'clear':
        this.host.clear();
        return;
      case 'play': {
        const v = yield* this.eval(s.e, env);
        const opts = yield* this.clauseValues(s.clauses, env);
        const volume = opts.volume ? this.num(opts.volume.vals[0], opts.volume.s, 'volume') : 0.5;
        if (s.what === 'note') {
          const f = noteFreq(v);
          if (f === null) runtimeError(s.e.s, `I don't know the note ${typeof v === 'string' ? `"${v}"` : typeName(v)}.`, 'Notes look like "C4", "F#5" or "Bb3", or a number like 60 (middle C).');
          const secs = opts.for ? this.num(opts.for.vals[0], opts.for.s, 'for') : 0.25;
          let wave = 'triangle';
          if (opts.wave) {
            const w = opts.wave.vals[0];
            wave = typeof w === 'string' ? (w === 'saw' ? 'sawtooth' : w) : '';
            if (!WAVES.includes(wave)) runtimeError(opts.wave.s, `I don't know the wave ${textOf(w, true)}.`, `Waves are: ${WAVES.join(', ')}.`);
          }
          this.host.playNote(f, Math.max(0.02, secs), wave, Math.max(0, Math.min(1, volume)));
        } else {
          if (typeof v !== 'string' || !SOUNDS.includes(v)) {
            const guess = typeof v === 'string' ? closest(v, SOUNDS) : null;
            runtimeError(s.e.s, `I don't know the sound ${textOf(v, true)}.`, guess ? `Did you mean "${guess}"?` : `Sounds are: ${SOUNDS.join(', ')}. For music, use \`play note "C4"\`.`);
          }
          this.host.playSound(v, Math.max(0, Math.min(1, volume)));
        }
        return;
      }
      case 'add': {
        const v = yield* this.eval(s.value, env);
        const l = yield* this.eval(s.target, env);
        if (!Array.isArray(l)) runtimeError(s.target.s, `I can only add things to a list, but this is ${typeName(l)}.`,
          typeof l === 'number' ? 'To make a number bigger, write `change name by 1`.' : 'Start a list with `set things to []`.');
        l.push(v);
        return;
      }
      case 'remove': {
        const v = yield* this.eval(s.value, env);
        if (s.from) {
          const l = yield* this.eval(s.from, env);
          if (!Array.isArray(l)) runtimeError(s.from.s, `I can only remove things from a list, but this is ${typeName(l)}.`);
          const i = l.findIndex((x) => equals(x, v));
          if (i >= 0) l.splice(i, 1);
          return;
        }
        for (const t of this.thingsOf(v, s.value.s, false)) t.removed = true;
        return;
      }
      case 'hide':
      case 'show': {
        const v = yield* this.eval(s.e, env);
        for (const t of this.thingsOf(v, s.e.s, false)) t.hidden = s.k === 'hide';
        return;
      }
      case 'expr':
        yield* this.eval(s.e, env);
        return;
    }
  }

  noGraphics(sp: Span): never {
    runtimeError(sp, 'Drawing needs a picture to draw on, and the command line has none.',
      'Open this story in the Once playground, or turn it into a web page with `once export`.');
  }

  setVar(name: string, v: Value, env: Env) {
    const e = env.find(name);
    (e ?? env).vars.set(name, v);
  }

  *assign(target: Expr, v: Value, env: Env): Gen<void> {
    if (target.k === 'var') { this.setVar(target.name, v, env); return; }
    if (target.k === 'prop') {
      const obj = yield* this.eval(target.obj, env);
      this.setProp(obj, target.name, v, target.s);
      return;
    }
    if (target.k === 'index') {
      const obj = yield* this.eval(target.obj, env);
      const idx = yield* this.eval(target.idx, env);
      if (Array.isArray(obj)) {
        const i = this.listIndex(obj, idx, target.idx.s, true);
        obj[i] = v;
        return;
      }
      if (obj instanceof Rec) { obj.m.set(textOf(idx), v); return; }
      if (typeof obj === 'string') runtimeError(target.s, 'Text can\'t be changed one letter at a time.', 'Build new text instead, with +.');
      runtimeError(target.obj.s, `I can't set an item of ${typeName(obj)}.`);
    }
    runtimeError(target.s, 'I can only set a name, a property or a list item.');
  }

  // ---- expressions ----
  *eval(e: Expr, env: Env): Gen<Value> {
    switch (e.k) {
      case 'num': return e.v;
      case 'bool': return e.v;
      case 'nothing': return null;
      case 'str': {
        let out = '';
        for (const p of e.parts) out += typeof p === 'string' ? p : textOf(yield* this.eval(p, env));
        return out;
      }
      case 'var': {
        const found = env.find(e.name);
        if (found) return found.vars.get(e.name)!;
        return this.unknown(e.name, e.s, env);
      }
      case 'list': {
        const out: Value[] = [];
        for (const it of e.items) out.push(yield* this.eval(it, env));
        return out;
      }
      case 'rec': {
        const r = new Rec();
        for (let i = 0; i < e.keys.length; i++) r.m.set(e.keys[i], yield* this.eval(e.vals[i], env));
        return r;
      }
      case 'bin': {
        if (e.op === 'and') return truthy(yield* this.eval(e.a, env)) && truthy(yield* this.eval(e.b, env));
        if (e.op === 'or') return truthy(yield* this.eval(e.a, env)) || truthy(yield* this.eval(e.b, env));
        const a = yield* this.eval(e.a, env);
        const b = yield* this.eval(e.b, env);
        return this.binary(e.op, a, b, e);
      }
      case 'un': {
        const a = yield* this.eval(e.a, env);
        if (e.op === 'not') return !truthy(a);
        if (e.op === 'neg') {
          if (typeof a !== 'number') runtimeError(e.s, `I can only make a number negative, but this is ${typeName(a)}.`);
          return -a;
        }
        return this.host.holding(this.keyName(a, e.a.s));
      }
      case 'call': {
        const fn = yield* this.eval(e.fn, env);
        const args: Value[] = [];
        for (const a of e.args) args.push(yield* this.eval(a, env));
        return yield* this.call(fn, args, e);
      }
      case 'prop': return this.getProp(yield* this.eval(e.obj, env), e.name, e);
      case 'index': {
        const obj = yield* this.eval(e.obj, env);
        const idx = yield* this.eval(e.idx, env);
        if (Array.isArray(obj)) return obj[this.listIndex(obj, idx, e.idx.s, false)];
        if (typeof obj === 'string') {
          const chars = [...obj];
          return chars[this.listIndex(chars, idx, e.idx.s, false)];
        }
        if (obj instanceof Rec) {
          const k = textOf(idx);
          if (!obj.m.has(k)) this.missingKey(obj, k, e.idx.s);
          return obj.m.get(k)!;
        }
        runtimeError(e.obj.s, `I can only take items from a list or text, but this is ${typeName(obj)}.`);
      }
      case 'random': {
        let lo = yield* this.eval(e.lo, env), hi = yield* this.eval(e.hi, env);
        if (typeof lo !== 'number' || typeof hi !== 'number') runtimeError(e.s, '`random` needs two numbers, like `random 1 to 6`.');
        if (lo > hi) [lo, hi] = [hi, lo];
        if (Number.isInteger(lo) && Number.isInteger(hi)) return lo + Math.floor(Math.random() * (hi - lo + 1));
        return lo + Math.random() * (hi - lo);
      }
      case 'any': {
        const l = yield* this.eval(e.list, env);
        const items = typeof l === 'string' ? [...l] : l;
        if (!Array.isArray(items)) runtimeError(e.list.s, `\`any of\` picks from a list, but this is ${typeName(l)}.`);
        if (items.length === 0) runtimeError(e.list.s, 'I can\'t pick from an empty list.');
        return items[Math.floor(Math.random() * items.length)];
      }
      case 'new': {
        const t = new Thing(e.kind as Thing['kind']);
        if (e.content) t.text = textOf(yield* this.eval(e.content, env));
        const opts = yield* this.clauseValues(e.clauses, env);
        for (const name in opts) {
          const { vals, s } = opts[name];
          switch (name) {
            case 'at': t.x = this.num(vals[0], s, 'at'); t.y = this.num(vals[1], s, 'at'); break;
            case 'size':
              if (t.kind === 'text') t.size = this.num(vals[0], s, 'size');
              else { t.w = this.num(vals[0], s, 'size'); t.h = vals[1] === undefined ? t.w : this.num(vals[1], s, 'size'); }
              break;
            case 'width': t.w = this.num(vals[0], s, 'width'); break;
            case 'height': t.h = this.num(vals[0], s, 'height'); break;
            case 'color': t.color = this.color(vals[0], s); break;
            case 'outline': t.outline = vals.length ? this.num(vals[0], s, 'outline') : 3; break;
            case 'angle': t.angle = this.num(vals[0], s, 'angle'); break;
            case 'moving': t.dx = this.num(vals[0], s, 'moving'); t.dy = this.num(vals[1], s, 'moving'); break;
            case 'bouncy': t.bounce = vals.length ? this.num(vals[0], s, 'bouncy') : 1; t.walls = true; break;
            case 'solid': t.solid = true; break;
            case 'fixed': t.fixed = true; break;
            case 'hidden': t.hidden = true; break;
          }
        }
        this.world.add(t);
        return t;
      }
    }
  }

  *clauseValues(clauses: Clause[], env: Env): Gen<Record<string, { vals: Value[]; s: Span }>> {
    const out: Record<string, { vals: Value[]; s: Span }> = {};
    for (const c of clauses) {
      const vals: Value[] = [];
      for (const a of c.args) vals.push(yield* this.eval(a, env));
      out[c.name] = { vals, s: c.s };
    }
    return out;
  }

  *drawCmd(kind: DrawCmd['kind'], content: Expr | null, clauses: Clause[], env: Env): Gen<DrawCmd> {
    const cmd: DrawCmd = {
      kind, x: 0, y: 0, w: 30, h: 30, x2: 0, y2: 0, color: INK_COLOR, outline: 0, angle: 0, text: '',
      size: 20, lineWidth: 2,
    };
    if (kind === 'box') { cmd.w = 40; cmd.h = 40; }
    if (content) cmd.text = textOf(yield* this.eval(content, env));
    const opts = yield* this.clauseValues(clauses, env);
    for (const name in opts) {
      const { vals, s } = opts[name];
      switch (name) {
        case 'at': cmd.x = this.num(vals[0], s, 'at'); cmd.y = this.num(vals[1], s, 'at'); break;
        case 'from': cmd.x = this.num(vals[0], s, 'from'); cmd.y = this.num(vals[1], s, 'from'); break;
        case 'to': cmd.x2 = this.num(vals[0], s, 'to'); cmd.y2 = this.num(vals[1], s, 'to'); break;
        case 'size':
          if (kind === 'text') cmd.size = this.num(vals[0], s, 'size');
          else { cmd.w = this.num(vals[0], s, 'size'); cmd.h = vals[1] === undefined ? cmd.w : this.num(vals[1], s, 'size'); }
          break;
        case 'width': if (kind === 'line') cmd.lineWidth = this.num(vals[0], s, 'width'); else cmd.w = this.num(vals[0], s, 'width'); break;
        case 'height': cmd.h = this.num(vals[0], s, 'height'); break;
        case 'color': cmd.color = this.color(vals[0], s); break;
        case 'outline': cmd.outline = vals.length ? this.num(vals[0], s, 'outline') : 3; break;
        case 'angle': cmd.angle = this.num(vals[0], s, 'angle'); break;
      }
    }
    return cmd;
  }

  *call(fn: Value, args: Value[], e: Extract<Expr, { k: 'call' }>): Gen<Value> {
    const name = e.fn.k === 'var' ? e.fn.name : e.fn.k === 'prop' ? e.fn.name : 'this';
    if (fn instanceof Builtin) return fn.fn(args, (msg, hint) => runtimeError(e.s, msg, hint));
    if (!(fn instanceof Fn)) {
      runtimeError(e.fn.s, `\`${name}\` is ${typeName(fn)}, not instructions, so it can't be used with ( ).`,
        fn instanceof Thing || fn instanceof Rec ? `To read a property, write ${name}'s x.` : undefined);
    }
    const params = fn.def.params;
    if (args.length !== params.length) {
      runtimeError(e.s, `\`${fn.def.name}\` needs ${params.length} input${params.length === 1 ? '' : 's'}${params.length ? ` (${params.join(', ')})` : ''}, but got ${args.length}.`,
        params.length ? `Like ${fn.def.name}(${params.join(', ')}).` : `Like ${fn.def.name}().`);
    }
    if (++this.depth > 300) {
      this.depth = 0;
      runtimeError(e.s, `\`${fn.def.name}\` went more than 300 calls deep, so it probably never stops.`, 'Make sure there is an `if` that gives back a value without calling it again. Once allows 300 calls inside each other.');
    }
    const local = new Env(fn.closure as Env);
    params.forEach((p, i) => local.vars.set(p, args[i]));
    try {
      const r = yield* this.block(fn.def.body, local);
      return r && typeof r === 'object' && 'give' in r ? r.give : null;
    } finally {
      this.depth--;
    }
  }

  binary(op: string, a: Value, b: Value, e: Extract<Expr, { k: 'bin' }>): Value {
    switch (op) {
      case 'eq': return equals(a, b);
      case 'ne': return !equals(a, b);
      case 'lt': case 'gt': case 'le': case 'ge': {
        if (!((typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string'))) {
          runtimeError(e.s, `I can only compare numbers with numbers (or text with text), but this is ${typeName(a)} and ${typeName(b)}.`,
            typeof a === 'string' || typeof b === 'string' ? 'Use number(...) to turn text into a number.' : undefined);
        }
        return op === 'lt' ? a < b : op === 'gt' ? a > b : op === 'le' ? a <= b : a >= b;
      }
      case 'touches': {
        const as = this.thingsOf(a, e.a.s, true);
        if (b instanceof Edge) return as.some((t) => this.world.touchesEdge(t));
        const bs = this.thingsOf(b, e.b.s, true);
        return as.some((x) => bs.some((y) => this.world.touches(x, y)));
      }
      case 'contains': {
        if (Array.isArray(a)) return a.some((x) => equals(x, b));
        if (typeof a === 'string') return a.includes(textOf(b));
        if (a instanceof Rec) return a.m.has(textOf(b));
        runtimeError(e.a.s, `\`contains\` works on lists and text, but this is ${typeName(a)}.`);
      }
      case '+': {
        if (typeof a === 'number' && typeof b === 'number') return a + b;
        if (typeof a === 'string' || typeof b === 'string') return textOf(a) + textOf(b);
        if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
        runtimeError(e.s, `I can't add ${typeName(a)} and ${typeName(b)}.`, Array.isArray(a) ? 'To put something in a list, write `add ... to list`.' : undefined);
      }
    }
    const words: Record<string, string> = { '-': 'subtract', '*': 'multiply', '/': 'divide', mod: 'use mod on', '^': 'raise' };
    if (typeof a !== 'number' || typeof b !== 'number') {
      const bad = typeof a !== 'number' ? a : b;
      runtimeError(e.s, `I can only ${words[op]} numbers, but this has ${typeName(bad)}.`,
        typeof bad === 'string' && bad.trim() !== '' && !Number.isNaN(Number(bad)) ? `"${bad}" is text. Use number("${bad}") to turn it into a number.` : undefined);
    }
    switch (op) {
      case '-': return a - b;
      case '*': return a * b;
      case '/': if (b === 0) runtimeError(e.s, 'You can\'t divide by zero.'); return a / b;
      case 'mod': if (b === 0) runtimeError(e.s, 'You can\'t use mod with zero.'); return ((a % b) + b) % b;
      case '^': return Math.pow(a, b);
    }
    runtimeError(e.s, `Unknown operator ${op}.`);
  }

  getProp(obj: Value, name: string, e: Extract<Expr, { k: 'prop' }>): Value {
    if (obj instanceof Thing) {
      switch (name) {
        case 'x': return obj.x;
        case 'y': return obj.y;
        case 'dx': return obj.dx;
        case 'dy': return obj.dy;
        case 'size': return obj.kind === 'text' ? obj.size : obj.w;
        case 'width': return obj.kind === 'text' ? this.world.measure(obj.text, obj.size) : obj.w;
        case 'height': return obj.kind === 'text' ? obj.size : obj.h;
        case 'color': return obj.color;
        case 'bouncy': return obj.bounce;
        case 'solid': return obj.solid;
        case 'fixed': return obj.fixed;
        case 'hidden': return obj.hidden;
        case 'text': return obj.text;
        case 'kind': return obj.kind;
        case 'angle': return obj.angle;
        case 'outline': return obj.outline;
        case 'speed': return Math.hypot(obj.dx, obj.dy);
        case 'removed': return obj.removed;
      }
      if (obj.extra.has(name)) return obj.extra.get(name)!;
      const guess = closest(name, [...THING_PROPS, ...obj.extra.keys()]);
      runtimeError(e.s, `This ${obj.kind} doesn't have a \`${name}\`.`, guess ? `Did you mean \`${guess}\`?` : `You can give it one first: set ... 's ${name} to 0.`);
    }
    if (obj instanceof Rec) {
      if (!obj.m.has(name)) this.missingKey(obj, name, e.s);
      return obj.m.get(name)!;
    }
    if (Array.isArray(obj) || typeof obj === 'string') {
      if (name === 'length') return typeof obj === 'string' ? [...obj].length : obj.length;
      if (Array.isArray(obj) && (name === 'first' || name === 'last')) {
        if (!obj.length) runtimeError(e.s, `The list is empty, so it has no ${name} item.`);
        return name === 'first' ? obj[0] : obj[obj.length - 1];
      }
      runtimeError(e.s, `${typeName(obj)[0].toUpperCase() + typeName(obj).slice(1)} doesn't have a \`${name}\`.`, `Lists and text have a length${Array.isArray(obj) ? ', a first and a last' : ''}.`);
    }
    runtimeError(e.obj.s, `${srcName(e.obj)} is ${typeName(obj)}, so it doesn't have a \`${name}\`.`,
      obj === null ? `Did you forget to give ${srcName(e.obj)} a value with \`set\`?` : undefined);
  }

  setProp(obj: Value, name: string, v: Value, sp: Span) {
    if (obj instanceof Thing) {
      const n = () => this.num(v, sp, name);
      const b = () => truthy(v);
      switch (name) {
        case 'x': obj.x = n(); return;
        case 'y': obj.y = n(); return;
        case 'dx': obj.dx = n(); return;
        case 'dy': obj.dy = n(); return;
        case 'size': if (obj.kind === 'text') obj.size = n(); else obj.w = obj.h = n(); return;
        case 'width': obj.w = n(); return;
        case 'height': if (obj.kind === 'text') obj.size = n(); else obj.h = n(); return;
        case 'color': obj.color = this.color(v, sp); return;
        case 'bouncy': obj.bounce = typeof v === 'number' ? v : b() ? 1 : 0; obj.walls = typeof v === 'number' || b(); return;
        case 'solid': obj.solid = b(); return;
        case 'fixed': obj.fixed = b(); return;
        case 'hidden': obj.hidden = b(); return;
        case 'text': obj.text = textOf(v); return;
        case 'angle': obj.angle = n(); return;
        case 'outline': obj.outline = n(); return;
        case 'kind': case 'speed': case 'removed':
          runtimeError(sp, `A shape's \`${name}\` can't be changed directly.`, name === 'speed' ? 'Set its dx and dy instead.' : undefined);
      }
      obj.extra.set(name, v);
      return;
    }
    if (obj instanceof Rec) { obj.m.set(name, v); return; }
    runtimeError(sp, `I can't give ${typeName(obj)} a \`${name}\`.`, 'Only shapes and records have properties you can set.');
  }

  missingKey(r: Rec, key: string, sp: Span): never {
    const guess = closest(key, r.m.keys());
    runtimeError(sp, `This record doesn't have a \`${key}\`.`, guess ? `Did you mean \`${guess}\`?` : r.m.size ? `It has: ${[...r.m.keys()].join(', ')}.` : undefined);
  }

  listIndex(l: unknown[], idx: Value, sp: Span, forSet: boolean): number {
    if (typeof idx !== 'number' || !Number.isInteger(idx)) runtimeError(sp, `List positions are whole numbers, but this is ${typeName(idx)}.`);
    if (idx === 0) runtimeError(sp, 'There is no item 0. In Once, lists count from 1.');
    const i = idx < 0 ? l.length + idx : idx - 1;
    if (i < 0 || i > l.length || (i === l.length && !forSet)) {
      runtimeError(sp, `There is no item ${idx}: the list only has ${l.length} item${l.length === 1 ? '' : 's'}.`, idx < 0 ? undefined : 'Lists count from 1, so the last item is the length.');
    }
    return i;
  }

  num(v: Value, sp: Span, what: string): number {
    if (typeof v !== 'number' || Number.isNaN(v)) {
      runtimeError(sp, `\`${what}\` needs a number, but got ${typeName(v)}.`,
        typeof v === 'string' && !Number.isNaN(Number(v)) && v.trim() !== '' ? `"${v}" is text. Use number("${v}").` : undefined);
    }
    return v;
  }

  color(v: Value, sp: Span): string {
    if (typeof v !== 'string') runtimeError(sp, `A color is text, like "tomato" or "#ff8800", but this is ${typeName(v)}.`);
    if (this.host.isColor && !this.host.isColor(v)) {
      const guess = closest(v, COLOR_NAMES);
      runtimeError(sp, `I don't know the color "${v}".`, guess ? `Did you mean "${guess}"?` : 'Try a name like "tomato" or "skyblue", a hex code like "#3f6788", or rgb(255, 120, 0).');
    }
    return v;
  }

  keyName(v: Value, sp: Span): string {
    if (typeof v !== 'string') runtimeError(sp, `Keys are named with text, like "space" or "left", but this is ${typeName(v)}.`);
    return normKey(v);
  }

  thingsOf(v: Value, sp: Span, allowEmpty: boolean): Thing[] {
    if (v instanceof Thing) return [v];
    if (Array.isArray(v) && v.every((x) => x instanceof Thing)) {
      if (!v.length && !allowEmpty) return [];
      return v as Thing[];
    }
    runtimeError(sp, `This needs a shape made with \`new\`, but got ${typeName(v)}.`,
      Array.isArray(v) ? 'Every item in the list has to be a shape.' : 'Make one with `set ball to new circle at 100, 100`.');
  }

  unknown(name: string, sp: Span, env: Env): never {
    const elsewhere: Record<string, string> = { print: 'say', console: 'say', len: 'length', str: 'text', int: 'round', Math: 'sqrt, round and friends', True: 'true', False: 'false', null: 'nothing', None: 'nothing', undefined: 'nothing', nil: 'nothing' };
    if (elsewhere[name]) runtimeError(sp, `Once doesn't have \`${name}\`. Use \`${elsewhere[name]}\` instead.`);
    const guess = closest(name, [...env.names(), ...BUILTIN_NAMES]);
    runtimeError(sp, `I don't know what \`${name}\` is.`, guess ? `Did you mean \`${guess}\`?` : `Give it a value first, like \`set ${name} to 0\`.`);
  }
}

function srcName(e: Expr): string {
  if (e.k === 'var') return `\`${e.name}\``;
  if (e.k === 'prop') return `${srcName(e.obj).replace(/`$/, '')}'s ${e.name}\``;
  return 'This';
}
