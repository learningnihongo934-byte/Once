"use strict";
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/cli.ts
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");

// src/errors.ts
var OnceError = class extends Error {
  constructor(kind, message, span2, hint) {
    super(message);
    this.kind = kind;
    this.span = span2;
    this.hint = hint;
  }
};
function syntaxError(span2, msg, hint) {
  throw new OnceError("syntax", msg, span2, hint);
}
function runtimeError(span2, msg, hint) {
  throw new OnceError("runtime", msg, span2, hint);
}
function formatError(err, source, file) {
  const head = err.kind === "syntax" ? "Something in the story doesn't read right" : "The story stopped";
  const out = [];
  const where = err.span ? `${file ? file + ", " : ""}line ${err.span.line}` : file || "";
  out.push(`${head}${where ? ` (${where})` : ""}:`);
  out.push("  " + err.message);
  if (err.span) {
    const text = source.split("\n")[err.span.line - 1] ?? "";
    const num2 = String(err.span.line);
    out.push("");
    out.push(`  ${num2} | ${text}`);
    out.push(`  ${" ".repeat(num2.length)} | ${" ".repeat(Math.max(0, err.span.col - 1))}${"^".repeat(Math.max(1, err.span.len))}`);
  }
  if (err.hint) {
    out.push("");
    out.push("  Hint: " + err.hint);
  }
  return out.join("\n");
}
function distance(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_2, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}
function closest(word, options) {
  const w = word.toLowerCase();
  let best = null;
  let bestD = Infinity;
  const limit = Math.max(1, Math.floor(word.length / 3));
  for (const o of options) {
    if (o === word) continue;
    const d = distance(w, o.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return bestD <= limit ? best : null;
}

// src/values.ts
var Rec = class {
  constructor() {
    __publicField(this, "m", /* @__PURE__ */ new Map());
  }
};
var Fn = class {
  constructor(def, closure) {
    this.def = def;
    this.closure = closure;
  }
};
var Builtin = class {
  constructor(name, fn) {
    this.name = name;
    this.fn = fn;
  }
};
var Edge = class {
  constructor() {
    __publicField(this, "isEdge", true);
  }
};
var EDGE = new Edge();
var INK = "#1f1f1f";
var PALETTE = ["#e5484d", "#f5a524", "#30a46c", "#0078d4", "#8e4ec6", "#f76b15", "#12a594"];
var _Thing = class _Thing {
  constructor(kind) {
    this.kind = kind;
    __publicField(this, "id", _Thing.next++);
    __publicField(this, "x", 0);
    __publicField(this, "y", 0);
    __publicField(this, "dx", 0);
    __publicField(this, "dy", 0);
    __publicField(this, "w", 30);
    __publicField(this, "h", 30);
    __publicField(this, "size", 20);
    __publicField(this, "color");
    __publicField(this, "bounce", 0);
    /** Stays inside the picture (set by `bouncy`). */
    __publicField(this, "walls", false);
    __publicField(this, "solid", false);
    __publicField(this, "fixed", false);
    __publicField(this, "hidden", false);
    __publicField(this, "removed", false);
    __publicField(this, "text", "");
    __publicField(this, "angle", 0);
    __publicField(this, "outline", 0);
    __publicField(this, "extra", /* @__PURE__ */ new Map());
    this.color = kind === "text" ? INK : PALETTE[(this.id - 1) % PALETTE.length];
    if (kind === "box") {
      this.w = 40;
      this.h = 40;
    }
  }
};
__publicField(_Thing, "next", 1);
var Thing = _Thing;
var INK_COLOR = INK;
function typeName(v) {
  if (v === null) return "nothing";
  if (typeof v === "number") return "a number";
  if (typeof v === "string") return "text";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return "a list";
  if (v instanceof Rec) return "a record";
  if (v instanceof Thing) return `a ${v.kind}`;
  if (v instanceof Fn) return `the instructions \`${v.def.name}\``;
  if (v instanceof Builtin) return `the built-in instructions \`${v.name}\``;
  if (v instanceof Edge) return "the edge";
  return "something";
}
function fmtNum(n) {
  if (Number.isNaN(n)) return "not a number";
  if (!Number.isFinite(n)) return n > 0 ? "infinity" : "-infinity";
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toFixed(6)));
}
function textOf(v, nested = false) {
  if (v === null) return "nothing";
  if (typeof v === "number") return fmtNum(v);
  if (typeof v === "string") return nested ? JSON.stringify(v) : v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return "[" + v.map((x) => textOf(x, true)).join(", ") + "]";
  if (v instanceof Rec) return "{" + [...v.m].map(([k, x]) => `${k}: ${textOf(x, true)}`).join(", ") + "}";
  if (v instanceof Thing) return v.kind === "text" ? `a text "${v.text}"` : `a ${v.kind} at ${fmtNum(v.x)}, ${fmtNum(v.y)}`;
  if (v instanceof Fn) return `the instructions ${v.def.name}`;
  if (v instanceof Builtin) return `the built-in ${v.name}`;
  if (v instanceof Edge) return "the edge";
  return "?";
}
function truthy(v) {
  return !(v === false || v === null || v === 0 || v === "");
}
function equals(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => equals(x, b[i]));
  if (a instanceof Rec && b instanceof Rec) {
    if (a.m.size !== b.m.size) return false;
    for (const [k, x] of a.m) if (!b.m.has(k) || !equals(x, b.m.get(k))) return false;
    return true;
  }
  return false;
}
var KEY_NAMES = {
  " ": "space",
  spacebar: "space",
  arrowleft: "left",
  arrowright: "right",
  arrowup: "up",
  arrowdown: "down",
  esc: "escape",
  return: "enter"
};
function normKey(k) {
  const low = k === " " ? " " : k.toLowerCase().trim();
  return KEY_NAMES[low] ?? low;
}
var NOTE_STEPS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
function noteFreq(v) {
  if (typeof v === "number") {
    if (v > 0 && v < 128) return 440 * Math.pow(2, (v - 69) / 12);
    return v >= 128 && v < 2e4 ? v : null;
  }
  if (typeof v !== "string") return null;
  const m = /^([a-g])(#|b|sharp|flat)?(-?\d)?$/i.exec(v.trim());
  if (!m) return null;
  let n = NOTE_STEPS[m[1].toLowerCase()];
  if (m[2] === "#" || m[2] === "sharp") n++;
  if (m[2] === "b" || m[2] === "flat") n--;
  const octave = m[3] === void 0 ? 4 : parseInt(m[3], 10);
  return 440 * Math.pow(2, (12 * (octave + 1) + n - 69) / 12);
}
var SOUNDS = ["beep", "boop", "coin", "jump", "pop", "hit", "boom", "click"];
var WAVES = ["triangle", "sine", "square", "sawtooth"];
var COLOR_NAMES = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "brown",
  "black",
  "white",
  "gray",
  "grey",
  "gold",
  "teal",
  "tomato",
  "skyblue",
  "navy",
  "maroon",
  "olive",
  "plum",
  "salmon",
  "coral",
  "crimson",
  "violet",
  "indigo",
  "turquoise",
  "lime",
  "silver",
  "beige",
  "ivory",
  "khaki",
  "lavender",
  "chocolate",
  "tan",
  "peru",
  "sienna",
  "orchid",
  "firebrick",
  "goldenrod",
  "seagreen",
  "steelblue",
  "slateblue",
  "wheat",
  "linen",
  "cornsilk",
  "darkgreen",
  "darkblue",
  "darkred",
  "lightblue",
  "lightgreen",
  "hotpink",
  "aqua",
  "cyan",
  "magenta",
  "forestgreen",
  "midnightblue",
  "cadetblue",
  "rosybrown",
  "burlywood",
  "transparent"
];

// src/stdlib.ts
function num(v, fn, fail2, what = "a number") {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    fail2(`\`${fn}\` needs ${what}, but got the text "${v}".`, `Use number("${v}") to turn the text into a number.`);
  }
  fail2(`\`${fn}\` needs ${what}, but got ${typeName(v)}.`);
}
function list(v, fn, fail2) {
  if (Array.isArray(v)) return v;
  fail2(`\`${fn}\` needs a list, but got ${typeName(v)}.`, "A list looks like [1, 2, 3].");
}
function str(v, fn, fail2) {
  if (typeof v === "string") return v;
  fail2(`\`${fn}\` needs text, but got ${typeName(v)}.`, "Use text(...) to turn a value into text.");
}
var rad = (d) => d * Math.PI / 180;
function arity(name, args, min, max, fail2, usage) {
  if (args.length < min || args.length > max) {
    const want = min === max ? `${min}` : `${min} to ${max}`;
    fail2(`\`${name}\` needs ${want} value${max === 1 ? "" : "s"}, but got ${args.length}.`, `Like ${usage}.`);
  }
}
var defs = [
  ["sqrt", 1, 1, "sqrt(16)", ([x], f) => {
    const n = num(x, "sqrt", f);
    if (n < 0) f("I can't take the square root of a number below zero.");
    return Math.sqrt(n);
  }],
  ["abs", 1, 1, "abs(-3)", ([x], f) => Math.abs(num(x, "abs", f))],
  ["round", 1, 2, "round(3.7) or round(3.14159, 2)", ([x, p], f) => {
    const n = num(x, "round", f);
    const places = p === void 0 ? 0 : num(p, "round", f);
    const k = Math.pow(10, places);
    return Math.round(n * k) / k;
  }],
  ["floor", 1, 1, "floor(3.7)", ([x], f) => Math.floor(num(x, "floor", f))],
  ["ceil", 1, 1, "ceil(3.2)", ([x], f) => Math.ceil(num(x, "ceil", f))],
  ["sin", 1, 1, "sin(90)", ([x], f) => clean(Math.sin(rad(num(x, "sin", f))))],
  ["cos", 1, 1, "cos(0)", ([x], f) => clean(Math.cos(rad(num(x, "cos", f))))],
  ["tan", 1, 1, "tan(45)", ([x], f) => clean(Math.tan(rad(num(x, "tan", f))))],
  ["angle", 2, 2, "angle(dx, dy)", ([x, y], f) => Math.atan2(num(y, "angle", f), num(x, "angle", f)) * 180 / Math.PI],
  ["distance", 2, 4, "distance(ball, paddle) or distance(x1, y1, x2, y2)", (a, f) => {
    if (a.length === 2) {
      const [p, q] = a;
      if (!(p instanceof Thing) || !(q instanceof Thing)) return f("With two values, `distance` needs two shapes.", "For points, write distance(x1, y1, x2, y2).");
      return Math.hypot(q.x - p.x, q.y - p.y);
    }
    if (a.length !== 4) f("`distance` needs two shapes, or four numbers.");
    const [x1, y1, x2, y2] = a.map((v) => num(v, "distance", f));
    return Math.hypot(x2 - x1, y2 - y1);
  }],
  ["min", 1, 99, "min(3, 8) or min(numbers)", (a, f) => Math.min(...nums(a, "min", f))],
  ["max", 1, 99, "max(3, 8) or max(numbers)", (a, f) => Math.max(...nums(a, "max", f))],
  ["sum", 1, 1, "sum([1, 2, 3])", ([x], f) => list(x, "sum", f).reduce((s, v) => s + num(v, "sum", f, "a list of numbers"), 0)],
  ["clamp", 3, 3, "clamp(x, 0, 480)", ([x, lo, hi], f) => Math.max(num(lo, "clamp", f), Math.min(num(hi, "clamp", f), num(x, "clamp", f)))],
  ["text", 1, 1, "text(42)", ([x]) => textOf(x)],
  ["number", 1, 1, 'number("42")', ([x], f) => {
    if (typeof x === "number") return x;
    if (typeof x === "string" && x.trim() !== "" && !Number.isNaN(Number(x))) return Number(x);
    if (typeof x === "boolean") return x ? 1 : 0;
    return f(`I can't turn ${typeof x === "string" ? `"${x}"` : typeName(x)} into a number.`);
  }],
  ["length", 1, 1, "length(names) or length of names", ([x], f) => {
    if (typeof x === "string" || Array.isArray(x)) return x.length;
    if (x instanceof Rec) return x.m.size;
    return f(`\`length\` works on lists and text, but got ${typeName(x)}.`);
  }],
  ["upper", 1, 1, 'upper("hi")', ([x], f) => str(x, "upper", f).toUpperCase()],
  ["lower", 1, 1, 'lower("HI")', ([x], f) => str(x, "lower", f).toLowerCase()],
  ["join", 1, 2, 'join(words, " ")', ([x, sep], f) => list(x, "join", f).map((v) => textOf(v)).join(sep === void 0 ? "" : str(sep, "join", f))],
  ["split", 1, 2, 'split("a b c", " ")', ([x, sep], f) => {
    const s = str(x, "split", f);
    return sep === void 0 ? [...s] : s.split(str(sep, "split", f));
  }],
  ["range", 2, 2, "range(1, 5)", ([a, b], f) => {
    const lo = num(a, "range", f), hi = num(b, "range", f);
    if (Math.abs(hi - lo) > 1e5) f("That range is too long. Keep it under 100,000 numbers.");
    const out = [];
    if (lo <= hi) for (let i = lo; i <= hi; i++) out.push(i);
    else for (let i = lo; i >= hi; i--) out.push(i);
    return out;
  }],
  ["sort", 1, 1, "sort([3, 1, 2])", ([x], f) => {
    const l = [...list(x, "sort", f)];
    if (l.every((v) => typeof v === "number")) return l.sort((p, q) => p - q);
    if (l.every((v) => typeof v === "string")) return l.sort();
    return f("`sort` needs a list of only numbers, or only text.");
  }],
  ["reverse", 1, 1, "reverse([1, 2, 3])", ([x], f) => {
    if (typeof x === "string") return [...x].reverse().join("");
    return [...list(x, "reverse", f)].reverse();
  }],
  ["find", 2, 2, 'find(names, "Pip")', ([x, v], f) => {
    if (typeof x === "string") return x.indexOf(str(v, "find", f)) + 1;
    return list(x, "find", f).findIndex((y) => equals(y, v)) + 1;
  }],
  ["keys", 1, 1, "keys(pet)", ([x], f) => {
    if (!(x instanceof Rec)) return f(`\`keys\` needs a record, but got ${typeName(x)}.`);
    return [...x.m.keys()];
  }],
  ["rgb", 3, 3, "rgb(255, 120, 0)", (a, f) => {
    const [r, g, b] = a.map((v) => Math.round(Math.max(0, Math.min(255, num(v, "rgb", f)))));
    return `rgb(${r}, ${g}, ${b})`;
  }],
  ["hsl", 3, 3, "hsl(200, 60, 50)", (a, f) => {
    const [h, s, l] = a.map((v) => num(v, "hsl", f));
    return `hsl(${fmtNum(h)}, ${fmtNum(s)}%, ${fmtNum(l)}%)`;
  }]
];
function clean(n) {
  return Math.abs(n) < 1e-12 ? 0 : Math.round(n * 1e12) / 1e12;
}
function nums(a, fn, fail2) {
  const items = a.length === 1 && Array.isArray(a[0]) ? a[0] : a;
  if (items.length === 0) fail2(`\`${fn}\` needs at least one number.`);
  return items.map((v) => num(v, fn, fail2));
}
function builtins() {
  const m = /* @__PURE__ */ new Map();
  for (const [name, min, max, usage, fn] of defs) {
    m.set(name, new Builtin(name, (args, fail2) => {
      arity(name, args, min, max, fail2, usage);
      return fn(args, fail2);
    }));
  }
  return m;
}
var BUILTIN_NAMES = defs.map((d) => d[0]);

