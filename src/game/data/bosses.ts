// The three bosses. Each has phases (HP thresholds) and its own attack loop.
import type { Engine } from "../engine";
import type { Enemy } from "../types";
import { Audio } from "../audio";
import { TAU, angDiff, rand } from "../utils";

export interface BossDef {
  id: string;
  name: string;
  title: string;
  desc: string;
  hp: number;
  dmg: number;
  speed: number;
  radius: number;
  sprite: string;
  scale: number;
  color: string;
  xp: number;
  credits: number;
  phases: number[]; // HP fractions where a new phase starts
  turrets: { x: number; y: number }[];
  engines: { x: number; y: number }[];
  attacks: string[];
  update: (g: Engine, e: Enemy, dt: number) => void;
  onPhase: (g: Engine, e: Enemy, phase: number) => void;
  onSpawn: (g: Engine, e: Enemy) => void;
}

function toward(e: Enemy, tx: number, ty: number, rate: number, dt: number) {
  const a = Math.atan2(ty - e.y, tx - e.x);
  e.angle += angDiff(e.angle, a) * Math.min(1, rate * dt);
}

function nextAttack(e: Enemy, count: number, pause: number) {
  e.aiState = (e.aiState + 1) % count;
  e.aiN = 0;
  e.shootCD = pause;
}

/* ------------------------------ LEVIATÁN ------------------------------ */
const leviathan: BossDef = {
  id: "leviathan",
  name: "LEVIATÁN",
  title: "Portanaves de asedio",
  desc: "Nave gigantesca armada con cuatro torretas, anillos de plasma y bombardeos de área. En su última fase despliega escuadrillas.",
  hp: 5200,
  dmg: 24,
  speed: 52,
  radius: 72,
  sprite: "boss_leviathan",
  scale: 4.2,
  color: "#a35cff",
  xp: 40,
  credits: 180,
  phases: [0.66, 0.33],
  turrets: [{ x: -13, y: 3 }, { x: 13, y: 3 }, { x: -6, y: -7 }, { x: 6, y: -7 }],
  engines: [{ x: -9, y: 13 }, { x: 9, y: 13 }, { x: -7.5, y: 18 }, { x: 7.5, y: 18 }, { x: 0, y: 19 }],
  attacks: ["Andanada de torretas", "Anillo de plasma", "Bombardeo de área", "Escuadrillas de interceptores"],
  onSpawn(_g, e) {
    e.turretA = [0, 0, 0, 0];
    e.shootCD = 2;
  },
  onPhase(g, e, phase) {
    g.banner(phase === 1 ? "LEVIATÁN · FASE 2" : "LEVIATÁN · FASE 3", phase === 1 ? "Anillos dobles de plasma" : "Despliegue de escuadrillas", "alert");
    e.shootCD = 1;
  },
  update(g, e, dt) {
    const p = g.player;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = e.speed * (1 + e.phase * 0.2);
    const dir = d > 340 ? 1 : d < 240 ? -0.5 : 0.15;
    e.vx = (dx / d) * sp * dir;
    e.vy = (dy / d) * sp * dir;
    toward(e, p.x, p.y, 0.5, dt);
    for (let i = 0; i < 4; i++) {
      const tp = g.bossLocal(e, this.turrets[i]!.x, this.turrets[i]!.y);
      const ta = Math.atan2(p.y - tp.y, p.x - tp.x);
      e.turretA[i] = (e.turretA[i] ?? 0) + angDiff(e.turretA[i] ?? 0, ta) * Math.min(1, 6 * dt);
    }
    e.shootCD -= dt;
    if (e.shootCD > 0) return;
    const nAtt = e.phase >= 2 ? 4 : 3;
    switch (e.aiState) {
      case 0: {
        // turret volley
        for (let i = 0; i < 4; i++) {
          if ((e.aiN + i) % 2) continue;
          const tp = g.bossLocal(e, this.turrets[i]!.x, this.turrets[i]!.y);
          g.spawnEnemyProj(tp.x, tp.y, e.turretA[i] ?? 0, 300 + e.phase * 30, 12, "bolt", "#ff6be8", 6);
        }
        Audio.SFX.bossShot();
        e.aiN++;
        e.shootCD = 0.2;
        if (e.aiN >= 8 + e.phase * 2) nextAttack(e, nAtt, 1.1);
        break;
      }
      case 1: {
        // plasma ring(s)
        const n = 22 + e.phase * 4;
        const off = e.aiN * 0.13;
        for (let i = 0; i < n; i++) g.spawnEnemyProj(e.x, e.y, off + (i * TAU) / n, 170 + e.phase * 15, 14, "orb", "#c89bff", 8);
        Audio.SFX.boss();
        e.aiN++;
        e.shootCD = 0.55;
        if (e.aiN >= 1 + e.phase) nextAttack(e, nAtt, 1.2);
        break;
      }
      case 2: {
        // area bombardment around the player
        const n = 5 + e.phase * 2;
        for (let i = 0; i < n; i++) {
          const a = rand(0, TAU), r = i === 0 ? 0 : rand(40, 230);
          g.addHazard({ kind: "circle", x: p.x + Math.cos(a) * r + p.vx * 0.5, y: p.y + Math.sin(a) * r + p.vy * 0.5, r: 72, warn: 1.15, dmg: 24, color: "#ff3df2" });
        }
        Audio.SFX.alarm();
        nextAttack(e, nAtt, 2);
        break;
      }
      case 3: {
        // hangar launch
        for (let i = 0; i < 6; i++) {
          const hp = g.bossLocal(e, (i - 2.5) * 4, 8);
          g.spawnEnemyAt("interceptor", hp.x, hp.y, { formation: e.angle + rand(-0.6, 0.6) });
        }
        nextAttack(e, nAtt, 1.2);
        break;
      }
    }
  },
};

