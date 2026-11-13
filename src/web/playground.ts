// The playground page: examples, share links and export, around the shared workbench.
import blank from '../../examples/blank.once';
import dino from '../../examples/dino-dash.once';
import bouncing from '../../examples/bouncing-balls.once';
import hello from '../../examples/hello.once';
import { exportPage } from './exportpage';
import { emptyOutput, file, load, run, src, store } from './workbench';

const STORIES: { id: string; title: string; code: string }[] = [
  { id: 'bouncing-balls', title: 'Bouncing balls', code: bouncing },
  { id: 'dino-dash', title: 'Dino Dash', code: dino },
  { id: 'hello', title: 'Hello, world', code: hello },
  { id: 'blank', title: 'Blank', code: blank },
];
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stories = $<HTMLSelectElement>('stories');

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
  run();
}

start();
