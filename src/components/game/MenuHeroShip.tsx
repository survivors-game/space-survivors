import { useEffect, useRef, useState } from "react";
import type { ShipDef } from "@/game/data/ships";
import { getSprite } from "@/game/sprites";
import { rand } from "@/game/utils";
import { TAU, drawGlow, hexA } from "@/components/game/menuFx";

type SystemId = "LASER" | "BURST" | "DRONES" | "FIELD";

const SYSTEMS: { id: SystemId; label: string; tone: string }[] = [
  { id: "LASER", label: "LÁSER DE PULSO", tone: "text-cyan-200" },
  { id: "BURST", label: "CAÑÓN DE RÁFAGAS", tone: "text-[#ffd700]" },
  { id: "DRONES", label: "DRONES DE APOYO", tone: "text-[#c4a1ff]" },
  { id: "FIELD", label: "CAMPO ELÉCTRICO", tone: "text-[#ff6b95]" },
];

// Logical drawing space. The canvas scales to any width via CSS.
const VIEW_W = 360;
const VIEW_H = 300;
const CX = VIEW_W / 2;
const BASE_Y = 128; // resting height of the ship's centre
const PED_Y = 246; // pedestal centre
const SHIP_SCALE = 4;
const FIELD_R = 74;

interface Bolt {
  x: number;
  y: number;
  vy: number;
  life: number;
  len: number;
  w: number;
  color: string;
}
interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
}
interface Mote {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}
interface Pulse {
  side: -1 | 1;
  p: number;
}
interface Arc {
  pts: { x: number; y: number }[];
  color: string;
  alpha: number;
}

interface Fx {
  t: number;
  system: number;
  systemT: number;
  systemDur: number;
  shotT: number;
  droneT: number;
  arcT: number;
  moteT: number;
  kick: number;
  flash: number;
  heal: number;
  gunCounter: number;
  bolts: Bolt[];
  sparks: Spark[];
  motes: Mote[];
  pulses: Pulse[];
  arcs: Arc[];
}

function createFx(): Fx {
  return {
    t: 0,
    system: 0,
    systemT: 0,
    systemDur: rand(4, 5),
    shotT: 0,
    droneT: 0,
    arcT: 0,
    moteT: 0,
    kick: 0,
    flash: 0,
    heal: 0,
    gunCounter: 0,
    bolts: [],
    sparks: [],
    motes: [],
    pulses: [],
    arcs: [],
  };
}

/** Vertical float: the hull rises and sinks in a smooth sine. `h` is 0 (low) .. 1 (high). */
function floatPose(fx: Fx): { h: number; y: number } {
  const h = (Math.sin(fx.t * 1.6) + 1) / 2;
  return { h, y: BASE_Y - h * 12 + fx.kick * 1.3 };
}

function dronePos(side: -1 | 1, t: number, shipY: number) {
  return {
    x: CX + side * (92 + Math.sin(t * 1.2 + side) * 6),
    y: shipY - 12 + Math.cos(t * 1.9 + side * 1.3) * 8,
  };
}

function makeArc(): Arc {
  const a0 = Math.random() * TAU;
  const span = rand(0.35, 0.9);
  const n = 5 + Math.floor(Math.random() * 3);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + span * (i / n);
    const r = FIELD_R + (i === 0 || i === n ? 0 : rand(-7, 7));
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return {
    pts,
    color: Math.random() < 0.55 ? "#00f0ff" : "#ff0055",
    alpha: rand(0.55, 1),
  };
}

