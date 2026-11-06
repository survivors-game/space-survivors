// Sprite builder: turns ASCII art (art.ts) and procedural generators into
// cached canvases with outline, pixel shading and a white "hit flash" copy.
import { ART, BASE_PAL, EMISSIVE, type ArtDef } from "./art";
import { mulberry32, TAU } from "./utils";

export interface Sprite {
  w: number;
  h: number;
  canvas: HTMLCanvasElement;
  flash: HTMLCanvasElement;
}

const OUTLINE = [8, 4, 22];
const cache = new Map<string, Sprite>();
const urlCache = new Map<string, string>();

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h,
    16,
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

/** Expand mirrored ASCII rows into a full grid */
export function expandRows(def: ArtDef): string[] {
  const mirror = def.mirror !== false;
  let rows = def.rows;
  const maxLen = Math.max(...rows.map((r) => r.length));
  rows = rows.map((r) => (mirror ? r.padStart(maxLen, ".") : r.padEnd(maxLen, ".")));
  if (mirror) rows = rows.map((r) => r + r.slice(0, -1).split("").reverse().join(""));
  if (def.mirrorY) rows = [...rows, ...rows.slice(0, -1).reverse()];
  return rows;
}

/** Build from a pixel colour grid (null = transparent) */
function buildFromGrid(grid: (string | null)[][], shadeMask: boolean[][] | null): Sprite {
  const h = grid.length;
  const w = grid[0]?.length ?? 1;
  const W = w + 2,
    H = h + 2;
  const c = makeCanvas(W, H);
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(W, H);
  const filled = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && grid[y]![x] !== null;
  const cx = (w - 1) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = grid[y]![x];
      if (!col) continue;
      let [r, g, b] = hexToRgb(col);
      if (!shadeMask || shadeMask[y]![x]) {
        let k = 1;
        if (!filled(x, y - 1)) k *= 1.22; // top rim light
        if (!filled(x, y + 1)) k *= 0.72; // bottom shadow
        if (x > cx + 0.5) k *= 0.88; // right side away from light
        if (!filled(x - 1, y) && x <= cx) k *= 1.08;
        r = Math.min(255, r * k);
        g = Math.min(255, g * k);
        b = Math.min(255, b * k);
      }
      const i = ((y + 1) * W + (x + 1)) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  // outline pass
  for (let y = -1; y <= h; y++) {
    for (let x = -1; x <= w; x++) {
      if (filled(x, y)) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
        const i = ((y + 1) * W + (x + 1)) * 4;
        img.data[i] = OUTLINE[0]!;
        img.data[i + 1] = OUTLINE[1]!;
        img.data[i + 2] = OUTLINE[2]!;
        img.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const f = makeCanvas(W, H);
  const fctx = f.getContext("2d")!;
  fctx.drawImage(c, 0, 0);
  fctx.globalCompositeOperation = "source-in";
  fctx.fillStyle = "#ffffff";
  fctx.fillRect(0, 0, W, H);
  return { w: W, h: H, canvas: c, flash: f };
}

function buildArt(def: ArtDef): Sprite {
  const rows = expandRows(def);
  const pal = { ...BASE_PAL, ...(def.pal ?? {}) };
  const grid: (string | null)[][] = rows.map((r) =>
    r.split("").map((ch) => (ch === "." ? null : (pal[ch] ?? "#ff00ff"))),
  );
  const mask =
    def.shade === false
      ? rows.map((r) => r.split("").map(() => false))
      : rows.map((r) => r.split("").map((ch) => !EMISSIVE.has(ch)));
  return buildFromGrid(grid, mask);
}

/* ---------------- Procedural sprites ---------------- */

type Palette4 = [string, string, string, string];

/** Lumpy pixel asteroid / rock with craters and directional light */
function buildRock(seed: number, r: number, pal: Palette4, crackColor: string | null): Sprite {
  const rnd = mulberry32(seed);
  const size = r * 2 + 1;
  const harm = [rnd() * TAU, rnd() * TAU, rnd() * TAU];
  const amp = [0.12 + rnd() * 0.08, 0.06 + rnd() * 0.05, 0.04];
  const craters = Array.from({ length: 2 + Math.floor(rnd() * 4) }, () => ({
    x: (rnd() - 0.5) * r * 1.1,
    y: (rnd() - 0.5) * r * 1.1,
    r: 1 + rnd() * r * 0.25,
  }));
  const grid: (string | null)[][] = [];
  for (let y = 0; y < size; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < size; x++) {
      const dx = x - r,
        dy = y - r;
      const a = Math.atan2(dy, dx);
      const rr =
        r *
        (1 -
          amp[0]! * (1 + Math.sin(a * 3 + harm[0]!)) -
          amp[1]! * (1 + Math.sin(a * 5 + harm[1]!)) -
          amp[2]! * Math.sin(a * 9 + harm[2]!));
      const d = Math.hypot(dx, dy);
      if (d > rr) {
        row.push(null);
        continue;
      }
      // light from top-left
      const nx = dx / (rr || 1),
        ny = dy / (rr || 1);
      let l = 0.55 - nx * 0.35 - ny * 0.45 + (rnd() - 0.5) * 0.12;
      for (const c of craters) {
        const cd = Math.hypot(dx - c.x, dy - c.y);
        if (cd < c.r) l -= 0.35;
        else if (cd < c.r + 1 && dy - c.y > 0) l += 0.2;
      }
      const idx = l > 0.75 ? 0 : l > 0.45 ? 1 : l > 0.15 ? 2 : 3;
      let col = pal[idx]!;
      if (crackColor && Math.abs(Math.sin(dx * 0.7 + harm[0]!) * 3 + dy * 0.4) < 0.18 && d < rr - 1)
        col = crackColor;
      row.push(col);
    }
    grid.push(row);
  }
  return buildFromGrid(grid, null);
}

/** Alien coral spire seen from above: spiky ring + bioluminescent pods */
function buildSpire(seed: number, r: number): Sprite {
  const rnd = mulberry32(seed);
  const size = r * 2 + 1;
  const spikes = 5 + Math.floor(rnd() * 4);
  const ph = rnd() * TAU;
  const grid: (string | null)[][] = [];
  for (let y = 0; y < size; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < size; x++) {
      const dx = x - r,
        dy = y - r;
      const a = Math.atan2(dy, dx);
      const d = Math.hypot(dx, dy);
      const edge = r * (0.62 + 0.38 * Math.pow(Math.abs(Math.cos((a * spikes + ph) / 2)), 3));
      if (d > edge) {
        row.push(null);
        continue;
      }
      let col = "#3a1460";
      if (d < r * 0.55) col = "#5a1f86";
      if (d < r * 0.4) col = "#7b2fb0";
      if (d < r * 0.22) col = "#2be8c8";
      if (d < r * 0.1) col = "#d8fff6";
      if (d > r * 0.6 && Math.abs(Math.sin(a * spikes + ph)) > 0.92) col = "#ff3df2";
      row.push(col);
    }
    grid.push(row);
  }
  return buildFromGrid(grid, null);
}

