// Parallax pixel-art backdrops for each stage (also used behind the menus).
import type { StageDef } from "./data/stages";
import { getSprite } from "./sprites";
import { mulberry32, TAU } from "./utils";

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

interface Mote {
  x: number;
  y: number;
  v: number;
  s: number;
  ph: number;
}

export class Backdrop {
  stage: StageDef;
  nebula: HTMLCanvasElement;
  stars1: HTMLCanvasElement;
  stars2: HTMLCanvasElement;
  floor: HTMLCanvasElement | null = null;
  twinkles: { x: number; y: number; ph: number; c: string }[] = [];
  motes: Mote[] = [];
  comet = { x: 0, y: 0, vx: 0, vy: 0, life: 0 };
  cometTimer = 3;

  constructor(stage: StageDef) {
    this.stage = stage;
    const rnd = mulberry32(stage.id.length * 9973 + stage.name.charCodeAt(2));
    // nebula: low-res soft blobs, upscaled with nearest-neighbour -> pixel clouds
    const N = 160;
    this.nebula = canvas(N, N);
    const nctx = this.nebula.getContext("2d")!;
    for (let i = 0; i < 14; i++) {
      const x = rnd() * N,
        y = rnd() * N,
        r = 18 + rnd() * 46;
      const col = stage.nebula[i % 3]!;
      for (const ox of [-N, 0, N])
        for (const oy of [-N, 0, N]) {
          const g = nctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          g.addColorStop(0, hexA(col, 0.34));
          g.addColorStop(1, hexA(col, 0));
          nctx.fillStyle = g;
          nctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
    }
    // posterize for pixel banding
    const img = nctx.getImageData(0, 0, N, N);
    for (let i = 0; i < img.data.length; i += 4) {
      for (let k = 0; k < 4; k++) {
        const step = k === 3 ? 28 : 24;
        img.data[i + k] = Math.round(img.data[i + k]! / step) * step;
      }
      const px = (i / 4) % N,
        py = Math.floor(i / 4 / N);
      if ((px + py) % 2 === 0) img.data[i + 3] = Math.max(0, img.data[i + 3]! - 10);
    }
    nctx.putImageData(img, 0, 0);

    this.stars1 = this.makeStars(rnd, 140, 70, stage.star);
    this.stars2 = this.makeStars(rnd, 140, 26, "#ffffff");
    for (let i = 0; i < 26; i++)
      this.twinkles.push({
        x: rnd() * 1400,
        y: rnd() * 1400,
        ph: rnd() * TAU,
        c: i % 3 === 0 ? stage.accent : "#ffffff",
      });

    if (stage.obstacles === "pillars") this.floor = this.makeFloor();
    const nm = stage.id === "ash" ? 90 : stage.id === "abyss" ? 50 : 0;
    for (let i = 0; i < nm; i++)
      this.motes.push({
        x: rnd(),
        y: rnd(),
        v: 0.3 + rnd(),
        s: 1 + Math.floor(rnd() * 3),
        ph: rnd() * TAU,
      });
  }

  private makeStars(rnd: () => number, size: number, n: number, col: string) {
    const c = canvas(size, size);
    const ctx = c.getContext("2d")!;
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rnd() * size),
        y = Math.floor(rnd() * size);
      const b = rnd();
      ctx.fillStyle = b > 0.85 ? "#ffffff" : hexA(col, 0.35 + b * 0.5);
      ctx.fillRect(x, y, 1, 1);
      if (b > 0.94) {
        ctx.fillStyle = hexA(col, 0.4);
        ctx.fillRect(x - 1, y, 1, 1);
        ctx.fillRect(x + 1, y, 1, 1);
        ctx.fillRect(x, y - 1, 1, 1);
        ctx.fillRect(x, y + 1, 1, 1);
      }
    }
    return c;
  }

  private makeFloor() {
    const S = 32;
    const c = canvas(S, S);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#120c22";
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = "#1a1230";
    ctx.fillRect(1, 1, 14, 14);
    ctx.fillRect(17, 17, 14, 14);
    ctx.fillStyle = "#160f2a";
    ctx.fillRect(17, 1, 14, 14);
    ctx.fillRect(1, 17, 14, 14);
    ctx.fillStyle = "#2a1f48";
    ctx.fillRect(0, 0, S, 1);
    ctx.fillRect(0, 0, 1, S);
    ctx.fillRect(0, 16, S, 1);
    ctx.fillRect(16, 0, 1, S);
    ctx.fillStyle = "#3d2e66";
    for (const [x, y] of [
      [3, 3],
      [12, 3],
      [3, 12],
      [12, 12],
      [19, 19],
      [28, 19],
      [19, 28],
      [28, 28],
    ])
      ctx.fillRect(x!, y!, 1, 1);
    ctx.fillStyle = "#24183f";
    ctx.fillRect(20, 6, 8, 1);
    ctx.fillRect(4, 22, 8, 1);
    return c;
  }

  private tile(
    ctx: CanvasRenderingContext2D,
    img: HTMLCanvasElement,
    scale: number,
    ox: number,
    oy: number,
    W: number,
    H: number,
  ) {
    const tw = img.width * scale,
      th = img.height * scale;
    const sx = (((-ox % tw) + tw) % tw) - tw;
    const sy = (((-oy % th) + th) % th) - th;
    for (let x = sx; x < W; x += tw)
      for (let y = sy; y < H; y += th) ctx.drawImage(img, x, y, tw, th);
  }

  /** Screen-space layers. camX/camY in world units, zoom = world->screen scale */
  draw(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    camX: number,
    camY: number,
    zoom: number,
    t: number,
    dt: number,
    fancy: boolean,
  ) {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = this.stage.bg;
    ctx.fillRect(0, 0, W, H);
    this.tile(ctx, this.nebula, 5, camX * 0.12, camY * 0.12, W, H);
    this.tile(ctx, this.stars1, 3, camX * 0.3, camY * 0.3, W, H);
    // planet far away
    const pl = getSprite(this.stage.planet);
    const ps = 3;
    ctx.drawImage(
      pl.canvas,
      W * 0.72 - camX * 0.05 - (pl.w * ps) / 2,
      H * 0.22 - camY * 0.05 - (pl.h * ps) / 2,
      pl.w * ps,
      pl.h * ps,
    );
    this.tile(ctx, this.stars2, 4, camX * 0.55, camY * 0.55, W, H);
    // twinkling stars
    for (const s of this.twinkles) {
      const x = (((s.x - camX * 0.45) % 1400) + 1400) % 1400;
      const y = (((s.y - camY * 0.45) % 1400) + 1400) % 1400;
      if (x > W || y > H) continue;
      const a = 0.5 + 0.5 * Math.sin(t * 2.2 + s.ph);
      ctx.globalAlpha = a;
      ctx.fillStyle = s.c;
      ctx.fillRect(x - 1, y - 4, 2, 8);
      ctx.fillRect(x - 4, y - 1, 8, 2);
      ctx.globalAlpha = 1;
    }
    // stage-specific ambient FX
    if (this.stage.id === "nova") {
      this.cometTimer -= dt;
      if (this.cometTimer <= 0 && this.comet.life <= 0) {
        this.comet = {
          x: Math.random() * W,
          y: -20,
          vx: (Math.random() - 0.5) * 500,
          vy: 380 + Math.random() * 200,
          life: 2.5,
        };
        this.cometTimer = 5 + Math.random() * 6;
      }
      if (this.comet.life > 0) {
        const c = this.comet;
        c.life -= dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        for (let i = 0; i < 10; i++) {
          ctx.globalAlpha = (1 - i / 10) * 0.8;
          ctx.fillStyle = i < 2 ? "#ffffff" : this.stage.accent;
          ctx.fillRect(c.x - c.vx * i * 0.012, c.y - c.vy * i * 0.012, 3, 3);
        }
        ctx.globalAlpha = 1;
      }
    }
    if (this.motes.length) {
      const ash = this.stage.id === "ash";
      for (const m of this.motes) {
        m.y += (ash ? m.v * 0.03 : -m.v * 0.008) * dt;
        m.x += (ash ? 0.012 : Math.sin(t + m.ph) * 0.004) * dt * m.v;
        m.x = ((m.x % 1) + 1) % 1;
        m.y = ((m.y % 1) + 1) % 1;
        const x = (((m.x * W - camX * 0.8 * zoom) % W) + W) % W;
        const y = (((m.y * H - camY * 0.8 * zoom) % H) + H) % H;
        if (ash) {
          ctx.fillStyle = m.s === 3 ? "#ff8a1f" : "rgba(200,180,170,0.5)";
          ctx.fillRect(x, y, m.s, m.s);
        } else {
          const a = 0.4 + 0.4 * Math.sin(t * 1.5 + m.ph);
          ctx.globalAlpha = a;
          ctx.fillStyle = m.ph > 3 ? "#2be8c8" : "#ff3df2";
          ctx.fillRect(x, y, m.s + 1, m.s + 1);
          ctx.globalAlpha = 1;
        }
      }
    }
    void fancy;
  }

  /** World-space floor (Omega facility) — call inside the world transform */
  drawFloor(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    viewW: number,
    viewH: number,
    t: number,
  ) {
    if (!this.floor) return;
    const scale = 4;
    const tw = this.floor.width * scale;
    const x0 = Math.floor((camX - viewW / 2) / tw) * tw;
    const y0 = Math.floor((camY - viewH / 2) / tw) * tw;
    ctx.globalAlpha = 0.85;
    for (let x = x0; x < camX + viewW / 2 + tw; x += tw)
      for (let y = y0; y < camY + viewH / 2 + tw; y += tw) ctx.drawImage(this.floor, x, y, tw, tw);
    ctx.globalAlpha = 1;
    // energy conduits pulsing along the main grid lines
    const G = tw * 4;
    const gx0 = Math.floor((camX - viewW / 2) / G) * G;
    const gy0 = Math.floor((camY - viewH / 2) / G) * G;
    for (let x = gx0; x < camX + viewW / 2 + G; x += G) {
      const a = 0.25 + 0.25 * Math.sin(t * 2 + x * 0.01);
      ctx.fillStyle = `rgba(37,244,255,${a})`;
      ctx.fillRect(x - 2, camY - viewH / 2 - 10, 4, viewH + 20);
    }
    for (let y = gy0; y < camY + viewH / 2 + G; y += G) {
      const a = 0.2 + 0.2 * Math.sin(t * 2.4 + y * 0.01);
      ctx.fillStyle = `rgba(255,61,242,${a})`;
      ctx.fillRect(camX - viewW / 2 - 10, y - 2, viewW + 20, 4);
    }
  }
}
