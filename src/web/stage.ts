// Draws a running story on a canvas, and feeds it keys, the mouse and sound.
import { Program } from '../ast';
import { OnceError } from '../errors';
import { DrawCmd, Host, Runner } from '../interp';
import { normKey, Thing } from '../values';
import { HEIGHT, WIDTH } from '../world';

export const TEXT_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const INK_EDGE = 'rgba(0, 0, 0, 0.35)';

export interface StageOptions {
  onSay: (text: string) => void;
  onError: (err: OnceError) => void;
  onEnd?: () => void;
  keyTarget?: HTMLElement | Window;
}

type Shape = Pick<DrawCmd, 'x' | 'y' | 'w' | 'h' | 'color' | 'outline' | 'angle' | 'text' | 'size'> &
  { kind: string; x2?: number; y2?: number; lineWidth?: number };

export class Stage {
  ctx: CanvasRenderingContext2D;
  pen: HTMLCanvasElement;
  penCtx: CanvasRenderingContext2D;
  runner: Runner | null = null;
  keys = new Set<string>();
  /** Keys pressed since the last tick, so a very quick tap still counts as holding for one frame. */
  tapped = new Set<string>();
  mouse = { x: 0, y: 0, down: false };
  raf = 0;
  last = 0;
  acc = 0;
  ac: AudioContext | null = null;
  master: GainNode | null = null;
  voices = 0;
  colorProbe: CanvasRenderingContext2D;
  ended = false;

