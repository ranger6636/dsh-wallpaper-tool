/**
 * Animated background effects painted on a 2D canvas that sits inside the
 * wallpaper layer. Every effect is a pure draw function over a shared clock so
 * they can be added or tuned without touching the layer.
 *
 * Cost control: one requestAnimationFrame loop for the whole plugin, device
 * pixel ratio capped at 1.5, particle counts scaled by both intensity and the
 * canvas area, and the loop stops whenever the effect is hidden, the window is
 * in the background, or `prefers-reduced-motion` asks for stillness.
 */
import type { EffectId } from './types.js';

export interface EffectParams {
  id: EffectId;
  intensity: number;
  speed: number;
  color: string;
  accent: string;
}

interface Star {
  x: number;
  y: number;
  z: number;
  size: number;
}

interface Mote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  hue: number;
}

interface Drop {
  x: number;
  y: number;
  len: number;
  v: number;
}

interface State {
  stars: Star[];
  motes: Mote[];
  drops: Drop[];
  seed: number;
}

function makeState(): State {
  return { stars: [], motes: [], drops: [], seed: Math.random() * 1000 };
}

function hexToRgb(colour: string): [number, number, number] {
  const hex = colour.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) {
    const body = hex.slice(1);
    const full = body.length === 3 ? body.split('').map((c) => c + c).join('') : body;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }
  const rgb = hex.match(/rgba?\(([^)]+)\)/i);
  if (rgb) {
    const parts = rgb[1].split(/[,\s/]+/).map((piece) => parseFloat(piece));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  }
  return [79, 140, 255];
}

function rgba(colour: string, alpha: number): string {
  const [r, g, b] = hexToRgb(colour);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return `rgb(${Math.round(r1 + (r2 - r1) * t)}, ${Math.round(g1 + (g2 - g1) * t)}, ${Math.round(b1 + (b2 - b1) * t)})`;
}

