// ./build.sh test: runs every story in tests/ and checks what it says or which mistake it reports.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { OnceError, formatError } from './errors';
import { Runner } from './interp';
import { parse } from './parser';

const root = join(__dirname, '..');
let passed = 0, failed = 0;

function runStory(src: string, graphics = false): { out: string[]; err: OnceError | null } {
  const out: string[] = [];
  try {
    const r = new Runner(parse(src), {
      graphics, say: (t) => out.push(t), drawPersistent: () => {}, clear: () => {}, playNote: () => {},
      playSound: () => {}, holding: () => false, mouse: () => ({ x: 0, y: 0, down: false }),
    });
    r.start();
    for (let i = 0; i < 3000 && !r.ended && !r.idle(); i++) r.tick(1 / 60);
    return { out, err: r.error };
  } catch (e) {
    if (e instanceof OnceError) return { out, err: e };
    throw e;
  }
}

function report(name: string, ok: boolean, detail: string) {
  if (ok) { passed++; return; }
  failed++;
  console.log(`FAIL ${name}\n${detail}\n`);
}

for (const f of readdirSync(join(root, 'tests/cases')).filter((f) => f.endsWith('.once')).sort()) {
  const src = readFileSync(join(root, 'tests/cases', f), 'utf8');
  const want = readFileSync(join(root, 'tests/cases', f.replace(/\.once$/, '.out')), 'utf8').trimEnd();
  const { out, err } = runStory(src);
  const got = out.join('\n');
  report(f, !err && got === want, err ? formatError(err, src, f) : `--- wanted\n${want}\n--- got\n${got}`);
}

for (const f of readdirSync(join(root, 'tests/errors')).filter((f) => f.endsWith('.once')).sort()) {
  const src = readFileSync(join(root, 'tests/errors', f), 'utf8');
  const want = /^-- error: (.+)$/m.exec(src)![1].trim();
  const hint = /^-- hint: (.+)$/m.exec(src)?.[1].trim();
  const line = /^-- line: (\d+)$/m.exec(src)?.[1];
  const { err } = runStory(src);
  const ok = !!err && err.message.includes(want) && (!hint || (err.hint ?? '').includes(hint)) && (!line || err.span?.line === Number(line));
  report(f, ok, err ? `wanted "${want}"${hint ? ` / hint "${hint}"` : ''}${line ? ` on line ${line}` : ''}\n${formatError(err, src, f)}` : `wanted an error "${want}", got none`);
}

// Every story in the examples and every listing in the Book must at least read correctly and run without error.
const listings: [string, string][] = [];
for (const f of readdirSync(join(root, 'examples'))) listings.push([`examples/${f}`, readFileSync(join(root, 'examples', f), 'utf8')]);
const book = readFileSync(join(root, 'web/docs.html'), 'utf8');
let n = 0;
for (const m of book.matchAll(/<pre class="once">([\s\S]*?)<\/pre>/g)) {
  const code = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  listings.push([`book listing ${++n}`, code]);
}
for (const [name, code] of listings) {
  const { err } = runStory(code, true);
  const expected = name.startsWith('book') && code.includes('say scroe');
  report(name, expected ? !!err : !err, err ? formatError(err, code, name) : 'expected the deliberate mistake to be reported');
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