function update(fx: Fx, dt: number, ship: ShipDef, onSystem: (index: number) => void) {
  fx.t += dt;
  fx.systemT += dt;
  if (fx.systemT >= fx.systemDur) {
    fx.systemT = 0;
    fx.systemDur = rand(4, 5);
    fx.system = (fx.system + 1) % SYSTEMS.length;
    fx.shotT = 0;
    fx.droneT = 0;
    fx.arcT = 0;
    fx.arcs = [];
    onSystem(fx.system);
  }

  fx.kick *= Math.exp(-dt * 11);
  fx.flash *= Math.exp(-dt * 9);
  fx.heal = Math.max(0, fx.heal - dt * 1.8);

  const { y } = floatPose(fx);
  const muzzles = ship.guns.map((g) => ({ x: CX + g.x * SHIP_SCALE, y: y + g.y * SHIP_SCALE }));
  const mode = SYSTEMS[fx.system]?.id ?? "LASER";

  if (mode === "LASER") {
    fx.shotT -= dt;
    if (fx.shotT <= 0) {
      fx.shotT = 0.5;
      fx.flash = 1;
      for (const m of muzzles) {
        fx.bolts.push({ x: m.x, y: m.y - 2, vy: -330, life: 1.3, len: 26, w: 2, color: "#25f4ff" });
      }
    }
  } else if (mode === "BURST") {
    fx.shotT -= dt;
    if (fx.shotT <= 0 && muzzles.length > 0) {
      fx.shotT = 0.085;
      const m = muzzles[fx.gunCounter % muzzles.length] ?? muzzles[0]!;
      fx.gunCounter++;
      fx.flash = 0.8;
      fx.kick = Math.min(7, fx.kick + 2.4); // recoil: the hull is pushed back
      fx.bolts.push({ x: m.x, y: m.y - 2, vy: -640, life: 0.8, len: 12, w: 1.5, color: "#ffffff" });
      for (let i = 0; i < 5; i++) {
        fx.sparks.push({
          x: m.x,
          y: m.y - 2,
          vx: rand(-70, 70),
          vy: rand(-170, -60),
          life: 0.3,
          max: 0.3,
          color: i % 2 ? "#ffd700" : "#25f4ff",
        });
      }
    }
  } else if (mode === "DRONES") {
    fx.droneT -= dt;
    if (fx.droneT <= 0) {
      fx.droneT = 0.95;
      fx.pulses.push({ side: -1, p: 0 }, { side: 1, p: 0 });
    }
  } else {
    fx.arcT -= dt;
    if (fx.arcT <= 0) {
      fx.arcT = 0.06;
      fx.arcs = [makeArc(), makeArc()];
      if (Math.random() < 0.5) fx.arcs.push(makeArc());
    }
  }

  for (const b of fx.bolts) {
    b.y += b.vy * dt;
    b.life -= dt;
  }
  fx.bolts = fx.bolts.filter((b) => b.life > 0 && b.y > -40);

  for (const s of fx.sparks) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 420 * dt;
    s.life -= dt;
  }
  fx.sparks = fx.sparks.filter((s) => s.life > 0);

  for (const p of fx.pulses) p.p += dt / 0.55;
  if (fx.pulses.some((p) => p.p >= 1)) fx.heal = 1;
  fx.pulses = fx.pulses.filter((p) => p.p < 1);

  fx.moteT -= dt;
  if (fx.moteT <= 0) {
    fx.moteT = 0.12;
    const life = rand(1.6, 2.6);
    fx.motes.push({
      x: CX + rand(-96, 96),
      y: PED_Y - 4,
      vy: -rand(26, 50),
      life,
      max: life,
      size: Math.random() < 0.2 ? 2 : 1,
      color: Math.random() < 0.6 ? "#25f4ff" : "#a855f7",
    });
  }
  for (const m of fx.motes) {
    m.y += m.vy * dt;
    m.life -= dt;
  }
  fx.motes = fx.motes.filter((m) => m.life > 0);
}