/** Omega facility pylon: octagon with plating and cyan energy ring */
function buildPillar(r: number): Sprite {
  const size = r * 2 + 1;
  const grid: (string | null)[][] = [];
  for (let y = 0; y < size; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < size; x++) {
      const dx = Math.abs(x - r),
        dy = Math.abs(y - r);
      const oct = Math.max(dx, dy, (dx + dy) * 0.72);
      if (oct > r) {
        row.push(null);
        continue;
      }
      let col = "#2a3550";
      if (oct < r - 1) col = "#4a5a80";
      if (oct < r - 2 && x - r + (y - r) < 0) col = "#6b7fae";
      if (Math.abs(oct - r * 0.62) < 0.8) col = "#25f4ff";
      if (oct < r * 0.45) col = "#1a2240";
      if (oct < r * 0.25) col = "#ff3df2";
      if ((dx === 0 || dy === 0) && oct > r * 0.7 && oct < r - 1) col = "#141b30";
      row.push(col);
    }
    grid.push(row);
  }
  return buildFromGrid(grid, null);
}

/** Large background planet with bands, dithered terminator and ring */
function buildPlanet(r: number, bands: string[], ring: string): Sprite {
  const padX = Math.round(r * 1.35);
  const padY = Math.round(r * 0.35);
  const W = r * 2 + padX * 2,
    H = r * 2 + padY * 2;
  const grid: (string | null)[][] = [];
  const cx = W / 2,
    cy = H / 2;
  for (let y = 0; y < H; y++) {
    const row: (string | null)[] = [];
    for (let x = 0; x < W; x++) {
      const dx = x - cx,
        dy = y - cy;
      const d = Math.hypot(dx, dy);
      // ring (ellipse)
      const re = Math.hypot(dx / 1.9, dy / 0.42);
      const onRing = re > r * 0.98 && re < r * 1.12 && !(d < r && dy < 0);
      if (d < r) {
        const band =
          bands[
            Math.floor(((dy / r + 1) * 0.5 + Math.sin(dx * 0.08) * 0.03) * bands.length) %
              bands.length
          ]!;
        const light = (-dx / r) * 0.6 - (dy / r) * 0.4;
        const dither = (x + y) % 2 === 0;
        if (light < -0.35 || (light < -0.15 && dither)) row.push("#0c0720");
        else row.push(band);
      } else if (onRing) {
        row.push((x + y) % 3 === 0 ? "#0c0720" : ring);
      } else row.push(null);
    }
    grid.push(row);
  }
  return buildFromGrid(grid, null);
}

