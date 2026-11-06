import { useEffect, useRef } from "react";
import { getSprite } from "@/game/sprites";
import { rand } from "@/game/utils";
import { TAU, hexA, tintCanvas } from "@/components/game/menuFx";

const ROCK_IDS = [
  "rock_nova_0",
  "rock_nova_1",
  "rock_nova_2",
  "rock_nova_3",
  "rock_nova_4",
  "rock_nova_5",
  "rock_ash_0",
  "rock_ash_2",
  "rock_ash_4",
];
const PATROL_IDS = ["en_interceptor", "en_hunter", "en_destroyer"];
const STREAK_COLORS = ["#00f0ff", "#ff0055", "#a855f7", "#ffd700"];
const ROCK_COUNT = 4;

interface Star {
  x: number; // normalised 0..1
  y: number; // normalised 0..1
  speed: number; // px per second
  size: number;
  alpha: number;
  phase: number;
  color: string;
}
interface Rock {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  depth: number; // 0 far .. 1 near
  scale: number;
  id: string;
}
interface Streak {
  x: number;
  y: number;
  ux: number;
  uy: number;
  speed: number;
  len: number;
  life: number;
  max: number;
  color: string;
}
interface PatrolUnit {
  ox: number;
  oy: number;
}
interface Patrol {
  x: number;
  y: number;
  vx: number;
  id: string;
  sc: number;
  alpha: number;
  units: PatrolUnit[];
}
interface World {
  t: number;
  streakT: number;
  patrolT: number;
  stars: Star[];
  rocks: Rock[];
  streaks: Streak[];
  patrols: Patrol[];
}

const silhouetteCache = new Map<string, HTMLCanvasElement>();

/** Dark silhouette of an enemy sprite with a thin neon rim, cached per sprite id. */
function silhouette(id: string): HTMLCanvasElement {
  const hit = silhouetteCache.get(id);
  if (hit) return hit;
  const src = getSprite(id).canvas;
  const pad = 1;
  const out = document.createElement("canvas");
  out.width = src.width + pad * 2;
  out.height = src.height + pad * 2;
  const x = out.getContext("2d");
  if (x) {
    const neon = tintCanvas(src, "#ff3df2");
    x.globalAlpha = 0.9;
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      x.drawImage(neon, pad + dx, pad + dy);
    }
    x.globalAlpha = 1;
    x.drawImage(tintCanvas(src, "#140830"), pad, pad);
  }
  silhouetteCache.set(id, out);
  return out;
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] ?? list[0]!;
}

function makeRock(w: number, h: number, initial: boolean): Rock {
  const depth = rand(0.25, 1);
  const dir = Math.random() < 0.5 ? 1 : -1;
  const speed = 14 + depth * 46; // parallax: near rocks move faster
  return {
    x: initial ? rand(0, w) : dir > 0 ? -90 : w + 90,
    y: initial ? rand(0, h) : rand(-40, h * 0.7),
    vx: dir * speed,
    vy: speed * rand(0.08, 0.3),
    rot: rand(0, TAU),
    vr: rand(-0.35, 0.35),
    depth,
    scale: 1.8 + depth * 2.2,
    id: pick(ROCK_IDS),
  };
}

function makePatrol(w: number, h: number): Patrol {
  const dir = Math.random() < 0.5 ? 1 : -1;
  const far = Math.random() < 0.6;
  const count = Math.random() < 0.45 ? 1 : 3 + Math.floor(Math.random() * 3);
  const units: PatrolUnit[] = [];
  for (let i = 0; i < count; i++) {
    // Chevron formation trailing behind the leader
    units.push({ ox: -dir * i * 22, oy: (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 7 });
  }
  return {
    x: dir > 0 ? -220 : w + 220,
    y: rand(h * 0.08, h * 0.5),
    vx: dir * rand(240, 400),
    id: pick(PATROL_IDS),
    sc: far ? rand(0.9, 1.15) : rand(1.2, 1.5),
    alpha: far ? rand(0.45, 0.65) : rand(0.7, 0.9),
    units,
  };
}

function spawnStreak(world: World, w: number, h: number) {
  const dir = Math.random() < 0.5 ? 1 : -1;
  const angle = rand(0.5, 0.85); // radians below the horizontal
  world.streaks.push({
    x: rand(0, w),
    y: rand(-0.05 * h, 0.3 * h),
    ux: dir * Math.cos(angle),
    uy: Math.sin(angle),
    speed: rand(700, 1100),
    len: rand(120, 190),
    life: 1,
    max: 1,
    color: pick(STREAK_COLORS),
  });
}

function createWorld(w: number, h: number): World {
  const stars: Star[] = [];
  const layers = [
    { count: 60, speed: 6, size: 1, alpha: 0.35, color: "#ffffff" },
    { count: 30, speed: 16, size: 1.5, alpha: 0.6, color: "#ffffff" },
    { count: 12, speed: 34, size: 2, alpha: 0.9, color: "#9befff" },
  ];
  for (const layer of layers) {
    for (let i = 0; i < layer.count; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        speed: layer.speed,
        size: layer.size,
        alpha: layer.alpha,
        phase: rand(0, TAU),
        color: layer.color,
      });
    }
  }
  return {
    t: 0,
    streakT: 1,
    patrolT: 3,
    stars,
    rocks: Array.from({ length: ROCK_COUNT }, () => makeRock(w, h, true)),
    streaks: [],
    patrols: [],
  };
}