function drawPedestal(ctx: CanvasRenderingContext2D, fx: Fx, h: number) {
  // Base disc of light
  const disc = ctx.createRadialGradient(CX, PED_Y, 4, CX, PED_Y, 130);
  disc.addColorStop(0, hexA("#00f0ff", 0.3));
  disc.addColorStop(0.55, hexA("#8a2be2", 0.14));
  disc.addColorStop(1, hexA("#8a2be2", 0));
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.ellipse(CX, PED_Y, 130, 31, 0, 0, TAU);
  ctx.fill();

  // Shadow cast by the hovering hull: smaller and fainter when the ship is high
  const sr = 58 - h * 14;
  ctx.fillStyle = `rgba(0,0,0,${(0.55 - h * 0.25).toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(CX, PED_Y - 2, sr, sr * 0.24, 0, 0, TAU);
  ctx.fill();

  // Concentric neon rings, counter-rotating, breathing in alpha
  const rings = [
    { rx: 128, color: "#00f0ff", dir: 1, a: 0.85, w: 2 },
    { rx: 100, color: "#a855f7", dir: -1, a: 0.8, w: 1.6 },
    { rx: 74, color: "#00f0ff", dir: 1, a: 0.6, w: 1.6 },
  ];
  rings.forEach((r, i) => {
    ctx.save();
    ctx.globalAlpha = r.a * (0.72 + 0.28 * Math.sin(fx.t * 2 + i * 1.3));
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.w;
    ctx.setLineDash([16, 10]);
    ctx.lineDashOffset = r.dir * fx.t * 30;
    ctx.beginPath();
    ctx.ellipse(CX, PED_Y, r.rx, r.rx * 0.24, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  });

  // Expanding ripple every 2.4 s
  const rp = (fx.t % 2.4) / 2.4;
  const rr = 36 + rp * 100;
  ctx.save();
  ctx.globalAlpha = (1 - rp) * 0.55;
  ctx.strokeStyle = "#25f4ff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(CX, PED_Y, rr, rr * 0.24, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();

  // Emitter core
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  drawGlow(ctx, "#25f4ff", CX, PED_Y, 30, 0.55);
  ctx.restore();
}

function drawBeam(ctx: CanvasRenderingContext2D, fx: Fx, shipBottom: number) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(CX - 62, PED_Y);
  ctx.lineTo(CX + 62, PED_Y);
  ctx.lineTo(CX + 30, shipBottom);
  ctx.lineTo(CX - 30, shipBottom);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, PED_Y, 0, shipBottom);
  grad.addColorStop(0, hexA("#00f0ff", 0.22));
  grad.addColorStop(1, hexA("#00f0ff", 0.02));
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.clip();
  // Hologram scanlines climbing the beam
  ctx.fillStyle = "rgba(180,250,255,0.22)";
  const off = (fx.t * 40) % 6;
  for (let y = PED_Y - off; y > shipBottom; y -= 6) {
    ctx.fillRect(CX - 70, y, 140, 1);
  }
  ctx.restore();
}

function drawHalo(ctx: CanvasRenderingContext2D, y: number, h: number, heal: number) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  drawGlow(ctx, "#00f0ff", CX, y, 110, 0.22 + h * 0.1 + heal * 0.25);
  drawGlow(ctx, "#8a2be2", CX, y + 6, 80, 0.12 + heal * 0.1);
  ctx.restore();
}

function drawShip(
  ctx: CanvasRenderingContext2D,
  fx: Fx,
  ship: ShipDef,
  y: number,
  holo: HTMLCanvasElement,
  hctx: CanvasRenderingContext2D,
) {
  const sprite = getSprite(ship.sprite);
  const sw = sprite.w * SHIP_SCALE;
  const sh = sprite.h * SHIP_SCALE;
  if (holo.width !== sw || holo.height !== sh) {
    holo.width = sw;
    holo.height = sh;
  }

  // Build the hologram version of the sprite: cyan tint plus a sweeping scan band
  hctx.clearRect(0, 0, sw, sh);
  hctx.imageSmoothingEnabled = false;
  hctx.drawImage(sprite.canvas, 0, 0, sw, sh);
  hctx.globalCompositeOperation = "source-atop";
  hctx.fillStyle = "rgba(37,244,255,0.22)";
  hctx.fillRect(0, 0, sw, sh);
  const band = ((fx.t * 0.6) % 1.4) - 0.2;
  const by = band * sh;
  const sweep = hctx.createLinearGradient(0, by - 10, 0, by + 10);
  sweep.addColorStop(0, "rgba(255,255,255,0)");
  sweep.addColorStop(0.5, "rgba(255,255,255,0.55)");
  sweep.addColorStop(1, "rgba(255,255,255,0)");
  hctx.fillStyle = sweep;
  hctx.fillRect(0, by - 10, sw, 20);
  hctx.globalCompositeOperation = "source-over";

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.95;
  ctx.drawImage(holo, Math.round(CX - sw / 2), Math.round(y - sh / 2));
  ctx.restore();

  // Nav lights blinking on the hull
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ship.lights.forEach((l, i) => {
    if (Math.sin(fx.t * 5 + i * Math.PI) <= 0) return;
    const lx = CX + l.x * SHIP_SCALE;
    const ly = y + l.y * SHIP_SCALE;
    ctx.fillStyle = l.color;
    ctx.fillRect(lx - 1.5, ly - 1.5, 3, 3);
    drawGlow(ctx, l.color, lx, ly, 9, 0.8);
  });

  // Muzzle flashes
  if (fx.flash > 0.03) {
    for (const g of ship.guns) {
      drawGlow(ctx, "#ffffff", CX + g.x * SHIP_SCALE, y + g.y * SHIP_SCALE - 2, 14, fx.flash * 0.9);
    }
  }
  ctx.restore();
}

function drawProjectiles(ctx: CanvasRenderingContext2D, fx: Fx) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  for (const b of fx.bolts) {
    const grad = ctx.createLinearGradient(b.x, b.y + b.len, b.x, b.y);
    grad.addColorStop(0, hexA(b.color, 0));
    grad.addColorStop(1, hexA(b.color, 1));
    ctx.strokeStyle = grad;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = b.w * 3.5;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y + b.len);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineWidth = b.w;
    ctx.stroke();
    drawGlow(ctx, b.color, b.x, b.y, 8, 0.9);
  }
  for (const s of fx.sparks) {
    ctx.globalAlpha = Math.max(0, s.life / s.max);
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, 1.5, 1.5);
  }
  ctx.restore();
}

function drawDrones(ctx: CanvasRenderingContext2D, fx: Fx, shipY: number) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const side of [-1, 1] as const) {
    const d = dronePos(side, fx.t, shipY);
    // Support link toward the hull
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = "#a855f7";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.lineDashOffset = -fx.t * 20;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(CX + side * 30, shipY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    // Drone body: diamond with side pods
    ctx.fillStyle = "#0b0a22";
    ctx.strokeStyle = "#c4a1ff";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y - 6);
    ctx.lineTo(d.x + 6, d.y);
    ctx.lineTo(d.x, d.y + 6);
    ctx.lineTo(d.x - 6, d.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#a855f7";
    ctx.fillRect(d.x - 10, d.y - 1, 4, 2);
    ctx.fillRect(d.x + 6, d.y - 1, 4, 2);
    drawGlow(ctx, "#a855f7", d.x, d.y, 9, 0.9);
  }
  // Synchronised pulses travelling from each drone to the hull
  for (const p of fx.pulses) {
    const d = dronePos(p.side, fx.t, shipY);
    const px = d.x + (CX - d.x) * p.p;
    const py = d.y + (shipY - d.y) * p.p - Math.sin(p.p * Math.PI) * 8;
    drawGlow(ctx, "#c4a1ff", px, py, 7, 0.95);
  }
  ctx.restore();
}

function drawField(ctx: CanvasRenderingContext2D, fx: Fx, shipY: number) {
  const R = FIELD_R + Math.sin(fx.t * 3) * 2.5;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // Plasma dome: cyan core fading to a magenta edge
  const dome = ctx.createRadialGradient(CX, shipY, R * 0.35, CX, shipY, R);
  dome.addColorStop(0, hexA("#00f0ff", 0));
  dome.addColorStop(0.7, hexA("#00f0ff", 0.12));
  dome.addColorStop(0.92, hexA("#ff0055", 0.22));
  dome.addColorStop(1, hexA("#ff0055", 0));
  ctx.fillStyle = dome;
  ctx.beginPath();
  ctx.arc(CX, shipY, R, 0, TAU);
  ctx.fill();

  // Rotating rings
  ctx.strokeStyle = "#00f0ff";
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([10, 14]);
  ctx.lineDashOffset = fx.t * 60;
  ctx.beginPath();
  ctx.arc(CX, shipY, R, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = "#ff0055";
  ctx.globalAlpha = 0.6;
  ctx.setLineDash([4, 8]);
  ctx.lineDashOffset = -fx.t * 40;
  ctx.beginPath();
  ctx.arc(CX, shipY, R * 0.9, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);

  // Electric arcs crawling over the dome
  for (const arc of fx.arcs) {
    ctx.beginPath();
    arc.pts.forEach((p, i) => {
      if (i === 0) ctx.moveTo(CX + p.x, shipY + p.y);
      else ctx.lineTo(CX + p.x, shipY + p.y);
    });
    ctx.globalAlpha = arc.alpha * 0.3;
    ctx.strokeStyle = arc.color;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.globalAlpha = arc.alpha;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();
}

function drawMotes(ctx: CanvasRenderingContext2D, fx: Fx) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const m of fx.motes) {
    ctx.globalAlpha = Math.max(0, m.life / m.max) * 0.8;
    ctx.fillStyle = m.color;
    ctx.fillRect(Math.round(m.x), Math.round(m.y), m.size, m.size);
  }
  ctx.restore();
}

function render(
  ctx: CanvasRenderingContext2D,
  fx: Fx,
  ship: ShipDef,
  holo: HTMLCanvasElement,
  hctx: CanvasRenderingContext2D,
) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;

  const { h, y } = floatPose(fx);
  const sprite = getSprite(ship.sprite);
  const shipBottom = y + (sprite.h * SHIP_SCALE) / 2;
  const mode = SYSTEMS[fx.system]?.id ?? "LASER";

  drawPedestal(ctx, fx, h);
  drawBeam(ctx, fx, shipBottom);
  drawHalo(ctx, y, h, fx.heal);
  drawShip(ctx, fx, ship, y, holo, hctx);

  if (mode === "LASER" || mode === "BURST") drawProjectiles(ctx, fx);
  if (mode === "DRONES") drawDrones(ctx, fx, y);
  if (mode === "FIELD") drawField(ctx, fx, y);
  drawMotes(ctx, fx);
}

interface MenuHeroShipProps {
  ship: ShipDef;
}

/** Holographic projector showing the selected ship on a levitating pedestal. */
export function MenuHeroShip({ ship }: MenuHeroShipProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shipRef = useRef(ship);
  const [system, setSystem] = useState(0);

  useEffect(() => {
    shipRef.current = ship;
  }, [ship]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const holo = document.createElement("canvas");
    const hctx = holo.getContext("2d");
    if (!hctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(VIEW_W * dpr);
    canvas.height = Math.round(VIEW_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeScale = reduce ? 0.35 : 1;

    const fx = createFx();
    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000) * timeScale;
      last = now;
      const current = shipRef.current;
      update(fx, dt, current, setSystem);
      render(ctx, fx, current, holo, hctx);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
  }, []);

  const active = SYSTEMS[system] ?? SYSTEMS[0]!;

  return (
    <div className="flex w-full flex-col items-center">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Proyector holográfico: ${ship.name}`}
        className="block h-auto w-full max-w-[360px]"
        style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
      />
      <div className="mt-1 flex flex-col items-center gap-2.5">
        <p
          className={`font-arcade animate-pulse text-center text-[8px] uppercase leading-relaxed tracking-[0.12em] ${active.tone}`}
        >
          {`[SISTEMA: ${active.label}]`}
        </p>
        <div className="flex gap-1.5" aria-hidden="true">
          {SYSTEMS.map((s, i) => (
            <span
              key={s.id}
              className={`h-1 w-7 transition-colors duration-300 ${
                i === system ? "bg-cyan-300 shadow-[0_0_8px_#00f0ff]" : "bg-white/15"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}