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
  const d2 = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_2, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d2[i][j] = Math.min(d2[i - 1][j] + 1, d2[i][j - 1] + 1, d2[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d2[i][j] = Math.min(d2[i][j], d2[i - 2][j - 2] + 1);
    }
  }
  return d2[m][n];
}
function closest(word, options) {
  const w = word.toLowerCase();
  let best = null;
  let bestD = Infinity;
  const limit = Math.max(1, Math.floor(word.length / 3));
  for (const o of options) {
    if (o === word) continue;
    const d2 = distance(w, o.toLowerCase());
    if (d2 < bestD) {
      bestD = d2;
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
          let j = i + 1, d2 = 1, inStr = false;
          while (j < src.length && src[j] !== "\n") {
            const cj = src[j];
            if (inStr) {
              if (cj === '"') inStr = false;
            } else if (cj === '"') inStr = true;
            else if (cj === "{") d2++;
            else if (cj === "}" && --d2 === 0) break;
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

// src/worddocs.ts
var d = (kind, sig, doc, example) => ({ kind, sig, doc, example });
var STATEMENTS2 = {
  say: d("statement", "say value", "Prints a line of text. Inside text, `{name}` is replaced by its value.", 'say "Hello, {name}!"'),
  set: d("statement", "set name to value", "Keeps a value under a name, creating the name if it is new. Also sets properties (`ball's x`) and list items (`item 2 of xs`).", `set score to 0
set ball's color to "gold"`),
  change: d("statement", "change name by amount", "Adds an amount to a number (use a negative amount to subtract). On text, adds the amount to the end.", "change score by 1\nchange lives by -1"),
  if: d("statement", "if condition ... otherwise ... end", "Runs the steps only when the condition is true. Add `otherwise if` and `otherwise` for other cases. One step can go on the same line with `then`, with no `end`.", 'if score is above 10\n  say "You win"\notherwise\n  say "Keep going"\nend'),
  otherwise: d("keyword", "otherwise / otherwise if condition", "The other path of an `if`. `else` also works.", 'if x is 1\n  say "one"\notherwise\n  say "not one"\nend'),
  else: d("keyword", "else", "Same as `otherwise`."),
  then: d("keyword", "if condition then step", "Puts a single step on the same line as its `if`. No `end` is needed.", "if lives is 0 then the end"),
  end: d("keyword", "end", "Closes a block: if, repeat, for each, to, every or when. You can write `end if`, `end repeat` and so on for clarity."),
  repeat: d("statement", "repeat N times / repeat while c / repeat until c / repeat forever", "Runs the steps again and again. `repeat forever` runs once per frame (60 times a second) and never freezes the page.", 'repeat 3 times\n  say "knock"\nend'),
  times: d("keyword", "repeat N times", "How many times a `repeat` runs."),
  while: d("keyword", "repeat while condition", "Keeps repeating while the condition stays true.", "repeat while x is below 100\n  set x to x * 2\nend"),
  until: d("keyword", "repeat until condition", "Keeps repeating until the condition becomes true."),
  forever: d("keyword", "repeat forever", "Repeats once per frame until the program ends or a `stop` runs. Drawings inside are redrawn each frame."),
  for: d("statement", "for each name in list / for each name from a to b [by step]", "Runs the steps once for each item of a list (or each letter of text), or for each number in a range. Ranges include both ends.", "for each n from 1 to 5\n  say n\nend\nfor each pet in pets\n  say pet\nend"),
  each: d("keyword", "for each name in list", "Part of a `for each` loop."),
  in: d("keyword", "for each name in list", "Goes through a list, text or record."),
  from: d("keyword", "for each n from a to b / draw line from x, y", "The start of a counting range, or where a line starts."),
  by: d("keyword", "change x by n / for each n from a to b by step", "How much to change by, or the step when counting."),
  to: d("statement", "to name input1 and input2 ... end", "Defines your own instructions. Use them by writing `name(values)`. `give back` returns a value. Must be at the top level.", "to area w and h\n  give back w * h\nend\nsay area(3, 4)"),
  give: d("statement", "give back value", "Ends the current `to` instructions and hands a value back to where they were used.", "to double x\n  give back x * 2\nend"),
  back: d("keyword", "give back value", "Part of `give back`."),
  stop: d("statement", "stop", "Leaves the loop it is in right away."),
  skip: d("statement", "skip", "Jumps to the next turn of the loop it is in."),
  the: d("statement", "the end", "Ends the whole program. Everything stops.", "if lives is 0 then the end"),
  wait: d("statement", "wait N seconds", "Pauses this part of the program. Everything else keeps running.", "wait 0.5 seconds"),
  every: d("statement", "every frame ... end / every N seconds ... end", "`every frame` runs 60 times a second; its drawings are wiped and redrawn each time, so they can move. `every N seconds` runs on a clock. Must be at the top level.", "every frame\n  draw circle at mouse's x, mouse's y size 20\nend"),
  when: d("statement", 'when key "k" is pressed / when mouse is clicked / when a touches b', "Waits for something to happen, then runs the steps. Touch events fire once, when the shapes first meet. Must be at the top level.", `when key "space" is pressed
  set hero's dy to -8
end`),
  key: d("keyword", 'when key "name" is pressed', 'Key names: "left", "right", "up", "down", "space", "enter", "escape", a letter like "a", or "any".'),
  pressed: d("keyword", 'when key "name" is pressed', "Fires once each time the key goes down."),
  clicked: d("keyword", "when mouse is clicked", "Fires each time the preview is clicked or tapped."),
  frame: d("value", "every frame / frame", "In `every frame`: 60 times a second. On its own, `frame` is how many frames have run so far."),
  seconds: d("keyword", "wait N seconds / every N seconds", "Time is counted in seconds. `second` also works."),
  second: d("keyword", "wait 1 second", "Same as `seconds`."),
  draw: d("statement", "draw circle|box|line|text ...settings", "Draws a shape. Inside `every frame` or `repeat forever` it lasts one frame; elsewhere it stays until `clear`.", 'draw circle at 240, 180 size 60 color "tomato"\ndraw text "Score: {score}" at 10, 10'),
  background: d("statement", "background color", "Fills the whole preview with a color, behind everything.", 'background "skyblue"'),
  clear: d("statement", "clear", "Wipes everything drawn outside `every frame`."),
  play: d("statement", 'play note "C4" [for s] [wave w] [volume v] / play sound "name"', "Plays a musical note or a ready-made sound.", 'play note "E5" for 0.2\nplay sound "coin"'),
  note: d("keyword", 'play note "C4" for 0.5', 'A note name like "C4" (middle C), "F#5" or "Bb3", or a number (60 is middle C).'),
  sound: d("keyword", 'play sound "name"', 'Sounds: "beep", "boop", "coin", "jump", "pop", "hit", "boom", "click".'),
  add: d("statement", "add value to list", "Puts a value at the end of a list.", 'add "fox" to pets'),
  remove: d("statement", "remove value from list / remove shape", "Takes the first matching value out of a list, or takes a shape off the screen.", 'remove "owl" from pets\nremove coin'),
  hide: d("statement", "hide shape", "Hides a shape. It stops touching things until you `show` it."),
  show: d("statement", "show shape", "Shows a hidden shape again."),
  new: d("statement", "new circle|box|text ...settings", "Makes a shape that stays on screen and moves by itself. Keep it in a name to change it later.", "set ball to new circle at 100, 50 size 30 moving 3, 0 bouncy")
};
var OPERATORS = {
  is: d("operator", "a is b / is not / is above / is below / is at least / is at most", "Compares two values. Lists and records are equal when their contents are equal.", 'if score is at least 10 then say "nice"'),
  not: d("operator", "not condition / is not", "Flips true and false.", 'if not holding "space" then say "let go"'),
  and: d("operator", "a and b", "True when both sides are true. Also joins inputs in `to name a and b`."),
  or: d("operator", "a or b", "True when either side is true."),
  above: d("operator", "a is above b", "Greater than. Same as `>`."),
  below: d("operator", "a is below b", "Less than. Same as `<`."),
  least: d("operator", "a is at least b", "Greater than or equal. Same as `>=`."),
  most: d("operator", "a is at most b", "Less than or equal. Same as `<=`."),
  mod: d("operator", "a mod b", "The remainder after dividing. Always 0 or more for a positive b.", "say 7 mod 3   -- 1"),
  random: d("operator", "random a to b", "A random number between a and b. Whole numbers give a whole number, including both ends.", "set roll to random 1 to 6"),
  any: d("operator", "any of list", "Picks one item at random.", 'set c to any of ["red", "gold", "teal"]'),
  of: d("operator", "name of value / item n of list / any of list", "`length of xs` is the same as `length(xs)`: any one-input instruction can be written with `of`."),
  item: d("operator", "item n of list", "The nth item. Lists count from 1; negative numbers count from the end. Same as `list[n]`.", "say item 1 of names"),
  holding: d("operator", 'holding "key"', "True while the key is held down.", `if holding "left" then change hero's x by -4`),
  touches: d("operator", "a touches b / a touches edge", "True when two shapes overlap. Either side can be a list of shapes. `edge` is the border of the preview.", "if ball touches paddle then set ball's dy to -5"),
  contains: d("operator", "list contains value / text contains text", "True when the value is in the list (or the text is inside the text)."),
  true: d("value", "true", "Yes."),
  false: d("value", "false", 'No. `false`, `nothing`, `0` and `""` all count as no in an `if`.'),
  nothing: d("value", "nothing", "No value at all. Instructions without `give back` give back nothing.")
};
var SHAPES2 = {
  circle: d("shape", "circle at x, y size s", "A circle. `at` is its middle; `size` is how wide it is.", 'draw circle at 240, 180 size 50 color "gold"'),
  box: d("shape", "box at x, y size w, h", "A rectangle. `at` is its middle. `angle` turns it. Also `square` and `rectangle`.", 'draw box at 240, 330 size 480, 60 color "seagreen"'),
  line: d("shape", "line from x, y to x, y", "A straight line. `width` sets how thick.", "draw line from 0, 0 to 480, 360 width 3"),
  text: d("shape", 'text "words" at x, y size s', "Text. `at` is its top left corner; `size` is the font size.", 'draw text "Score: {score}" at 10, 10 size 24')
};
var SETTINGS = {
  at: d("setting", "at x, y", "Where it goes. The middle for circles and boxes, the top left for text. (0, 0) is the top left of the preview."),
  size: d("setting", "size s / size w, h", "How big: the width of a circle, the width and height of a box, the font size of text."),
  color: d("setting", 'color "name"', 'A color: a name like "tomato", a code like "#0078d4", or rgb(...) / hsl(...).'),
  outline: d("setting", "outline [thickness]", "Draws just the outline instead of filling it."),
  angle: d("setting", "angle degrees", "Turns a box."),
  width: d("setting", "width w", "How wide a box is, or how thick a line is. On its own, `width` is the preview width (480)."),
  height: d("setting", "height h", "How tall a box is. On its own, `height` is the preview height (360)."),
  moving: d("setting", "moving dx, dy", "A `new` shape moves this far across and down every frame."),
  bouncy: d("setting", "bouncy [amount]", "A `new` shape bounces off the edges. `bouncy 0.8` loses some speed each bounce; `bouncy 0` just stops at the edges."),
  solid: d("setting", "solid", "A `new` shape bumps into other solid shapes instead of passing through."),
  fixed: d("setting", "fixed", "A `new` shape never moves by itself and isn't pulled by gravity. Good for walls."),
  hidden: d("setting", "hidden", "A `new` shape starts out hidden. Use `show` later."),
  wave: d("setting", 'wave "triangle"|"sine"|"square"|"sawtooth"', "The voice of a `play note`."),
  volume: d("setting", "volume 0 to 1", "How loud a note or sound is. 0.5 is the default.")
};
var FUNCTIONS = {
  sqrt: d("function", "sqrt(x)", "The square root.", "sqrt(16)   -- 4"),
  abs: d("function", "abs(x)", "The number without its minus sign.", "abs(-3)   -- 3"),
  round: d("function", "round(x) / round(x, places)", "Rounds to the nearest whole number, or to some decimal places.", "round(3.14159, 2)   -- 3.14"),
  floor: d("function", "floor(x)", "Rounds down."),
  ceil: d("function", "ceil(x)", "Rounds up."),
  sin: d("function", "sin(degrees)", "Sine of an angle in degrees.", "sin(90)   -- 1"),
  cos: d("function", "cos(degrees)", "Cosine of an angle in degrees."),
  tan: d("function", "tan(degrees)", "Tangent of an angle in degrees."),
  angle: d("function", "angle(dx, dy)", "The direction of a movement, in degrees. As a setting, `angle` turns a box."),
  distance: d("function", "distance(a, b) / distance(x1, y1, x2, y2)", "How far apart two shapes, or two points, are."),
  min: d("function", "min(a, b, ...) / min(list)", "The smallest number."),
  max: d("function", "max(a, b, ...) / max(list)", "The largest number."),
  sum: d("function", "sum(list)", "All the numbers in a list added up."),
  clamp: d("function", "clamp(x, low, high)", "Keeps x between low and high.", "set x to clamp(x, 0, width)"),
  text: d("function", "text(value)", "Turns any value into text."),
  number: d("function", "number(text)", 'Turns text like "42" into a number.'),
  length: d("function", "length(list or text)", "How many items or letters. Also `length of xs` and `xs's length`."),
  upper: d("function", "upper(text)", "Text in capital letters."),
  lower: d("function", "lower(text)", "Text in small letters."),
  join: d("function", "join(list, separator)", "Glues a list into text.", 'join(["a", "b"], ", ")   -- "a, b"'),
  split: d("function", "split(text, separator)", "Cuts text into a list. Without a separator, into letters."),
  range: d("function", "range(a, b)", "A list of the whole numbers from a to b."),
  sort: d("function", "sort(list)", "A sorted copy of a list of numbers or of text."),
  reverse: d("function", "reverse(list or text)", "A backwards copy."),
  find: d("function", "find(list, value)", "Where the value is (counting from 1), or 0 if it isn't there."),
  keys: d("function", "keys(record)", "The names inside a record, as a list."),
  rgb: d("function", "rgb(r, g, b)", "A color from red, green and blue, each 0 to 255."),
  hsl: d("function", "hsl(hue, saturation, lightness)", "A color from hue (0 to 360), saturation and lightness (0 to 100).")
};
var GLOBALS = {
  width: d("value", "width", "The width of the preview: 480."),
  height: d("value", "height", "The height of the preview: 360."),
  mouse: d("value", "mouse's x, mouse's y, mouse's down", "Where the mouse is over the preview, and whether a button is down."),
  edge: d("value", "edge", "The border of the preview, for `touches`.", 'when ball touches edge\n  play sound "click"\nend'),
  gravity: d("value", "set gravity to 0.4", "How fast shapes made with `new` fall. 0 at the start. Fixed shapes don't fall."),
  time: d("value", "time", "Seconds since the program started."),
  frame: d("value", "frame", "How many frames have run (60 a second)."),
  pi: d("value", "pi", "3.14159...")
};
var PROPERTIES = {
  x: d("property", "shape's x", "Across: the middle of a circle or box, the left of text."),
  y: d("property", "shape's y", "Down: the middle of a circle or box, the top of text."),
  dx: d("property", "shape's dx", "How far it moves across each frame."),
  dy: d("property", "shape's dy", "How far it moves down each frame. Negative goes up."),
  speed: d("property", "shape's speed", "How fast it is moving (read only)."),
  size: d("property", "shape's size", "Its width, or font size for text."),
  width: d("property", "shape's width", "How wide it is."),
  height: d("property", "shape's height", "How tall it is."),
  color: d("property", "shape's color", "Its color."),
  bouncy: d("property", "shape's bouncy", "How bouncy it is (0 means it stops at the edges)."),
  solid: d("property", "shape's solid", "Whether it bumps into other solid shapes."),
  fixed: d("property", "shape's fixed", "Whether it stays still."),
  hidden: d("property", "shape's hidden", "Whether it is hidden."),
  text: d("property", "shape's text", "The words of a text shape."),
  kind: d("property", "shape's kind", '"circle", "box" or "text".'),
  angle: d("property", "shape's angle", "How far a box is turned, in degrees."),
  length: d("property", "list's length", "How many items. Lists also have `first` and `last`."),
  first: d("property", "list's first", "The first item."),
  last: d("property", "list's last", "The last item.")
};

// src/explain.ts
function symbols(src) {
  const lines = src.split("\n");
  const fns = /* @__PURE__ */ new Map();
  const vars = /* @__PURE__ */ new Map();
  lines.forEach((raw, i) => {
    const l = raw.replace(/--.*$/, "");
    let m = /^\s*to\s+([A-Za-z_]\w*)\s*(?:with\s+)?(.*)$/.exec(l);
    if (m && !fns.has(m[1])) {
      const params = m[2].split(/\s*(?:,|\band\b)\s*/).map((p) => p.trim()).filter((p) => /^[A-Za-z_]\w*$/.test(p));
      const comment = [];
      for (let j = i - 1; j >= 0 && /^\s*--/.test(lines[j]); j--) comment.unshift(lines[j].replace(/^\s*--\s?/, ""));
      fns.set(m[1], { name: m[1], params, line: i, comment: comment.join("\n") });
      return;
    }
    m = /^\s*set\s+([A-Za-z_]\w*)\s+to\s+(.*)$/.exec(l);
    if (m && !vars.has(m[1])) {
      vars.set(m[1], { name: m[1], line: i, text: l.trim() });
      return;
    }
    m = /^\s*for\s+(?:each\s+)?([A-Za-z_]\w*)\s+(in|from)\b/.exec(l);
    if (m && !vars.has(m[1])) vars.set(m[1], { name: m[1], line: i, text: l.trim() });
  });
  return { fns, vars };
}
function fence(code) {
  return "```once\n" + code + "\n```";
}
function formatDoc(w, label) {
  const head = label ? `*${label}*

` : "";
  return head + fence(w.sig) + "\n\n" + w.doc + (w.example ? "\n\n**Example**\n\n" + fence(w.example) : "");
}
function zone(line, col) {
  let inStr = false, depth = 0;
  for (let i = 0; i < col && i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (depth === 0 && (c === '"' || c === "\u201D")) inStr = false;
      else if (c === "{") depth++;
      else if (c === "}" && depth > 0) depth--;
    } else {
      if (c === '"' || c === "\u201C") {
        inStr = true;
        depth = 0;
      } else if (c === "-" && line[i + 1] === "-") return "comment";
    }
  }
  return inStr && depth === 0 ? "string" : "code";
}
function explain(src, line, col, syms) {
  const text = src.split("\n")[line] ?? "";
  let start = col, end = col;
  while (start > 0 && /\w/.test(text[start - 1])) start--;
  while (end < text.length && /\w/.test(text[end])) end++;
  if (start === end || /^\d/.test(text.slice(start, end))) return null;
  if (zone(text, start) !== "code") return null;
  const word = text.slice(start, end);
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = /^\s*(\w+)/.exec(text)?.[1] ?? "";
  const prevWord = /(\w+)\s*$/.exec(before)?.[1] ?? "";
  const s = syms ?? symbols(src);
  const out = (markdown) => ({ markdown, start, end });
  if (/(['’]s|\.)\s*$/.test(before)) {
    const p = PROPERTIES[word];
    if (p) return out(formatDoc(p, "property"));
    return out(fence(`${/(\w+)\s*(?:['’]s|\.)\s*$/.exec(before)?.[1] ?? "it"}'s ${word}`) + "\n\nA property set by the program, like `set ball's " + word + " to 0`.");
  }
  const fn = s.fns.get(word);
  if (fn && !(STATEMENTS2[word] && lead === word)) {
    const sig = `to ${fn.name}${fn.params.length ? " " + fn.params.join(" and ") : ""}`;
    const use = `${fn.name}(${fn.params.join(", ")})`;
    return out(`*your instructions, line ${fn.line + 1}*

` + fence(sig) + (fn.comment ? "\n\n" + fn.comment : "") + "\n\nUse it like `" + use + "`.");
  }
  const owner = enclosingFn(src, line, s);
  if (owner && owner.params.includes(word)) {
    return out(`*input of \`${owner.name}\`*

` + fence(`to ${owner.name} ${owner.params.join(" and ")}`) + `

The value given to \`${owner.name}\` when it is used.`);
  }
  if (word === "to") {
    if (lead === "to" && /^\s*$/.test(before)) return out(formatDoc(STATEMENTS2.to));
    if (/\bset\b/.test(before)) return out(fence("set name to value") + "\n\nThe value to keep.");
    if (/\brandom\b/.test(before)) return out(formatDoc(OPERATORS.random));
    if (/\bfrom\b/.test(before) && lead === "draw") return out(fence("draw line from x, y to x, y") + "\n\nWhere the line ends.");
    if (/\bfrom\b/.test(before)) return out(fence("for each n from a to b") + "\n\nThe last number counted (it is included).");
    if (lead === "add") return out(formatDoc(STATEMENTS2.add));
  }
  if (word === "frame" && prevWord === "every") return out(formatDoc(STATEMENTS2.every));
  const shapeLine = /^\s*(draw|set\s+.*\bto\s+new|new)\b/.test(text) || /\bnew\s+\w+/.test(before);
  if (shapeLine && (prevWord === "draw" || prevWord === "new") && SHAPES2[word]) return out(formatDoc(SHAPES2[word], "shape"));
  if (/^\s*(\(|of\b)/.test(after) && FUNCTIONS[word] && !s.vars.has(word)) return out(formatDoc(FUNCTIONS[word], "built-in instructions"));
  if (shapeLine && SETTINGS[word] && /\bnew\b|\bdraw\b/.test(before)) return out(formatDoc(SETTINGS[word], "setting"));
  if (/^\s*play\b/.test(text) && SETTINGS[word]) return out(formatDoc(SETTINGS[word], "setting"));
  const v = s.vars.get(word);
  if (v && !STATEMENTS2[word] && !OPERATORS[word]) {
    return out(`*your name, first set on line ${v.line + 1}*

` + fence(v.text));
  }
  if (STATEMENTS2[word]) return out(formatDoc(STATEMENTS2[word]));
  if (OPERATORS[word]) return out(formatDoc(OPERATORS[word]));
  if (GLOBALS[word]) return out(formatDoc(GLOBALS[word], "always there"));
  if (FUNCTIONS[word]) return out(formatDoc(FUNCTIONS[word], "built-in instructions"));
  if (SHAPES2[word]) return out(formatDoc(SHAPES2[word], "shape"));
  if (SETTINGS[word]) return out(formatDoc(SETTINGS[word], "setting"));
  return null;
}
function enclosingFn(src, line, s) {
  const lines = src.split("\n");
  const stack = [];
  for (let i = 0; i <= line && i < lines.length; i++) {
    const l = lines[i].replace(/--.*$/, "");
    const m = /^\s*to\s+([A-Za-z_]\w*)/.exec(l);
    if (m) stack.push("fn:" + m[1]);
    else if (/^\s*(if\b(?!.*\bthen\s+\S)|repeat\b|for\b|every\b|when\b)/.test(l)) stack.push("block");
    else if (/^\s*end\b/.test(l) && i < line) stack.pop();
  }
  const f = stack.find((x) => x.startsWith("fn:"));
  return f ? s.fns.get(f.slice(3)) ?? null : null;
}
function signatureAt(src, line, col, syms) {
  const text = (src.split("\n")[line] ?? "").slice(0, col);
  let depth = 0, commas = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    const c = text[i];
    if (c === ")" || c === "]") depth++;
    else if (c === "[") depth--;
    else if (c === "(") {
      if (depth > 0) {
        depth--;
        continue;
      }
      const name = /([A-Za-z_]\w*)\s*$/.exec(text.slice(0, i))?.[1];
      if (!name) return null;
      const s = syms ?? symbols(src);
      const fn = s.fns.get(name);
      if (fn) return { label: `${name}(${fn.params.join(", ")})`, params: fn.params, active: commas, doc: fn.comment || "Your instructions." };
      const b = FUNCTIONS[name];
      if (!b) return null;
      const first = b.sig.split(" / ")[0];
      const params = /\((.*)\)/.exec(first)?.[1].split(",").map((p) => p.trim()).filter(Boolean) ?? [];
      return { label: first, params, active: commas, doc: b.doc };
    } else if (c === "," && depth === 0) commas++;
  }
  return null;
}
var SNIPPETS = [
  { label: "if", kind: "snippet", detail: "if ... end", doc: "Run steps only when something is true.", insert: "if ${1:condition}\n	$0\nend" },
  { label: "if otherwise", kind: "snippet", detail: "if ... otherwise ... end", doc: "Choose between two paths.", insert: "if ${1:condition}\n	$2\notherwise\n	$0\nend" },
  { label: "repeat times", kind: "snippet", detail: "repeat N times ... end", doc: "Repeat steps a number of times.", insert: "repeat ${1:3} times\n	$0\nend" },
  { label: "repeat forever", kind: "snippet", detail: "repeat forever ... end", doc: "Repeat once per frame until the program ends.", insert: "repeat forever\n	$0\nend" },
  { label: "for each in", kind: "snippet", detail: "for each item in list ... end", doc: "Go through a list.", insert: "for each ${1:item} in ${2:list}\n	$0\nend" },
  { label: "for each from", kind: "snippet", detail: "for each n from 1 to 10 ... end", doc: "Count through numbers.", insert: "for each ${1:n} from ${2:1} to ${3:10}\n	$0\nend" },
  { label: "to", kind: "snippet", detail: "to name inputs ... end", doc: "Define your own instructions.", insert: "to ${1:name} ${2:input}\n	$0\nend" },
  { label: "every frame", kind: "snippet", detail: "every frame ... end", doc: "Run 60 times a second (animation).", insert: "every frame\n	$0\nend" },
  { label: "every seconds", kind: "snippet", detail: "every N seconds ... end", doc: "Run on a clock.", insert: "every ${1:2} seconds\n	$0\nend" },
  { label: "when key", kind: "snippet", detail: 'when key "space" is pressed ... end', doc: "React to a key.", insert: 'when key "${1:space}" is pressed\n	$0\nend' },
  { label: "when mouse", kind: "snippet", detail: "when mouse is clicked ... end", doc: "React to a click.", insert: "when mouse is clicked\n	$0\nend" },
  { label: "when touches", kind: "snippet", detail: "when a touches b ... end", doc: "React when two shapes meet.", insert: "when ${1:ball} touches ${2:edge}\n	$0\nend" },
  { label: "draw circle", kind: "snippet", detail: "draw circle at x, y size s color c", doc: "Draw a circle.", insert: 'draw circle at ${1:240}, ${2:180} size ${3:40} color "${4:tomato}"' },
  { label: "new circle", kind: "snippet", detail: "new circle that moves and bounces", doc: "A shape that moves by itself.", insert: "new circle at ${1:100}, ${2:100} size ${3:30} moving ${4:3}, ${5:0} bouncy" }
];
function completions(src, line, col, syms) {
  const text = (src.split("\n")[line] ?? "").slice(0, col);
  if (zone(text, text.length) !== "code") return [];
  const s = syms ?? symbols(src);
  const items = [];
  if (/(['’]s|\.)\s*\w*$/.test(text)) {
    for (const [k, w] of Object.entries(PROPERTIES)) items.push({ label: k, kind: "property", detail: w.sig, doc: w.doc });
    return items;
  }
  const atStart = /^\s*\w*$/.test(text);
  for (const f of s.fns.values()) items.push({ label: f.name, kind: "user-fn", detail: `to ${f.name} ${f.params.join(" and ")}`.trim(), doc: f.comment || "Your instructions.", insert: `${f.name}(${f.params.map((p, i) => `\${${i + 1}:${p}}`).join(", ")})` });
  for (const v of s.vars.values()) items.push({ label: v.name, kind: "user-var", detail: v.text, doc: `First set on line ${v.line + 1}.` });
  if (atStart) items.push(...SNIPPETS);
  const tables = atStart ? [STATEMENTS2, OPERATORS, FUNCTIONS, GLOBALS] : [OPERATORS, FUNCTIONS, GLOBALS, SHAPES2, SETTINGS, STATEMENTS2];
  const seen = new Set(items.map((i) => i.label));
  for (const t of tables) {
    for (const [k, w] of Object.entries(t)) {
      if (seen.has(k)) continue;
      seen.add(k);
      items.push({ label: k, kind: w.kind, detail: w.sig, doc: w.doc, insert: w.kind === "function" ? `${k}($0)` : void 0 });
    }
  }
  return items;
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
    const d2 = new vscode.Diagnostic(range, e.message.replace(/`/g, "'") + (e.hint ? `
Hint: ${e.hint.replace(/`/g, "'")}` : ""), vscode.DiagnosticSeverity.Error);
    d2.source = "once";
    return d2;
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
  const KIND = {
    statement: vscode.CompletionItemKind.Keyword,
    keyword: vscode.CompletionItemKind.Keyword,
    operator: vscode.CompletionItemKind.Operator,
    shape: vscode.CompletionItemKind.Class,
    setting: vscode.CompletionItemKind.Property,
    function: vscode.CompletionItemKind.Function,
    value: vscode.CompletionItemKind.Constant,
    property: vscode.CompletionItemKind.Field,
    "user-fn": vscode.CompletionItemKind.Method,
    "user-var": vscode.CompletionItemKind.Variable,
    snippet: vscode.CompletionItemKind.Snippet
  };
  const selector = { language: "once" };
  ctx.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, {
      provideHover(doc, pos) {
        const r = explain(doc.getText(), pos.line, pos.character);
        if (!r) return null;
        const md = new vscode.MarkdownString(r.markdown);
        return new vscode.Hover(md, new vscode.Range(pos.line, r.start, pos.line, r.end));
      }
    }),
    vscode.languages.registerCompletionItemProvider(selector, {
      provideCompletionItems(doc, pos) {
        const src = doc.getText();
        return completions(src, pos.line, pos.character, symbols(src)).map((c) => {
          const item = new vscode.CompletionItem(c.label, KIND[c.kind] ?? vscode.CompletionItemKind.Text);
          item.detail = c.detail;
          item.documentation = new vscode.MarkdownString(c.doc);
          if (c.insert) item.insertText = new vscode.SnippetString(c.insert);
          if (c.kind === "snippet") item.sortText = "0" + c.label;
          else if (c.kind.startsWith("user")) item.sortText = "1" + c.label;
          return item;
        });
      }
    }, "'", "."),
    vscode.languages.registerSignatureHelpProvider(selector, {
      provideSignatureHelp(doc, pos) {
        const sig = signatureAt(doc.getText(), pos.line, pos.character);
        if (!sig) return null;
        const info = new vscode.SignatureInformation(sig.label, new vscode.MarkdownString(sig.doc));
        info.parameters = sig.params.map((p) => new vscode.ParameterInformation(p));
        const help = new vscode.SignatureHelp();
        help.signatures = [info];
        help.activeSignature = 0;
        help.activeParameter = Math.min(sig.active, Math.max(0, sig.params.length - 1));
        return help;
      }
    }, "(", ",")
  );
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
    p.stdout.on("data", (d2) => output.append(d2.toString()));
    p.stderr.on("data", (d2) => output.append(d2.toString()));
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
            const d2 = await vscode.workspace.openTextDocument(panelDoc);
            diags.set(panelDoc, [toDiag(Object.assign(new OnceError("runtime", m.message, m.span, m.hint)), d2)]);
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
