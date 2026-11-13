// The Learn page: lessons on the left, the shared workbench on the right, tasks checked after each run.
import { highlight } from '../highlight';
import { CheckCtx, LESSONS, Lesson } from '../lessons';
import { config, hooks, lastError, load, run, said, src, stage, store } from './workbench';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const list = $<HTMLOListElement>('lesson-list');
const select = $<HTMLSelectElement>('lesson-select');
const status = $<HTMLDivElement>('task-status');
const DONE_KEY = 'once:learn:done';

let at = 0;
let checkTimer = 0;

const done = new Set<string>((() => { try { return JSON.parse(store.get(DONE_KEY) ?? '[]'); } catch { return []; } })());
const codeKey = (l: Lesson) => 'once:learn:code:' + l.id;

function renderList() {
  list.innerHTML = '';
  select.innerHTML = '';
  let part = '';
  LESSONS.forEach((l, i) => {
    if (l.part !== part) {
      part = l.part;
      const h = document.createElement('li');
      h.className = 'part';
      h.textContent = part;
      list.append(h);
      const g = document.createElement('optgroup');
      g.label = part;
      select.append(g);
    }
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#' + l.id;
    a.className = 'lesson-link' + (i === at ? ' active' : '') + (done.has(l.id) ? ' done' : '');
    a.innerHTML = `<span class="check" aria-hidden="true"></span><span class="n">${i + 1}</span>`;
    a.append(l.title);
    if (done.has(l.id)) a.setAttribute('aria-label', `${l.title} (done)`);
    li.append(a);
    list.append(li);
    const o = document.createElement('option');
    o.value = l.id;
    o.textContent = `${i + 1}. ${l.title}${done.has(l.id) ? '  ✓' : ''}`;
    (select.lastElementChild as HTMLOptGroupElement).append(o);
  });
  select.value = LESSONS[at].id;
  $('progress-text').textContent = `${done.size} / ${LESSONS.length} done`;
  $('progress-bar').style.width = `${(done.size / LESSONS.length) * 100}%`;
}

function show(i: number, fromHash = false) {
  at = Math.max(0, Math.min(LESSONS.length - 1, i));
  const l = LESSONS[at];
  clearTimeout(checkTimer);
  stage.stop();
  $('crumb').textContent = `${l.part} · Lesson ${at + 1} of ${LESSONS.length}`;
  $('lesson-title').textContent = l.title;
  const body = $('lesson-body');
  body.innerHTML = l.body;
  body.querySelectorAll<HTMLPreElement>('pre.once').forEach((p) => { p.innerHTML = highlight(p.textContent ?? ''); });
  $('task-text').innerHTML = l.task;
  setStatus(done.has(l.id) ? 'done' : 'todo', done.has(l.id)
    ? 'You already finished this one. Feel free to keep playing with it.'
    : 'Write your code, then press <b>Run</b>. Your code is checked automatically.');
  config.draftKey = codeKey(l);
  load(store.get(codeKey(l)) ?? l.starter, `${l.id}.once`);
  stage.paintIdle();
  $<HTMLButtonElement>('prev').disabled = at === 0;
  const next = $<HTMLButtonElement>('next');
  next.disabled = at === LESSONS.length - 1;
  next.classList.toggle('primary', done.has(l.id));
  store.set('once:learn:at', l.id);
  if (!fromHash) history.replaceState(null, '', '#' + l.id);
  renderList();
  $('lesson').scrollTop = 0;
  window.scrollTo({ top: 0 });
}

function setStatus(state: 'todo' | 'checking' | 'done' | 'hint' | 'error', html: string) {
  status.dataset.state = state;
  status.innerHTML = html;
}

function check() {
  const l = LESSONS[at];
  const r = stage.runner;
  const ctx: CheckCtx = {
    code: src.value,
    bare: src.value.replace(/--.*$/gm, ''),
    out: [...said],
    error: lastError,
    things: r ? r.world.things : [],
    vars: r ? r.globals.vars : new Map(),
  };
  if (ctx.error && l.id !== 'shooter-6') {
    setStatus('error', 'There is a problem in your code. Look at the <b>Problems</b> panel, fix it, and run again.');
    return;
  }
  const hint = l.check(ctx);
  if (hint) {
    const esc = hint.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    setStatus('hint', `<b>Not quite yet.</b> ${esc}`);
    return;
  }
  done.add(l.id);
  store.set(DONE_KEY, JSON.stringify([...done]));
  const last = at === LESSONS.length - 1;
  setStatus('done', last
    ? '<b>You finished the course!</b> You know all of Once now. Open the <a href="./">playground</a> to keep building, and share your game with a link.'
    : `<b>Nice, that's it!</b> ${l.part !== LESSONS[at + 1].part ? `That's the end of "${l.part}". ` : ''}Move on when you're ready.`);
  const next = $<HTMLButtonElement>('next');
  next.classList.add('primary');
  renderList();
}

hooks.onRun = () => {
  clearTimeout(checkTimer);
  if (lastError) { check(); return; }
  setStatus('checking', 'Running and checking…');
  // Check once the program has run long enough (counted in frames, so a slow or background tab can't check too early).
  const frames = Math.round((LESSONS[at].wait ?? 0.7) * 60);
  const started = Date.now();
  const poll = () => {
    const r = stage.runner;
    if (!r || r.ended || r.frameNo >= frames || Date.now() - started > 15000) check();
    else checkTimer = window.setTimeout(poll, 100);
  };
  checkTimer = window.setTimeout(poll, 100);
};
hooks.onError = () => { clearTimeout(checkTimer); check(); };

$('check').addEventListener('click', () => run());
$('solution').addEventListener('click', () => {
  const l = LESSONS[at];
  load(l.solution, `${l.id}.once`);
  store.set(codeKey(l), l.solution);
  setStatus('todo', 'Here is one way to do it. Read it through, then press <b>Run</b>.');
});
$('reset').addEventListener('click', () => {
  const l = LESSONS[at];
  load(l.starter, `${l.id}.once`);
  store.set(codeKey(l), l.starter);
  setStatus('todo', 'Back to the start. Press <b>Run</b> when you are ready.');
});
$('prev').addEventListener('click', () => show(at - 1));
$('next').addEventListener('click', () => show(at + 1));
select.addEventListener('change', () => show(LESSONS.findIndex((l) => l.id === select.value)));
window.addEventListener('hashchange', () => {
  const i = LESSONS.findIndex((l) => '#' + l.id === location.hash);
  if (i >= 0 && i !== at) show(i, true);
});

const fromHash = LESSONS.findIndex((l) => '#' + l.id === location.hash);
const saved = LESSONS.findIndex((l) => l.id === store.get('once:learn:at'));
show(fromHash >= 0 ? fromHash : saved >= 0 ? saved : 0, fromHash >= 0);
