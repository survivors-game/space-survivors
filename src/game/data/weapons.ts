// Weapon definitions (template section 9, expanded). Each weapon has 5 levels
// and an evolution unlocked at max level when its paired passive is owned.
import type { Engine } from "../engine";
import type { Player, WeaponState } from "../types";
import { Audio } from "../audio";
import { TAU, rand } from "../utils";

export interface WL {
  cd: number;
  dmg: number;
  count: number;
  speed: number;
  pierce: number;
  radius: number;
  area: number;
  range: number;
  life: number;
  tick: number;
  spin: number;
  slow: number;
  cap: number;
  regen: number;
  delay: number;
}

const D: WL = { cd: 1, dmg: 10, count: 1, speed: 600, pierce: 0, radius: 4, area: 0, range: 600, life: 1, tick: 0.5, spin: 2, slow: 0, cap: 0, regen: 0, delay: 3 };
const L = (p: Partial<WL>): WL => ({ ...D, ...p });

export interface WeaponDef {
  id: string;
  name: string;
  icon: string;
  color: string;
  desc: string;
  kind: "ARMA" | "MÓDULO";
  levels: WL[];
  evo: { passive: string; name: string; desc: string };
  levelText: (l: WL) => string;
  fire?: (g: Engine, w: WeaponState, l: WL) => void;
  update?: (g: Engine, w: WeaponState, l: WL, dt: number) => void;
}

function aimAt(g: Engine, p: Player, range: number): number {
  const t = g.nearestEnemy(p.x, p.y, range);
  return t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(p.facingY, p.facingX);
}

export function dronePos(p: Player, w: WeaponState, l: WL, i: number, count: number) {
  const a = w.angle + (i * TAU) / count;
  return { x: p.x + Math.cos(a) * l.radius, y: p.y + Math.sin(a) * l.radius * 0.85, a };
}

export function droneCount(w: WeaponState, l: WL) {
  return l.count + (w.evolved ? 2 : 0);
}

export function fieldRadius(w: WeaponState, l: WL) {
  return l.radius * (w.evolved ? 1.35 : 1);
}

