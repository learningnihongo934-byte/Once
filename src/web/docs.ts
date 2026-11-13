// Highlights the docs' examples, adds a Run link to each, and handles the theme switch.
import { highlight } from '../highlight';

function b64(bytes: Uint8Array) {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pack(code: string): Promise<string> {
  const data = new TextEncoder().encode(code);
  if (typeof CompressionStream === 'undefined') return 'u' + b64(data);
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return 'z' + b64(new Uint8Array(await new Response(stream).arrayBuffer()));
}

document.querySelectorAll<HTMLPreElement>('pre.once').forEach(async (pre) => {
  const code = pre.textContent ?? '';
  pre.innerHTML = highlight(code);
  const chapter = (pre.closest('section')?.querySelector('h2')?.textContent ?? 'example').replace(/^[\d.\s]+/, '').replace(/^Reference: /, '');
  const a = document.createElement('a');
  a.className = 'try';
  a.textContent = 'Run';
  a.href = './#code=' + (await pack(code)) + '&title=' + encodeURIComponent(chapter);
  pre.parentElement!.appendChild(a);
});

document.getElementById('theme')?.addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('once:theme', root.dataset.theme); } catch { /* private mode */ }
});
