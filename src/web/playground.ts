// The playground: an editor on the left; preview, output and problems on the right.
import blank from '../../examples/blank.once';
import bouncing from '../../examples/bouncing-balls.once';
import hello from '../../examples/hello.once';
import { OnceError } from '../errors';
import { highlight } from '../highlight';
import { parse } from '../parser';
import { exportPage } from './exportpage';
import { Stage } from './stage';

const STORIES: { id: string; title: string; code: string }[] = [
  { id: 'bouncing-balls', title: 'Bouncing balls', code: bouncing },
  { id: 'hello', title: 'Hello, world', code: hello },
  { id: 'blank', title: 'Blank', code: blank },
];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const src = $<HTMLTextAreaElement>('src');
const hl = $<HTMLPreElement>('hl');
const gutter = $<HTMLDivElement>('gutter');
const curline = $<HTMLDivElement>('curline');
const errline = $<HTMLDivElement>('errline');
const squiggle = $<HTMLDivElement>('squiggle');
const output = $<HTMLDivElement>('output');
const problems = $<HTMLDivElement>('problems');
const pcount = $<HTMLSpanElement>('pcount');
const filename = $<HTMLSpanElement>('filename');
const stories = $<HTMLSelectElement>('stories');
const stagebox = $<HTMLDivElement>('stagebox');
const runBtn = $<HTMLButtonElement>('run');
const stopBtn = $<HTMLButtonElement>('stop');
const statusbar = document.querySelector<HTMLElement>('.statusbar')!;
const status = $<HTMLSpanElement>('status');
const errcount = $<HTMLSpanElement>('errcount');
const cursor = $<HTMLSpanElement>('cursor');
const LINE = 20, PAD_TOP = 8, PAD_LEFT = 4;

let file = 'bouncing-balls.once';

const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// ---- theme ----
$<HTMLButtonElement>('theme').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  store.set('once:theme', root.dataset.theme);
});

// ---- editor ----
const charWidth = (() => {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
  probe.textContent = 'x'.repeat(100);
  hl.appendChild(probe);
  const w = probe.getBoundingClientRect().width / 100;
  probe.remove();
  return w || 8.4;
})();

function refresh() {
  const code = src.value;
  hl.innerHTML = highlight(code) + '\n';
  const lines = code.split('\n').length;
  if (gutter.dataset.n !== String(lines)) {
    gutter.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
    gutter.dataset.n = String(lines);
  }
  store.set('once:draft', code);
  moveCursor();
}

function moveCursor() {
  const before = src.value.slice(0, src.selectionStart);
  const line = before.split('\n').length;
  const col = before.length - before.lastIndexOf('\n');
  curline.style.top = `${PAD_TOP + (line - 1) * LINE}px`;
  cursor.textContent = `Ln ${line}, Col ${col}`;
}

function lineStart(v: string, pos: number) { return v.lastIndexOf('\n', pos - 1) + 1; }

function replaceRange(start: number, end: number, text: string, caret: number) {
  src.setRangeText(text, start, end, 'end');
  src.selectionStart = src.selectionEnd = caret;
  refresh();
}

const OPENS = /^\s*(if\b(?!.*\bthen\s+\S)|otherwise\b|else\b|repeat\b|for\b|to\b|every\b|when\b)/;

src.addEventListener('input', (ev) => {
  clearProblems();
  const v = src.value, pos = src.selectionStart;
  const ls = lineStart(v, pos);
  const line = v.slice(ls, pos);
  // Typing `end` or `otherwise` on its own line lines it up with its block.
  const m = /^( +)(end|otherwise|else)$/.exec(line);
  if (m && (ev as InputEvent).inputType === 'insertText' && (pos === v.length || v[pos] === '\n')) {
    const above = v.slice(0, Math.max(0, ls - 1)).split('\n').filter((l) => l.trim()).pop();
    if (above !== undefined) {
      const pi = /^ */.exec(above)![0].length;
      const target = OPENS.test(above) ? pi : pi - 2;
      if (target >= 0 && m[1].length > target) {
        replaceRange(ls, ls + m[1].length - target, '', pos - (m[1].length - target));
        return;
      }
    }
  }
  refresh();
  lint();
});
['keyup', 'click', 'focus'].forEach((e) => src.addEventListener(e, moveCursor));
document.addEventListener('selectionchange', () => { if (document.activeElement === src) moveCursor(); });

src.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key === '/') { e.preventDefault(); toggleComment(); return; }
  const v = src.value, a = src.selectionStart, b = src.selectionEnd;
  if (e.key === 'Tab') {
    e.preventDefault();
    const ls = lineStart(v, a);
    if (e.shiftKey) {
      if (v.startsWith('  ', ls)) replaceRange(ls, ls + 2, '', Math.max(ls, a - 2));
    } else if (a === b) {
      replaceRange(a, b, '  ', a + 2);
    } else {
      src.setRangeText(v.slice(ls, b).replace(/^/gm, '  '), ls, b, 'select');
      refresh();
    }
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const line = v.slice(lineStart(v, a), a);
    let indent = /^\s*/.exec(line)![0];
    if (OPENS.test(line)) indent += '  ';
    replaceRange(a, b, '\n' + indent, a + 1 + indent.length);
  }
});

