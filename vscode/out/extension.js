"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/vscode/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var import_node_path = require("node:path");
var import_node_zlib = require("node:zlib");
var vscode = __toESM(require("vscode"));

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
    let list = null, from = null, to = null, by = null;
    if (this.eatWord("in")) list = this.expr();
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
    return { k: "foreach", name, list, from, to, by, body, s: sp };
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
      const arity = Object.prototype.hasOwnProperty.call(schema, t.v) ? schema[t.v] : void 0;
      if (!arity) {
        const options = Object.keys(schema);
        const guess = closest(t.v, options);
        const what = kind === "note" || kind === "sound" ? `A ${kind}` : `A ${kind}`;
        syntaxError(span(t), `${what} doesn't have a \`${t.v}\` setting.`, guess ? `Did you mean \`${guess}\`?` : `It can have: ${options.join(", ")}.`);
      }
      const [min, max] = arity;
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

// src/vscode/extension.ts
var output;
var running = null;
var panel = null;
var panelDoc = null;
function activate(ctx) {
  output = vscode.window.createOutputChannel("Once");
  const diags = vscode.languages.createDiagnosticCollection("once");
  const cli = (0, import_node_path.join)(ctx.extensionPath, "out", "once.cjs");
  const toDiag = (e, doc) => {
    const sp = e.span ?? { line: 1, col: 1, len: 1 };
    const line = Math.min(doc.lineCount - 1, Math.max(0, sp.line - 1));
    const range = new vscode.Range(line, sp.col - 1, line, sp.col - 1 + Math.max(1, sp.len));
    const d = new vscode.Diagnostic(range, e.message.replace(/`/g, "'") + (e.hint ? `
Hint: ${e.hint.replace(/`/g, "'")}` : ""), vscode.DiagnosticSeverity.Error);
    d.source = "once";
    return d;
  };
  const check = (doc) => {
    if (doc.languageId !== "once") return;
    try {
      parse(doc.getText());
      diags.set(doc.uri, []);
    } catch (e) {
      if (e instanceof OnceError) diags.set(doc.uri, [toDiag(e, doc)]);
    }
  };
  const timers = /* @__PURE__ */ new Map();
  ctx.subscriptions.push(
    output,
    diags,
    vscode.workspace.onDidOpenTextDocument(check),
    vscode.workspace.onDidChangeTextDocument((ev) => {
      const k = ev.document.uri.toString();
      clearTimeout(timers.get(k));
      timers.set(k, setTimeout(() => check(ev.document), 300));
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => diags.delete(doc.uri)),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (panel && panelDoc && doc.uri.toString() === panelDoc.toString()) sendCode(doc);
    })
  );
  vscode.workspace.textDocuments.forEach(check);
  const current = async () => {
    const ed = vscode.window.activeTextEditor;
    const doc = ed?.document ?? (panelDoc ? await vscode.workspace.openTextDocument(panelDoc) : null);
    if (!doc || doc.languageId !== "once") {
      vscode.window.showWarningMessage("Open a .once file first.");
      return null;
    }
    if (doc.isDirty && !doc.isUntitled) await doc.save();
    return doc;
  };
  const runCli = (args, onDone) => {
    running?.kill();
    const p = (0, import_node_child_process.spawn)(process.execPath, [cli, ...args], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } });
    running = p;
    p.stdout.on("data", (d) => output.append(d.toString()));
    p.stderr.on("data", (d) => output.append(d.toString()));
    p.on("close", (code) => {
      if (running === p) running = null;
      onDone?.(code);
    });
  };
  const sendCode = (doc) => {
    diags.set(doc.uri, []);
    check(doc);
    panel?.webview.postMessage({ type: "run", code: doc.getText() });
  };
  ctx.subscriptions.push(
    vscode.commands.registerCommand("once.preview", async () => {
      const doc = await current();
      if (!doc) return;
      panelDoc = doc.uri;
      if (!panel) {
        panel = vscode.window.createWebviewPanel("oncePreview", "Once Preview", { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.file((0, import_node_path.join)(ctx.extensionPath, "out", "web"))]
        });
        panel.webview.html = previewHtml(panel.webview, ctx.extensionPath);
        panel.onDidDispose(() => {
          panel = null;
        });
        panel.webview.onDidReceiveMessage(async (m) => {
          if (m.type === "ready" && panelDoc) sendCode(await vscode.workspace.openTextDocument(panelDoc));
          if (m.type === "error" && panelDoc) {
            const d = await vscode.workspace.openTextDocument(panelDoc);
            diags.set(panelDoc, [toDiag(Object.assign(new OnceError("runtime", m.message, m.span, m.hint)), d)]);
          }
        });
      } else {
        panel.reveal(vscode.ViewColumn.Beside, true);
        sendCode(doc);
      }
      panel.title = `Once: ${doc.fileName.split(/[\\/]/).pop()}`;
    }),
    vscode.commands.registerCommand("once.runInTerminal", async () => {
      const doc = await current();
      if (!doc) return;
      output.clear();
      output.show(true);
      if (doc.isUntitled) {
        output.appendLine("Save the file first, then run it again.");
        return;
      }
      runCli(["run", doc.fileName], (code) => output.appendLine(code === 0 ? "\n[done]" : code === null ? "\n[stopped]" : ""));
    }),
    vscode.commands.registerCommand("once.stop", () => {
      running?.kill();
      panel?.webview.postMessage({ type: "stop" });
    }),
    vscode.commands.registerCommand("once.export", async () => {
      const doc = await current();
      if (!doc || doc.isUntitled) return;
      const out = doc.fileName.replace(/\.once$/, "") + ".html";
      output.clear();
      runCli(["export", doc.fileName, "-o", out], async (code) => {
        if (code !== 0) {
          output.show(true);
          return;
        }
        const pick = await vscode.window.showInformationMessage(`Saved ${out.split(/[\\/]/).pop()}`, "Open in browser");
        if (pick) vscode.env.openExternal(vscode.Uri.file(out));
      });
    }),
    vscode.commands.registerCommand("once.openPlayground", async () => {
      const doc = await current();
      if (!doc) return;
      const packed = "z" + (0, import_node_zlib.deflateRawSync)(Buffer.from(doc.getText(), "utf8")).toString("base64url");
      const name = doc.fileName.split(/[\\/]/).pop().replace(/\.once$/, "");
      vscode.env.openExternal(vscode.Uri.parse(`https://once.rennko.tech/#code=${packed}&title=${encodeURIComponent(name)}`));
    })
  );
}
function previewHtml(webview, extPath) {
  const js = webview.asWebviewUri(vscode.Uri.file((0, import_node_path.join)(extPath, "out", "web", "once-web.js")));
  const nonce = Math.random().toString(36).slice(2);
  (0, import_node_fs.readFileSync)((0, import_node_path.join)(extPath, "out", "web", "once-web.js"));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}';">
