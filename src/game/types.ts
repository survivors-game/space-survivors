 import type { Poolable } from "./pool";
import type { EnemyDef } from "./data/enemies";
import type { BossDef } from "./data/bosses";
import type { WeaponDef } from "./data/weapons";
import type { ShipDef } from "./data/ships";

export interface Enemy extends Poolable {
  uid: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  dmg: number;
  speed: number;
  radius: number;
  def: EnemyDef;
  boss: BossDef | null;
  elite: boolean;
  hitFlash: number;
  knockX: number;
  knockY: number;
  t: number;
  aiT: number;
  aiState: number;
  aiN: number;
  tx: number;
  ty: number;
  shootCD: number;
  slow: number;
  contactCD: number;
  droneCD: number;
  phase: number;
  shield: number;
  shieldMax: number;
  parentUid: number;
  orbitA: number;
  dying: number;
  turretA: number[];
}

export type ProjKind = "laser" | "spread" | "missile" | "plasma" | "drone" | "bomblet";

export interface Projectile extends Poolable {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  life: number;
  maxLife: number;
  radius: number;
  kind: ProjKind;
  color: string;
  pierce: number;
  hits: Set<number>;
  target: Enemy | null;
  targetUid: number;
  aoe: number;
  turn: number;
  speed: number;
  evolved: boolean;
  trailT: number;
}

export type EProjKind = "orb" | "bolt" | "bomb" | "missile" | "big";

export interface EnemyProjectile extends Poolable {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dmg: number;
  life: number;
  maxLife: number;
  radius: number;
  kind: EProjKind;
  color: string;
  tx: number;
  ty: number;
  aoe: number;
  t: number;
}

export interface Particle extends Poolable {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  drag: number;
  add: boolean;
  kind: 0 | 1 | 2; // 0 square, 1 streak, 2 ring
  grow: number;
}

export interface Gem extends Poolable {
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  tier: 0 | 1 | 2 | 3;
  bobT: number;
  pulled: boolean;
}

export type PickupKind = "repair" | "magnet" | "emp";
export interface Pickup extends Poolable {
  x: number;
  y: number;
  kind: PickupKind;
  t: number;
}

export interface DmgNumber extends Poolable {
  x: number;
  y: number;
  vy: number;
  life: number;
  value: number;
  crit: boolean;
  color: string;
}

export interface Hazard {
  kind: "circle" | "line" | "ring";
  x: number;
  y: number;
  x2: number;
  y2: number;
  r: number;
  w: number;
  warn: number;
  dur: number;
  t: number;
  dmg: number;
  color: string;
  hitsEnemies: boolean;
  hitPlayer: boolean;
  tick: number;
  meteor: boolean;
}

export interface Obstacle {
  x: number;
  y: number;
  r: number;
  rot: number;
  spin: number;
  sprite: string;
  scale: number;
}

export interface WeaponState {
  def: WeaponDef;
  level: number;
  timer: number;
  evolved: boolean;
  t: number;
  angle: number;
  aux: number;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  facingX: number;
  facingY: number;
  hp: number;
  maxHp: number;
  shield: number;
  shieldMax: number;
  shieldDelay: number;
  shieldRegen: number;
  level: number;
  xp: number;
  xpToNext: number;
  speed: number;
  pickupRadius: number;
  dmgMult: number;
  cdMult: number;
  xpMult: number;
  critChance: number;
  regen: number;
  armor: number;
  iframe: number;
  boostT: number;
  boostCD: number;
  boostCDMax: number;
  weapons: WeaponState[];
  passives: Record<string, number>;
  ship: ShipDef;
  hitT: number;
  fireFlash: number;
  slowT: number;
  rerolls: number;
  radius: number;
}

export interface Ring {
  x: number;
  y: number;
  r: number;
  maxR: number;
  dmg: number;
  color: string;
  life: number;
  maxLife: number;
  hit: Set<number>;
  delay: number;
}

export interface LineFx {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  life: number;
  maxLife: number;
  width: number;
  jag: number;
}

export type ChoiceKind = "weapon-new" | "weapon-up" | "passive" | "evolve" | "heal" | "credits";
export interface UpgradeChoice {
  kind: ChoiceKind;
  id: string;
  name: string;
  desc: string;
  icon: string;
  level: number; // level after picking (1-based) or stacks
  maxLevel: number;
  color: string;
  tag: string;
}

export interface RunResult {
  victory: boolean;
  finalBossDefeated: boolean;
  stageId: string;
  shipId: string;
  time: number;
  duration: number;
  kills: number;
  killsByType: Record<string, number>;
  bossesDefeated: string[];
  level: number;
  damageDealt: number;
  damageTaken: number;
  energy: number;
  evolutions: number;
  weapons: { id: string; level: number; evolved: boolean }[];
  maxPhase: number;
  credits: number;
}

export interface HudState {
  hp: number;
  maxHp: number;
  shield: number;
  shieldMax: number;
  xp: number;
  xpToNext: number;
  level: number;
  time: number;
  duration: number;
  kills: number;
  phase: number;
  phaseName: string;
  boostReady: number; // 0..1
  boss: {
    name: string;
    hp: number;
    maxHp: number;
    shield: number;
    shieldMax: number;
    phase: number;
  } | null;
  weapons: { id: string; icon: string; level: number; max: number; evolved: boolean }[];
  passives: { id: string; icon: string; stacks: number }[];
  hordeNotice: { horde: number; remaining: number } | null;
  banner: {
    title: string;
    sub: string;
    tone: "info" | "alert" | "good" | "warn";
    t: number;
  } | null;
  credits: number;
}