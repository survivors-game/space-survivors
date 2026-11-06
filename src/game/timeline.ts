 // Survival timeline. Everything is expressed in "mission minutes" (0..15) so
// shorter run lengths compress the same five phases proportionally.
export const MISSION_MINUTES = 15;

/* Hordas: la partida dura 20 minutos, dividida en 10 intervalos de 2 minutos. */
export const HORDE_COUNT = 10;
export const HORDE_INTERVAL_SEC = 120;

/* Mundo 1 (ÓRBITA NOVA): probabilidades de aparición por horda (en %, cada fila suma 100 o menos según la horda). */
export const WORLD1_ID = "nova";
export const WORLD1_HORDES: Record<string, number>[] = [
  { interceptor: 100 },
  { interceptor: 50, hunter: 50 },
  { hunter: 50, destroyer: 30, bomber: 20 },
  { hunter: 40, destroyer: 35, bomber: 25 },
  { hunter: 20, destroyer: 40, bomber: 30, parasite: 10 },
  { hunter: 15, destroyer: 35, bomber: 30, parasite: 20 },
  { hunter: 10, destroyer: 35, bomber: 30, parasite: 25 },
  { hunter: 5, destroyer: 35, bomber: 30, parasite: 30 },
  { destroyer: 35, bomber: 30, parasite: 35 },
  { destroyer: 30, bomber: 30, parasite: 40 },
];

/** Índice (0..9) del intervalo de horda en el que se encuentra el tiempo transcurrido. */
export function hordeIndexAt(elapsedSec: number) {
  return Math.min(HORDE_COUNT - 1, Math.floor(elapsedSec / HORDE_INTERVAL_SEC));
}

export interface PhaseDef {
  id: number;
  from: number;
  to: number;
  name: string;
  desc: string;
  weights: Record<string, number>;
  rate: number; // spawn-rate multiplier
  eliteChance: number;
  formationEvery: number; // seconds of mission time between formation events (0 = none)
}

export const PHASES: PhaseDef[] = [
  { id: 0, from: 0, to: 3, name: "CONTACTO", desc: "Enemigos básicos", weights: { interceptor: 72, hunter: 28 }, rate: 1, eliteChance: 0, formationEvery: 0 },
  { id: 1, from: 3, to: 6, name: "FORMACIONES", desc: "Nuevas formaciones", weights: { interceptor: 45, hunter: 35, destroyer: 20 }, rate: 1.15, eliteChance: 0.02, formationEvery: 22 },
  { id: 2, from: 6, to: 9, name: "ESPECIALISTAS", desc: "Enemigos especializados", weights: { interceptor: 24, hunter: 24, destroyer: 16, bomber: 20, parasite: 16 }, rate: 1.25, eliteChance: 0.05, formationEvery: 26 },
  { id: 3, from: 9, to: 12, name: "OFENSIVA COMBINADA", desc: "Ataques combinados", weights: { interceptor: 22, hunter: 24, destroyer: 18, bomber: 18, parasite: 18 }, rate: 1.4, eliteChance: 0.1, formationEvery: 16 },
  { id: 4, from: 12, to: 15, name: "JEFE FINAL", desc: "Enfrentamiento final", weights: { interceptor: 26, hunter: 26, destroyer: 16, bomber: 16, parasite: 16 }, rate: 0.85, eliteChance: 0.12, formationEvery: 24 },
];

export interface BossEvent {
  minute: number;
  boss: string;
  final: boolean;
}

export const BOSS_SCHEDULE: BossEvent[] = [
  { minute: 5, boss: "leviathan", final: false },
  { minute: 9, boss: "nemesis", final: false },
  { minute: 12, boss: "colossus", final: true },
];

/* Campaña, mundo 1: único jefe, LEVIATÁN, al llegar al minuto 20 (minuto 15 de la escala de misión). */
export const CAMPAIGN_FINAL_BOSSES: BossEvent[] = [{ minute: 15, boss: "leviathan", final: true }];

/* Ajustes de equilibrio del mundo 1 (solo campaña). */
export const WORLD1_MAX_ENEMIES = 60; // enemigos normales simultáneos (antes: 90)
export const WORLD1_PICKUP_CHANCE = 0.015; // probabilidad de objeto por enemigo eliminado (antes: 0,6 %)

export type FormationKind = "vee" | "ring" | "wall" | "squad" | "swarm" | "pincer";

/** Formations available per phase (combined attacks mix several families). */
export const FORMATIONS: Record<number, FormationKind[]> = {
  0: [],
  1: ["vee", "ring", "wall"],
  2: ["squad", "swarm", "vee", "ring"],
  3: ["pincer", "ring", "squad", "swarm", "wall"],
  4: ["vee", "pincer", "squad"],
};

export function toMissionMinute(elapsedSec: number, durationSec: number) {
  return (elapsedSec / Math.max(1, durationSec)) * MISSION_MINUTES;
}

export function phaseAt(minute: number): PhaseDef {
  for (const p of PHASES) if (minute < p.to) return p;
  return PHASES[PHASES.length - 1]!;
}

/** Seconds between regular spawns. Decreases over the mission. */
export function spawnInterval(minute: number, stageDifficulty: number) {
  const t = Math.min(1, minute / 12);
  const base = 0.95 + (0.17 - 0.95) * Math.pow(t, 0.8);
  return base / (phaseAt(minute).rate * (0.85 + 0.15 * stageDifficulty));
}

/** Enemy HP multiplier at a given mission minute. */
export function enemyHpScale(minute: number, stageDifficulty: number) {
  return (1 + minute * 0.38 + Math.pow(minute / 15, 2) * 1.8) * stageDifficulty;
}

export function enemyDmgScale(minute: number, stageDmg: number) {
  return (1 + minute * 0.05) * stageDmg;
}

export function xpForLevel(level: number) {
  return Math.round(5 * Math.pow(level, 1.34));
}

export function pickWeighted(weights: Record<string, number>, r = Math.random()): string {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [k, w] of entries) {
    x -= w;
    if (x <= 0) return k;
  }
  return entries[entries.length - 1]![0];
}