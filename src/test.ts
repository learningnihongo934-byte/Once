// ./build.sh test: runs every story in tests/ and checks what it says or which mistake it reports.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { OnceError, formatError } from './errors';
import { Runner } from './interp';
import { Thing } from './values';
import { parse } from './parser';
import { completions, explain, signatureAt } from './explain';
import { LESSONS } from './lessons';

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

// Hover explanations: [source, line, col, text the hover must contain]
const hoverSrc = [
  '-- Doubles a number.',
  'to double x',
  '  give back x * 2',
  'end',
  'set score to 0',
  'set ball to new circle at 10, 20 size 30 moving 2, 0 bouncy',
  'every frame',
  '  draw text "s {score}" at 10, 10',
  '  if ball touches edge then change score by double(1)',
  '  say sqrt(ball\'s x)',
  'end',
].join('\n');
const hovers: [number, string, string][] = [
  [1, 'double', 'your instructions'], [8, 'double', 'Doubles a number.'], [2, 'x', 'input of `double`'], [4, 'score', 'first set on line 5'],
  [5, 'circle', 'shape'], [5, ' at', 'Where it goes'], [5, 'moving', 'moves this far'], [5, 'bouncy', 'bounces off the edges'],
  [6, 'every', 'every frame'], [7, 'draw', 'Draws a shape'], [7, 'text', 'Text.'], [7, 'score', 'score'], [8, 'touches', 'overlap'], [8, 'edge', 'border of the preview'],
  [9, 'sqrt', 'square root'], [9, "x)", 'Across'], [4, 'to', 'The value to keep'], [0, 'Doubles', ''], [7, ' s ', ''],
];
for (const [l, w, want] of hovers) {
  const lineText = hoverSrc.split('\n')[l];
  const c = lineText.indexOf(w) + (w.startsWith(' ') ? 1 : 0);
  const r = explain(hoverSrc, l, c);
  const ok = want === '' ? r === null : !!r && r.markdown.includes(want);
  report(`hover line ${l + 1} "${w.trim()}"`, ok, `wanted "${want}", got:\n${r?.markdown ?? 'nothing'}`);
}
const sig = signatureAt('say clamp(1, 2', 0, 14);
report('signature help', !!sig && sig.label === 'clamp(x, low, high)' && sig.active === 1, JSON.stringify(sig));
const comp = completions('set ball to 1\nsay ba', 1, 6).map((c) => c.label);
report('completions', comp.includes('ball') && comp.includes('sqrt'), comp.slice(0, 10).join(', '));

// Every lesson: its solution must pass its check, and its starter must not.
for (const l of LESSONS) {
  for (const which of ['solution', 'starter'] as const) {
    const code = l[which];
    const out: string[] = [];
    let err: OnceError | null = null;
    let runner: Runner | null = null;
    try {
      runner = new Runner(parse(code), {
        graphics: true, say: (t) => out.push(t), drawPersistent: () => {}, clear: () => {}, playNote: () => {},
        playSound: () => {}, holding: () => false, mouse: () => ({ x: 300, y: 100, down: false }),
      });
      runner.start();
      for (let i = 0; i < Math.round((l.wait ?? 0.7) * 60) && !runner.ended; i++) runner.tick(1 / 60);
      err = runner.error;
    } catch (e) { if (e instanceof OnceError) err = e; else throw e; }
    const hint = l.check({ code, bare: code.replace(/--.*$/gm, ''), out, error: err, things: runner ? runner.world.things : [], vars: runner ? runner.globals.vars : new Map() });
    if (which === 'solution') report(`lesson ${l.id} solution`, !err && hint === null, err ? formatError(err, code, l.id) : `check said: ${hint}\noutput: ${out.join(' | ')}`);
    else if (l.id !== 'shooter-6') report(`lesson ${l.id} starter is not already done`, hint !== null, 'the starter code already passes the check');
  }
}

// Play the finished shooter for 40 seconds: shoot at the nearest enemy every 10 frames.
{
  const code = LESSONS[LESSONS.length - 1].solution;
  const out: string[] = [];
  const mouse = { x: 0, y: 0, down: false };
  const r = new Runner(parse(code), {
    graphics: true, say: (t) => out.push(t), drawPersistent: () => {}, clear: () => {}, playNote: () => {},
    playSound: () => {}, holding: () => false, mouse: () => mouse,
  });
  r.start();
  let frames = 0;
  for (; frames < 2400 && !r.ended; frames++) {
    const enemies = (r.globals.vars.get("enemies") ?? []) as Thing[];
    if (frames % 10 === 0 && enemies.length) { mouse.x = enemies[0].x; mouse.y = enemies[0].y; r.clicks++; }
    r.tick(1 / 60);
  }
  const score = r.globals.vars.get('score');
  report('shooter plays for 40s', !r.error && typeof score === 'number' && score > 5,
    r.error ? formatError(r.error, code, 'shooter') : `score ${String(score)}, frames ${frames}, said: ${out.join(' | ')}`);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
