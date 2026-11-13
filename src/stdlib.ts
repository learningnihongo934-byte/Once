// Built-in instructions. Angles are in degrees, lists count from 1.
import { Builtin, Caller, GenBuiltin, Rec, Thing, Value, deepCopy, equals, fmtNum, kindOf, textOf, truthy, typeName } from './values';

type Fail = (msg: string, hint?: string) => never;

function num(v: Value, fn: string, fail: Fail, what = 'a number'): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
    fail(`\`${fn}\` needs ${what}, but got the text "${v}".`, `Use number("${v}") to turn the text into a number.`);
  }
  fail(`\`${fn}\` needs ${what}, but got ${typeName(v)}.`);
}

function list(v: Value, fn: string, fail: Fail): Value[] {
  if (Array.isArray(v)) return v;
  fail(`\`${fn}\` needs a list, but got ${typeName(v)}.`, 'A list looks like [1, 2, 3].');
}

function str(v: Value, fn: string, fail: Fail): string {
  if (typeof v === 'string') return v;
  fail(`\`${fn}\` needs text, but got ${typeName(v)}.`, 'Use text(...) to turn a value into text.');
}

const rad = (d: number) => (d * Math.PI) / 180;

function arity(name: string, args: Value[], min: number, max: number, fail: Fail, usage: string) {
  if (args.length < min || args.length > max) {
    const want = min === max ? `${min}` : `${min} to ${max}`;
    fail(`\`${name}\` needs ${want} value${max === 1 ? '' : 's'}, but got ${args.length}.`, `Like ${usage}.`);
  }
}

type Def = [string, number, number, string, (a: Value[], fail: Fail) => Value];