// src/world.ts
var WIDTH = 480;
var HEIGHT = 360;
var World = class {
  constructor() {
    __publicField(this, "things", []);
    __publicField(this, "gravity", 0);
    __publicField(this, "bg", "#ffffff");
    __publicField(this, "measure", (text, size) => text.length * size * 0.5);
  }
  add(t) {
    this.things.push(t);
  }
  bounds(t) {
    if (t.kind === "text") {
      const w = this.measure(t.text, t.size);
      return { cx: t.x + w / 2, cy: t.y + t.size / 2, hx: w / 2, hy: t.size / 2, circle: false };
    }
    return { cx: t.x, cy: t.y, hx: t.w / 2, hy: t.h / 2, circle: t.kind === "circle" };
  }
  step() {
    const g = this.gravity;
    for (const t of this.things) {
      if (t.removed || t.fixed) continue;
      t.dy += g;
      t.x += t.dx;
      t.y += t.dy;
      if (t.walls) this.edges(t, g);
    }
    let solids = this.things.filter((t) => t.solid && !t.removed && !t.hidden);
    if (solids.length > 400) solids = solids.slice(0, 400);
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) this.resolve(solids[i], solids[j]);
    }
    if (this.things.some((t) => t.removed)) this.things = this.things.filter((t) => !t.removed);
  }
  edges(t, g) {
    const b = this.bounds(t);
    const e = t.bounce;
    if (b.cx - b.hx < 0) {
      t.x -= b.cx - b.hx;
      if (t.dx < 0) t.dx = -t.dx * e;
    } else if (b.cx + b.hx > WIDTH) {
      t.x -= b.cx + b.hx - WIDTH;
      if (t.dx > 0) t.dx = -t.dx * e;
    }
    if (b.cy - b.hy < 0) {
      t.y -= b.cy - b.hy;
      if (t.dy < 0) t.dy = -t.dy * e;
    } else if (b.cy + b.hy > HEIGHT) {
      t.y -= b.cy + b.hy - HEIGHT;
      if (t.dy > 0) t.dy = Math.abs(t.dy) < g * 2 ? 0 : -t.dy * e;
    }
  }
  overlap(a, b) {
    const A = this.bounds(a), B = this.bounds(b);
    const dx = B.cx - A.cx, dy = B.cy - A.cy;
    if (A.circle && B.circle) {
      const d = Math.hypot(dx, dy), r = A.hx + B.hx;
      if (d >= r) return null;
      return d === 0 ? { nx: 1, ny: 0, pen: r } : { nx: dx / d, ny: dy / d, pen: r - d };
    }
    if (!A.circle && !B.circle) {
      const ox = A.hx + B.hx - Math.abs(dx), oy = A.hy + B.hy - Math.abs(dy);
      if (ox <= 0 || oy <= 0) return null;
      return ox < oy ? { nx: Math.sign(dx) || 1, ny: 0, pen: ox } : { nx: 0, ny: Math.sign(dy) || 1, pen: oy };
    }
    const C = A.circle ? A : B, R = A.circle ? B : A;
    const px = Math.max(R.cx - R.hx, Math.min(C.cx, R.cx + R.hx));
    const py = Math.max(R.cy - R.hy, Math.min(C.cy, R.cy + R.hy));
    let vx = C.cx - px, vy = C.cy - py;
    let nx, ny, pen;
    const d2 = vx * vx + vy * vy;
    if (d2 > 0) {
      const d = Math.sqrt(d2);
      if (d >= C.hx) return null;
      nx = vx / d;
      ny = vy / d;
      pen = C.hx - d;
    } else {
      vx = C.cx - R.cx;
      vy = C.cy - R.cy;
      const ox = R.hx - Math.abs(vx) + C.hx, oy = R.hy - Math.abs(vy) + C.hx;
      if (ox < oy) {
        nx = Math.sign(vx) || 1;
        ny = 0;
        pen = ox;
      } else {
        nx = 0;
        ny = Math.sign(vy) || 1;
        pen = oy;
      }
    }
    return A.circle ? { nx: -nx, ny: -ny, pen } : { nx, ny, pen };
  }
  touches(a, b) {
    if (a === b || a.removed || b.removed || a.hidden || b.hidden) return false;
    return this.overlap(a, b) !== null;
  }
  touchesEdge(t) {
    if (t.removed || t.hidden) return false;
    const b = this.bounds(t);
    return b.cx - b.hx <= 0.5 || b.cx + b.hx >= WIDTH - 0.5 || b.cy - b.hy <= 0.5 || b.cy + b.hy >= HEIGHT - 0.5;
  }
  resolve(a, b) {
    const hit = this.overlap(a, b);
    if (!hit) return;
    const ia = a.fixed ? 0 : 1 / Math.max(1, a.w * a.h);
    const ib = b.fixed ? 0 : 1 / Math.max(1, b.w * b.h);
    const sum = ia + ib;
    if (sum === 0) return;
    const { nx, ny, pen } = hit;
    a.x -= nx * pen * (ia / sum);
    a.y -= ny * pen * (ia / sum);
    b.x += nx * pen * (ib / sum);
    b.y += ny * pen * (ib / sum);
    const rv = (b.dx - a.dx) * nx + (b.dy - a.dy) * ny;
    if (rv >= 0) return;
    const e = Math.max(a.bounce, b.bounce);
    const j = -(1 + e) * rv / sum;
    a.dx -= j * ia * nx;
    a.dy -= j * ia * ny;
    b.dx += j * ib * nx;
    b.dy += j * ib * ny;
  }
};