const PROCEDURAL: Record<string, () => Sprite> = {};
for (let i = 0; i < 6; i++) {
  PROCEDURAL[`rock_ash_${i}`] = () =>
    buildRock(
      101 + i * 17,
      9 + (i % 3) * 5,
      ["#b8a08a", "#7d6656", "#4a3a36", "#24191e"],
      i % 2 ? "#ff6a1f" : null,
    );
  PROCEDURAL[`rock_nova_${i}`] = () =>
    buildRock(301 + i * 13, 5 + (i % 3) * 2, ["#9fb4e0", "#5a6a9e", "#323a66", "#161a36"], null);
  PROCEDURAL[`spire_${i}`] = () => buildSpire(501 + i * 7, 10 + (i % 3) * 4);
}
PROCEDURAL["pillar_s"] = () => buildPillar(9);
PROCEDURAL["pillar_l"] = () => buildPillar(14);
PROCEDURAL["planet_nova"] = () =>
  buildPlanet(60, ["#3d7bff", "#2d5ad0", "#5a92ff", "#24409a", "#3d7bff"], "#a35cff");
PROCEDURAL["planet_ash"] = () =>
  buildPlanet(46, ["#ff8a1f", "#c4541a", "#ffb347", "#8a3010"], "#ffd23f");
PROCEDURAL["planet_abyss"] = () =>
  buildPlanet(52, ["#2be8c8", "#1a8f7e", "#7b2fb0", "#3a1460", "#2be8c8"], "#ff3df2");
PROCEDURAL["planet_omega"] = () =>
  buildPlanet(40, ["#ff2d55", "#8a1030", "#ff3df2", "#5e0a1e"], "#25f4ff");

export function getSprite(id: string): Sprite {
  let s = cache.get(id);
  if (s) return s;
  const proc = PROCEDURAL[id];
  if (proc) s = proc();
  else {
    const def = ART[id];
    if (!def) throw new Error(`Unknown sprite ${id}`);
    s = buildArt(def);
  }
  cache.set(id, s);
  return s;
}

/** Pixelated PNG data URL for React screens (hangar, cards, HUD) */
export function spriteUrl(id: string, scale = 4): string {
  const key = `${id}@${scale}`;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const s = getSprite(id);
  const c = makeCanvas(s.w * scale, s.h * scale);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s.canvas, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/png");
  urlCache.set(key, url);
  return url;
}

/* ---------------- Glow sprites (additive light) ---------------- */
const glowCache = new Map<string, HTMLCanvasElement>();
export function glow(color: string, radius = 32): HTMLCanvasElement {
  const key = color + radius;
  let g = glowCache.get(key);
  if (g) return g;
  g = makeCanvas(radius * 2, radius * 2);
  const ctx = g.getContext("2d")!;
  const [r, gg, b] = hexToRgb(color);
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, `rgba(${r},${gg},${b},0.85)`);
  grad.addColorStop(0.25, `rgba(${r},${gg},${b},0.35)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, radius * 2, radius * 2);
  glowCache.set(key, g);
  return g;
}

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  x: number,
  y: number,
  rot: number,
  scale: number,
  flash = false,
) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  const w = s.w * scale,
    h = s.h * scale;
  ctx.drawImage(flash ? s.flash : s.canvas, -w / 2, -h / 2, w, h);
  ctx.restore();
}