const defs: Def[] = [
  ['sqrt', 1, 1, 'sqrt(16)', ([x], f) => {
    const n = num(x, 'sqrt', f);
    if (n < 0) f('I can\'t take the square root of a number below zero.');
    return Math.sqrt(n);
  }],
  ['abs', 1, 1, 'abs(-3)', ([x], f) => Math.abs(num(x, 'abs', f))],
  ['round', 1, 2, 'round(3.7) or round(3.14159, 2)', ([x, p], f) => {
    const n = num(x, 'round', f);
    const places = p === undefined ? 0 : num(p, 'round', f);
    const k = Math.pow(10, places);
    return Math.round(n * k) / k;
  }],
  ['floor', 1, 1, 'floor(3.7)', ([x], f) => Math.floor(num(x, 'floor', f))],
  ['ceil', 1, 1, 'ceil(3.2)', ([x], f) => Math.ceil(num(x, 'ceil', f))],
  ['sin', 1, 1, 'sin(90)', ([x], f) => clean(Math.sin(rad(num(x, 'sin', f))))],
  ['cos', 1, 1, 'cos(0)', ([x], f) => clean(Math.cos(rad(num(x, 'cos', f))))],
  ['tan', 1, 1, 'tan(45)', ([x], f) => clean(Math.tan(rad(num(x, 'tan', f))))],
  ['angle', 2, 2, 'angle(dx, dy)', ([x, y], f) => (Math.atan2(num(y, 'angle', f), num(x, 'angle', f)) * 180) / Math.PI],
  ['distance', 2, 4, 'distance(ball, paddle) or distance(x1, y1, x2, y2)', (a, f) => {
    if (a.length === 2) {
      const [p, q] = a;
      if (!(p instanceof Thing) || !(q instanceof Thing)) return f('With two values, `distance` needs two shapes.', 'For points, write distance(x1, y1, x2, y2).');
      return Math.hypot(q.x - p.x, q.y - p.y);
    }
    if (a.length !== 4) f('`distance` needs two shapes, or four numbers.');
    const [x1, y1, x2, y2] = a.map((v) => num(v, 'distance', f));
    return Math.hypot(x2 - x1, y2 - y1);
  }],
  ['min', 1, 99, 'min(3, 8) or min(numbers)', (a, f) => Math.min(...nums(a, 'min', f))],
  ['max', 1, 99, 'max(3, 8) or max(numbers)', (a, f) => Math.max(...nums(a, 'max', f))],
  ['sum', 1, 1, 'sum([1, 2, 3])', ([x], f) => list(x, 'sum', f).reduce<number>((s, v) => s + num(v, 'sum', f, 'a list of numbers'), 0)],
  ['clamp', 3, 3, 'clamp(x, 0, 480)', ([x, lo, hi], f) => Math.max(num(lo, 'clamp', f), Math.min(num(hi, 'clamp', f), num(x, 'clamp', f)))],
  ['text', 1, 1, 'text(42)', ([x]) => textOf(x)],
  ['number', 1, 1, 'number("42")', ([x], f) => {
    if (typeof x === 'number') return x;
    if (typeof x === 'string' && x.trim() !== '' && !Number.isNaN(Number(x))) return Number(x);
    if (typeof x === 'boolean') return x ? 1 : 0;
    return f(`I can't turn ${typeof x === 'string' ? `"${x}"` : typeName(x)} into a number.`);
  }],
  ['length', 1, 1, 'length(names) or length of names', ([x], f) => {
    if (typeof x === 'string' || Array.isArray(x)) return x.length;
    if (x instanceof Rec) return x.m.size;
    return f(`\`length\` works on lists and text, but got ${typeName(x)}.`);
  }],
  ['upper', 1, 1, 'upper("hi")', ([x], f) => str(x, 'upper', f).toUpperCase()],
  ['lower', 1, 1, 'lower("HI")', ([x], f) => str(x, 'lower', f).toLowerCase()],
  ['join', 1, 2, 'join(words, " ")', ([x, sep], f) => list(x, 'join', f).map((v) => textOf(v)).join(sep === undefined ? '' : str(sep, 'join', f))],
  ['split', 1, 2, 'split("a b c", " ")', ([x, sep], f) => {
    const s = str(x, 'split', f);
    return sep === undefined ? [...s] : s.split(str(sep, 'split', f));
  }],
  ['range', 2, 2, 'range(1, 5)', ([a, b], f) => {
    const lo = num(a, 'range', f), hi = num(b, 'range', f);
    if (Math.abs(hi - lo) > 100000) f('That range is too long. Keep it under 100,000 numbers.');
    const out: number[] = [];
    if (lo <= hi) for (let i = lo; i <= hi; i++) out.push(i);
    else for (let i = lo; i >= hi; i--) out.push(i);
    return out;
  }],
  ['sort', 1, 1, 'sort([3, 1, 2])', ([x], f) => {
    const l = [...list(x, 'sort', f)];
    if (l.every((v) => typeof v === 'number')) return (l as number[]).sort((p, q) => p - q);
    if (l.every((v) => typeof v === 'string')) return (l as string[]).sort();
    return f('`sort` needs a list of only numbers, or only text.');
  }],
  ['reverse', 1, 1, 'reverse([1, 2, 3])', ([x], f) => {
    if (typeof x === 'string') return [...x].reverse().join('');
    return [...list(x, 'reverse', f)].reverse();
  }],
  ['find', 2, 2, 'find(names, "Pip")', ([x, v], f) => {
    if (typeof x === 'string') return x.indexOf(str(v, 'find', f)) + 1;
    return list(x, 'find', f).findIndex((y) => equals(y, v)) + 1;
  }],
  ['keys', 1, 1, 'keys(pet)', ([x], f) => {
    if (!(x instanceof Rec)) return f(`\`keys\` needs a record, but got ${typeName(x)}.`);
    return [...x.m.keys()];
  }],
  ['rgb', 3, 3, 'rgb(255, 120, 0)', (a, f) => {
    const [r, g, b] = a.map((v) => Math.round(Math.max(0, Math.min(255, num(v, 'rgb', f)))));
    return `rgb(${r}, ${g}, ${b})`;
  }],
  ['hsl', 3, 3, 'hsl(200, 60, 50)', (a, f) => {
    const [h, s, l] = a.map((v) => num(v, 'hsl', f));
    return `hsl(${fmtNum(h)}, ${fmtNum(s)}%, ${fmtNum(l)}%)`;
  }],
  // ---- more math ----
  ['exp', 1, 1, 'exp(1)', ([x], f) => Math.exp(num(x, 'exp', f))],
  ['log', 1, 2, 'log(100, 10)', ([x, b], f) => {
    const n = num(x, 'log', f);
    if (n <= 0) return f('`log` needs a number above zero.');
    return b === undefined ? Math.log(n) : Math.log(n) / Math.log(num(b, 'log', f));
  }],
  ['sign', 1, 1, 'sign(-5)', ([x], f) => Math.sign(num(x, 'sign', f))],
  ['lerp', 3, 3, 'lerp(0, 100, 0.25)', ([a, b, t], f) => { const p = num(a, 'lerp', f); return p + (num(b, 'lerp', f) - p) * num(t, 'lerp', f); }],
  ['average', 1, 99, 'average([2, 4, 9])', (a, f) => { const n = nums(a, 'average', f); return n.reduce((p, q) => p + q, 0) / n.length; }],
  ['asin', 1, 1, 'asin(1)', ([x], f) => (Math.asin(num(x, 'asin', f)) * 180) / Math.PI],
  ['acos', 1, 1, 'acos(0)', ([x], f) => (Math.acos(num(x, 'acos', f)) * 180) / Math.PI],
  ['atan', 1, 1, 'atan(1)', ([x], f) => (Math.atan(num(x, 'atan', f)) * 180) / Math.PI],
  ['chance', 1, 1, 'chance(25)', ([x], f) => Math.random() * 100 < num(x, 'chance', f, 'a percent')],
  ['shuffle', 1, 1, 'shuffle(cards)', ([x], f) => {
    const l = [...list(x, 'shuffle', f)];
    for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
    return l;
  }],
  ['sample', 2, 2, 'sample(cards, 3)', ([x, n], f) => {
    const l = [...list(x, 'sample', f)];
    const k = Math.max(0, Math.min(l.length, Math.floor(num(n, 'sample', f))));
    for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; }
    return l.slice(0, k);
  }],
  // ---- more text ----
  ['trim', 1, 1, 'trim("  hi  ")', ([x], f) => str(x, 'trim', f).trim()],
  ['replace', 3, 3, 'replace("a-b-c", "-", " ")', ([x, a, b], f) => str(x, 'replace', f).split(str(a, 'replace', f)).join(str(b, 'replace', f))],
  ['slice', 2, 3, 'slice(names, 2, 4)', ([x, a, b], f) => {
    const from = Math.floor(num(a, 'slice', f));
    const len = typeof x === 'string' ? [...x].length : list(x, 'slice', f).length;
    const to = b === undefined ? len : Math.floor(num(b, 'slice', f));
    const lo = from < 0 ? len + from : from - 1, hi = to < 0 ? len + to + 1 : to;
    if (typeof x === 'string') return [...x].slice(Math.max(0, lo), Math.max(0, hi)).join('');
    return list(x, 'slice', f).slice(Math.max(0, lo), Math.max(0, hi));
  }],
  ['title', 1, 1, 'title("hello there")', ([x], f) => str(x, 'title', f).replace(/\b\p{L}/gu, (c) => c.toUpperCase())],
  ['count', 2, 2, 'count(rolls, 6)', ([x, v], f) => {
    if (typeof x === 'string') { const n = str(v, 'count', f); return n ? x.split(n).length - 1 : 0; }
    return list(x, 'count', f).filter((y) => equals(y, v)).length;
  }],
  ['code', 1, 1, 'code("A")', ([x], f) => { const t = str(x, 'code', f); if (!t) return f('`code` needs a letter.'); return t.codePointAt(0)!; }],
  ['letter', 1, 1, 'letter(65)', ([x], f) => String.fromCodePoint(Math.max(0, Math.floor(num(x, 'letter', f))))],
  ['begins', 2, 2, 'begins(name, "Dr")', ([x, p], f) => str(x, 'begins', f).startsWith(str(p, 'begins', f))],
  ['ends', 2, 2, 'ends(file, ".once")', ([x, p], f) => str(x, 'ends', f).endsWith(str(p, 'ends', f))],
  ['pad', 2, 3, 'pad(score, 5, "0")', ([x, w, c], f) => textOf(x).padStart(Math.floor(num(w, 'pad', f)), c === undefined ? ' ' : str(c, 'pad', f))],
  // ---- more lists and records ----
  ['pop', 1, 1, 'pop(stack)', ([x], f) => { const l = list(x, 'pop', f); if (!l.length) return f('The list is empty, so there is nothing to pop.'); return l.pop()!; }],
  ['insert', 3, 3, 'insert(names, 1, "Ada")', ([x, i, v], f) => {
    const l = list(x, 'insert', f);
    const n = Math.floor(num(i, 'insert', f));
    if (n < 1 || n > l.length + 1) return f(`Position ${n} is outside the list, which has ${l.length} items.`, 'Positions count from 1. Use length + 1 to insert at the end.');
    l.splice(n - 1, 0, v);
    return l;
  }],
  ['unique', 1, 1, 'unique([1, 1, 2])', ([x], f) => { const out: Value[] = []; for (const v of list(x, 'unique', f)) if (!out.some((y) => equals(y, v))) out.push(v); return out; }],
  ['flatten', 1, 1, 'flatten([[1, 2], [3]])', ([x], f) => list(x, 'flatten', f).flatMap((v) => (Array.isArray(v) ? v : [v]))],
  ['zip', 2, 2, 'zip(names, scores)', ([a, b], f) => { const p = list(a, 'zip', f), q = list(b, 'zip', f); return p.slice(0, Math.min(p.length, q.length)).map((v, i) => [v, q[i]]); }],
  ['fill', 2, 2, 'fill(5, 0)', ([n, v], f) => {
    const k = Math.floor(num(n, 'fill', f));
    if (k < 0 || k > 100000) return f('`fill` makes between 0 and 100,000 items.');
    return Array.from({ length: k }, () => deepCopy(v));
  }],
  ['copy', 1, 1, 'copy(board)', ([x]) => deepCopy(x)],
  ['values', 1, 1, 'values(scores)', ([x], f) => { if (!(x instanceof Rec)) return f(`\`values\` needs a record, but got ${typeName(x)}.`); return [...x.m.values()]; }],
  ['merge', 2, 2, 'merge(defaults, options)', ([a, b], f) => {
    if (!(a instanceof Rec) || !(b instanceof Rec)) return f('`merge` needs two records.');
    const r = new Rec();
    for (const [k, v] of a.m) r.m.set(k, v);
    for (const [k, v] of b.m) r.m.set(k, v);
    return r;
  }],
  // ---- values, time and color ----
  ['type', 1, 1, 'type(x)', ([x]) => kindOf(x)],
  ['now', 0, 0, 'now()', () => {
    const d = new Date();
    const r = new Rec();
    const parts: [string, number][] = [['year', d.getFullYear()], ['month', d.getMonth() + 1], ['day', d.getDate()], ['weekday', d.getDay() === 0 ? 7 : d.getDay()], ['hour', d.getHours()], ['minute', d.getMinutes()], ['second', d.getSeconds()]];
    for (const [k, v] of parts) r.m.set(k, v);
    return r;
  }],
  ['randomcolor', 0, 0, 'randomcolor()', () => `hsl(${Math.floor(Math.random() * 360)}, 70%, 55%)`],
  ['mix', 3, 3, 'mix("#ff0000", "#0000ff", 0.5)', ([a, b, t], f) => {
    const p = parseColor(str(a, 'mix', f), f), q = parseColor(str(b, 'mix', f), f), k = num(t, 'mix', f);
    const c = p.map((v, i) => Math.round(v + (q[i] - v) * k));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }],
];