// src/interp.ts
var BREAK = { sig: "stop" };
var CONTINUE = { sig: "skip" };
var EndOfStory = class {
};
var Env = class {
  constructor(parent) {
    this.parent = parent;
    __publicField(this, "vars", /* @__PURE__ */ new Map());
  }
  find(name) {
    for (let e = this; e; e = e.parent) if (e.vars.has(name)) return e;
    return null;
  }
  names() {
    const s = /* @__PURE__ */ new Set();
    for (let e = this; e; e = e.parent) for (const k of e.vars.keys()) s.add(k);
    return s;
  }
};
var SLICE = 5e4;
var THING_PROPS = ["x", "y", "dx", "dy", "size", "width", "height", "color", "bouncy", "solid", "fixed", "hidden", "text", "kind", "angle", "outline", "speed"];
var Runner = class {
  constructor(program, host) {
    this.program = program;
    this.host = host;
    __publicField(this, "world", new World());
    __publicField(this, "globals", new Env(null));
    __publicField(this, "tasks", []);
    __publicField(this, "handlers", []);
    __publicField(this, "frameDraws", []);
    __publicField(this, "time", 0);
    __publicField(this, "frameNo", 0);
    __publicField(this, "steps", 0);
    __publicField(this, "depth", 0);
    __publicField(this, "current", null);
    __publicField(this, "ended", false);
    __publicField(this, "error", null);
    __publicField(this, "keyQueue", []);
    __publicField(this, "clicks", 0);
    /** How long a `repeat forever` pass waits. 0 means "until the next tick". */
    __publicField(this, "frameWait", 0);
    __publicField(this, "mouseRec", new Rec());
    for (const [name, b] of builtins()) this.globals.vars.set(name, b);
    const g = this.globals.vars;
    g.set("width", WIDTH);
    g.set("height", HEIGHT);
    g.set("pi", Math.PI);
    g.set("edge", EDGE);
    g.set("gravity", 0);
    g.set("time", 0);
    g.set("frame", 0);
    g.set("mouse", this.mouseRec);
    this.mouseRec.m.set("x", 0);
    this.mouseRec.m.set("y", 0);
    this.mouseRec.m.set("down", false);
  }
  start() {
    for (const s of this.program.body) {
      if (s.k === "fn") this.globals.vars.set(s.name, new Fn(s, this.globals));
      else if (s.k === "every" || s.k === "when") this.handlers.push({ stmt: s, running: null, touching: /* @__PURE__ */ new Set() });
    }
    this.spawn(this.program.body, false, this.globals);
  }
  /** True when nothing is left to run and nothing will start by itself. */
  idle() {
    if (this.tasks.length || this.handlers.some((h) => h.stmt.k === "every")) return false;
    const touch = this.handlers.some((h) => h.stmt.k === "when" && h.stmt.ev === "touch");
    const g = this.globals.vars.get("gravity");
    return !touch || !this.world.things.some((t) => !t.fixed && (t.dx || t.dy || typeof g === "number" && g !== 0));
  }
  /** Seconds until something needs to run (for the command line). */
  nextWake() {
    let t = Infinity;
    for (const task of this.tasks) t = Math.min(t, task.wakeAt - this.time);
    for (const h of this.handlers) {
      if (h.stmt.k === "every") t = Math.min(t, h.stmt.mode === "frame" ? 1 / 60 : (h.next ?? this.time) - this.time);
    }
    return Math.max(0, t);
  }
  spawn(body, perFrame, env) {
    const task = { gen: this.block(body, env ?? new Env(this.globals)), wakeAt: 0, perFrame, forever: 0, done: false };
    this.tasks.push(task);
    return task;
  }
  tick(dt) {
    if (this.ended) return;
    try {
      this.time += dt;
      this.frameNo++;
      const g = this.globals.vars;
      g.set("time", this.time);
      g.set("frame", this.frameNo);
      const m = this.host.mouse();
      this.mouseRec.m.set("x", m.x);
      this.mouseRec.m.set("y", m.y);
      this.mouseRec.m.set("down", m.down);
      this.frameDraws = [];
      const keys = this.keyQueue;
      this.keyQueue = [];
      const clicks = this.clicks;
      this.clicks = 0;
      for (const h of this.handlers) {
        const s = h.stmt;
        if (s.k === "when" && s.ev === "key" && keys.length) {
          const want = this.keyName(this.sync(this.eval(s.a, this.globals)), s.a.s);
          for (const k of keys) if (want === k || want === "any") this.spawn(s.body, false);
        } else if (s.k === "when" && s.ev === "click") {
          for (let i = 0; i < clicks; i++) this.spawn(s.body, false);
        } else if (s.k === "every" && s.mode === "frame") {
          if (!h.running || h.running.done) h.running = this.spawn(s.body, true);
        } else if (s.k === "every" && s.mode === "seconds") {
          if (h.interval === void 0) {
            const v = this.sync(this.eval(s.e, this.globals));
            if (typeof v !== "number" || v <= 0) runtimeError(s.e.s, `\`every\` needs a number of seconds above zero, but got ${typeName(v)}.`);
            h.interval = Math.max(v, 1 / 60);
            h.next = this.time + h.interval;
          }
          if (this.time >= h.next) {
            this.spawn(s.body, false);
            h.next += h.interval;
            if (h.next < this.time) h.next = this.time + h.interval;
          }
        }
      }
      this.runTasks();
      this.world.gravity = this.numberVar("gravity");
      this.world.step();
      let spawned = false;
      for (const h of this.handlers) {
        const s = h.stmt;
        if (s.k !== "when" || s.ev !== "touch") continue;
        const as = this.thingsOf(this.sync(this.eval(s.a, this.globals)), s.a.s, true);
        const bv = this.sync(this.eval(s.b, this.globals));
        const now = /* @__PURE__ */ new Set();
        if (bv instanceof Edge) {
          for (const a of as) if (this.world.touchesEdge(a)) now.add(`${a.id}:edge`);
        } else {
          const bs = this.thingsOf(bv, s.b.s, true);
          for (const a of as) for (const b of bs) if (this.world.touches(a, b)) now.add(`${a.id}:${b.id}`);
        }
        for (const k of now) if (!h.touching.has(k)) {
          this.spawn(s.body, false);
          spawned = true;
        }
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
      else if (r.value === "frame") task.wakeAt = this.time + this.frameWait;
      else if (r.value === "slice") task.wakeAt = this.time;
      else task.wakeAt = this.time + r.value.wait;
      if (this.ended) return;
    }
    this.current = null;
  }
  fail(e) {
    this.ended = true;
    this.tasks = [];
    if (e instanceof EndOfStory) return;
    if (e instanceof OnceError) {
      this.error = e;
      return;
    }
    if (e instanceof RangeError) {
      this.error = new OnceError("runtime", "Some instructions keep calling themselves and never stop.", null, "Make sure there is an `if` that gives back a value without calling again.");
      return;
    }
    this.error = new OnceError("runtime", "Something went wrong inside Once itself: " + (e instanceof Error ? e.message : String(e)), null);
  }
  /** Runs a generator that must not wait (conditions checked by the runner itself). */
  sync(g) {
    for (; ; ) {
      const r = g.next();
      if (r.done) return r.value;
      if (r.value !== "slice") runtimeError(null, "This part of a `when` line can't wait or repeat forever.");
    }
  }
  numberVar(name) {
    const v = this.globals.vars.get(name);
    if (typeof v !== "number") runtimeError(null, `\`${name}\` has to be a number, but it is ${typeName(v ?? null)}.`);
    return v;
  }
  // ---- statements ----
  *block(stmts, env) {
    for (const s of stmts) {
      const r = yield* this.exec(s, env);
      if (r) return r;
    }
    return void 0;
  }
  *exec(s, env) {
    if (++this.steps > SLICE) {
      this.steps = 0;
      yield "slice";
    }
    switch (s.k) {
      case "set": {
        const v = yield* this.eval(s.value, env);
        yield* this.assign(s.target, v, env);
        return;
      }
      case "change": {
        const cur = yield* this.eval(s.target, env);
        const by = yield* this.eval(s.by, env);
        if (typeof cur !== "number" || typeof by !== "number") {
          if (typeof cur === "string") {
            yield* this.assign(s.target, cur + textOf(by), env);
            return;
          }
          runtimeError(
            s.s,
            `\`change\` adds numbers, but this is ${typeName(cur)} and ${typeName(by)}.`,
            Array.isArray(cur) ? "To put something in a list, write `add ... to list`." : void 0
          );
        }
        yield* this.assign(s.target, cur + by, env);
        return;
      }
      case "say":
        this.host.say(textOf(yield* this.eval(s.value, env)));
        return;
      case "if": {
        for (const br of s.branches) {
          if (truthy(yield* this.eval(br.cond, env))) return yield* this.block(br.body, env);
        }
        if (s.els) return yield* this.block(s.els, env);
        return;
      }
      case "repeat": {
        if (s.mode === "times") {
          const n = yield* this.eval(s.e, env);
          if (typeof n !== "number") runtimeError(s.e.s, `\`repeat\` needs a number of times, but got ${typeName(n)}.`);
          for (let i = 0; i < Math.floor(n); i++) {
            const r = yield* this.block(s.body, env);
            if (r === BREAK) break;
            if (r && r !== CONTINUE) return r;
          }
          return;
        }
        if (s.mode === "forever") {
          const task = this.current;
          task.forever++;
          try {
            for (; ; ) {
              const r = yield* this.block(s.body, env);
              if (r === BREAK) break;
              if (r && r !== CONTINUE) return r;
              yield "frame";
            }
          } finally {
            task.forever--;
          }
          return;
        }
        for (; ; ) {
          const c = truthy(yield* this.eval(s.e, env));
          if (s.mode === "while" ? !c : c) break;
          const r = yield* this.block(s.body, env);
          if (r === BREAK) break;
          if (r && r !== CONTINUE) return r;
        }
        return;
      }
      case "foreach": {
        let items;
        if (s.list) {
          const v = yield* this.eval(s.list, env);
          if (Array.isArray(v)) items = [...v];
          else if (typeof v === "string") items = [...v];
          else if (v instanceof Rec) items = [...v.m.keys()];
          else {
            runtimeError(
              s.list.s,
              `\`for each\` needs a list to go through, but got ${typeName(v)}.`,
              typeof v === "number" ? `To count, write \`for each ${s.name} from 1 to ${v}\`.` : void 0
            );
          }
        } else {
          const a = yield* this.eval(s.from, env), b = yield* this.eval(s.to, env);
          const by = s.by ? yield* this.eval(s.by, env) : typeof a === "number" && typeof b === "number" && a > b ? -1 : 1;
          if (typeof a !== "number") runtimeError(s.from.s, `Counting needs numbers, but this is ${typeName(a)}.`);
          if (typeof b !== "number") runtimeError(s.to.s, `Counting needs numbers, but this is ${typeName(b)}.`);
          if (typeof by !== "number" || by === 0) runtimeError(s.by?.s ?? s.s, "`by` needs a number that isn't zero.");
          const lo = a, hi = b, step = by;
          items = function* () {
            for (let i = lo; step > 0 ? i <= hi + 1e-9 : i >= hi - 1e-9; i += step) yield i;
          }();
        }
        for (const item of items) {
          this.setVar(s.name, item, env);
          const r = yield* this.block(s.body, env);
          if (r === BREAK) break;
          if (r && r !== CONTINUE) return r;
        }
        return;
      }
      case "fn":
      case "every":
      case "when":
        return;
      case "give":
        return { give: s.value ? yield* this.eval(s.value, env) : null };
      case "stop":
        return BREAK;
      case "skip":
        return CONTINUE;
      case "theend":
        throw new EndOfStory();
      case "wait": {
        const n = yield* this.eval(s.e, env);
        if (typeof n !== "number" || n < 0) runtimeError(s.e.s, `\`wait\` needs a number of seconds, but got ${typeName(n)}.`);
        yield { wait: n };
        return;
      }
      case "draw": {
        const cmd2 = yield* this.drawCmd(s.kind, s.content, s.clauses, env);
        if (!this.host.graphics) this.noGraphics(s.s);
        const t = this.current;
        if (t && (t.perFrame || t.forever > 0)) this.frameDraws.push(cmd2);
        else this.host.drawPersistent(cmd2);
        return;
      }
      case "background":
        this.world.bg = this.color(yield* this.eval(s.e, env), s.e.s);
        return;
      case "clear":
        this.host.clear();
        return;
      case "play": {
        const v = yield* this.eval(s.e, env);
        const opts = yield* this.clauseValues(s.clauses, env);
        const volume = opts.volume ? this.num(opts.volume.vals[0], opts.volume.s, "volume") : 0.5;
        if (s.what === "note") {
          const f = noteFreq(v);
          if (f === null) runtimeError(s.e.s, `I don't know the note ${typeof v === "string" ? `"${v}"` : typeName(v)}.`, 'Notes look like "C4", "F#5" or "Bb3", or a number like 60 (middle C).');
          const secs = opts.for ? this.num(opts.for.vals[0], opts.for.s, "for") : 0.25;
          let wave = "triangle";
          if (opts.wave) {
            const w = opts.wave.vals[0];
            wave = typeof w === "string" ? w === "saw" ? "sawtooth" : w : "";
            if (!WAVES.includes(wave)) runtimeError(opts.wave.s, `I don't know the wave ${textOf(w, true)}.`, `Waves are: ${WAVES.join(", ")}.`);
          }
          this.host.playNote(f, Math.max(0.02, secs), wave, Math.max(0, Math.min(1, volume)));
        } else {
          if (typeof v !== "string" || !SOUNDS.includes(v)) {
            const guess = typeof v === "string" ? closest(v, SOUNDS) : null;
            runtimeError(s.e.s, `I don't know the sound ${textOf(v, true)}.`, guess ? `Did you mean "${guess}"?` : `Sounds are: ${SOUNDS.join(", ")}. For music, use \`play note "C4"\`.`);
          }
          this.host.playSound(v, Math.max(0, Math.min(1, volume)));
        }
        return;
      }
      case "add": {
        const v = yield* this.eval(s.value, env);
        const l = yield* this.eval(s.target, env);
        if (!Array.isArray(l)) runtimeError(
          s.target.s,
          `I can only add things to a list, but this is ${typeName(l)}.`,
          typeof l === "number" ? "To make a number bigger, write `change name by 1`." : "Start a list with `set things to []`."
        );
        l.push(v);
        return;
      }
      case "remove": {
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
      case "hide":
      case "show": {
        const v = yield* this.eval(s.e, env);
        for (const t of this.thingsOf(v, s.e.s, false)) t.hidden = s.k === "hide";
        return;
      }
      case "expr":
        yield* this.eval(s.e, env);
        return;
    }
  }
  noGraphics(sp) {
    runtimeError(
      sp,
      "Drawing needs a picture to draw on, and the command line has none.",
      "Open this story in the Once playground, or turn it into a web page with `once export`."
    );
  }
  setVar(name, v, env) {
    const e = env.find(name);
    (e ?? env).vars.set(name, v);
  }
  *assign(target, v, env) {
    if (target.k === "var") {
      this.setVar(target.name, v, env);
      return;
    }
    if (target.k === "prop") {
      const obj = yield* this.eval(target.obj, env);
      this.setProp(obj, target.name, v, target.s);
      return;
    }
    if (target.k === "index") {
      const obj = yield* this.eval(target.obj, env);
      const idx = yield* this.eval(target.idx, env);
      if (Array.isArray(obj)) {
        const i = this.listIndex(obj, idx, target.idx.s, true);
        obj[i] = v;
        return;
      }
      if (obj instanceof Rec) {
        obj.m.set(textOf(idx), v);
        return;
      }
      if (typeof obj === "string") runtimeError(target.s, "Text can't be changed one letter at a time.", "Build new text instead, with +.");
      runtimeError(target.obj.s, `I can't set an item of ${typeName(obj)}.`);
    }
    runtimeError(target.s, "I can only set a name, a property or a list item.");
  }
  // ---- expressions ----
  *eval(e, env) {
    switch (e.k) {
      case "num":
        return e.v;
      case "bool":
        return e.v;
      case "nothing":
        return null;
      case "str": {
        let out = "";
        for (const p of e.parts) out += typeof p === "string" ? p : textOf(yield* this.eval(p, env));
        return out;
      }
      case "var": {
        const found = env.find(e.name);
        if (found) return found.vars.get(e.name);
        return this.unknown(e.name, e.s, env);
      }
      case "list": {
        const out = [];
        for (const it of e.items) out.push(yield* this.eval(it, env));
        return out;
      }
      case "rec": {
        const r = new Rec();
        for (let i = 0; i < e.keys.length; i++) r.m.set(e.keys[i], yield* this.eval(e.vals[i], env));
        return r;
      }
      case "bin": {
        if (e.op === "and") return truthy(yield* this.eval(e.a, env)) && truthy(yield* this.eval(e.b, env));
        if (e.op === "or") return truthy(yield* this.eval(e.a, env)) || truthy(yield* this.eval(e.b, env));
        const a = yield* this.eval(e.a, env);
        const b = yield* this.eval(e.b, env);
        return this.binary(e.op, a, b, e);
      }
      case "un": {
        const a = yield* this.eval(e.a, env);
        if (e.op === "not") return !truthy(a);
        if (e.op === "neg") {
          if (typeof a !== "number") runtimeError(e.s, `I can only make a number negative, but this is ${typeName(a)}.`);
          return -a;
        }
        return this.host.holding(this.keyName(a, e.a.s));
      }
      case "call": {
        const fn = yield* this.eval(e.fn, env);
        const args = [];
        for (const a of e.args) args.push(yield* this.eval(a, env));
        return yield* this.call(fn, args, e);
      }
      case "prop":
        return this.getProp(yield* this.eval(e.obj, env), e.name, e);
      case "index": {
        const obj = yield* this.eval(e.obj, env);
        const idx = yield* this.eval(e.idx, env);
        if (Array.isArray(obj)) return obj[this.listIndex(obj, idx, e.idx.s, false)];
        if (typeof obj === "string") {
          const chars = [...obj];
          return chars[this.listIndex(chars, idx, e.idx.s, false)];
        }
        if (obj instanceof Rec) {
          const k = textOf(idx);
          if (!obj.m.has(k)) this.missingKey(obj, k, e.idx.s);
          return obj.m.get(k);
        }
        runtimeError(e.obj.s, `I can only take items from a list or text, but this is ${typeName(obj)}.`);
      }
      case "random": {
        let lo = yield* this.eval(e.lo, env), hi = yield* this.eval(e.hi, env);
        if (typeof lo !== "number" || typeof hi !== "number") runtimeError(e.s, "`random` needs two numbers, like `random 1 to 6`.");
        if (lo > hi) [lo, hi] = [hi, lo];
        if (Number.isInteger(lo) && Number.isInteger(hi)) return lo + Math.floor(Math.random() * (hi - lo + 1));
        return lo + Math.random() * (hi - lo);
      }
      case "any": {
        const l = yield* this.eval(e.list, env);
        const items = typeof l === "string" ? [...l] : l;
        if (!Array.isArray(items)) runtimeError(e.list.s, `\`any of\` picks from a list, but this is ${typeName(l)}.`);
        if (items.length === 0) runtimeError(e.list.s, "I can't pick from an empty list.");
        return items[Math.floor(Math.random() * items.length)];
      }
      case "new": {
        const t = new Thing(e.kind);
        if (e.content) t.text = textOf(yield* this.eval(e.content, env));
        const opts = yield* this.clauseValues(e.clauses, env);
        for (const name in opts) {
          const { vals, s } = opts[name];
          switch (name) {
            case "at":
              t.x = this.num(vals[0], s, "at");
              t.y = this.num(vals[1], s, "at");
              break;
            case "size":
              if (t.kind === "text") t.size = this.num(vals[0], s, "size");
              else {
                t.w = this.num(vals[0], s, "size");
                t.h = vals[1] === void 0 ? t.w : this.num(vals[1], s, "size");
              }
              break;
            case "width":
              t.w = this.num(vals[0], s, "width");
              break;
            case "height":
              t.h = this.num(vals[0], s, "height");
              break;
            case "color":
              t.color = this.color(vals[0], s);
              break;
            case "outline":
              t.outline = vals.length ? this.num(vals[0], s, "outline") : 3;
              break;
            case "angle":
              t.angle = this.num(vals[0], s, "angle");
              break;
            case "moving":
              t.dx = this.num(vals[0], s, "moving");
              t.dy = this.num(vals[1], s, "moving");
              break;
            case "bouncy":
              t.bounce = vals.length ? this.num(vals[0], s, "bouncy") : 1;
              t.walls = true;
              break;
            case "solid":
              t.solid = true;
              break;
            case "fixed":
              t.fixed = true;
              break;
            case "hidden":
              t.hidden = true;
              break;
          }
        }
        this.world.add(t);
        return t;
      }
    }
  }
  *clauseValues(clauses, env) {
    const out = {};
    for (const c of clauses) {
      const vals = [];
      for (const a of c.args) vals.push(yield* this.eval(a, env));
      out[c.name] = { vals, s: c.s };
    }
    return out;
  }
  *drawCmd(kind, content, clauses, env) {
    const cmd2 = {
      kind,
      x: 0,
      y: 0,
      w: 30,
      h: 30,
      x2: 0,
      y2: 0,
      color: INK_COLOR,
      outline: 0,
      angle: 0,
      text: "",
      size: 20,
      lineWidth: 2
    };
    if (kind === "box") {
      cmd2.w = 40;
      cmd2.h = 40;
    }
    if (content) cmd2.text = textOf(yield* this.eval(content, env));
    const opts = yield* this.clauseValues(clauses, env);
    for (const name in opts) {
      const { vals, s } = opts[name];
      switch (name) {
        case "at":
          cmd2.x = this.num(vals[0], s, "at");
          cmd2.y = this.num(vals[1], s, "at");
          break;
        case "from":
          cmd2.x = this.num(vals[0], s, "from");
          cmd2.y = this.num(vals[1], s, "from");
          break;
        case "to":
          cmd2.x2 = this.num(vals[0], s, "to");
          cmd2.y2 = this.num(vals[1], s, "to");
          break;
        case "size":
          if (kind === "text") cmd2.size = this.num(vals[0], s, "size");
          else {
            cmd2.w = this.num(vals[0], s, "size");
            cmd2.h = vals[1] === void 0 ? cmd2.w : this.num(vals[1], s, "size");
          }
          break;
        case "width":
          if (kind === "line") cmd2.lineWidth = this.num(vals[0], s, "width");
          else cmd2.w = this.num(vals[0], s, "width");
          break;
        case "height":
          cmd2.h = this.num(vals[0], s, "height");
          break;
        case "color":
          cmd2.color = this.color(vals[0], s);
          break;
        case "outline":
          cmd2.outline = vals.length ? this.num(vals[0], s, "outline") : 3;
          break;
        case "angle":
          cmd2.angle = this.num(vals[0], s, "angle");
          break;
      }
    }
    return cmd2;
  }
  *call(fn, args, e) {
    const name = e.fn.k === "var" ? e.fn.name : e.fn.k === "prop" ? e.fn.name : "this";
    if (fn instanceof Builtin) return fn.fn(args, (msg, hint) => runtimeError(e.s, msg, hint));
    if (!(fn instanceof Fn)) {
      runtimeError(
        e.fn.s,
        `\`${name}\` is ${typeName(fn)}, not instructions, so it can't be used with ( ).`,
        fn instanceof Thing || fn instanceof Rec ? `To read a property, write ${name}'s x.` : void 0
      );
    }
    const params = fn.def.params;
    if (args.length !== params.length) {
      runtimeError(
        e.s,
        `\`${fn.def.name}\` needs ${params.length} input${params.length === 1 ? "" : "s"}${params.length ? ` (${params.join(", ")})` : ""}, but got ${args.length}.`,
        params.length ? `Like ${fn.def.name}(${params.join(", ")}).` : `Like ${fn.def.name}().`
      );
    }
    if (++this.depth > 300) {
      this.depth = 0;
      runtimeError(e.s, `\`${fn.def.name}\` went more than 300 calls deep, so it probably never stops.`, "Make sure there is an `if` that gives back a value without calling it again. Once allows 300 calls inside each other.");
    }
    const local = new Env(fn.closure);
    params.forEach((p, i) => local.vars.set(p, args[i]));
    try {
      const r = yield* this.block(fn.def.body, local);
      return r && typeof r === "object" && "give" in r ? r.give : null;
    } finally {
      this.depth--;
    }
  }
  binary(op, a, b, e) {
    switch (op) {
      case "eq":
        return equals(a, b);
      case "ne":
        return !equals(a, b);
      case "lt":
      case "gt":
      case "le":
      case "ge": {
        if (!(typeof a === "number" && typeof b === "number" || typeof a === "string" && typeof b === "string")) {
          runtimeError(
            e.s,
            `I can only compare numbers with numbers (or text with text), but this is ${typeName(a)} and ${typeName(b)}.`,
            typeof a === "string" || typeof b === "string" ? "Use number(...) to turn text into a number." : void 0
          );
        }
        return op === "lt" ? a < b : op === "gt" ? a > b : op === "le" ? a <= b : a >= b;
      }
      case "touches": {
        const as = this.thingsOf(a, e.a.s, true);
        if (b instanceof Edge) return as.some((t) => this.world.touchesEdge(t));
        const bs = this.thingsOf(b, e.b.s, true);
        return as.some((x) => bs.some((y) => this.world.touches(x, y)));
      }
      case "contains": {
        if (Array.isArray(a)) return a.some((x) => equals(x, b));
        if (typeof a === "string") return a.includes(textOf(b));
        if (a instanceof Rec) return a.m.has(textOf(b));
        runtimeError(e.a.s, `\`contains\` works on lists and text, but this is ${typeName(a)}.`);
      }
      case "+": {
        if (typeof a === "number" && typeof b === "number") return a + b;
        if (typeof a === "string" || typeof b === "string") return textOf(a) + textOf(b);
        if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
        runtimeError(e.s, `I can't add ${typeName(a)} and ${typeName(b)}.`, Array.isArray(a) ? "To put something in a list, write `add ... to list`." : void 0);
      }
    }
    const words = { "-": "subtract", "*": "multiply", "/": "divide", mod: "use mod on", "^": "raise" };
    if (typeof a !== "number" || typeof b !== "number") {
      const bad = typeof a !== "number" ? a : b;
      runtimeError(
        e.s,
        `I can only ${words[op]} numbers, but this has ${typeName(bad)}.`,
        typeof bad === "string" && bad.trim() !== "" && !Number.isNaN(Number(bad)) ? `"${bad}" is text. Use number("${bad}") to turn it into a number.` : void 0
      );
    }
    switch (op) {
      case "-":
        return a - b;
      case "*":
        return a * b;
      case "/":
        if (b === 0) runtimeError(e.s, "You can't divide by zero.");
        return a / b;
      case "mod":
        if (b === 0) runtimeError(e.s, "You can't use mod with zero.");
        return (a % b + b) % b;
      case "^":
        return Math.pow(a, b);
    }
    runtimeError(e.s, `Unknown operator ${op}.`);
  }
  getProp(obj, name, e) {
    if (obj instanceof Thing) {
      switch (name) {
        case "x":
          return obj.x;
        case "y":
          return obj.y;
        case "dx":
          return obj.dx;
        case "dy":
          return obj.dy;
        case "size":
          return obj.kind === "text" ? obj.size : obj.w;
        case "width":
          return obj.kind === "text" ? this.world.measure(obj.text, obj.size) : obj.w;
        case "height":
          return obj.kind === "text" ? obj.size : obj.h;
        case "color":
          return obj.color;
        case "bouncy":
          return obj.bounce;
        case "solid":
          return obj.solid;
        case "fixed":
          return obj.fixed;
        case "hidden":
          return obj.hidden;
        case "text":
          return obj.text;
        case "kind":
          return obj.kind;
        case "angle":
          return obj.angle;
        case "outline":
          return obj.outline;
        case "speed":
          return Math.hypot(obj.dx, obj.dy);
        case "removed":
          return obj.removed;
      }
      if (obj.extra.has(name)) return obj.extra.get(name);
      const guess = closest(name, [...THING_PROPS, ...obj.extra.keys()]);
      runtimeError(e.s, `This ${obj.kind} doesn't have a \`${name}\`.`, guess ? `Did you mean \`${guess}\`?` : `You can give it one first: set ... 's ${name} to 0.`);
    }
    if (obj instanceof Rec) {
      if (!obj.m.has(name)) this.missingKey(obj, name, e.s);
      return obj.m.get(name);
    }
    if (Array.isArray(obj) || typeof obj === "string") {
      if (name === "length") return typeof obj === "string" ? [...obj].length : obj.length;
      if (Array.isArray(obj) && (name === "first" || name === "last")) {
        if (!obj.length) runtimeError(e.s, `The list is empty, so it has no ${name} item.`);
        return name === "first" ? obj[0] : obj[obj.length - 1];
      }
      runtimeError(e.s, `${typeName(obj)[0].toUpperCase() + typeName(obj).slice(1)} doesn't have a \`${name}\`.`, `Lists and text have a length${Array.isArray(obj) ? ", a first and a last" : ""}.`);
    }
    runtimeError(
      e.obj.s,
      `${srcName(e.obj)} is ${typeName(obj)}, so it doesn't have a \`${name}\`.`,
      obj === null ? `Did you forget to give ${srcName(e.obj)} a value with \`set\`?` : void 0
    );
  }
  setProp(obj, name, v, sp) {
    if (obj instanceof Thing) {
      const n = () => this.num(v, sp, name);
      const b = () => truthy(v);
      switch (name) {
        case "x":
          obj.x = n();
          return;
        case "y":
          obj.y = n();
          return;
        case "dx":
          obj.dx = n();
          return;
        case "dy":
          obj.dy = n();
          return;
        case "size":
          if (obj.kind === "text") obj.size = n();
          else obj.w = obj.h = n();
          return;
        case "width":
          obj.w = n();
          return;
        case "height":
          if (obj.kind === "text") obj.size = n();
          else obj.h = n();
          return;
        case "color":
          obj.color = this.color(v, sp);
          return;
        case "bouncy":
          obj.bounce = typeof v === "number" ? v : b() ? 1 : 0;
          obj.walls = typeof v === "number" || b();
          return;
        case "solid":
          obj.solid = b();
          return;
        case "fixed":
          obj.fixed = b();
          return;
        case "hidden":
          obj.hidden = b();
          return;
        case "text":
          obj.text = textOf(v);
          return;
        case "angle":
          obj.angle = n();
          return;
        case "outline":
          obj.outline = n();
          return;
        case "kind":
        case "speed":
        case "removed":
          runtimeError(sp, `A shape's \`${name}\` can't be changed directly.`, name === "speed" ? "Set its dx and dy instead." : void 0);
      }
      obj.extra.set(name, v);
      return;
    }
    if (obj instanceof Rec) {
      obj.m.set(name, v);
      return;
    }
    runtimeError(sp, `I can't give ${typeName(obj)} a \`${name}\`.`, "Only shapes and records have properties you can set.");
  }
  missingKey(r, key, sp) {
    const guess = closest(key, r.m.keys());
    runtimeError(sp, `This record doesn't have a \`${key}\`.`, guess ? `Did you mean \`${guess}\`?` : r.m.size ? `It has: ${[...r.m.keys()].join(", ")}.` : void 0);
  }
  listIndex(l, idx, sp, forSet) {
    if (typeof idx !== "number" || !Number.isInteger(idx)) runtimeError(sp, `List positions are whole numbers, but this is ${typeName(idx)}.`);
    if (idx === 0) runtimeError(sp, "There is no item 0. In Once, lists count from 1.");
    const i = idx < 0 ? l.length + idx : idx - 1;
    if (i < 0 || i > l.length || i === l.length && !forSet) {
      runtimeError(sp, `There is no item ${idx}: the list only has ${l.length} item${l.length === 1 ? "" : "s"}.`, idx < 0 ? void 0 : "Lists count from 1, so the last item is the length.");
    }
    return i;
  }
  num(v, sp, what) {
    if (typeof v !== "number" || Number.isNaN(v)) {
      runtimeError(
        sp,
        `\`${what}\` needs a number, but got ${typeName(v)}.`,
        typeof v === "string" && !Number.isNaN(Number(v)) && v.trim() !== "" ? `"${v}" is text. Use number("${v}").` : void 0
      );
    }
    return v;
  }
  color(v, sp) {
    if (typeof v !== "string") runtimeError(sp, `A color is text, like "tomato" or "#ff8800", but this is ${typeName(v)}.`);
    if (this.host.isColor && !this.host.isColor(v)) {
      const guess = closest(v, COLOR_NAMES);
      runtimeError(sp, `I don't know the color "${v}".`, guess ? `Did you mean "${guess}"?` : 'Try a name like "tomato" or "skyblue", a hex code like "#3f6788", or rgb(255, 120, 0).');
    }
    return v;
  }
  keyName(v, sp) {
    if (typeof v !== "string") runtimeError(sp, `Keys are named with text, like "space" or "left", but this is ${typeName(v)}.`);
    return normKey(v);
  }
  thingsOf(v, sp, allowEmpty) {
    if (v instanceof Thing) return [v];
    if (Array.isArray(v) && v.every((x) => x instanceof Thing)) {
      if (!v.length && !allowEmpty) return [];
      return v;
    }
    runtimeError(
      sp,
      `This needs a shape made with \`new\`, but got ${typeName(v)}.`,
      Array.isArray(v) ? "Every item in the list has to be a shape." : "Make one with `set ball to new circle at 100, 100`."
    );
  }
  unknown(name, sp, env) {
    const elsewhere = { print: "say", console: "say", len: "length", str: "text", int: "round", Math: "sqrt, round and friends", True: "true", False: "false", null: "nothing", None: "nothing", undefined: "nothing", nil: "nothing" };
    if (elsewhere[name]) runtimeError(sp, `Once doesn't have \`${name}\`. Use \`${elsewhere[name]}\` instead.`);
    const guess = closest(name, [...env.names(), ...BUILTIN_NAMES]);
    runtimeError(sp, `I don't know what \`${name}\` is.`, guess ? `Did you mean \`${guess}\`?` : `Give it a value first, like \`set ${name} to 0\`.`);
  }
};
function srcName(e) {
  if (e.k === "var") return `\`${e.name}\``;
  if (e.k === "prop") return `${srcName(e.obj).replace(/`$/, "")}'s ${e.name}\``;
  return "This";
}

