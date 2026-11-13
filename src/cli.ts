// The `once` command: run, check or export a story.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { OnceError, formatError } from './errors';
import { Runner } from './interp';
import { parse } from './parser';
import { exportPage } from './web/exportpage';

declare const ONCE_VERSION: string;

const USAGE = `Once ${ONCE_VERSION}: a little language for moving pictures.

  once run <story.once>                 run a story (say, numbers, lists, waits)
  once check <story.once>               look for mistakes without running
  once export <story.once> [-o page.html]   make a web page that plays the story
  once version

Drawing, sound and keys need a picture: use the playground at
https://once.rennko.tech, or export the story as a web page.`;

function read(file: string | undefined): string {
  if (!file) { console.error(USAGE); process.exit(2); }
  if (!existsSync(file)) { console.error(`I can't find the file ${file}.`); process.exit(2); }
  return readFileSync(file, 'utf8');
}

function fail(err: unknown, src: string, file: string): never {
  if (err instanceof OnceError) {
    console.error(formatError(err, src, basename(file)));
    process.exit(1);
  }
  throw err;
}

function run(file: string) {
  const src = read(file);
  let program;
  try { program = parse(src); } catch (e) { fail(e, src, file); }
  const runner = new Runner(program, {
    graphics: false,
    say: (t) => process.stdout.write(t + '\n'),
    drawPersistent: () => {},
    clear: () => {},
    playNote: () => {},
    playSound: () => {},
    holding: () => false,
    mouse: () => ({ x: 0, y: 0, down: false }),
  });
  runner.frameWait = 1 / 60;
  runner.start();
  let last = performance.now();
  const step = () => {
    const now = performance.now();
    runner.tick(Math.max(1e-6, (now - last) / 1000));
    last = now;
    if (runner.error) fail(runner.error, src, file);
    if (runner.ended || runner.idle()) process.exit(0);
    const wait = runner.nextWake();
    if (wait <= 0) setImmediate(step);
    else setTimeout(step, Math.min(1000, wait * 1000));
  };
  step();
}

function check(file: string) {
  const src = read(file);
  try { parse(src); } catch (e) { fail(e, src, file); }
  console.log(`${basename(file)} reads well. No mistakes found.`);
}

function exportCmd(file: string, out?: string) {
  const src = read(file);
  try { parse(src); } catch (e) { fail(e, src, file); }
  const runtime = readFileSync(join(__dirname, 'web', 'once-web.js'), 'utf8');
  const first = /^\s*--\s*(.+)$/m.exec(src);
  const title = first ? first[1].trim() : basename(file, '.once');
  const target = out ?? file.replace(/\.once$/, '') + '.html';
  writeFileSync(target, exportPage(src, runtime, title));
  console.log(`Wrote ${resolve(target)}`);
}

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'run': run(rest[0]); break;
  case 'check': check(rest[0]); break;
  case 'export': {
    const o = rest.indexOf('-o');
    exportCmd(rest[0], o >= 0 ? rest[o + 1] : undefined);
    break;
  }
  case 'version': case '--version': case '-v': console.log(ONCE_VERSION); break;
  case undefined: case 'help': case '--help': case '-h': console.log(USAGE); break;
  default:
    if (cmd.endsWith('.once')) run(cmd);
    else { console.error(`I don't know the command "${cmd}".\n\n${USAGE}`); process.exit(2); }
}
