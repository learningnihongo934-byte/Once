import { Stmt } from './ast';

export type Value = number | string | boolean | null | Value[] | Rec | Thing | Fn | Builtin | Edge;

/** A record, written {name: "Pip", age: 3}. */
export class Rec {
  m = new Map<string, Value>();
}

/** Instructions the story wrote with `to name ... end`. */
export class Fn {
  constructor(public def: Extract<Stmt, { k: 'fn' }>, public closure: unknown) {}
}

/** Instructions that come with Once, like sqrt or length. */
export class Builtin {
  constructor(public name: string, public fn: (args: Value[], fail: (msg: string, hint?: string) => never) => Value) {}
}

/** The edge of the picture, so you can ask `ball touches edge`. */
export class Edge { readonly isEdge = true; }
export const EDGE = new Edge();

const INK = '#1f1f1f';
const PALETTE = ['#e5484d', '#f5a524', '#30a46c', '#0078d4', '#8e4ec6', '#f76b15', '#12a594'];

/** A shape made with `new`. It stays on the picture, moves by itself and can bump into others. */
export class Thing {
  static next = 1;
  id = Thing.next++;
  x = 0; y = 0; dx = 0; dy = 0;
  w = 30; h = 30; size = 20;
  color: string;
  bounce = 0;
  /** Stays inside the picture (set by `bouncy`). */
  walls = false;
  solid = false; fixed = false; hidden = false; removed = false;
  text = '';
  angle = 0;
  outline = 0;
  extra = new Map<string, Value>();
  constructor(public kind: 'circle' | 'box' | 'text') {
    this.color = kind === 'text' ? INK : PALETTE[(this.id - 1) % PALETTE.length];
    if (kind === 'box') { this.w = 40; this.h = 40; }
  }
}

export const INK_COLOR = INK;

export function typeName(v: Value): string {
  if (v === null) return 'nothing';
  if (typeof v === 'number') return 'a number';
  if (typeof v === 'string') return 'text';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return 'a list';
  if (v instanceof Rec) return 'a record';
  if (v instanceof Thing) return `a ${v.kind}`;
  if (v instanceof Fn) return `the instructions \`${v.def.name}\``;
  if (v instanceof Builtin) return `the built-in instructions \`${v.name}\``;
  if (v instanceof Edge) return 'the edge';
  return 'something';
}

export function fmtNum(n: number): string {
  if (Number.isNaN(n)) return 'not a number';
  if (!Number.isFinite(n)) return n > 0 ? 'infinity' : '-infinity';
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toFixed(6)));
}

export function textOf(v: Value, nested = false): string {
  if (v === null) return 'nothing';
  if (typeof v === 'number') return fmtNum(v);
  if (typeof v === 'string') return nested ? JSON.stringify(v) : v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return '[' + v.map((x) => textOf(x, true)).join(', ') + ']';
  if (v instanceof Rec) return '{' + [...v.m].map(([k, x]) => `${k}: ${textOf(x, true)}`).join(', ') + '}';
  if (v instanceof Thing) return v.kind === 'text' ? `a text "${v.text}"` : `a ${v.kind} at ${fmtNum(v.x)}, ${fmtNum(v.y)}`;
  if (v instanceof Fn) return `the instructions ${v.def.name}`;
  if (v instanceof Builtin) return `the built-in ${v.name}`;
  if (v instanceof Edge) return 'the edge';
  return '?';
}

export function truthy(v: Value): boolean {
  return !(v === false || v === null || v === 0 || v === '');
}

export function equals(a: Value, b: Value): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equals(x, b[i]));
  if (a instanceof Rec && b instanceof Rec) {
    if (a.m.size !== b.m.size) return false;
    for (const [k, x] of a.m) if (!b.m.has(k) || !equals(x, b.m.get(k)!)) return false;
    return true;
  }
  return false;
}

const KEY_NAMES: Record<string, string> = {
  ' ': 'space', spacebar: 'space', arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down',
  esc: 'escape', return: 'enter',
};

export function normKey(k: string): string {
  const low = k === ' ' ? ' ' : k.toLowerCase().trim();
  return KEY_NAMES[low] ?? low;
}

const NOTE_STEPS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** "C4", "F#5", "Bb3" or a MIDI number (60 is middle C) to a frequency. */
export function noteFreq(v: Value): number | null {
  if (typeof v === 'number') {
    if (v > 0 && v < 128) return 440 * Math.pow(2, (v - 69) / 12);
    return v >= 128 && v < 20000 ? v : null;
  }
  if (typeof v !== 'string') return null;
  const m = /^([a-g])(#|b|sharp|flat)?(-?\d)?$/i.exec(v.trim());
  if (!m) return null;
  let n = NOTE_STEPS[m[1].toLowerCase()];
  if (m[2] === '#' || m[2] === 'sharp') n++;
  if (m[2] === 'b' || m[2] === 'flat') n--;
  const octave = m[3] === undefined ? 4 : parseInt(m[3], 10);
  return 440 * Math.pow(2, (12 * (octave + 1) + n - 69) / 12);
}

export const SOUNDS = ['beep', 'boop', 'coin', 'jump', 'pop', 'hit', 'boom', 'click'];
export const WAVES = ['triangle', 'sine', 'square', 'sawtooth'];

export const COLOR_NAMES = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'black', 'white',
  'gray', 'grey', 'gold', 'teal', 'tomato', 'skyblue', 'navy', 'maroon', 'olive', 'plum', 'salmon', 'coral', 'crimson',
  'violet', 'indigo', 'turquoise', 'lime', 'silver', 'beige', 'ivory', 'khaki', 'lavender', 'chocolate', 'tan', 'peru',
  'sienna', 'orchid', 'firebrick', 'goldenrod', 'seagreen', 'steelblue', 'slateblue', 'wheat', 'linen', 'cornsilk',
  'darkgreen', 'darkblue', 'darkred', 'lightblue', 'lightgreen', 'hotpink', 'aqua', 'cyan', 'magenta', 'forestgreen',
  'midnightblue', 'cadetblue', 'rosybrown', 'burlywood', 'transparent'];