function parseColor(c: string, f: Fail): number[] {
  let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c.trim());
  if (m) return m.slice(1).map((h) => parseInt(h, 16));
  m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c.trim());
  if (m) return m.slice(1).map((h) => parseInt(h + h, 16));
  m = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(c.trim());
  if (m) return m.slice(1).map(Number);
  return f(`\`mix\` needs colors written as codes like "#ff8800" or rgb(...), but got "${c}".`);
}

type GenDef = [string, number, number, string, (a: Value[], call: Caller, fail: Fail) => Generator<unknown, Value, unknown>];

/** Built-ins that take instructions, like map(numbers, given n: n * 2). */
const genDefs: GenDef[] = [
  ['map', 2, 2, 'map(numbers, given n: n * 2)', function* ([x, fn], call, f) {
    const out: Value[] = [];
    for (const v of [...list(x, 'map', f)]) out.push(yield* call(fn, [v]));
    return out;
  }],
  ['filter', 2, 2, 'filter(numbers, given n: n is above 0)', function* ([x, fn], call, f) {
    const out: Value[] = [];
    for (const v of [...list(x, 'filter', f)]) if (truthy(yield* call(fn, [v]))) out.push(v);
    return out;
  }],
  ['reduce', 3, 3, 'reduce(numbers, given total and n: total + n, 0)', function* ([x, fn, start], call, f) {
    let acc = start;
    for (const v of [...list(x, 'reduce', f)]) acc = yield* call(fn, [acc, v]);
    return acc;
  }],
  ['sortby', 2, 2, 'sortby(enemies, given e: e\'s x)', function* ([x, fn], call, f) {
    const l = [...list(x, 'sortby', f)];
    const keyed: [Value, Value][] = [];
    for (const v of l) keyed.push([yield* call(fn, [v]), v]);
    const allNum = keyed.every(([k]) => typeof k === 'number'), allText = keyed.every(([k]) => typeof k === 'string');
    if (!allNum && !allText) return f('The instructions given to `sortby` must give back only numbers, or only text.');
    keyed.sort((p, q) => (allNum ? (p[0] as number) - (q[0] as number) : String(p[0]).localeCompare(String(q[0]))));
    return keyed.map(([, v]) => v);
  }],
  ['some', 2, 2, 'some(enemies, given e: e touches player)', function* ([x, fn], call, f) {
    for (const v of [...list(x, 'some', f)]) if (truthy(yield* call(fn, [v]))) return true;
    return false;
  }],
  ['all', 2, 2, 'all(scores, given s: s is above 0)', function* ([x, fn], call, f) {
    for (const v of [...list(x, 'all', f)]) if (!truthy(yield* call(fn, [v]))) return false;
    return true;
  }],
];