function toggleComment() {
  const v = src.value, a = src.selectionStart, b = src.selectionEnd;
  const ls = lineStart(v, a);
  const le = v.indexOf('\n', b) === -1 ? v.length : v.indexOf('\n', b);
  const lines = v.slice(ls, le).split('\n');
  const all = lines.every((l) => !l.trim() || /^\s*--/.test(l));
  const out = lines.map((l) => (all ? l.replace(/^(\s*)-- ?/, '$1') : l.trim() ? l.replace(/^(\s*)/, '$1-- ') : l)).join('\n');
  src.setRangeText(out, ls, le, 'select');
  refresh();
}

// ---- problems ----
function setStatus(state: 'ready' | 'running' | 'error' | 'ended', text: string) {
  statusbar.dataset.state = state;
  status.innerHTML = '<span class="dot"></span>';
  status.append(text);
}

function showPanel(which: 'output' | 'problems') {
  output.hidden = which !== 'output';
  problems.hidden = which !== 'problems';
  $('tab-output').classList.toggle('active', which === 'output');
  $('tab-problems').classList.toggle('active', which === 'problems');
  $('tab-output').setAttribute('aria-selected', String(which === 'output'));
  $('tab-problems').setAttribute('aria-selected', String(which === 'problems'));
}
$('tab-output').addEventListener('click', () => showPanel('output'));
$('tab-problems').addEventListener('click', () => showPanel('problems'));
$('clear-output').addEventListener('click', () => { output.textContent = ''; emptyOutput(); });

function emptyOutput() {
  if (!output.childElementCount) output.innerHTML = '<div class="empty">Nothing yet. Lines from <code>say</code> show up here.</div>';
}

function clearProblems() {
  problems.innerHTML = '<div class="empty">No problems.</div>';
  pcount.hidden = true;
  errcount.textContent = '0 problems';
  errline.style.display = 'none';
  squiggle.style.display = 'none';
  if (statusbar.dataset.state === 'error') setStatus('ready', 'Ready');
}

/** Fills an element with text, turning `quoted` words into <code>. */
function richText(el: HTMLElement, text: string) {
  text.split('`').forEach((part, i) => {
    if (i % 2) {
      const c = document.createElement('code');
      c.textContent = part;
      el.append(c);
    } else if (part) el.append(part);
  });
}

const ERROR_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" stroke="currentColor" stroke-width="1.2"/></svg>';

function showProblem(err: OnceError, focus: boolean) {
  const sp = err.span;
  problems.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'problem';
  row.innerHTML = ERROR_ICON;
  const msg = document.createElement('div');
  msg.className = 'msg';
  richText(msg, err.message);
  if (sp) {
    const where = document.createElement('span');
    where.className = 'where';
    where.textContent = `${file} [Ln ${sp.line}, Col ${sp.col}]`;
    msg.append(where);
  }
  row.append(msg);
  if (sp) {
    const text = src.value.split('\n')[sp.line - 1] ?? '';
    const pre = document.createElement('div');
    pre.className = 'src';
    const u = document.createElement('u');
    u.textContent = text.slice(sp.col - 1, sp.col - 1 + sp.len) || ' ';
    pre.append(text.slice(0, sp.col - 1).trimStart(), u, text.slice(sp.col - 1 + sp.len));
    row.append(pre);
    row.addEventListener('click', () => jumpTo(sp.line, sp.col));
    errline.style.display = 'block';
    errline.style.top = `${PAD_TOP + (sp.line - 1) * LINE}px`;
    squiggle.style.display = 'block';
    squiggle.style.top = `${PAD_TOP + sp.line * LINE - 4}px`;
    squiggle.style.left = `${PAD_LEFT + (sp.col - 1) * charWidth}px`;
    squiggle.style.width = `${Math.max(1, sp.len) * charWidth}px`;
  }
  if (err.hint) {
    const hint = document.createElement('div');
    hint.className = 'hint';
    richText(hint, err.hint);
    row.append(hint);
  }
  problems.append(row);
  pcount.hidden = false;
  errcount.textContent = '1 problem';
  if (focus) showPanel('problems');
}

function jumpTo(line: number, col: number) {
  const lines = src.value.split('\n');
  let pos = 0;
  for (let i = 0; i < line - 1; i++) pos += lines[i].length + 1;
  src.focus();
  src.selectionStart = src.selectionEnd = pos + col - 1;
  $<HTMLDivElement>('editor').scrollTop = Math.max(0, (line - 5) * LINE);
  moveCursor();
}