// src/lexer.ts
var OPS2 = ["<=", ">=", "!=", "=="];
var OPS1 = "+-*/^%()[]{},:.=<>";
var OPEN = "([{";
var CLOSE = ")]}";
var QUOTES_OPEN = '"\u201C';
var QUOTES_CLOSE = '"\u201D';
function span(t) {
  return { line: t.line, col: t.col, len: t.len };
}
function lex(src, lineOffset = 0, colOffset = 0) {
  const toks = [];
  let i = 0, line = 1 + lineOffset, col = 1 + colOffset;
  let depth = 0;
  const push = (t, v, l, c, len, extra = {}) => toks.push({ t, v, line: l, col: c, len, ...extra });
  const last = () => toks[toks.length - 1];
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\n") {
      const prev2 = last();
      if (depth === 0 && prev2 && prev2.t !== "nl" && !(prev2.t === "op" && prev2.v === ",")) push("nl", "\n", line, col, 1);
      i++;
      line++;
      col = 1;
      continue;
    }
    if (ch === " " || ch === "	" || ch === "\r") {
      i++;
      col++;
      continue;
    }
    if (ch === "-" && src[i + 1] === "-") {
      while (i < src.length && src[i] !== "\n") {
        i++;
        col++;
      }
      continue;
    }
    const sl = line, sc = col;
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9]/.test(src[j])) j++;
      if (src[j] === "." && /[0-9]/.test(src[j + 1] ?? "")) {
        j++;
        while (j < src.length && /[0-9]/.test(src[j])) j++;
      }
      const text = src.slice(i, j);
      push("num", text, sl, sc, j - i, { n: parseFloat(text) });
      col += j - i;
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const word = src.slice(i, j);
      push("id", word, sl, sc, j - i);
      col += j - i;
      i = j;
      continue;
    }
    if ((ch === "'" || ch === "\u2019") && src[i + 1] === "s" && !/[A-Za-z0-9_]/.test(src[i + 2] ?? "")) {
      const prev2 = last();
      if (prev2 && (prev2.t === "id" || prev2.t === "op" && (prev2.v === ")" || prev2.v === "]"))) {
        push("poss", "'s", sl, sc, 2);
        i += 2;
        col += 2;
        continue;
      }
    }
    if (ch === "'" || ch === "\u2018" || ch === "\u2019") {
      syntaxError(
        { line: sl, col: sc, len: 1 },
        'Text in Once goes inside double quotes, like "hello".',
        "Single quotes are only used for things like ball's x."
      );
    }
    if (QUOTES_OPEN.includes(ch)) {
      const parts = [];
      let buf = "";
      i++;
      col++;
      let closed = false;
      while (i < src.length) {
        const c = src[i];
        if (QUOTES_CLOSE.includes(c)) {
          i++;
          col++;
          closed = true;
          break;
        }
        if (c === "\n") break;
        if (c === "\\") {
          const n = src[i + 1];
          const map = { n: "\n", t: "	", '"': '"', "\\": "\\", "{": "{", "}": "}" };
          if (n !== void 0 && map[n] !== void 0) {
            buf += map[n];
            i += 2;
            col += 2;
            continue;
          }
          buf += c;
          i++;
          col++;
          continue;
        }
        if (c === "{") {
          if (buf) parts.push(buf);
          buf = "";
          const pl = line, pc = col + 1;
          let j = i + 1, d = 1, inStr = false;
          while (j < src.length && src[j] !== "\n") {
            const cj = src[j];
            if (inStr) {
              if (cj === '"') inStr = false;
            } else if (cj === '"') inStr = true;
            else if (cj === "{") d++;
            else if (cj === "}" && --d === 0) break;
            j++;
          }
          if (src[j] !== "}") {
            syntaxError(
              { line: pl, col: pc - 1, len: 1 },
              "This `{` inside the text is never closed with `}`.",
              "Inside text, {name} shows the value of name. To show a real brace, write \\{."
            );
          }
          const inner = src.slice(i + 1, j);
          if (!inner.trim()) syntaxError({ line: pl, col: pc - 1, len: 2 }, "There is nothing inside these braces `{}`.", 'Put a name inside, like "score: {score}".');
          parts.push({ src: inner, line: pl, col: pc });
          col += j + 1 - i;
          i = j + 1;
          continue;
        }
        buf += c;
        i++;
        col++;
      }
      if (!closed) {
        syntaxError(
          { line: sl, col: sc, len: Math.max(1, col - sc) },
          'This text is missing its closing quote `"`.',
          "Text has to start and end on the same line."
        );
      }
      if (buf || parts.length === 0) parts.push(buf);
      push("str", '"', sl, sc, col - sc, { parts });
      continue;
    }
    const two = src.slice(i, i + 2);
    if (OPS2.includes(two)) {
      push("op", two, sl, sc, 2);
      i += 2;
      col += 2;
      continue;
    }
    if (OPS1.includes(ch)) {
      if (OPEN.includes(ch)) depth++;
      if (CLOSE.includes(ch)) depth = Math.max(0, depth - 1);
      push("op", ch, sl, sc, 1);
      i++;
      col++;
      continue;
    }
    const hints = {
      ";": "Once doesn't need semicolons. Each line is one step.",
      "&": "Write `and` instead of `&&`.",
      "|": "Write `or` instead of `||`.",
      "!": "Write `not` instead of `!`.",
      "#": "Comments in Once start with `--`."
    };
    syntaxError({ line: sl, col: sc, len: 1 }, `I don't understand the character \`${ch}\` here.`, hints[ch]);
  }
  const prev = last();
  if (prev && prev.t !== "nl") push("nl", "\n", line, col, 1);
  push("eof", "", line, col, 1);
  return toks;
}

