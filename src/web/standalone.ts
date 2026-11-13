// The runtime bundled into exported pages: window.Once.boot({ code, canvas, said }).
import { OnceError, formatError } from '../errors';
import { parse } from '../parser';
import { Stage } from './stage';

interface BootOptions {
  code: string;
  canvas: HTMLCanvasElement;
  said?: HTMLElement;
  onError?: (e: OnceError) => void;
}

/** Runs `code` on `canvas`. Calling it again on the same canvas restarts with the new code. */
function boot(opts: BootOptions) {
  const said = opts.said;
  if (said) said.textContent = '';
  const line = (text: string, cls?: string) => {
    if (!said) return;
    const p = document.createElement('div');
    if (cls) p.className = cls;
    p.textContent = text;
    said.appendChild(p);
    while (said.childNodes.length > 500) said.removeChild(said.firstChild!);
    said.scrollTop = said.scrollHeight;
  };
  const report = (e: OnceError) => {
    line(formatError(e, opts.code), 'err');
    opts.onError?.(e);
  };
  const host = opts.canvas as HTMLCanvasElement & { onceStage?: Stage };
  let stage = host.onceStage;
  if (!stage) {
    stage = new Stage(opts.canvas, { onSay: () => {}, onError: () => {} });
    host.onceStage = stage;
  }
  stage.opts.onSay = (t) => line(t);
  stage.opts.onError = report;
  try {
    stage.run(parse(opts.code));
  } catch (e) {
    stage.stop();
    if (e instanceof OnceError) report(e);
    else throw e;
  }
  return stage;
}

(window as unknown as { Once: unknown }).Once = { boot };