/* ------------------------------ NÉMESIS ------------------------------ */
const nemesis: BossDef = {
  id: "nemesis",
  name: "NÉMESIS",
  title: "Caza de élite",
  desc: "Nave veloz que combina embestidas telegrafiadas, ráfagas dirigidas y espirales de proyectiles. Invoca ecos en su fase final.",
  hp: 9000,
  dmg: 28,
  speed: 170,
  radius: 46,
  sprite: "boss_nemesis",
  scale: 4,
  color: "#ff2d55",
  xp: 60,
  credits: 320,
  phases: [0.6, 0.3],
  turrets: [],
  engines: [{ x: -2, y: 13 }, { x: 2, y: 13 }, { x: 0, y: 14 }],
  attacks: ["Ráfagas dirigidas", "Embestida", "Espiral de proyectiles", "Ecos de caza"],
  onSpawn(_g, e) {
    e.shootCD = 1.5;
    e.aiT = 0;
  },
  onPhase(g, e, phase) {
    g.banner(phase === 1 ? "NÉMESIS · FASE 2" : "NÉMESIS · FASE 3", phase === 1 ? "Espirales dobles" : "Ecos de caza", "alert");
    e.aiState = 2;
    e.aiN = 0;
    e.shootCD = 0.6;
  },
  update(g, e, dt) {
    const p = g.player;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nAtt = e.phase >= 2 ? 4 : e.phase >= 1 ? 3 : 2;
    e.aiT += dt;
    if (e.aiState === 0) {
      // strafe around the player, aimed triple bursts
      const orbit = Math.atan2(-dy, -dx) + dt * 0.9;
      const R = 280;
      const tx = p.x + Math.cos(orbit) * R, ty = p.y + Math.sin(orbit) * R;
      const mx = tx - e.x, my = ty - e.y, md = Math.hypot(mx, my) || 1;
      const sp = e.speed * (1 + e.phase * 0.15);
      e.vx = (mx / md) * sp;
      e.vy = (my / md) * sp;
      toward(e, p.x, p.y, 5, dt);
      e.shootCD -= dt;
      if (e.shootCD <= 0) {
        const a = Math.atan2(dy, dx);
        const lead = Math.atan2(dy + p.vy * 0.35, dx + p.vx * 0.35);
        for (let k = -1; k <= 1; k++) g.spawnEnemyProj(e.x, e.y, (k === 0 ? lead : a) + k * 0.16, 380, 14, "bolt", "#ff7a8a", 6);
        Audio.SFX.bossShot();
        e.aiN++;
        e.shootCD = 0.55 - e.phase * 0.08;
        if (e.aiN >= 6) nextAttack(e, nAtt, 0.4);
      }
    } else if (e.aiState === 1) {
      // dash: telegraph -> charge
      if (e.aiN % 2 === 0) {
        // lock target and telegraph
        e.vx *= 0.85;
        e.vy *= 0.85;
        e.shootCD -= dt;
        if (e.shootCD <= 0) {
          const a = Math.atan2(dy, dx);
          e.tx = Math.cos(a);
          e.ty = Math.sin(a);
          e.angle = a;
          g.addHazard({ kind: "line", x: e.x, y: e.y, x2: e.x + e.tx * 760, y2: e.y + e.ty * 760, w: 70, warn: 0.6, dur: 0.0, dmg: 0, color: "#ff2d55" });
          Audio.SFX.warn();
          e.aiN++;
          e.shootCD = 0.6;
        }
      } else {
        e.shootCD -= dt;
        if (e.shootCD > 0) {
          e.vx = e.vy = 0;
        } else {
          e.vx = e.tx * 1250;
          e.vy = e.ty * 1250;
          g.bossTrail(e);
          if (e.shootCD < -0.6) {
            e.aiN++;
            e.shootCD = 0.25;
            if (e.aiN >= 2 * (1 + e.phase)) nextAttack(e, nAtt, 0.6);
          }
        }
      }
    } else if (e.aiState === 2) {
      // spiral emitters
      e.vx *= 0.9;
      e.vy *= 0.9;
      e.angle += dt * 2;
      e.shootCD -= dt;
      if (e.shootCD <= 0) {
        const arms = e.phase >= 2 ? 5 : e.phase >= 1 ? 4 : 3;
        const base = e.aiN * 0.21;
        for (let i = 0; i < arms; i++) {
          g.spawnEnemyProj(e.x, e.y, base + (i * TAU) / arms, 200, 12, "orb", "#ff2d55", 6);
          if (e.phase >= 1) g.spawnEnemyProj(e.x, e.y, -base + (i * TAU) / arms, 160, 12, "orb", "#ffb3c4", 5);
        }
        e.aiN++;
        e.shootCD = 0.085;
        if (e.aiN >= 34) nextAttack(e, nAtt, 0.8);
      }
    } else {
      // echoes: summon hunters around player
      for (let i = 0; i < 5; i++) {
        const a = (i * TAU) / 5;
        g.spawnEnemyAt("hunter", p.x + Math.cos(a) * 420, p.y + Math.sin(a) * 420, { elite: i === 0 });
      }
      g.banner("¡ECOS DE NÉMESIS!", "Cazadores de élite rodeándote", "alert");
      nextAttack(e, nAtt, 0.8);
    }
  },
};

