// Shared canvas helpers for the attract-mode menu visuals. Everything here is
// called only from inside requestAnimationFrame loops (never during render), so
// touching `document` is safe in the browser and SSR never reaches this code.

export const TAU = Math.PI * 2;

/** Hex colour (#rrggbb) to rgba() string with the given alpha. */
export function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const glowCache = new Map<string, HTMLCanvasElement>();

/** Soft radial light sprite, cached per colour. Drawn additively for neon halos. */
export function glowSprite(color: string): HTMLCanvasElement {
  const hit = glowCache.get(color);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const x = c.getContext("2d");
  if (x) {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, hexA(color, 1));
    g.addColorStop(0.35, hexA(color, 0.35));
    g.addColorStop(1, hexA(color, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
  }
  glowCache.set(color, c);
  return c;
}

/** Draws a glow of radius `r` centred at (x, y) and restores the previous alpha. */
export function drawGlow(
  ctx: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  r: number,
  alpha: number,
): void {
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha)) * prev;
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = prev;
}

/** Returns a copy of `src` with every opaque pixel recoloured to `color`. */
export function tintCanvas(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const x = c.getContext("2d");
  if (x) {
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = "source-atop";
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
  }
  return c;
}