function clean(n: number): number {
  return Math.abs(n) < 1e-12 ? 0 : Math.round(n * 1e12) / 1e12;
}

function nums(a: Value[], fn: string, fail: Fail): number[] {
  const items = a.length === 1 && Array.isArray(a[0]) ? a[0] : a;
  if (items.length === 0) fail(`\`${fn}\` needs at least one number.`);
  return items.map((v) => num(v, fn, fail));
}

export function builtins(): Map<string, Builtin> {
  const m = new Map<string, Builtin>();
  for (const [name, min, max, usage, fn] of defs) {
    m.set(name, new Builtin(name, (args, fail) => {
      arity(name, args, min, max, fail, usage);
      return fn(args, fail);
    }));
  }
  return m;
}

export function genBuiltins(): Map<string, GenBuiltin> {
  const m = new Map<string, GenBuiltin>();
  for (const [name, min, max, usage, fn] of genDefs) {
    m.set(name, new GenBuiltin(name, (args, call, fail) => {
      arity(name, args, min, max, fail, usage);
      return fn(args, call, fail);
    }));
  }
  return m;
}

/** Built-ins that need the picture or the person, added by the runner. */
export const HOST_BUILTINS = ['ask', 'measure', 'direction', 'nearest'];

export const BUILTIN_NAMES = [...defs.map((d) => d[0]), ...genDefs.map((d) => d[0]), ...HOST_BUILTINS];