  constructor(public canvas: HTMLCanvasElement, public opts: StageOptions) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.pen = document.createElement('canvas');
    this.pen.width = WIDTH * dpr;
    this.pen.height = HEIGHT * dpr;
    this.penCtx = this.pen.getContext('2d')!;
    this.penCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.colorProbe = document.createElement('canvas').getContext('2d')!;
    this.listen();
    this.paintIdle();
  }

  listen() {
    const target = this.opts.keyTarget ?? window;
    const gameKeys = new Set(['space', 'left', 'right', 'up', 'down']);
    target.addEventListener('keydown', (ev) => {
      const e = ev as KeyboardEvent;
      if (e.metaKey || e.ctrlKey) return;
      const k = normKey(e.key);
      if (this.runner && !this.ended && gameKeys.has(k)) e.preventDefault();
      if (!e.repeat && this.runner) this.runner.keyQueue.push(k);
      this.keys.add(k);
      this.tapped.add(k);
    });
    target.addEventListener('keyup', (ev) => { this.keys.delete(normKey((ev as KeyboardEvent).key)); });
    window.addEventListener('blur', () => this.keys.clear());
    const pos = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = Math.round(((e.clientX - r.left) / r.width) * WIDTH);
      this.mouse.y = Math.round(((e.clientY - r.top) / r.height) * HEIGHT);
    };
    this.canvas.addEventListener('pointermove', pos);
    this.canvas.addEventListener('pointerdown', (e) => {
      pos(e);
      this.mouse.down = true;
      if (this.runner) { this.runner.clicks++; this.audio(); }
    });
    window.addEventListener('pointerup', () => { this.mouse.down = false; });
  }

  host(): Host {
    return {
      graphics: true,
      say: (t) => this.opts.onSay(t),
      drawPersistent: (cmd) => this.drawShape(this.penCtx, cmd),
      clear: () => this.penCtx.clearRect(0, 0, WIDTH, HEIGHT),
      playNote: (f, s, w, v) => this.note(f, s, w as OscillatorType, v),
      playSound: (n, v) => this.sound(n, v),
      holding: (k) => (k === 'any' ? this.keys.size + this.tapped.size > 0 : this.keys.has(k) || this.tapped.has(k)),
      mouse: () => this.mouse,
      ask: (q) => {
        this.keys.clear();
        try { return window.prompt(q || 'Your answer:'); } catch { return null; }
      },
      save: (k, json) => { try { localStorage.setItem('once:save:' + k, json); } catch { /* storage blocked */ } },
      load: (k) => { try { return localStorage.getItem('once:save:' + k); } catch { return null; } },
      isColor: (c) => {
        const p = this.colorProbe;
        p.fillStyle = '#010203';
        p.fillStyle = c;
        const a = p.fillStyle;
        p.fillStyle = '#030201';
        p.fillStyle = c;
        return a !== '#010203' || p.fillStyle !== '#030201';
      },
    };
  }

  run(program: Program) {
    this.stop();
    this.ended = false;
    this.penCtx.clearRect(0, 0, WIDTH, HEIGHT);
    Thing.next = 1;
    const r = new Runner(program, this.host());
    r.world.measure = (text, size) => {
      this.ctx.font = `${size}px ${TEXT_FONT}`;
      return this.ctx.measureText(text).width;
    };
    this.runner = r;
    this.audio();
    r.start();
    this.last = performance.now();
    this.acc = 1 / 60;
    const loop = (now: number) => {
      this.acc += Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      let ticks = 0;
      while (this.acc >= 1 / 60 && ticks < 4 && !r.ended) {
        r.tick(1 / 60);
        this.tapped.clear();
        this.acc -= 1 / 60;
        ticks++;
      }
      this.render();
      // A program with nothing left to run, listen for or move has simply finished.
      if (!r.ended && r.tasks.length === 0 && r.handlers.length === 0 && r.world.things.length === 0) {
        r.ended = true;
        this.ended = true;
        this.opts.onEnd?.();
        return;
      }
      if (r.ended) {
        this.ended = true;
        if (r.error) this.opts.onError(r.error);
        else { this.paintEnd(); this.opts.onEnd?.(); }
        return;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    if (this.runner && !this.runner.ended) this.runner.ended = true;
    this.ended = true;
  }

  // ---- drawing ----
  render() {
    const r = this.runner;
    if (!r) return;
    const c = this.ctx;
    c.fillStyle = r.world.bg;
    c.fillRect(0, 0, WIDTH, HEIGHT);
    c.drawImage(this.pen, 0, 0, WIDTH, HEIGHT);
    for (const t of r.world.things) if (!t.hidden) this.drawShape(c, t, true);
    for (const cmd of r.frameDraws) this.drawShape(c, cmd);
  }

  drawShape(c: CanvasRenderingContext2D, s: Shape, inked = false) {
    c.save();
    c.fillStyle = s.color;
    c.strokeStyle = s.color;
    if (s.kind === 'circle') {
      c.beginPath();
      c.arc(s.x, s.y, Math.max(0, s.w / 2), 0, Math.PI * 2);
      this.paint(c, s, inked);
    } else if (s.kind === 'box') {
      c.translate(s.x, s.y);
      if (s.angle) c.rotate((s.angle * Math.PI) / 180);
      c.beginPath();
      c.rect(-s.w / 2, -s.h / 2, s.w, s.h);
      this.paint(c, s, inked);
    } else if (s.kind === 'line') {
      c.lineWidth = s.lineWidth ?? 2;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(s.x, s.y);
      c.lineTo(s.x2 ?? s.x, s.y2 ?? s.y);
      c.stroke();
    } else if (s.kind === 'text') {
      c.font = `${s.size}px ${TEXT_FONT}`;
      c.textBaseline = 'top';
      c.fillText(s.text, s.x, s.y);
    }
    c.restore();
  }

  paint(c: CanvasRenderingContext2D, s: Shape, inked: boolean) {
    if (s.outline > 0) {
      c.lineWidth = s.outline;
      c.stroke();
      return;
    }
    c.fill();
    if (inked) {
      c.lineWidth = 1;
      c.strokeStyle = INK_EDGE;
      c.stroke();
    }
  }

  paintIdle() {
    const c = this.ctx;
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, WIDTH, HEIGHT);
    c.fillStyle = '#9d9d9d';
    c.font = `15px ${TEXT_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('Press Run to see your program here.', WIDTH / 2, HEIGHT / 2);
    c.textAlign = 'start';
  }

  paintEnd() {
    const c = this.ctx;
    c.save();
    c.fillStyle = 'rgba(0, 0, 0, 0.55)';
    c.fillRect(0, HEIGHT / 2 - 24, WIDTH, 48);
    c.fillStyle = '#ffffff';
    c.font = `600 18px ${TEXT_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('The end', WIDTH / 2, HEIGHT / 2);
    c.restore();
  }

  // ---- sound ----
  audio(): AudioContext | null {
    if (this.ac) {
      if (this.ac.state === 'suspended') this.ac.resume().catch(() => {});
      return this.ac;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ac.destination);
    } catch {
      this.ac = null;
    }
    return this.ac;
  }

  voice(seconds: number): boolean {
    if (this.voices >= 24) return false;
    this.voices++;
    setTimeout(() => this.voices--, seconds * 1000 + 80);
    return true;
  }

  tone(freq: number, seconds: number, wave: OscillatorType, vol: number, at = 0, endFreq?: number) {
    const ac = this.audio();
    if (!ac || !this.master || !this.voice(seconds)) return;
    const t = ac.currentTime + at;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + seconds);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * 0.5), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + seconds + 0.05);
  }

  noise(seconds: number, vol: number, filter: BiquadFilterType, freq: number) {
    const ac = this.audio();
    if (!ac || !this.master || !this.voice(seconds)) return;
    const len = Math.max(1, Math.floor(ac.sampleRate * seconds));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  note(freq: number, seconds: number, wave: OscillatorType, vol: number) {
    this.tone(freq, seconds, wave, vol);
  }

  sound(name: string, vol: number) {
    switch (name) {
      case 'beep': this.tone(880, 0.12, 'square', vol * 0.6); break;
      case 'boop': this.tone(220, 0.18, 'sine', vol); break;
      case 'coin': this.tone(988, 0.08, 'square', vol * 0.5); this.tone(1319, 0.28, 'square', vol * 0.5, 0.08); break;
      case 'jump': this.tone(280, 0.22, 'sine', vol, 0, 720); break;
      case 'pop': this.tone(700, 0.09, 'sine', vol, 0, 160); break;
      case 'hit': this.noise(0.09, vol, 'bandpass', 1400); break;
      case 'boom': this.noise(0.7, vol * 1.4, 'lowpass', 380); break;
      case 'click': this.noise(0.025, vol, 'highpass', 2000); break;
    }
  }
}
