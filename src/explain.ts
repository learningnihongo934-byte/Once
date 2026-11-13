// Explains the word under the cursor (hover), lists what can be typed (completion),
// and shows the inputs of the instructions being called (signature help).
// Pure functions on text, so they are easy to test and could serve any editor.
import { FUNCTIONS, GLOBALS, OPERATORS, PROPERTIES, SETTINGS, SHAPES, STATEMENTS, WordDoc } from './worddocs';

export interface UserFn { name: string; params: string[]; line: number; comment: string }
export interface UserVar { name: string; line: number; text: string }
export interface Symbols { fns: Map<string, UserFn>; vars: Map<string, UserVar> }

/** Finds the story's own instructions (`to ...`) and names (`set ...`, `for each ...`). Lines are 0-based. */
export function symbols(src: string): Symbols {
  const lines = src.split('\n');
  const fns = new Map<string, UserFn>();
  const vars = new Map<string, UserVar>();
  lines.forEach((raw, i) => {
    const l = raw.replace(/--.*$/, '');
    let m = /^\s*to\s+([A-Za-z_]\w*)\s*(?:with\s+)?(.*)$/.exec(l);
    if (m && !fns.has(m[1])) {
      const params = m[2].split(/\s*(?:,|\band\b)\s*/).map((p) => p.trim()).filter((p) => /^[A-Za-z_]\w*$/.test(p));
      const comment: string[] = [];
      for (let j = i - 1; j >= 0 && /^\s*--/.test(lines[j]); j--) comment.unshift(lines[j].replace(/^\s*--\s?/, ''));
      fns.set(m[1], { name: m[1], params, line: i, comment: comment.join('\n') });
      return;
    }
    m = /^\s*set\s+([A-Za-z_]\w*)\s+to\s+(.*)$/.exec(l);
    if (m && !vars.has(m[1])) { vars.set(m[1], { name: m[1], line: i, text: l.trim() }); return; }
    m = /^\s*for\s+(?:each\s+)?([A-Za-z_]\w*)\s+(in|from)\b/.exec(l);
    if (m && !vars.has(m[1])) vars.set(m[1], { name: m[1], line: i, text: l.trim() });
  });
  return { fns, vars };
}

function fence(code: string) { return '```once\n' + code + '\n```'; }

export function formatDoc(w: WordDoc, label?: string): string {
  const head = label ? `*${label}*\n\n` : '';
  return head + fence(w.sig) + '\n\n' + w.doc + (w.example ? '\n\n**Example**\n\n' + fence(w.example) : '');
}

/** Where `col` falls on the line: in a comment, in plain text inside quotes, or in code. */
function zone(line: string, col: number): 'code' | 'string' | 'comment' {
  let inStr = false, depth = 0;
  for (let i = 0; i < col && i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (depth === 0 && (c === '"' || c === '”')) inStr = false;
      else if (c === '{') depth++;
      else if (c === '}' && depth > 0) depth--;
    } else {
      if (c === '"' || c === '“') { inStr = true; depth = 0; }
      else if (c === '-' && line[i + 1] === '-') return 'comment';
    }
  }
  return inStr && depth === 0 ? 'string' : 'code';
}

export interface Explained { markdown: string; start: number; end: number }

