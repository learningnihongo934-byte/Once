// The picture's physics: things move by their speed, fall with gravity,
// bounce off the edges and push each other apart when they are solid.
import { Thing } from './values';

export const WIDTH = 480;
export const HEIGHT = 360;

interface Bounds { cx: number; cy: number; hx: number; hy: number; circle: boolean }
interface Hit { nx: number; ny: number; pen: number }

export class World {
  things: Thing[] = [];
  gravity = 0;
  bg = '#ffffff';
  measure: (text: string, size: number) => number = (text, size) => text.length * size * 0.5;

  add(t: Thing) { this.things.push(t); }

  bounds(t: Thing): Bounds {
    if (t.kind === 'text') {
      const w = this.measure(t.text, t.size);
      return { cx: t.x + w / 2, cy: t.y + t.size / 2, hx: w / 2, hy: t.size / 2, circle: false };
    }
    return { cx: t.x, cy: t.y, hx: t.w / 2, hy: t.h / 2, circle: t.kind === 'circle' };
  }

  step() {
    const g = this.gravity;
    for (const t of this.things) {
      if (t.removed || t.fixed) continue;
      t.dy += g;
      t.x += t.dx;
      t.y += t.dy;
      if (t.walls) this.edges(t, g);
    }
    let solids = this.things.filter((t) => t.solid && !t.removed && !t.hidden);
    if (solids.length > 400) solids = solids.slice(0, 400);
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) this.resolve(solids[i], solids[j]);
    }
    if (this.things.some((t) => t.removed)) this.things = this.things.filter((t) => !t.removed);
  }

  edges(t: Thing, g: number) {
    const b = this.bounds(t);
    const e = t.bounce;
    if (b.cx - b.hx < 0) { t.x -= b.cx - b.hx; if (t.dx < 0) t.dx = -t.dx * e; }
    else if (b.cx + b.hx > WIDTH) { t.x -= b.cx + b.hx - WIDTH; if (t.dx > 0) t.dx = -t.dx * e; }
    if (b.cy - b.hy < 0) { t.y -= b.cy - b.hy; if (t.dy < 0) t.dy = -t.dy * e; }
    else if (b.cy + b.hy > HEIGHT) {
      t.y -= b.cy + b.hy - HEIGHT;
      if (t.dy > 0) t.dy = Math.abs(t.dy) < g * 2 ? 0 : -t.dy * e;
    }
  }

  overlap(a: Thing, b: Thing): Hit | null {
    const A = this.bounds(a), B = this.bounds(b);
    const dx = B.cx - A.cx, dy = B.cy - A.cy;
    if (A.circle && B.circle) {
      const d = Math.hypot(dx, dy), r = A.hx + B.hx;
      if (d >= r) return null;
      return d === 0 ? { nx: 1, ny: 0, pen: r } : { nx: dx / d, ny: dy / d, pen: r - d };
    }
    if (!A.circle && !B.circle) {
      const ox = A.hx + B.hx - Math.abs(dx), oy = A.hy + B.hy - Math.abs(dy);
      if (ox <= 0 || oy <= 0) return null;
      return ox < oy ? { nx: Math.sign(dx) || 1, ny: 0, pen: ox } : { nx: 0, ny: Math.sign(dy) || 1, pen: oy };
    }
    const C = A.circle ? A : B, R = A.circle ? B : A;
    const px = Math.max(R.cx - R.hx, Math.min(C.cx, R.cx + R.hx));
    const py = Math.max(R.cy - R.hy, Math.min(C.cy, R.cy + R.hy));
    let vx = C.cx - px, vy = C.cy - py;
    let nx: number, ny: number, pen: number;
    const d2 = vx * vx + vy * vy;
    if (d2 > 0) {
      const d = Math.sqrt(d2);
      if (d >= C.hx) return null;
      nx = vx / d; ny = vy / d; pen = C.hx - d;
    } else {
      vx = C.cx - R.cx; vy = C.cy - R.cy;
      const ox = R.hx - Math.abs(vx) + C.hx, oy = R.hy - Math.abs(vy) + C.hx;
      if (ox < oy) { nx = Math.sign(vx) || 1; ny = 0; pen = ox; } else { nx = 0; ny = Math.sign(vy) || 1; pen = oy; }
    }
    // (nx, ny) points from the box to the circle; turn it to point from a to b.
    return A.circle ? { nx: -nx, ny: -ny, pen } : { nx, ny, pen };
  }

  touches(a: Thing, b: Thing): boolean {
    if (a === b || a.removed || b.removed || a.hidden || b.hidden) return false;
    return this.overlap(a, b) !== null;
  }

  touchesEdge(t: Thing): boolean {
    if (t.removed || t.hidden) return false;
    const b = this.bounds(t);
    return b.cx - b.hx <= 0.5 || b.cx + b.hx >= WIDTH - 0.5 || b.cy - b.hy <= 0.5 || b.cy + b.hy >= HEIGHT - 0.5;
  }

  resolve(a: Thing, b: Thing) {
    const hit = this.overlap(a, b);
    if (!hit) return;
    const ia = a.fixed ? 0 : 1 / Math.max(1, a.w * a.h);
    const ib = b.fixed ? 0 : 1 / Math.max(1, b.w * b.h);
    const sum = ia + ib;
    if (sum === 0) return;
    const { nx, ny, pen } = hit;
    a.x -= nx * pen * (ia / sum); a.y -= ny * pen * (ia / sum);
    b.x += nx * pen * (ib / sum); b.y += ny * pen * (ib / sum);
    const rv = (b.dx - a.dx) * nx + (b.dy - a.dy) * ny;
    if (rv >= 0) return;
    const e = Math.max(a.bounce, b.bounce);
    const j = (-(1 + e) * rv) / sum;
    a.dx -= j * ia * nx; a.dy -= j * ia * ny;
    b.dx += j * ib * nx; b.dy += j * ib * ny;
  }
}