export const WEAPONS: WeaponDef[] = [
  {
    id: "laser",
    name: "LÁSER DE PULSO",
    icon: "ic_laser",
    color: "#25f4ff",
    kind: "ARMA",
    desc: "Disparo automático de alta cadencia hacia el enemigo más cercano.",
    levels: [
      L({ cd: 0.38, dmg: 14, count: 2, speed: 820, pierce: 1, life: 0.95 }),
      L({ cd: 0.34, dmg: 16, count: 2, speed: 850, pierce: 1, life: 1.0 }),
      L({ cd: 0.30, dmg: 18, count: 3, speed: 870, pierce: 2, life: 1.0 }),
      L({ cd: 0.26, dmg: 22, count: 3, speed: 900, pierce: 2, life: 1.05 }),
      L({ cd: 0.22, dmg: 26, count: 4, speed: 920, pierce: 3, life: 1.1 }),
    ],
    evo: { passive: "damage", name: "LANZA FOTÓNICA", desc: "Cada ráfaga añade un rayo continuo que atraviesa todo." },
    levelText: (l) => `${l.count} haz · ${l.dmg} daño · perfora ${l.pierce}`,
    fire(g, w, l) {
      const p = g.player;
      const a = aimAt(g, p, 760);
      for (let i = 0; i < l.count; i++) {
        const off = (i - (l.count - 1) / 2) * 0.08;
        const gun = p.ship.guns[i % p.ship.guns.length]!;
        const gp = g.localToWorld(gun.x, gun.y);
        g.fireProj("laser", gp.x, gp.y, a + off, l.speed, l.dmg * p.dmgMult, { radius: 4, pierce: l.pierce, life: l.life, color: "#25f4ff" });
      }
      if (w.evolved) {
        const len = 950;
        g.beamDamage(p.x, p.y, p.x + Math.cos(a) * len, p.y + Math.sin(a) * len, 12, l.dmg * 1.6 * p.dmgMult);
        g.addLine(p.x, p.y, p.x + Math.cos(a) * len, p.y + Math.sin(a) * len, "#9ff6ff", 10, 0.16, 0);
      }
      p.fireFlash = 0.06;
      Audio.SFX.laser();
    },
  },
  {
    id: "spread",
    name: "CAÑÓN DE RÁFAGA",
    icon: "ic_spread",
    color: "#ffd23f",
    kind: "ARMA",
    desc: "Abanico de proyectiles a corta distancia. Devastador en el cuerpo a cuerpo.",
    levels: [
      L({ cd: 1.15, dmg: 7, count: 3, area: 0.5, speed: 620, life: 0.45 }),
      L({ cd: 1.05, dmg: 8, count: 4, area: 0.6, speed: 640, life: 0.48 }),
      L({ cd: 1.0, dmg: 10, count: 5, area: 0.7, speed: 660, life: 0.5, pierce: 1 }),
      L({ cd: 0.92, dmg: 12, count: 6, area: 0.8, speed: 680, life: 0.52, pierce: 1 }),
      L({ cd: 0.85, dmg: 14, count: 7, area: 0.9, speed: 700, life: 0.55, pierce: 2 }),
    ],
    evo: { passive: "crit", name: "TORMENTA DE AGUJAS", desc: "Dispara abanicos delante y detrás con +2 proyectiles." },
    levelText: (l) => `${l.count} proyectiles · ${l.dmg} daño`,
    fire(g, w, l) {
      const p = g.player;
      const base = aimAt(g, p, 520);
      const n = l.count + (w.evolved ? 2 : 0);
      const dirs = w.evolved ? [base, base + Math.PI] : [base];
      for (const b of dirs) {
        for (let i = 0; i < n; i++) {
          const a = b + (i - (n - 1) / 2) * (l.area / (n - 1 || 1));
          g.fireProj("spread", p.x, p.y, a, l.speed * rand(0.92, 1.08), l.dmg * p.dmgMult, { radius: 4, pierce: l.pierce, life: l.life, color: "#ffd23f" });
        }
      }
      p.fireFlash = 0.06;
      Audio.SFX.spread();
    },
  },
  {
    id: "missile",
    name: "MISILES GUIADOS",
    icon: "ic_missile",
    color: "#ff2d55",
    kind: "ARMA",
    desc: "Misiles que persiguen objetivos y explotan con daño en área.",
    levels: [
      L({ cd: 1.6, dmg: 18, count: 1, speed: 360, area: 60, life: 2.6, spin: 5 }),
      L({ cd: 1.45, dmg: 22, count: 2, speed: 380, area: 65, life: 2.6, spin: 5.5 }),
      L({ cd: 1.3, dmg: 27, count: 2, speed: 400, area: 72, life: 2.8, spin: 6 }),
      L({ cd: 1.15, dmg: 33, count: 3, speed: 420, area: 80, life: 2.8, spin: 6.5 }),
      L({ cd: 1.0, dmg: 40, count: 4, speed: 440, area: 90, life: 3, spin: 7 }),
    ],
    evo: { passive: "rate", name: "ENJAMBRE HIDRA", desc: "Doble de misiles y cada explosión libera 4 submuniciones." },
    levelText: (l) => `${l.count} misiles · ${l.dmg} daño · área ${l.area}`,
    fire(g, w, l) {
      const p = g.player;
      const n = l.count * (w.evolved ? 2 : 1);
      for (let i = 0; i < n; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const a = Math.atan2(p.facingY, p.facingX) + side * (Math.PI / 2 + rand(-0.3, 0.3));
        const t = g.randomEnemyNear(p.x, p.y, 700);
        g.fireProj("missile", p.x, p.y, a, l.speed * 0.6, l.dmg * p.dmgMult, {
          radius: 6, pierce: 0, life: l.life, color: "#ff2d55", aoe: l.area, turn: l.spin, targetUid: t ? t.uid : -1, evolved: w.evolved, speed: l.speed,
        });
      }
      Audio.SFX.missile();
    },
  },
  {
    id: "drones",
    name: "DRONES DE COMBATE",
    icon: "ic_drones",
    color: "#25f4ff",
    kind: "ARMA",
    desc: "Drones autónomos que orbitan tu nave, embisten y disparan por su cuenta.",
    levels: [
      L({ count: 1, cd: 0.8, dmg: 7, range: 360, radius: 70, spin: 2.2 }),
      L({ count: 2, cd: 0.72, dmg: 8, range: 380, radius: 75, spin: 2.3 }),
      L({ count: 2, cd: 0.62, dmg: 10, range: 400, radius: 82, spin: 2.4 }),
      L({ count: 3, cd: 0.56, dmg: 12, range: 420, radius: 90, spin: 2.5 }),
      L({ count: 4, cd: 0.48, dmg: 15, range: 440, radius: 96, spin: 2.6 }),
    ],
    evo: { passive: "magnet", name: "ESCUADRA ALFA", desc: "+2 drones, disparo más rápido y láseres perforantes." },
    levelText: (l) => `${l.count} drones · ${l.dmg} daño`,
    update(g, w, l, dt) {
      const p = g.player;
      w.angle += l.spin * dt;
      w.timer -= dt;
      const n = droneCount(w, l);
      const fire = w.timer <= 0;
      if (fire) w.timer = l.cd * p.cdMult * (w.evolved ? 0.6 : 1);
      for (let i = 0; i < n; i++) {
        const d = dronePos(p, w, l, i, n);
        // ramming damage
        const c = g.queryEnemies(d.x, d.y, 14);
        for (let k = 0; k < c; k++) {
          const e = g.qbuf[k]!;
          if (e.droneCD <= 0) {
            g.damageEnemy(e, l.dmg * 0.8 * p.dmgMult);
            e.droneCD = 0.35;
          }
        }
        if (fire) {
          const t = g.nearestEnemy(d.x, d.y, l.range);
          if (t) {
            const a = Math.atan2(t.y - d.y, t.x - d.x);
            g.fireProj("drone", d.x, d.y, a, 720, l.dmg * p.dmgMult, { radius: 3, pierce: w.evolved ? 2 : 0, life: 0.7, color: "#9ff6ff" });
          }
        }
      }
      if (fire) Audio.SFX.drone();
    },
  },
  {
    id: "plasma",
    name: "CAÑÓN DE PLASMA",
    icon: "ic_plasma",
    color: "#a35cff",
    kind: "ARMA",
    desc: "Esferas de plasma lentas que atraviesan filas enteras y estallan al final.",
    levels: [
      L({ cd: 2.2, dmg: 20, radius: 12, speed: 240, life: 1.6, area: 70 }),
      L({ cd: 2.0, dmg: 26, radius: 13, speed: 250, life: 1.7, area: 80 }),
      L({ cd: 1.8, dmg: 32, radius: 15, speed: 260, life: 1.8, area: 90 }),
      L({ cd: 1.6, dmg: 40, radius: 16, speed: 270, life: 1.9, area: 100 }),
      L({ cd: 1.4, dmg: 50, radius: 18, speed: 280, life: 2, area: 112 }),
    ],
    evo: { passive: "armor", name: "SINGULARIDAD", desc: "Las esferas atraen a los enemigos y su explosión crece un 50%." },
    levelText: (l) => `${l.dmg} daño · explosión ${l.area}`,
    fire(g, w, l) {
      const p = g.player;
      const a = aimAt(g, p, 700);
      g.fireProj("plasma", p.x, p.y, a, l.speed, l.dmg * p.dmgMult, {
        radius: l.radius, pierce: 999, life: l.life, color: "#a35cff", aoe: l.area * (w.evolved ? 1.5 : 1), evolved: w.evolved,
      });
      p.fireFlash = 0.08;
      Audio.SFX.plasma();
    },
  },
  {
    id: "field",
    name: "CAMPO ELÉCTRICO",
    icon: "ic_field",
    color: "#3d7bff",
    kind: "MÓDULO",
    desc: "Aura eléctrica que daña y ralentiza a todo lo que se acerca.",
    levels: [
      L({ radius: 85, dmg: 6, tick: 0.5, slow: 0.25 }),
      L({ radius: 100, dmg: 8, tick: 0.48, slow: 0.3 }),
      L({ radius: 115, dmg: 10, tick: 0.45, slow: 0.35 }),
      L({ radius: 130, dmg: 12, tick: 0.42, slow: 0.4 }),
      L({ radius: 148, dmg: 15, tick: 0.38, slow: 0.45 }),
    ],
    evo: { passive: "regen", name: "TORMENTA IÓNICA", desc: "Radio +35% y arcos que saltan entre enemigos." },
    levelText: (l) => `radio ${l.radius} · ${l.dmg} daño/pulso`,
    update(g, w, l, dt) {
      const p = g.player;
      w.timer -= dt;
      w.angle += dt * 3;
      if (w.timer > 0) return;
      w.timer = l.tick * p.cdMult;
      const r = fieldRadius(w, l);
      const n = g.queryEnemies(p.x, p.y, r);
      let arcs = 0;
      for (let i = 0; i < n; i++) {
        const e = g.qbuf[i]!;
        e.slow = Math.max(e.slow, 0.6);
        if (arcs < (w.evolved ? 6 : 3) && Math.random() < 0.6) {
          g.addLine(p.x, p.y, e.x, e.y, "#7fb2ff", 2, 0.12, 14);
          arcs++;
          if (w.evolved) {
            const t2 = g.randomEnemyNear(e.x, e.y, 140, e.uid);
            if (t2) {
              g.addLine(e.x, e.y, t2.x, t2.y, "#25f4ff", 2, 0.12, 12);
              g.damageEnemy(t2, l.dmg * 0.5 * p.dmgMult);
            }
          }
        }
        g.damageEnemy(e, l.dmg * p.dmgMult);
      }
      if (n > 0) Audio.SFX.zap();
    },
  },
  {
    id: "shield",
    name: "ESCUDO ENERGÉTICO",
    icon: "ic_shield",
    color: "#25f4ff",
    kind: "MÓDULO",
    desc: "Burbuja de energía que absorbe impactos y se recarga si no recibes daño.",
    levels: [
      L({ cap: 25, regen: 6, delay: 3 }),
      L({ cap: 40, regen: 8, delay: 2.8 }),
      L({ cap: 55, regen: 10, delay: 2.6 }),
      L({ cap: 75, regen: 13, delay: 2.4 }),
      L({ cap: 100, regen: 16, delay: 2.2 }),
    ],
    evo: { passive: "maxhp", name: "ÉGIDA", desc: "Recarga instantánea y una onda devastadora al romperse." },
    levelText: (l) => `${l.cap} escudo · ${l.regen}/s`,
  },
  {
    id: "nova",
    name: "PULSO NOVA",
    icon: "ic_nova",
    color: "#ffd23f",
    kind: "ARMA",
    desc: "Onda de choque expansiva que empuja y daña a todo a tu alrededor.",
    levels: [
      L({ cd: 3.4, dmg: 16, radius: 150 }),
      L({ cd: 3.1, dmg: 20, radius: 170 }),
      L({ cd: 2.8, dmg: 25, radius: 195 }),
      L({ cd: 2.5, dmg: 31, radius: 225 }),
      L({ cd: 2.2, dmg: 38, radius: 260 }),
    ],
    evo: { passive: "speed", name: "SUPERNOVA", desc: "Doble onda con +50% daño y +30% radio." },
    levelText: (l) => `${l.dmg} daño · radio ${l.radius}`,
    fire(g, w, l) {
      const p = g.player;
      const m = w.evolved ? 1.5 : 1;
      const r = l.radius * (w.evolved ? 1.3 : 1);
      g.addRing(p.x, p.y, r, l.dmg * m * p.dmgMult, "#ffd23f", 0);
      if (w.evolved) g.addRing(p.x, p.y, r * 1.15, l.dmg * m * p.dmgMult, "#ff8a1f", 0.25);
      Audio.SFX.explode();
    },
  },
  {
    id: "arc",
    name: "ARCO VOLTAICO",
    icon: "ic_arc",
    color: "#a35cff",
    kind: "ARMA",
    desc: "Descarga que salta en cadena entre enemigos cercanos.",
    levels: [
      L({ cd: 1.1, dmg: 10, count: 2, range: 200 }),
      L({ cd: 1.0, dmg: 12, count: 3, range: 220 }),
      L({ cd: 0.9, dmg: 15, count: 4, range: 240 }),
      L({ cd: 0.8, dmg: 19, count: 5, range: 260 }),
      L({ cd: 0.7, dmg: 24, count: 6, range: 280 }),
    ],
    evo: { passive: "xp", name: "RED NEURONAL", desc: "Doble de saltos y los objetivos quedan aturdidos." },
    levelText: (l) => `${l.count} saltos · ${l.dmg} daño`,
    fire(g, w, l) {
      const p = g.player;
      let cur = g.nearestEnemy(p.x, p.y, 520);
      if (!cur) return;
      const hit = new Set<number>();
      let fx = p.x, fy = p.y;
      const chains = l.count * (w.evolved ? 2 : 1);
      for (let i = 0; i <= chains && cur; i++) {
        hit.add(cur.uid);
        g.addLine(fx, fy, cur.x, cur.y, "#c89bff", 3, 0.18, 16);
        g.damageEnemy(cur, l.dmg * p.dmgMult);
        if (w.evolved) cur.slow = Math.max(cur.slow, 1.2);
        fx = cur.x;
        fy = cur.y;
        cur = g.randomEnemyNear(fx, fy, l.range, -1, hit);
      }
      Audio.SFX.zap();
    },
  },
];

export const weaponById = (id: string) => WEAPONS.find((w) => w.id === id);