// src/parser.ts
var RESERVED = /* @__PURE__ */ new Set([
  "set",
  "to",
  "change",
  "by",
  "say",
  "if",
  "then",
  "otherwise",
  "else",
  "end",
  "repeat",
  "times",
  "while",
  "until",
  "forever",
  "for",
  "each",
  "in",
  "from",
  "give",
  "back",
  "stop",
  "skip",
  "wait",
  "every",
  "when",
  "draw",
  "background",
  "clear",
  "play",
  "add",
  "remove",
  "hide",
  "show",
  "new",
  "and",
  "or",
  "not",
  "is",
  "random",
  "any",
  "holding",
  "true",
  "false",
  "nothing",
  "mod",
  "of",
  "touches",
  "contains"
]);
var STATEMENTS = [
  "say",
  "set",
  "change",
  "if",
  "repeat",
  "for",
  "to",
  "give",
  "stop",
  "skip",
  "wait",
  "every",
  "when",
  "draw",
  "background",
  "clear",
  "play",
  "add",
  "remove",
  "hide",
  "show",
  "new"
];
var FROM_ELSEWHERE = {
  print: "say",
  log: "say",
  echo: "say",
  puts: "say",
  console: "say",
  return: "give back",
  def: "to",
  function: "to",
  func: "to",
  fn: "to",
  let: "set",
  var: "set",
  const: "set",
  loop: "repeat",
  elif: "otherwise if",
  break: "stop",
  continue: "skip",
  sleep: "wait",
  exit: "the end",
  while: "repeat while"
};
var SHAPES = {
  circle: { at: [2, 2], size: [1, 1], color: [1, 1], outline: [0, 1] },
  box: { at: [2, 2], size: [1, 2], width: [1, 1], height: [1, 1], color: [1, 1], outline: [0, 1], angle: [1, 1] },
  line: { from: [2, 2], to: [2, 2], color: [1, 1], width: [1, 1] },
  text: { at: [2, 2], size: [1, 1], color: [1, 1] }
};
var PHYSICS = { moving: [2, 2], bouncy: [0, 1], solid: [0, 0], fixed: [0, 0], hidden: [0, 0] };
var KIND_ALIASES = { square: "box", rectangle: "box", rect: "box", dot: "circle", ball: "circle", words: "text", label: "text" };
var NOTE_CLAUSES = { for: [1, 1], wave: [1, 1], volume: [1, 1] };
var SOUND_CLAUSES = { volume: [1, 1] };
var END_WORDS = /* @__PURE__ */ new Set(["if", "repeat", "for", "to", "every", "when", "each"]);
var VALUE_WORDS = /* @__PURE__ */ new Set(["true", "false", "nothing", "random", "any", "holding", "not", "new"]);
function parse(src) {
  const p = new Parser(lex(src));
  return p.program();
}
var Parser = class _Parser {
  constructor(toks) {
    this.toks = toks;
    __publicField(this, "i", 0);
    __publicField(this, "loops", 0);
    __publicField(this, "inFn", false);
    __publicField(this, "depth", 0);
  }
  // ---- token helpers ----
  peek(o = 0) {
    return this.toks[Math.min(this.i + o, this.toks.length - 1)];
  }
  next() {
    const t = this.peek();
    if (t.t !== "eof") this.i++;
    return t;
  }
  prev() {
    return this.toks[Math.max(0, this.i - 1)];
  }
  isWord(w, o = 0) {
    const t = this.peek(o);
    return t.t === "id" && t.v === w;
  }
  isOp(op, o = 0) {
    const t = this.peek(o);
    return t.t === "op" && t.v === op;
  }
  atLineEnd() {
    const t = this.peek();
    return t.t === "nl" || t.t === "eof";
  }
  eatWord(w) {
    if (this.isWord(w)) {
      this.i++;
      return true;
    }
    return false;
  }
  eatOp(op) {
    if (this.isOp(op)) {
      this.i++;
      return true;
    }
    return false;
  }
  expectWord(w, msg, hint) {
    if (this.isWord(w)) return this.next();
    const t = this.peek();
    syntaxError(span(t), msg ?? `I expected the word \`${w}\` here, but found ${describe(t)}.`, hint);
  }
  expectOp(op, msg, hint) {
    if (this.isOp(op)) return this.next();
    const t = this.peek();
    syntaxError(span(t), msg ?? `I expected \`${op}\` here, but found ${describe(t)}.`, hint);
  }
  spanFrom(start) {
    const end = this.prev();
    if (end.line === start.line && end.col >= start.col) return { line: start.line, col: start.col, len: end.col + end.len - start.col };
    return span(start);
  }
  skipNl() {
    while (this.peek().t === "nl") this.i++;
  }
  endLine() {
    const t = this.peek();
    if (t.t === "nl") {
      this.skipNl();
      return;
    }
    if (t.t === "eof") return;
    let hint = "Each step goes on its own line.";
    if (t.t === "op" && t.v === ",") hint = "There is one value too many here, or a comma that should not be there.";
    if (t.t === "id" && t.v === "then") hint = "`then` only goes right after the condition of an `if`.";
    syntaxError(span(t), `I expected the line to end here, but found ${describe(t)}.`, hint);
  }
  /** After a block's first line (if, repeat, ...) the steps start on the next line. */
  headerEnd(opener) {
    const t = this.peek();
    if (t.t === "nl" || t.t === "eof") return;
    syntaxError(
      span(t),
      `I expected a new line after this \`${opener.v}\` line, but found ${describe(t)}.`,
      opener.v === "if" ? "Put the steps on the lines below, or write `then` to do one step on the same line." : "Put the steps on the lines below, and close them with `end`."
    );
  }
  name(what) {
    const t = this.peek();
    if (t.t !== "id") syntaxError(span(t), `I expected a name for the ${what} here, but found ${describe(t)}.`);
    if (RESERVED.has(t.v)) syntaxError(span(t), `\`${t.v}\` is one of Once's own words, so it can't be used as a name.`, "Pick another name, like `my" + t.v[0].toUpperCase() + t.v.slice(1) + "`.");
    return this.next();
  }
  // ---- program and blocks ----
  program() {
    const body = [];
    this.skipNl();
    while (this.peek().t !== "eof") {
      body.push(this.statement());
      this.endLine();
    }
    return { body };
  }
  block(opener, terminators) {
    const body = [];
    this.depth++;
    this.skipNl();
    for (; ; ) {
      const t = this.peek();
      if (t.t === "eof") {
        syntaxError(
          span(opener),
          `This \`${opener.v}\` on line ${opener.line} is never closed with \`end\`.`,
          "Every if, repeat, for each, to, every and when needs an `end` after its steps."
        );
      }
      if (t.t === "id" && terminators.includes(t.v)) break;
      body.push(this.statement());
      this.endLine();
    }
    this.depth--;
    return body;
  }
  closeBlock(opener) {
    this.expectWord("end", `I expected \`end\` to close the \`${opener.v}\` on line ${opener.line}.`);
    if (this.peek().t === "id" && END_WORDS.has(this.peek().v)) this.next();
  }
  topLevelOnly(t) {
    if (this.depth > 0) {
      syntaxError(
        span(t),
        `\`${t.v}\` has to stand on its own, not inside another block.`,
        `Move this \`${t.v} ... end\` out so it starts at the left edge of the story.`
      );
    }
  }
  // ---- statements ----
  statement() {
    const t = this.peek();
    if (t.t !== "id") return this.exprStatement();
    switch (t.v) {
      case "set": {
        this.next();
        const target = this.target();
        if (this.isOp("=")) syntaxError(span(this.peek()), "In Once, write `to` instead of `=`.", `Like this: set ${srcOf(target)} to ...`);
        this.expectWord("to", void 0, "A set line looks like `set score to 0`.");
        const value = this.expr();
        return { k: "set", target, value, s: this.spanFrom(t) };
      }
      case "change": {
        this.next();
        const target = this.target();
        if (this.isWord("to")) syntaxError(span(this.peek()), "`change` adds an amount, so it uses `by`.", "Write `change score by 1`, or use `set score to ...` to replace it.");
        this.expectWord("by", void 0, "A change line looks like `change score by 1`.");
        const by = this.expr();
        return { k: "change", target, by, s: this.spanFrom(t) };
      }
      case "say": {
        this.next();
        if (this.atLineEnd()) syntaxError(span(t), "`say` needs something to say.", 'Like `say "hello"` or `say score`.');
        return { k: "say", value: this.expr(), s: this.spanFrom(t) };
      }
      case "if":
        return this.ifStatement();
      case "repeat":
        return this.repeat();
      case "for":
        return this.forEach();
      case "to":
        return this.fnDef();
      case "give": {
        this.next();
        this.expectWord("back", "After `give`, write `back`, like `give back total`.");
        if (!this.inFn) syntaxError(this.spanFrom(t), "`give back` only works inside a `to ... end` block.", "To end the whole story, write `the end`.");
        const value = this.atLineEnd() ? null : this.expr();
        return { k: "give", value, s: this.spanFrom(t) };
      }
      case "stop":
      case "skip": {
        this.next();
        if (this.loops === 0) {
          syntaxError(
            span(t),
            `\`${t.v}\` only works inside a repeat or for each loop.`,
            t.v === "stop" ? "To end the whole story, write `the end`." : void 0
          );
        }
        return { k: t.v, s: span(t) };
      }
      case "the":
        if (this.isWord("end", 1)) {
          this.next();
          this.next();
          return { k: "theend", s: this.spanFrom(t) };
        }
        break;
      case "wait": {
        this.next();
        const e = this.expr();
        if (!this.eatWord("seconds") && !this.eatWord("second")) {
          if (this.peek().t === "id" && /^(sec|secs|s|ms|frames?|minutes?)$/.test(this.peek().v)) {
            syntaxError(span(this.peek()), "Waiting is counted in seconds.", "Write `wait 0.5 seconds`.");
          }
        }
        return { k: "wait", e, s: this.spanFrom(t) };
      }
      case "every":
        return this.every();
      case "when":
        return this.when();
      case "draw": {
        this.next();
        const kind = this.kind(Object.keys(SHAPES), "draw");
        const content = kind === "text" ? this.expr() : null;
        const clauses = this.clauses(kind, SHAPES[kind]);
        return { k: "draw", kind, content, clauses, s: this.spanFrom(t) };
      }
      case "background":
        this.next();
        return { k: "background", e: this.expr(), s: this.spanFrom(t) };
      case "clear":
        this.next();
        return { k: "clear", s: span(t) };
      case "play": {
        this.next();
        if (this.eatWord("note")) {
          const e2 = this.expr();
          return { k: "play", what: "note", e: e2, clauses: this.clauses("note", NOTE_CLAUSES), s: this.spanFrom(t) };
        }
        this.eatWord("sound");
        const e = this.expr();
        return { k: "play", what: "sound", e, clauses: this.clauses("sound", SOUND_CLAUSES), s: this.spanFrom(t) };
      }
      case "add": {
        this.next();
        const value = this.expr();
        this.expectWord("to", void 0, "Like `add 5 to scores`.");
        const target = this.postfix();
        return { k: "add", value, target, s: this.spanFrom(t) };
      }
      case "remove": {
        this.next();
        const value = this.expr();
        const from = this.eatWord("from") ? this.postfix() : null;
        return { k: "remove", value, from, s: this.spanFrom(t) };
      }
      case "hide":
      case "show":
        this.next();
        return { k: t.v, e: this.expr(), s: this.spanFrom(t) };
      case "end":
        syntaxError(span(t), "There is an extra `end` here. Nothing is open for it to close.", "Check that each `end` matches an if, repeat, for each, to, every or when above it.");
      case "otherwise":
      case "else":
        syntaxError(span(t), `This \`${t.v}\` isn't part of an \`if\`.`, "An `otherwise` goes between an `if` and its `end`.");
      case "then":
        syntaxError(span(t), "`then` only goes right after the condition of an `if`.");
      case "while":
      case "until":
        syntaxError(span(t), `Loops start with \`repeat\`. Write \`repeat ${t.v} ...\`.`);
      case "times":
        syntaxError(span(t), "`times` goes after a number in a repeat, like `repeat 3 times`.");
    }
    return this.exprStatement();
  }
  exprStatement() {
    const t = this.peek();
    if (t.t === "id" && !RESERVED.has(t.v)) {
      const n = this.peek(1);
      const word = FROM_ELSEWHERE[t.v];
      if (word && (!(n.t === "op" && (n.v === "(" || n.v === "." || n.v === "[")) || word === "say")) {
        syntaxError(span(t), `Once doesn't use \`${t.v}\`. Write \`${word}\` instead.`, word === "say" ? 'Like `say "hello"`.' : void 0);
      }
      if (n.t === "op" && n.v === "=") {
        syntaxError({ line: t.line, col: t.col, len: n.col + 1 - t.col }, "To keep a value, start the line with `set`.", `Like this: set ${t.v} to ...`);
      }
      const startsValue = n.t === "num" || n.t === "str" || n.t === "id" && !["of", "is", "and", "or", "mod", "touches", "contains"].includes(n.v);
      if (startsValue) {
        const guess = closest(t.v, STATEMENTS);
        syntaxError(
          span(t),
          `I don't know how to \`${t.v}\`.`,
          guess ? `Did you mean \`${guess}\`?` : "Lines start with a word like set, say, draw, if or repeat. To use your own instructions, write name(...)."
        );
      }
    }
    const start = this.peek();
    const e = this.expr();
    if (e.k === "call" || e.k === "new") return { k: "expr", e, s: this.spanFrom(start) };
    syntaxError(
      this.spanFrom(start),
      "This line works something out, but doesn't do anything with it.",
      e.k === "bin" && e.op === "eq" && e.a.k === "var" ? `To keep a value, write: set ${e.a.name} to ...` : "Start the line with `say` to show it, or `set name to ...` to keep it."
    );
  }
  target() {
    const start = this.peek();
    if (start.t === "id" && RESERVED.has(start.v) && !["item"].includes(start.v)) {
      syntaxError(span(start), `\`${start.v}\` is one of Once's own words, so it can't be used as a name.`);
    }
    const e = this.postfix();
    if (e.k !== "var" && e.k !== "prop" && e.k !== "index") syntaxError(this.spanFrom(start), "I can only set a name, a property like ball's x, or a list item.");
    return e;
  }
  ifStatement() {
    const start = this.next();
    const cond = this.expr();
    if (this.eatWord("then") && !this.atLineEnd()) {
      const body = [this.statement()];
      return { k: "if", branches: [{ cond, body }], els: null, s: this.spanFrom(start) };
    }
    const sp = this.spanFrom(start);
    this.headerEnd(start);
    const branches = [{ cond, body: this.block(start, ["otherwise", "else", "end"]) }];
    let els = null;
    while (this.isWord("otherwise") || this.isWord("else")) {
      const o = this.next();
      if (els) syntaxError(span(o), "This `if` already has an `otherwise`, so this one can never happen.");
      if (this.eatWord("if")) {
        const c = this.expr();
        this.eatWord("then");
        this.headerEnd(start);
        branches.push({ cond: c, body: this.block(start, ["otherwise", "else", "end"]) });
      } else {
        this.headerEnd(o);
        els = this.block(start, ["otherwise", "else", "end"]);
      }
    }
    this.closeBlock(start);
    return { k: "if", branches, els, s: sp };
  }
  repeat() {
    const start = this.next();
    let mode;
    let e = null;
    if (this.eatWord("forever")) mode = "forever";
    else if (this.eatWord("while")) {
      mode = "while";
      e = this.expr();
    } else if (this.eatWord("until")) {
      mode = "until";
      e = this.expr();
    } else {
      if (this.atLineEnd()) syntaxError(span(start), "How many times should this repeat?", "Write `repeat 10 times`, `repeat forever`, `repeat while ...` or `repeat until ...`.");
      e = this.expr();
      this.expectWord("times", void 0, "Write it like `repeat 10 times`.");
      mode = "times";
    }
    const sp = this.spanFrom(start);
    this.headerEnd(start);
    this.loops++;
    const body = this.block(start, ["end"]);
    this.loops--;
    this.closeBlock(start);
    return { k: "repeat", mode, e, body, s: sp };
  }
  forEach() {
    const start = this.next();
    this.eatWord("each");
    const name = this.name("loop").v;
    let list2 = null, from = null, to = null, by = null;
    if (this.eatWord("in")) list2 = this.expr();
    else if (this.eatWord("from")) {
      from = this.expr();
      this.expectWord("to", void 0, "Write it like `for each n from 1 to 10`.");
      to = this.expr();
      if (this.eatWord("by")) by = this.expr();
    } else {
      syntaxError(
        span(this.peek()),
        `After \`for each ${name}\`, write \`in\` and a list, or \`from\` and a number.`,
        `Like \`for each ${name} in balls\` or \`for each ${name} from 1 to 10\`.`
      );
    }
    const sp = this.spanFrom(start);
    this.headerEnd(start);
    this.loops++;
    const body = this.block(start, ["end"]);
    this.loops--;
    this.closeBlock(start);
    return { k: "foreach", name, list: list2, from, to, by, body, s: sp };
  }
  fnDef() {
    const start = this.next();
    this.topLevelOnly(start);
    const name = this.name("instructions").v;
    const params = [];
    this.eatWord("with");
    if (this.isOp("(")) syntaxError(span(this.peek()), "Instructions list their inputs without brackets.", `Like \`to ${name} a and b\`.`);
    while (!this.atLineEnd()) {
      if (params.length) {
        if (!this.eatWord("and") && !this.eatOp(",")) syntaxError(span(this.peek()), "Separate inputs with `and` or a comma.", `Like \`to ${name} a and b\`.`);
      }
      const p = this.name("input");
      if (params.includes(p.v)) syntaxError(span(p), `\`${p.v}\` is already an input of \`${name}\`.`);
      params.push(p.v);
    }
    const sp = this.spanFrom(start);
    const [loops, inFn] = [this.loops, this.inFn];
    this.loops = 0;
    this.inFn = true;
    const body = this.block(start, ["end"]);
    this.loops = loops;
    this.inFn = inFn;
    this.closeBlock(start);
    return { k: "fn", name, params, body, s: sp };
  }
  handlerBody(start) {
    this.headerEnd(start);
    const [loops, inFn] = [this.loops, this.inFn];
    this.loops = 0;
    this.inFn = false;
    const body = this.block(start, ["end"]);
    this.loops = loops;
    this.inFn = inFn;
    this.closeBlock(start);
    return body;
  }
  every() {
    const start = this.next();
    this.topLevelOnly(start);
    if (this.eatWord("frame")) {
      const sp2 = this.spanFrom(start);
      return { k: "every", mode: "frame", e: null, body: this.handlerBody(start), s: sp2 };
    }
    if (this.atLineEnd()) syntaxError(span(start), "Every what?", "Write `every frame` or `every 2 seconds`.");
    const e = this.expr();
    if (!this.eatWord("seconds") && !this.eatWord("second")) syntaxError(span(this.peek()), "After the number, write `seconds`.", "Like `every 2 seconds`.");
    const sp = this.spanFrom(start);
    return { k: "every", mode: "seconds", e, body: this.handlerBody(start), s: sp };
  }
  when() {
    const start = this.next();
    this.topLevelOnly(start);
    if (this.isWord("key") && this.peek(1).t !== "poss" && !this.isWord("touches", 1)) {
      this.next();
      const a2 = this.postfix();
      this.expectWord("is", void 0, 'Write it like `when key "space" is pressed`.');
      this.expectWord("pressed", void 0, 'Write it like `when key "space" is pressed`.');
      const sp2 = this.spanFrom(start);
      return { k: "when", ev: "key", a: a2, b: null, body: this.handlerBody(start), s: sp2 };
    }
    if (this.isWord("mouse") && this.isWord("is", 1)) {
      this.next();
      this.next();
      this.expectWord("clicked", void 0, "Write `when mouse is clicked`.");
      const sp2 = this.spanFrom(start);
      return { k: "when", ev: "click", a: null, b: null, body: this.handlerBody(start), s: sp2 };
    }
    const a = this.additive();
    this.expectWord("touches", void 0, 'A when line looks like `when key "space" is pressed`, `when mouse is clicked` or `when ball touches paddle`.');
    const b = this.additive();
    const sp = this.spanFrom(start);
    return { k: "when", ev: "touch", a, b, body: this.handlerBody(start), s: sp };
  }
  kind(allowed, verb) {
    const t = this.peek();
    if (t.t !== "id") syntaxError(span(t), `What should I ${verb}? I expected a shape here, but found ${describe(t)}.`, `Shapes are: ${allowed.join(", ")}.`);
    const k = KIND_ALIASES[t.v] ?? t.v;
    if (!allowed.includes(k)) {
      const guess = closest(t.v, allowed);
      syntaxError(span(t), `I don't know how to ${verb} a \`${t.v}\`.`, guess ? `Did you mean \`${guess}\`?` : `Shapes are: ${allowed.join(", ")}.`);
    }
    this.next();
    return k;
  }
  startsValue(schema) {
    const t = this.peek();
    if (t.t === "num" || t.t === "str") return true;
    if (t.t === "op") return "(-[{".includes(t.v);
    if (t.t === "id") {
      if (t.v in schema) return false;
      if (VALUE_WORDS.has(t.v)) return true;
      return !RESERVED.has(t.v);
    }
    return false;
  }
  clauses(kind, schema) {
    const out = [];
    while (this.peek().t === "id" && !this.isWord("then")) {
      const t = this.next();
      const arity2 = Object.prototype.hasOwnProperty.call(schema, t.v) ? schema[t.v] : void 0;
      if (!arity2) {
        const options = Object.keys(schema);
        const guess = closest(t.v, options);
        const what = kind === "note" || kind === "sound" ? `A ${kind}` : `A ${kind}`;
        syntaxError(span(t), `${what} doesn't have a \`${t.v}\` setting.`, guess ? `Did you mean \`${guess}\`?` : `It can have: ${options.join(", ")}.`);
      }
      const [min, max] = arity2;
      const args = [];
      if (max > 0 && (min > 0 || this.startsValue(schema))) {
        args.push(this.expr());
        while (args.length < max && this.eatOp(",")) args.push(this.expr());
      }
      if (args.length < min) {
        const ex = { at: "at 100, 50", from: "from 10, 10", to: "to 200, 80", moving: "moving 3, -2" };
        syntaxError(this.spanFrom(t), `\`${t.v}\` needs ${min === 2 ? "two numbers" : "a value"}.`, ex[t.v] ? `Like \`${ex[t.v]}\`.` : void 0);
      }
      out.push({ name: t.v, args, s: this.spanFrom(t) });
    }
    return out;
  }
  // ---- expressions ----
  expr() {
    return this.or();
  }
  or() {
    let a = this.and();
    while (this.isWord("or")) {
      const t = this.next();
      const b = this.and();
      a = { k: "bin", op: "or", a, b, s: join(a.s, b.s, t) };
    }
    return a;
  }
  and() {
    let a = this.not();
    while (this.isWord("and")) {
      const t = this.next();
      const b = this.not();
      a = { k: "bin", op: "and", a, b, s: join(a.s, b.s, t) };
    }
    return a;
  }
  not() {
    if (this.isWord("not")) {
      const t = this.next();
      const a = this.not();
      return { k: "un", op: "not", a, s: this.spanFrom(t) };
    }
    return this.compare();
  }
  compare() {
    const a = this.additive();
    const t = this.peek();
    let op = null;
    if (t.t === "id" && t.v === "is") {
      this.next();
      if (this.eatWord("not")) op = "ne";
      else if (this.eatWord("above")) op = "gt";
      else if (this.eatWord("below")) op = "lt";
      else if (this.isWord("more") || this.isWord("greater") || this.isWord("bigger")) {
        this.next();
        this.expectWord("than");
        op = "gt";
      } else if (this.isWord("less") || this.isWord("fewer") || this.isWord("smaller")) {
        this.next();
        this.expectWord("than");
        op = "lt";
      } else if (this.isWord("at") && (this.isWord("least", 1) || this.isWord("most", 1))) {
        this.next();
        op = this.next().v === "least" ? "ge" : "le";
      } else op = "eq";
    } else if (t.t === "op" && ["=", "==", "!=", "<", ">", "<=", ">="].includes(t.v)) {
      this.next();
      op = { "=": "eq", "==": "eq", "!=": "ne", "<": "lt", ">": "gt", "<=": "le", ">=": "ge" }[t.v];
    } else if (t.t === "id" && (t.v === "touches" || t.v === "contains")) {
      this.next();
      op = t.v;
    }
    if (!op) return a;
    const b = this.additive();
    return { k: "bin", op, a, b, s: join(a.s, b.s, t) };
  }
  additive() {
    let a = this.multiplicative();
    while (this.isOp("+") || this.isOp("-")) {
      const t = this.next();
      const b = this.multiplicative();
      a = { k: "bin", op: t.v, a, b, s: join(a.s, b.s, t) };
    }
    return a;
  }
  multiplicative() {
    let a = this.unary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%") || this.isWord("mod")) {
      const t = this.next();
      const b = this.unary();
      a = { k: "bin", op: t.v === "%" ? "mod" : t.v, a, b, s: join(a.s, b.s, t) };
    }
    return a;
  }
  unary() {
    if (this.isOp("-")) {
      const t = this.next();
      const a = this.unary();
      if (a.k === "num") return { k: "num", v: -a.v, s: this.spanFrom(t) };
      return { k: "un", op: "neg", a, s: this.spanFrom(t) };
    }
    return this.power();
  }
  power() {
    const a = this.postfix();
    if (this.isOp("^")) {
      const t = this.next();
      const b = this.unary();
      return { k: "bin", op: "^", a, b, s: join(a.s, b.s, t) };
    }
    return a;
  }
  postfix() {
    const start = this.peek();
    let e = this.primary();
    for (; ; ) {
      if (this.peek().t === "poss" || this.isOp(".") && this.peek(1).t === "id") {
        this.next();
        const n = this.peek();
        if (n.t !== "id") syntaxError(span(n), `After 's, I expected the name of a property, but found ${describe(n)}.`, "Like ball's x.");
        this.next();
        e = { k: "prop", obj: e, name: n.v, s: this.spanFrom(start) };
      } else if (this.isOp("[")) {
        this.next();
        const idx = this.expr();
        this.expectOp("]");
        e = { k: "index", obj: e, idx, s: this.spanFrom(start) };
      } else if (this.isOp("(") && (e.k === "var" || e.k === "prop" || e.k === "call" || e.k === "index")) {
        this.next();
        const args = [];
        while (!this.isOp(")")) {
          if (this.peek().t === "eof") this.expectOp(")");
          args.push(this.expr());
          if (!this.eatOp(",")) break;
        }
        this.expectOp(")", void 0, "Values given to instructions are separated by commas, like add(1, 2).");
        e = { k: "call", fn: e, args, s: this.spanFrom(start) };
      } else break;
    }
    return e;
  }
  primary() {
    const t = this.peek();
    if (t.t === "num") {
      this.next();
      return { k: "num", v: t.n, s: span(t) };
    }
    if (t.t === "str") {
      this.next();
      const parts = t.parts.map((p) => {
        if (typeof p === "string") return p;
        const sub = new _Parser(lex(p.src, p.line - 1, p.col - 1));
        const e = sub.expr();
        if (sub.peek().t !== "nl" && sub.peek().t !== "eof") syntaxError(span(sub.peek()), `Inside {braces} I expected one value, but found ${describe(sub.peek())}.`);
        return e;
      });
      return { k: "str", parts, s: span(t) };
    }
    if (t.t === "op") {
      if (t.v === "(") {
        this.next();
        const e = this.expr();
        this.expectOp(")", `I expected \`)\` to close the \`(\` on line ${t.line}, but found ${describe(this.peek())}.`);
        return e;
      }
      if (t.v === "[") {
        this.next();
        const items = [];
        while (!this.isOp("]")) {
          if (this.peek().t === "eof") break;
          items.push(this.expr());
          if (!this.eatOp(",")) break;
        }
        this.expectOp("]", `I expected \`]\` to close the list started on line ${t.line}, but found ${describe(this.peek())}.`, "Items in a list are separated by commas.");
        return { k: "list", items, s: this.spanFrom(t) };
      }
      if (t.v === "{") {
        this.next();
        const keys = [], vals = [];
        while (!this.isOp("}")) {
          const k = this.peek();
          if (k.t === "id") keys.push(k.v);
          else if (k.t === "str" && k.parts.length === 1 && typeof k.parts[0] === "string") keys.push(k.parts[0]);
          else break;
          this.next();
          this.expectOp(":", void 0, 'A record looks like {name: "Pip", age: 3}.');
          vals.push(this.expr());
          if (!this.eatOp(",")) break;
        }
        this.expectOp("}", `I expected \`}\` to close the record started on line ${t.line}, but found ${describe(this.peek())}.`, 'A record looks like {name: "Pip", age: 3}.');
        return { k: "rec", keys, vals, s: this.spanFrom(t) };
      }
      if (t.v === "=" || t.v === "==") syntaxError(span(t), `I expected a value before \`${t.v}\`.`);
      syntaxError(span(t), `I expected a value here, but found ${describe(t)}.`);
    }
    if (t.t === "id") {
      switch (t.v) {
        case "true":
        case "false":
          this.next();
          return { k: "bool", v: t.v === "true", s: span(t) };
        case "nothing":
          this.next();
          return { k: "nothing", s: span(t) };
        case "random": {
          this.next();
          const lo = this.additive();
          this.expectWord("to", void 0, "Write it like `random 1 to 6`.");
          const hi = this.additive();
          return { k: "random", lo, hi, s: this.spanFrom(t) };
        }
        case "any": {
          this.next();
          this.expectWord("of", void 0, "Write it like `any of colors`, to pick one at random.");
          return { k: "any", list: this.unary(), s: this.spanFrom(t) };
        }
        case "holding": {
          this.next();
          return { k: "un", op: "holding", a: this.postfix(), s: this.spanFrom(t) };
        }
        case "new": {
          this.next();
          const kind = this.kind(["circle", "box", "text"], "make");
          const content = kind === "text" ? this.expr() : null;
          const clauses = this.clauses(kind, { ...SHAPES[kind], ...PHYSICS });
          return { k: "new", kind, content, clauses, s: this.spanFrom(t) };
        }
        case "item": {
          const n = this.peek(1);
          if (n.t === "num" || n.t === "op" && (n.v === "(" || n.v === "-") || n.t === "id" && !RESERVED.has(n.v) && this.peek(2).t !== "poss") {
            this.next();
            const idx = this.additive();
            this.expectWord("of", void 0, "Write it like `item 2 of names`.");
            const obj = this.unary();
            return { k: "index", obj, idx, s: this.spanFrom(t) };
          }
          break;
        }
      }
      if (RESERVED.has(t.v)) {
        const hint = t.v === "end" ? "Maybe something is missing just before this `end`." : void 0;
        syntaxError(span(t), `I expected a value here, but found the word \`${t.v}\`.`, hint);
      }
      this.next();
      if (this.isWord("of")) {
        this.next();
        const arg = this.unary();
        return { k: "call", fn: { k: "var", name: t.v, s: span(t) }, args: [arg], s: this.spanFrom(t) };
      }
      return { k: "var", name: t.v, s: span(t) };
    }
    if (t.t === "nl" || t.t === "eof") syntaxError(span(t), "This line ends too soon. I expected a value here.");
    syntaxError(span(t), `I expected a value here, but found ${describe(t)}.`);
  }
};
function join(a, b, t) {
  if (a.line === b.line && b.col >= a.col) return { line: a.line, col: a.col, len: b.col + b.len - a.col };
  return span(t);
}
function describe(t) {
  switch (t.t) {
    case "nl":
      return "the end of the line";
    case "eof":
      return "the end of the story";
    case "num":
      return `the number ${t.v}`;
    case "str":
      return "some text";
    case "poss":
      return "'s";
    case "op":
      return `\`${t.v}\``;
    default:
      return `the word \`${t.v}\``;
  }
}
function srcOf(e) {
  if (e.k === "var") return e.name;
  if (e.k === "prop") return `${srcOf(e.obj)}'s ${e.name}`;
  return "it";
}