function step(world: World, dt: number, w: number, h: number) {
  world.t += dt;

  for (const s of world.stars) {
    s.y += (s.speed * dt) / h;
    if (s.y > 1) {
      s.y -= 1;
      s.x = Math.random();
    }
  }

  world.rocks.forEach((r, i) => {
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    r.rot += r.vr * dt;
    const gone = (r.vx > 0 && r.x > w + 110) || (r.vx < 0 && r.x < -110) || r.y > h + 110;
    if (gone) world.rocks[i] = makeRock(w, h, false);
  });

  world.streakT -= dt;
  if (world.streakT <= 0) {
    world.streakT = rand(1.2, 3.2);
    spawnStreak(world, w, h);
  }
  for (const s of world.streaks) {
    s.x += s.ux * s.speed * dt;
    s.y += s.uy * s.speed * dt;
    s.life -= dt;
  }
  world.streaks = world.streaks.filter((s) => s.life > 0);

  world.patrolT -= dt;
  if (world.patrolT <= 0) {
    world.patrolT = rand(7, 14);
    world.patrols.push(makePatrol(w, h));
  }
  for (const p of world.patrols) p.x += p.vx * dt;
  world.patrols = world.patrols.filter((p) => (p.vx > 0 ? p.x < w + 320 : p.x > -320));
}

function paint(ctx: CanvasRenderingContext2D, world: World, w: number, h: number) {
  // Starfield (three depth layers)
  for (const s of world.stars) {
    const twinkle = 0.75 + 0.25 * Math.sin(world.t * 2.2 + s.phase);
    ctx.globalAlpha = s.alpha * twinkle;
    ctx.fillStyle = s.color;
    ctx.fillRect(Math.round(s.x * w), Math.round(s.y * h), s.size, s.size);
  }
  ctx.globalAlpha = 1;

  // Asteroids: pixel rocks, dimmer and slower when far away
  ctx.imageSmoothingEnabled = false;
  for (const r of world.rocks) {
    const src = getSprite(r.id).canvas;
    const rw = src.width * r.scale;
    const rh = src.height * r.scale;
    ctx.save();
    ctx.globalAlpha = 0.3 + 0.7 * r.depth;
    ctx.translate(r.x, r.y);
    ctx.rotate(r.rot);
    ctx.drawImage(src, -rw / 2, -rh / 2, rw, rh);
    ctx.restore();
  }

  // Shooting stars: neon streak that fades out behind the head
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (const s of world.streaks) {
    const k = Math.max(0, s.life / s.max);
    const tx = s.x - s.ux * s.len;
    const ty = s.y - s.uy * s.len;
    const grad = ctx.createLinearGradient(tx, ty, s.x, s.y);
    grad.addColorStop(0, hexA(s.color, 0));
    grad.addColorStop(1, hexA(s.color, k));
    ctx.strokeStyle = grad;

    ctx.globalAlpha = 0.25 * k;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();

    ctx.globalAlpha = k;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(s.x - 1, s.y - 1, 2.4, 2.4);
  }
  ctx.restore();

  // Distant patrols: silhouettes with a magenta rim and engine trails
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (const p of world.patrols) {
    const sil = silhouette(p.id);
    const dir = p.vx > 0 ? 1 : -1;
    const rot = dir * (Math.PI / 2); // nose points in the direction of travel
    const sw = sil.width * p.sc;
    const sh = sil.height * p.sc;
    for (const u of p.units) {
      const x = p.x + u.ox;
      const y = p.y + u.oy;

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.drawImage(sil, -sw / 2, -sh / 2, sw, sh);
      ctx.restore();

      const ex = x - dir * (sh / 2);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const trail = ctx.createLinearGradient(ex, y, ex - dir * 34, y);
      trail.addColorStop(0, hexA("#ff3df2", 0.5 * p.alpha));
      trail.addColorStop(1, hexA("#ff3df2", 0));
      ctx.strokeStyle = trail;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ex, y);
      ctx.lineTo(ex - dir * 34, y);
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();

  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true;
}

/** Animated space backdrop rendered only while the main menu is on screen. */
export function MenuAttractBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeScale = reduce ? 0.35 : 1;

    let w = 1;
    let h = 1;
    let dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);

    const world = createWorld(w, h);
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000) * timeScale;
      last = now;
      step(world, dt, w, h);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      paint(ctx, world, w, h);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}