// Syntax mistakes show up as you type, a moment after you stop.
let lintTimer = 0;
function lint() {
  clearTimeout(lintTimer);
  lintTimer = window.setTimeout(() => {
    try { parse(src.value); } catch (e) { if (e instanceof OnceError) showProblem(e, false); }
  }, 500);
}

// ---- running ----
const stage = new Stage($<HTMLCanvasElement>('stage'), {
  keyTarget: stagebox,
  onSay: (t) => {
    output.querySelector('.empty')?.remove();
    const d = document.createElement('div');
    d.className = 'line';
    d.textContent = t;
    output.appendChild(d);
    while (output.childNodes.length > 500) output.removeChild(output.firstChild!);
    output.scrollTop = output.scrollHeight;
  },
  onError: (e) => { showProblem(e, true); setRunning(false); setStatus('error', 'Stopped with an error'); },
  onEnd: () => { setRunning(false); setStatus('ended', 'Finished'); },
});

function setRunning(on: boolean) {
  runBtn.lastChild!.textContent = on ? 'Restart' : 'Run';
  stopBtn.disabled = !on;
}

function run() {
  clearTimeout(lintTimer);
  clearProblems();
  output.textContent = '';
  emptyOutput();
  showPanel('output');
  try {
    stage.run(parse(src.value));
    setRunning(true);
    setStatus('running', 'Running');
    stagebox.focus({ preventScroll: true });
  } catch (e) {
    if (!(e instanceof OnceError)) throw e;
    stage.stop();
    showProblem(e, true);
    setRunning(false);
    setStatus('error', 'Could not run');
  }
}

runBtn.addEventListener('click', run);
stopBtn.addEventListener('click', () => { stage.stop(); setRunning(false); setStatus('ready', 'Stopped'); });
stagebox.addEventListener('pointerdown', () => stagebox.focus({ preventScroll: true }));

// ---- examples, sharing, export ----
const own = document.createElement('option');
own.value = '';
own.textContent = 'Your code';
own.disabled = true;
stories.append(own);
for (const s of STORIES) {
  const o = document.createElement('option');
  o.value = s.id;
  o.textContent = `Example: ${s.title}`;
  stories.append(o);
}
stories.addEventListener('change', () => {
  const s = STORIES.find((x) => x.id === stories.value)!;
  load(s.code, s.id + '.once');
  history.replaceState(null, '', location.pathname + '#story=' + s.id);
  run();
});

function load(code: string, name: string) {
  src.value = code;
  file = name;
  filename.textContent = name;
  clearProblems();
  refresh();
}

function b64(bytes: Uint8Array) {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pack(code: string): Promise<string> {
  const data = new TextEncoder().encode(code);
  if (typeof CompressionStream === 'undefined') return 'u' + b64(data);
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return 'z' + b64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

async function unpack(s: string): Promise<string> {
  const bytes = unb64(s.slice(1));
  if (s[0] === 'u') return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return await new Response(stream).text();
}

function flash(btn: HTMLButtonElement, text: string) {
  const old = btn.dataset.label ?? btn.textContent!;
  btn.dataset.label = old;
  btn.textContent = text;
  setTimeout(() => (btn.textContent = old), 1600);
}

$<HTMLButtonElement>('share').addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  const url = location.origin + location.pathname + '#code=' + (await pack(src.value));
  history.replaceState(null, '', url);
  try {
    await navigator.clipboard.writeText(url);
    flash(btn, 'Link copied');
  } catch {
    flash(btn, 'Link in address bar');
  }
});

$<HTMLButtonElement>('export').addEventListener('click', async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  try {
    const runtime = await (await fetch('once-web.js')).text();
    const firstComment = /^\s*--\s*(.+)$/m.exec(src.value);
    const name = firstComment ? firstComment[1].trim() : file.replace(/\.once$/, '');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([exportPage(src.value, runtime, name)], { type: 'text/html' }));
    a.download = file.replace(/\.once$/, '') + '.html';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    flash(btn, 'Downloaded');
  } catch {
    flash(btn, 'Export failed');
  }
});

async function start() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const code = hash.get('code');
  const story = hash.get('story');
  const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shared';
  if (code) {
    try { load(await unpack(code), slug(hash.get('title') ?? 'shared') + '.once'); stories.value = ''; }
    catch { load(bouncing, 'bouncing-balls.once'); }
  } else if (story && STORIES.some((s) => s.id === story)) {
    load(STORIES.find((x) => x.id === story)!.code, story + '.once');
    stories.value = story;
  } else {
    const draft = store.get('once:draft');
    if (draft && draft.trim()) { load(draft, 'main.once'); stories.value = ''; }
    else load(bouncing, 'bouncing-balls.once');
  }
  emptyOutput();
  setRunning(false);
  run();
}

start();