// src/web/exportpage.ts
var esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function exportPage(code, runtimeJs, title) {
  const data = JSON.stringify(code).replace(/</g, "\\u003c");
  const js = runtimeJs.replace(/<\/script/gi, "<\\/script");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="color-scheme" content="light dark">
<style>
  :root { --bg: #f3f3f3; --fg: #3b3b3b; --muted: #6e7681; --border: #e5e5e5; --panel: #ffffff; --accent: #0078d4; --error: #e51400; }
  @media (prefers-color-scheme: dark) { :root { --bg: #181818; --fg: #cccccc; --muted: #9d9d9d; --border: #2b2b2b; --panel: #1f1f1f; --error: #f85149; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--fg); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px 16px; }
  h1 { font-size: 18px; font-weight: 600; margin: 0 0 14px; }
  .plate { position: relative; width: min(100%, 720px); border: 1px solid var(--border); background: #fff; }
  canvas { display: block; width: 100%; aspect-ratio: 4 / 3; touch-action: none; }
  .begin { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; border: 0; width: 100%;
    background: rgba(0,0,0,.45); color: #fff; font: 600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; cursor: pointer; }
  .said { width: min(100%, 720px); margin-top: 12px; padding: 8px 12px; min-height: 2em; max-height: 10em; overflow: auto; white-space: pre-wrap;
    background: var(--panel); border: 1px solid var(--border); font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .said:empty { display: none; }
  .said .err { color: var(--error); }
  footer { margin-top: 14px; font-size: 12px; color: var(--muted); }
  footer a { color: var(--accent); }
</style>
</head>
<body>
<h1>${esc(title)}</h1>
<div class="plate"><canvas id="stage" tabindex="0" aria-label="${esc(title)}"></canvas><button class="begin" id="begin">&#9654;&nbsp; Click to run</button></div>
<div class="said" id="said" aria-live="polite"></div>
<footer>Made with <a href="https://once.rennko.tech">Once</a></footer>
<script>${js}</script>
<script>
  var code = ${data};
  var begin = document.getElementById('begin');
  begin.addEventListener('click', function () {
    begin.remove();
    document.getElementById('stage').focus();
    Once.boot({ code: code, canvas: document.getElementById('stage'), said: document.getElementById('said') });
  });
</script>
</body>
</html>
`;
}

// src/cli.ts
var USAGE = `Once ${"0.1.0"}: a little language for moving pictures.

  once run <story.once>                 run a story (say, numbers, lists, waits)
  once check <story.once>               look for mistakes without running
  once export <story.once> [-o page.html]   make a web page that plays the story
  once version

Drawing, sound and keys need a picture: use the playground at
https://once.rennko.tech, or export the story as a web page.`;
function read(file) {
  if (!file) {
    console.error(USAGE);
    process.exit(2);
  }
  if (!(0, import_node_fs.existsSync)(file)) {
    console.error(`I can't find the file ${file}.`);
    process.exit(2);
  }
  return (0, import_node_fs.readFileSync)(file, "utf8");
}
function fail(err, src, file) {
  if (err instanceof OnceError) {
    console.error(formatError(err, src, (0, import_node_path.basename)(file)));
    process.exit(1);
  }
  throw err;
}
function run(file) {
  const src = read(file);
  let program;
  try {
    program = parse(src);
  } catch (e) {
    fail(e, src, file);
  }
  const runner = new Runner(program, {
    graphics: false,
    say: (t) => process.stdout.write(t + "\n"),
    drawPersistent: () => {
    },
    clear: () => {
    },
    playNote: () => {
    },
    playSound: () => {
    },
    holding: () => false,
    mouse: () => ({ x: 0, y: 0, down: false })
  });
  runner.frameWait = 1 / 60;
  runner.start();
  let last = performance.now();
  const step = () => {
    const now = performance.now();
    runner.tick(Math.max(1e-6, (now - last) / 1e3));
    last = now;
    if (runner.error) fail(runner.error, src, file);
    if (runner.ended || runner.idle()) process.exit(0);
    const wait = runner.nextWake();
    if (wait <= 0) setImmediate(step);
    else setTimeout(step, Math.min(1e3, wait * 1e3));
  };
  step();
}
function check(file) {
  const src = read(file);
  try {
    parse(src);
  } catch (e) {
    fail(e, src, file);
  }
  console.log(`${(0, import_node_path.basename)(file)} reads well. No mistakes found.`);
}
function exportCmd(file, out) {
  const src = read(file);
  try {
    parse(src);
  } catch (e) {
    fail(e, src, file);
  }
  const runtime = (0, import_node_fs.readFileSync)((0, import_node_path.join)(__dirname, "web", "once-web.js"), "utf8");
  const first = /^\s*--\s*(.+)$/m.exec(src);
  const title = first ? first[1].trim() : (0, import_node_path.basename)(file, ".once");
  const target = out ?? file.replace(/\.once$/, "") + ".html";
  (0, import_node_fs.writeFileSync)(target, exportPage(src, runtime, title));
  console.log(`Wrote ${(0, import_node_path.resolve)(target)}`);
}
var [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case "run":
    run(rest[0]);
    break;
  case "check":
    check(rest[0]);
    break;
  case "export": {
    const o = rest.indexOf("-o");
    exportCmd(rest[0], o >= 0 ? rest[o + 1] : void 0);
    break;
  }
  case "version":
  case "--version":
  case "-v":
    console.log("0.1.0");
    break;
  case void 0:
  case "help":
  case "--help":
  case "-h":
    console.log(USAGE);
    break;
  default:
    if (cmd.endsWith(".once")) run(cmd);
    else {
      console.error(`I don't know the command "${cmd}".

${USAGE}`);
      process.exit(2);
    }
}