export class EffectRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private params: EffectParams = { id: 'aurora', intensity: 55, speed: 1, color: '#4f8cff', accent: '#a86bff' };
  private state: State = makeState();
  private frame = 0;
  private running = false;
  /** Explicit "a frame is queued" flag: a handle of 0 is a legal rAF return. */
  private scheduled = false;
  private last = 0;
  private clock = 0;
  private width = 0;
  private height = 0;
  private reducedMotion = false;
  private paused = false;
  private area = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
  }

  setParams(params: Partial<EffectParams>): void {
    const previous = this.params.id;
    this.params = { ...this.params, ...params };
    if (previous !== this.params.id) this.state = makeState();
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
    this.sync();
  }

  /** Background tabs and hidden windows stop the loop entirely. */
  setPaused(value: boolean): void {
    this.paused = value;
    this.sync();
  }

  get active(): boolean {
    return this.running;
  }

  /** Which effect is selected right now. */
  get effectId(): string {
    return this.params.id;
  }

  /**
   * Live state for the diagnostics panel.
   *
   * `width`/`height` are the canvas backing store: zero means the draw calls are
   * being skipped, which is what makes an effect look broken while the wallpaper
   * itself is fine.
   */
  status(): { running: boolean; paused: boolean; reducedMotion: boolean; width: number; height: number } {
    return {
      running: this.running,
      paused: this.paused,
      reducedMotion: this.reducedMotion,
      width: this.canvas.width,
      height: this.canvas.height,
    };
  }

  start(): void {
    this.running = true;
    this.sync();
  }

  stop(): void {
    this.running = false;
    this.sync();
  }

  resize(): void {
    const dpr = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.width = width;
    this.height = height;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.area = (width * height) / (1920 * 1080);
    if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.state.stars = [];
    this.state.motes = [];
    this.state.drops = [];
  }

  private shouldRun(): boolean {
    return this.running && !this.paused && this.params.id !== 'none' && !this.reducedMotion;
  }

  private sync(): void {
    const shouldRun = this.shouldRun();
    if (shouldRun && !this.scheduled) {
      this.last = performance.now();
      this.scheduled = true;
      this.frame = window.requestAnimationFrame(this.tick);
    } else if (!shouldRun && this.scheduled) {
      window.cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.scheduled = false;
      if (this.ctx) this.ctx.clearRect(0, 0, this.width, this.height);
    }
  }

  private tick = (now: number): void => {
    this.scheduled = false;
    this.frame = 0;
    const delta = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.clock += delta * this.params.speed;
    this.draw();
    if (this.shouldRun()) {
      this.scheduled = true;
      this.frame = window.requestAnimationFrame(this.tick);
    }
  };

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { width, height } = this;
    if (width === 0 || height === 0) return;
    const { id, intensity, color, accent } = this.params;
    const strength = Math.max(0, Math.min(1, intensity / 100));

    switch (id) {
      case 'aurora':
        this.drawAurora(ctx, width, height, strength, color, accent);
        break;
      case 'starfield':
        this.drawStarfield(ctx, width, height, strength, color);
        break;
      case 'particles':
        this.drawParticles(ctx, width, height, strength, color, accent);
        break;
      case 'waves':
        this.drawWaves(ctx, width, height, strength, color, accent);
        break;
      case 'rays':
        this.drawRays(ctx, width, height, strength, color, accent);
        break;
      case 'rain':
        this.drawRain(ctx, width, height, strength, color);
        break;
      default:
        ctx.clearRect(0, 0, width, height);
        break;
    }
  }

  private drawAurora(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number, color: string, accent: string): void {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const bands = 5;
    for (let i = 0; i < bands; i += 1) {
      const phase = this.clock * 0.35 + i * 1.7;
      const y = h * (0.18 + 0.16 * i) + Math.sin(phase) * h * 0.06;
      const gradient = ctx.createLinearGradient(0, y - h * 0.25, 0, y + h * 0.25);
      const tone = mix(color, accent, (i + 1) / (bands + 1));
      gradient.addColorStop(0, rgba(tone, 0));
      gradient.addColorStop(0.5, rgba(tone, 0.22 * strength));
      gradient.addColorStop(1, rgba(tone, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += Math.max(12, w / 48)) {
        const wave = Math.sin(x / (w / 6) + phase) * h * 0.05 + Math.sin(x / (w / 17) - phase * 1.3) * h * 0.03;
        ctx.lineTo(x, y + wave);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private seedStars(w: number, h: number, strength: number): void {
    const target = Math.round(90 + strength * 260 * this.area);
    while (this.state.stars.length < target) {
      this.state.stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        z: 0.2 + Math.random() * 0.8,
        size: 0.4 + Math.random() * 1.8,
      });
    }
    if (this.state.stars.length > target) this.state.stars.length = target;
  }

  private drawStarfield(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number, color: string): void {
    ctx.clearRect(0, 0, w, h);
    this.seedStars(w, h, strength);
    const cx = w / 2;
    const cy = h / 2;
    for (const star of this.state.stars) {
      star.z -= 0.0016 * (0.4 + strength);
      if (star.z <= 0.05) {
        star.x = Math.random() * w;
        star.y = Math.random() * h;
        star.z = 1;
      }
      const scale = 1 / star.z;
      const px = cx + (star.x - cx) * scale * 0.35;
      const py = cy + (star.y - cy) * scale * 0.35;
      if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue;
      const radius = star.size * scale * 0.5;
      ctx.beginPath();
      ctx.fillStyle = rgba(color, Math.min(0.9, (1.05 - star.z) * strength + 0.08));
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private seedMotes(w: number, h: number, strength: number): void {
    const target = Math.round(24 + strength * 90 * this.area);
    while (this.state.motes.length < target) {
      this.state.motes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 6 + Math.random() * 46,
        vx: (Math.random() - 0.5) * 12,
        vy: -4 - Math.random() * 14,
        hue: Math.random(),
      });
    }
    if (this.state.motes.length > target) this.state.motes.length = target;
  }

  private drawParticles(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number, color: string, accent: string): void {
    ctx.clearRect(0, 0, w, h);
    this.seedMotes(w, h, strength);
    ctx.globalCompositeOperation = 'lighter';
    for (const mote of this.state.motes) {
      mote.x += mote.vx * 0.016;
      mote.y += mote.vy * 0.016;
      if (mote.y + mote.r < 0) {
        mote.y = h + mote.r;
        mote.x = Math.random() * w;
      }
      if (mote.x < -mote.r) mote.x = w + mote.r;
      if (mote.x > w + mote.r) mote.x = -mote.r;
      const tone = mix(color, accent, mote.hue);
      const gradient = ctx.createRadialGradient(mote.x, mote.y, 0, mote.x, mote.y, mote.r);
      gradient.addColorStop(0, rgba(tone, 0.3 * strength));
      gradient.addColorStop(1, rgba(tone, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(mote.x, mote.y, mote.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawWaves(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number, color: string, accent: string): void {
    ctx.clearRect(0, 0, w, h);
    const rows = 4;
    for (let i = 0; i < rows; i += 1) {
      const t = i / rows;
      const tone = mix(color, accent, t);
      const base = h * (0.45 + i * 0.12);
      const amplitude = h * 0.04 * (1 + strength);
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += Math.max(10, w / 60)) {
        const y = base + Math.sin(x / (w / (3 + i)) + this.clock * (0.6 + i * 0.2)) * amplitude;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = rgba(tone, 0.07 + 0.1 * strength * (1 - t));
      ctx.fill();
    }
  }

  private drawRays(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number, color: string, accent: string): void {
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const originX = w * (0.5 + Math.sin(this.clock * 0.08) * 0.18);
    const count = 9;
    for (let i = 0; i < count; i += 1) {
      const spread = (i / (count - 1) - 0.5) * 0.9 + Math.sin(this.clock * 0.12 + i) * 0.05;
      const tone = mix(color, accent, i / count);
      const gradient = ctx.createLinearGradient(originX, -h * 0.2, originX + spread * w, h);
      gradient.addColorStop(0, rgba(tone, 0.18 * strength));
      gradient.addColorStop(1, rgba(tone, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(originX - w * 0.06, -h * 0.1);
      ctx.lineTo(originX + w * 0.06, -h * 0.1);
      ctx.lineTo(originX + spread * w + w * 0.18, h * 1.05);
      ctx.lineTo(originX + spread * w - w * 0.18, h * 1.05);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private seedDrops(w: number, h: number, strength: number): void {
    const target = Math.round(80 + strength * 320 * this.area);
    while (this.state.drops.length < target) {
      this.state.drops.push({
        x: Math.random() * w,
        y: Math.random() * h,
        len: 12 + Math.random() * 40,
        v: 260 + Math.random() * 620,
      });
    }
    if (this.state.drops.length > target) this.state.drops.length = target;
  }

  private drawRain(ctx: CanvasRenderingContext2D, w: number, h: number, strength: number, color: string): void {
    ctx.clearRect(0, 0, w, h);
    this.seedDrops(w, h, strength);
    ctx.strokeStyle = rgba(color, 0.12 + 0.24 * strength);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const drop of this.state.drops) {
      drop.y += drop.v * 0.016;
      if (drop.y > h + drop.len) {
        drop.y = -drop.len;
        drop.x = Math.random() * w;
      }
      ctx.moveTo(drop.x, drop.y);
      ctx.lineTo(drop.x - drop.len * 0.16, drop.y + drop.len);
    }
    ctx.stroke();
  }
}