<style>
  body { margin: 0; padding: 12px; background: var(--vscode-editor-background); color: var(--vscode-foreground); font: var(--vscode-font-size) var(--vscode-font-family); }
  .stage { max-width: 720px; border: 1px solid var(--vscode-panel-border, #8884); background: #fff; }
  canvas { display: block; width: 100%; aspect-ratio: 4 / 3; outline: none; touch-action: none; }
  .bar { display: flex; justify-content: space-between; max-width: 720px; margin: 0 0 8px; color: var(--vscode-descriptionForeground); font-size: 12px; }
  #said { max-width: 720px; margin-top: 10px; font: var(--vscode-editor-font-size, 13px)/1.5 var(--vscode-editor-font-family, monospace); white-space: pre-wrap; }
  #said .err { color: var(--vscode-errorForeground); }
</style></head>
<body>
<div class="bar"><span>480 &times; 360. Click the picture to use the keyboard.</span><span>Saves re-run the program.</span></div>
<div class="stage"><canvas id="stage" tabindex="0"></canvas></div>
<div id="said"></div>
<script nonce="${nonce}" src="${js}"></script>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const canvas = document.getElementById('stage');
  const said = document.getElementById('said');
  canvas.addEventListener('pointerdown', () => canvas.focus());
  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (m.type === 'run') {
      Once.boot({ code: m.code, canvas, said, onError: (e) => vscode.postMessage({ type: 'error', message: e.message, hint: e.hint, span: e.span }) });
      canvas.focus();
    }
    if (m.type === 'stop' && canvas.onceStage) canvas.onceStage.stop();
  });
  vscode.postMessage({ type: 'ready' });
</script>
</body></html>`;
}
function deactivate() {
  running?.kill();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