/** Explains the word at (line, col), both 0-based. */
export function explain(src: string, line: number, col: number, syms?: Symbols): Explained | null {
  const text = src.split('\n')[line] ?? '';
  let start = col, end = col;
  while (start > 0 && /\w/.test(text[start - 1])) start--;
  while (end < text.length && /\w/.test(text[end])) end++;
  if (start === end || /^\d/.test(text.slice(start, end))) return null;
  if (zone(text, start) !== 'code') return null;
  const word = text.slice(start, end);
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = /^\s*(\w+)/.exec(text)?.[1] ?? '';
  const prevWord = /(\w+)\s*$/.exec(before)?.[1] ?? '';
  const s = syms ?? symbols(src);
  const out = (markdown: string) => ({ markdown, start, end });

  // After 's or a dot: a property.
  if (/(['’]s|\.)\s*$/.test(before)) {
    const p = PROPERTIES[word];
    if (p) return out(formatDoc(p, 'property'));
    return out(fence(`${/(\w+)\s*(?:['’]s|\.)\s*$/.exec(before)?.[1] ?? 'it'}'s ${word}`) + '\n\nA property set by the program, like `set ball\'s ' + word + ' to 0`.');
  }

  // The story's own instructions and names come before built-ins (except Once's own keywords).
  const fn = s.fns.get(word);
  if (fn && !(STATEMENTS[word] && lead === word)) {
    const sig = `to ${fn.name}${fn.params.length ? ' ' + fn.params.join(' and ') : ''}`;
    const use = `${fn.name}(${fn.params.join(', ')})`;
    return out(`*your instructions, line ${fn.line + 1}*\n\n` + fence(sig) + (fn.comment ? '\n\n' + fn.comment : '') + '\n\nUse it like ' + '`' + use + '`.');
  }
  const owner = enclosingFn(src, line, s);
  if (owner && owner.params.includes(word)) {
    return out(`*input of \`${owner.name}\`*\n\n` + fence(`to ${owner.name} ${owner.params.join(' and ')}`) + `\n\nThe value given to \`${owner.name}\` when it is used.`);
  }

  // Words whose meaning depends on where they are.
  if (word === 'to') {
    if (lead === 'to' && /^\s*$/.test(before)) return out(formatDoc(STATEMENTS.to));
    if (/\bset\b/.test(before)) return out(fence('set name to value') + '\n\nThe value to keep.');
    if (/\brandom\b/.test(before)) return out(formatDoc(OPERATORS.random));
    if (/\bfrom\b/.test(before) && lead === 'draw') return out(fence('draw line from x, y to x, y') + '\n\nWhere the line ends.');
    if (/\bfrom\b/.test(before)) return out(fence('for each n from a to b') + '\n\nThe last number counted (it is included).');
    if (lead === 'add') return out(formatDoc(STATEMENTS.add));
  }
  if (word === 'frame' && prevWord === 'every') return out(formatDoc(STATEMENTS.every));
  const shapeLine = /^\s*(draw|set\s+.*\bto\s+new|new)\b/.test(text) || /\bnew\s+\w+/.test(before);
  if (shapeLine && (prevWord === 'draw' || prevWord === 'new') && SHAPES[word]) return out(formatDoc(SHAPES[word], 'shape'));
  if (/^\s*(\(|of\b)/.test(after) && FUNCTIONS[word] && !s.vars.has(word)) return out(formatDoc(FUNCTIONS[word], 'built-in instructions'));
  if (shapeLine && SETTINGS[word] && /\bnew\b|\bdraw\b/.test(before)) return out(formatDoc(SETTINGS[word], 'setting'));
  if (/^\s*play\b/.test(text) && SETTINGS[word]) return out(formatDoc(SETTINGS[word], 'setting'));

  const v = s.vars.get(word);
  if (v && !STATEMENTS[word] && !OPERATORS[word]) {
    return out(`*your name, first set on line ${v.line + 1}*\n\n` + fence(v.text));
  }
  if (STATEMENTS[word]) return out(formatDoc(STATEMENTS[word]));
  if (OPERATORS[word]) return out(formatDoc(OPERATORS[word]));
  if (GLOBALS[word]) return out(formatDoc(GLOBALS[word], 'always there'));
  if (FUNCTIONS[word]) return out(formatDoc(FUNCTIONS[word], 'built-in instructions'));
  if (SHAPES[word]) return out(formatDoc(SHAPES[word], 'shape'));
  if (SETTINGS[word]) return out(formatDoc(SETTINGS[word], 'setting'));
  return null;
}

/** The `to ...` block that line `line` is inside, if any. */
function enclosingFn(src: string, line: number, s: Symbols): UserFn | null {
  const lines = src.split('\n');
  const stack: string[] = [];
  for (let i = 0; i <= line && i < lines.length; i++) {
    const l = lines[i].replace(/--.*$/, '');
    const m = /^\s*to\s+([A-Za-z_]\w*)/.exec(l);
    if (m) stack.push('fn:' + m[1]);
    else if (/^\s*(if\b(?!.*\bthen\s+\S)|repeat\b|for\b|every\b|when\b)/.test(l)) stack.push('block');
    else if (/^\s*end\b/.test(l) && i < line) stack.pop();
  }
  const f = stack.find((x) => x.startsWith('fn:'));
  return f ? s.fns.get(f.slice(3)) ?? null : null;
}

export interface Signature { label: string; params: string[]; active: number; doc: string }

/** The instructions being called around (line, col), for showing their inputs while typing. */
export function signatureAt(src: string, line: number, col: number, syms?: Symbols): Signature | null {
  const text = (src.split('\n')[line] ?? '').slice(0, col);
  let depth = 0, commas = 0;
  for (let i = text.length - 1; i >= 0; i--) {
    const c = text[i];
    if (c === ')' || c === ']') depth++;
    else if (c === '[') depth--;
    else if (c === '(') {
      if (depth > 0) { depth--; continue; }
      const name = /([A-Za-z_]\w*)\s*$/.exec(text.slice(0, i))?.[1];
      if (!name) return null;
      const s = syms ?? symbols(src);
      const fn = s.fns.get(name);
      if (fn) return { label: `${name}(${fn.params.join(', ')})`, params: fn.params, active: commas, doc: fn.comment || 'Your instructions.' };
      const b = FUNCTIONS[name];
      if (!b) return null;
      const first = b.sig.split(' / ')[0];
      const params = /\((.*)\)/.exec(first)?.[1].split(',').map((p) => p.trim()).filter(Boolean) ?? [];
      return { label: first, params, active: commas, doc: b.doc };
    } else if (c === ',' && depth === 0) commas++;
  }
  return null;
}

export interface Completion { label: string; kind: WordDoc['kind'] | 'user-fn' | 'user-var' | 'snippet'; detail: string; doc: string; insert?: string }

const SNIPPETS: Completion[] = [
  { label: 'if', kind: 'snippet', detail: 'if ... end', doc: 'Run steps only when something is true.', insert: 'if ${1:condition}\n\t$0\nend' },
  { label: 'if otherwise', kind: 'snippet', detail: 'if ... otherwise ... end', doc: 'Choose between two paths.', insert: 'if ${1:condition}\n\t$2\notherwise\n\t$0\nend' },
  { label: 'repeat times', kind: 'snippet', detail: 'repeat N times ... end', doc: 'Repeat steps a number of times.', insert: 'repeat ${1:3} times\n\t$0\nend' },
  { label: 'repeat forever', kind: 'snippet', detail: 'repeat forever ... end', doc: 'Repeat once per frame until the program ends.', insert: 'repeat forever\n\t$0\nend' },
  { label: 'for each in', kind: 'snippet', detail: 'for each item in list ... end', doc: 'Go through a list.', insert: 'for each ${1:item} in ${2:list}\n\t$0\nend' },
  { label: 'for each from', kind: 'snippet', detail: 'for each n from 1 to 10 ... end', doc: 'Count through numbers.', insert: 'for each ${1:n} from ${2:1} to ${3:10}\n\t$0\nend' },
  { label: 'to', kind: 'snippet', detail: 'to name inputs ... end', doc: 'Define your own instructions.', insert: 'to ${1:name} ${2:input}\n\t$0\nend' },
  { label: 'every frame', kind: 'snippet', detail: 'every frame ... end', doc: 'Run 60 times a second (animation).', insert: 'every frame\n\t$0\nend' },
  { label: 'every seconds', kind: 'snippet', detail: 'every N seconds ... end', doc: 'Run on a clock.', insert: 'every ${1:2} seconds\n\t$0\nend' },
  { label: 'when key', kind: 'snippet', detail: 'when key "space" is pressed ... end', doc: 'React to a key.', insert: 'when key "${1:space}" is pressed\n\t$0\nend' },
  { label: 'when mouse', kind: 'snippet', detail: 'when mouse is clicked ... end', doc: 'React to a click.', insert: 'when mouse is clicked\n\t$0\nend' },
  { label: 'when touches', kind: 'snippet', detail: 'when a touches b ... end', doc: 'React when two shapes meet.', insert: 'when ${1:ball} touches ${2:edge}\n\t$0\nend' },
  { label: 'draw circle', kind: 'snippet', detail: 'draw circle at x, y size s color c', doc: 'Draw a circle.', insert: 'draw circle at ${1:240}, ${2:180} size ${3:40} color "${4:tomato}"' },
  { label: 'new circle', kind: 'snippet', detail: 'new circle that moves and bounces', doc: 'A shape that moves by itself.', insert: 'new circle at ${1:100}, ${2:100} size ${3:30} moving ${4:3}, ${5:0} bouncy' },
];

/** Everything that can be typed at this point, best matches first left to the editor. */
export function completions(src: string, line: number, col: number, syms?: Symbols): Completion[] {
  const text = (src.split('\n')[line] ?? '').slice(0, col);
  if (zone(text, text.length) !== 'code') return [];
  const s = syms ?? symbols(src);
  const items: Completion[] = [];
  if (/(['’]s|\.)\s*\w*$/.test(text)) {
    for (const [k, w] of Object.entries(PROPERTIES)) items.push({ label: k, kind: 'property', detail: w.sig, doc: w.doc });
    return items;
  }
  const atStart = /^\s*\w*$/.test(text);
  for (const f of s.fns.values()) items.push({ label: f.name, kind: 'user-fn', detail: `to ${f.name} ${f.params.join(' and ')}`.trim(), doc: f.comment || 'Your instructions.', insert: `${f.name}(${f.params.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})` });
  for (const v of s.vars.values()) items.push({ label: v.name, kind: 'user-var', detail: v.text, doc: `First set on line ${v.line + 1}.` });
  if (atStart) items.push(...SNIPPETS);
  const tables: Record<string, WordDoc>[] = atStart ? [STATEMENTS, OPERATORS, FUNCTIONS, GLOBALS] : [OPERATORS, FUNCTIONS, GLOBALS, SHAPES, SETTINGS, STATEMENTS];
  const seen = new Set(items.map((i) => i.label));
  for (const t of tables) {
    for (const [k, w] of Object.entries(t)) {
      if (seen.has(k)) continue;
      seen.add(k);
      items.push({ label: k, kind: w.kind, detail: w.sig, doc: w.doc, insert: w.kind === 'function' ? `${k}($0)` : undefined });
    }
  }
  return items;
}
