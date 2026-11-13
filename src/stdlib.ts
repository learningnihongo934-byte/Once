// Built-in instructions. Angles are in degrees, lists count from 1.
import { Builtin, Rec, Thing, Value, equals, fmtNum, textOf, typeName } from './values';

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

export const BUILTIN_NAMES = defs.map((d) => d[0]);