/* ------------------------------ COLOSO ------------------------------ */
const colossus: BossDef = {
  id: "colossus",
  name: "COLOSO",
  title: "Fortaleza orbital",
  desc: "Fortaleza blindada protegida por generadores de escudo. Ondas sísmicas, rayos de barrido y salvas de misiles.",
  hp: 19000,
  dmg: 34,
  speed: 34,
  radius: 78,
  sprite: "boss_colossus",
  scale: 4,
  color: "#25f4ff",
  xp: 120,
  credits: 600,
  phases: [0.6, 0.3],
  turrets: [],
  engines: [],
  attacks: ["Onda sísmica", "Rayos de barrido", "Salva de misiles", "Anillos de defensa"],
  onSpawn(g, e) {
    e.shootCD = 2.5;
    spawnGenerators(g, e, 3);
  },
  onPhase(g, e, phase) {
    if (phase === 1) {
      spawnGenerators(g, e, 4);
      g.banner("COLOSO · FASE 2", "Escudo regenerado: destruye los generadores", "alert");
    } else {
      g.banner("COLOSO · FASE 3", "Núcleo sobrecargado", "alert");
    }
    e.shootCD = 1;
  },
  update(g, e, dt) {
    const p = g.player;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const sp = e.speed * (1 + e.phase * 0.35);
    e.vx = (dx / d) * sp * (d > 200 ? 1 : 0);
    e.vy = (dy / d) * sp * (d > 200 ? 1 : 0);
    e.angle += dt * (0.15 + e.phase * 0.1);
    e.shieldMax = 1;
    e.shield = g.countChildren(e.uid) > 0 ? 1 : 0;
    e.shootCD -= dt;
    if (e.shootCD > 0) return;
    const nAtt = e.phase >= 2 ? 4 : 3;
    switch (e.aiState) {
      case 0:
        g.addHazard({ kind: "ring", x: e.x, y: e.y, r: 620, w: 30, warn: 0.9, dur: 1.5, dmg: 26, color: "#25f4ff" });
        Audio.SFX.boss();
        g.shake(0.4);
        nextAttack(e, nAtt, 2.2 - e.phase * 0.3);
        break;
      case 1: {
        const n = e.phase >= 1 ? 5 : 3;
        const base = Math.atan2(dy, dx);
        for (let i = 0; i < n; i++) {
          const a = base + (i - (n - 1) / 2) * 0.42;
          g.addHazard({ kind: "line", x: e.x, y: e.y, x2: e.x + Math.cos(a) * 1000, y2: e.y + Math.sin(a) * 1000, w: 34, warn: 1.0, dur: 0.6, dmg: 22, color: "#ff3df2" });
        }
        Audio.SFX.alarm();
        nextAttack(e, nAtt, 2.0);
        break;
      }
      case 2: {
        const n = 6 + e.phase * 2;
        for (let i = 0; i < n; i++) g.spawnEnemyProj(e.x, e.y, (i * TAU) / n, 150, 16, "missile", "#ffd23f", 7, { life: 5 });
        Audio.SFX.missile();
        nextAttack(e, nAtt, 1.6);
        break;
      }
      case 3: {
        const n = 30;
        const off = e.aiN * 0.1;
        for (let i = 0; i < n; i++) g.spawnEnemyProj(e.x, e.y, off + (i * TAU) / n, 190, 14, "big", "#9ff6ff", 9);
        e.aiN++;
        e.shootCD = 0.4;
        if (e.aiN >= 3) nextAttack(e, nAtt, 1.4);
        break;
      }
    }
  },
};

function spawnGenerators(g: Engine, e: Enemy, n: number) {
  for (let i = 0; i < n; i++) {
    const a = (i * TAU) / n;
    const gen = g.spawnEnemyAt("generator", e.x + Math.cos(a) * 160, e.y + Math.sin(a) * 160, { parentUid: e.uid });
    if (gen) gen.orbitA = a;
  }
}

export const BOSSES: BossDef[] = [leviathan, nemesis, colossus];
export const bossById = (id: string) => BOSSES.find((b) => b.id === id) ?? BOSSES[0]!;
