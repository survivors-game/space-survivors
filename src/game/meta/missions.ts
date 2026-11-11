// Centro de operaciones de temporada: misiones diarias, semanales, desafíos mayores
// y el Pase de Temporada de 20 niveles. Todo el cálculo de qué misiones están activas
// es determinístico a partir de la fecha UTC, así que cada piloto ve el mismo conjunto.
import type { RunResult } from "../types";
import type { Progress } from "./progress";

export type MissionPeriod = "DAILY" | "WEEKLY" | "SEASON";
export type MissionTier = "BASIC" | "PILOT" | "ELITE";
export type MissionIcon =
  | "target"
  | "zap"
  | "skull"
  | "shield"
  | "flame"
  | "clock"
  | "wrench"
  | "crown"
  | "radar"
  | "cpu"
  | "crosshair";

export interface SeasonRewardNode {
  level: number;
  requiredPt: number;
  freeReward: { type: "CR" | "OBS" | "TITLE"; amount: number; label: string };
  vipReward: { type: "CR" | "OBS" | "SKIN" | "TITLE"; amount: number; label: string };
}

/**
 * Plantilla de misión basada en partidas. Diarias y semanales comparten la misma forma:
 * `progress` extrae el aporte de UNA partida y `agg` decide si se suma o se toma el máximo.
 */
export interface RunMissionTemplate {
  id: string;
  title: string;
  desc: string;
  icon: MissionIcon;
  /** Solo las diarias tienen tier; las semanales son "pesadas" y no lo usan. */
  tier: MissionTier | null;
  agg: "sum" | "max";
  goal: number;
  /** Créditos (CR) al reclamar. */
  reward: number;
  /** Puntos de Temporada (PT) al reclamar. */
  pt: number;
  progress: (r: RunResult) => number;
}

/** Desafío mayor de temporada: usa estadísticas de vida del piloto, no de una sola partida. */
export interface SeasonChallengeTemplate {
  id: string;
  title: string;
  desc: string;
  icon: MissionIcon;
  goal: number;
  reward: number;
  pt: number;
  progress: (p: Progress, base: SeasonBaseline) => number;
}

export const SEASON_MAX_LEVEL = 20;

/** Cada temporada dura 30 días exactos (UTC). Inicio de la temporada 1. */
export const SEASON_LENGTH_MS = 30 * 86_400_000;
export const SEASON_START_MS = Date.UTC(2026, 10, 9);

/** Índice de temporada (empieza en S01). Cambia solo con la fecha de inicio. */
export function getSeasonId(now: number = Date.now()): string {
  const index = Math.max(0, Math.floor((now - SEASON_START_MS) / SEASON_LENGTH_MS));
  return `S${String(index + 1).padStart(2, "0")}`;
}

export function getSeasonName(now: number = Date.now()): string {
  return `TEMPORADA ${getSeasonId(now).slice(1)}`;
}

/** Estadísticas de vida al inicio de la temporada. Los desafíos miden desde aquí. */
export interface SeasonBaseline {
  kills: number;
  wins: number;
  bossKills: Record<string, number>;
  ships: string[];
  weaponsUsed: string[];
}

export const DAILY_TIERS: readonly MissionTier[] = ["BASIC", "PILOT", "ELITE"];
export const DAILY_PER_TIER: Record<MissionTier, number> = { BASIC: 2, PILOT: 2, ELITE: 1 };
export const DAILY_MISSION_COUNT = 5;
export const WEEKLY_PICK_COUNT = 15;

/** Cofre diario: se desbloquea al reclamar 4 de las 5 misiones diarias. */
export const DAILY_CHEST = {
  id: "CHEST",
  threshold: 4,
  reward: 10,
  pt: 10,
} as const;

const bossHit = (id: string) => (r: RunResult) => (r.bossesDefeated.includes(id) ? 1 : 0);

/* ---------------- 12 plantillas diarias (4 por tier, se eligen 2 por tier cada día) ---------------- */
export const DAILY_MISSION_TEMPLATES: RunMissionTemplate[] = [
  {
    id: "d_basic_runs",
    title: "PATRULLA DE REFUERZO",
    desc: "Completa 1 misión",
    icon: "target",
    tier: "BASIC",
    agg: "sum",
    goal: 2,
    reward: 4,
    pt: 3,
    progress: () => 1,
  },
  {
    id: "d_basic_kills",
    title: "BARRIDO DE CHATARRA",
    desc: "Destruye 60 naves enemigas",
    icon: "crosshair",
    tier: "BASIC",
    agg: "sum",
    goal: 300,
    reward: 4,
    pt: 3,
    progress: (r) => r.kills,
  },
  {
    id: "d_basic_survive",
    title: "CONTROL DE PERÍMETRO",
    desc: "Sobrevive 10 minutos en una sola partida",
    icon: "clock",
    tier: "BASIC",
    agg: "max",
    goal: 600,
    reward: 4,
    pt: 3,
    progress: (r) => r.time,
  },
  {
    id: "d_basic_level",
    title: "ESCALADA INICIAL",
    desc: "Alcanza el nivel 20 en una partida",
    icon: "zap",
    tier: "BASIC",
    agg: "max",
    goal: 20,
    reward: 4,
    pt: 3,
    progress: (r) => r.level,
  },
  {
    id: "d_pilot_kills",
    title: "ESCUADRÓN ACTIVO",
    desc: "Destruye 180 naves enemigas",
    icon: "crosshair",
    tier: "PILOT",
    agg: "sum",
    goal: 800,
    reward: 6,
    pt: 5,
    progress: (r) => r.kills,
  },
  {
    id: "d_pilot_win",
    title: "SUPERVIVIENTE DEL DÍA",
    desc: "Gana 2 misiones",
    icon: "shield",
    tier: "PILOT",
    agg: "sum",
    goal: 2,
    reward: 7,
    pt: 6,
    progress: (r) => (r.victory ? 1 : 0),
  },
  {
    id: "d_pilot_damage",
    title: "SOBRECARGA",
    desc: "Inflige 150.000 de daño en total",
    icon: "flame",
    tier: "PILOT",
    agg: "sum",
    goal: 150000,
    reward: 6,
    pt: 5,
    progress: (r) => Math.round(r.damageDealt),
  },
  {
    id: "d_pilot_runs",
    title: "DOBLE TURNO",
    desc: "Completa 4 misiones",
    icon: "radar",
    tier: "PILOT",
    agg: "sum",
    goal: 4,
    reward: 6,
    pt: 5,
    progress: () => 1,
  },
  {
    id: "d_elite_boss",
    title: "CAZADOR DE JEFES",
    desc: "Derrota 2 jefes",
    icon: "skull",
    tier: "ELITE",
    agg: "sum",
    goal: 2,
    reward: 10,
    pt: 8,
    progress: (r) => r.bossesDefeated.length,
  },
  {
    id: "d_elite_evo",
    title: "INGENIERO DE CAMPO",
    desc: "Consigue 5 evoluciones de arma",
    icon: "wrench",
    tier: "ELITE",
    agg: "sum",
    goal: 5,
    reward: 9,
    pt: 8,
    progress: (r) => r.evolutions,
  },
  {
    id: "d_elite_lvl20",
    title: "ALTA PRESIÓN",
    desc: "Alcanza el nivel 30 en una partida",
    icon: "cpu",
    tier: "ELITE",
    agg: "max",
    goal: 30,
    reward: 9,
    pt: 8,
    progress: (r) => r.level,
  },
  {
    id: "d_elite_win_ash",
    title: "DOMINIO DE CENIZA",
    desc: "Gana 2 misiones en el Cinturón de Ceniza",
    icon: "crown",
    tier: "ELITE",
    agg: "sum",
    goal: 2,
    reward: 10,
    pt: 8,
    progress: (r) => (r.victory && r.stageId === "ash" ? 1 : 0),
  },
];

/* ---------------- 12 plantillas semanales (se eligen 8 cada semana) ---------------- */
export const WEEKLY_MISSION_TEMPLATES: RunMissionTemplate[] = [
  {
    id: "w_time",
    title: "MARATÓN SEMANAL",
    desc: "Acumula 120 minutos de combate",
    icon: "clock",
    tier: null,
    agg: "sum",
    goal: 7200,
    reward: 25,
    pt: 16,
    progress: (r) => r.time,
  },
  {
    id: "w_kills",
    title: "EXTERMINIO MASIVO",
    desc: "Destruye 5.000 naves enemigas",
    icon: "crosshair",
    tier: null,
    agg: "sum",
    goal: 5000,
    reward: 30,
    pt: 18,
    progress: (r) => r.kills,
  },
  {
    id: "w_bosses",
    title: "CAZA DE BESTIAS",
    desc: "Derrota 5 jefes",
    icon: "skull",
    tier: null,
    agg: "sum",
    goal: 5,
    reward: 35,
    pt: 20,
    progress: (r) => r.bossesDefeated.length,
  },
  {
    id: "w_wins",
    title: "MISIÓN PERFECTA",
    desc: "Gana 8 misiones",
    icon: "shield",
    tier: null,
    agg: "sum",
    goal: 8,
    reward: 30,
    pt: 18,
    progress: (r) => (r.victory ? 1 : 0),
  },
  {
    id: "w_evo",
    title: "INGENIERÍA AVANZADA",
    desc: "Consigue 10 evoluciones de arma",
    icon: "wrench",
    tier: null,
    agg: "sum",
    goal: 10,
    reward: 25,
    pt: 16,
    progress: (r) => r.evolutions,
  },
  {
    id: "w_damage",
    title: "NÚCLEO DE DAÑO",
    desc: "Inflige 1.000.000 de daño en total",
    icon: "flame",
    tier: null,
    agg: "sum",
    goal: 1000000,
    reward: 30,
    pt: 18,
    progress: (r) => Math.round(r.damageDealt),
  },
  {
    id: "w_runs",
    title: "PILOTO DE RESISTENCIA",
    desc: "Completa 20 misiones",
    icon: "radar",
    tier: null,
    agg: "sum",
    goal: 20,
    reward: 25,
    pt: 16,
    progress: () => 1,
  },
  {
    id: "w_level",
    title: "ESCALADA",
    desc: "Alcanza el nivel 35 en una partida",
    icon: "cpu",
    tier: null,
    agg: "max",
    goal: 35,
    reward: 25,
    pt: 16,
    progress: (r) => r.level,
  },
  {
    id: "w_nemesis",
    title: "NÉMESIS EN LA MIRA",
    desc: "Derrota a NÉMESIS",
    icon: "skull",
    tier: null,
    agg: "sum",
    goal: 1,
    reward: 30,
    pt: 18,
    progress: bossHit("nemesis"),
  },
  {
    id: "w_colossus",
    title: "COLOSO CAÍDO",
    desc: "Derrota al COLOSO",
    icon: "skull",
    tier: null,
    agg: "sum",
    goal: 1,
    reward: 30,
    pt: 18,
    progress: bossHit("colossus"),
  },
  {
    id: "w_leviathan",
    title: "SEÑAL DEL LEVIATÁN",
    desc: "Derrota al LEVIATÁN 3 veces",
    icon: "skull",
    tier: null,
    agg: "sum",
    goal: 3,
    reward: 30,
    pt: 18,
    progress: bossHit("leviathan"),
  },
  {
    id: "w_survive",
    title: "CENIZA ETERNA",
    desc: "Sobrevive 30 minutos en una sola partida",
    icon: "clock",
    tier: null,
    agg: "max",
    goal: 1800,
    reward: 30,
    pt: 18,
    progress: (r) => r.time,
  },
  {
    id: "w_damage_taken",
    title: "BLINDAJE BAJO PRESIÓN",
    desc: "Recibe 20.000 de daño y completa la misión",
    icon: "shield",
    tier: null,
    agg: "sum",
    goal: 20000,
    reward: 25,
    pt: 16,
    progress: (r) => Math.round(r.damageTaken),
  },
  {
    id: "w_ash_wins",
    title: "DOMINIO DEL CINTURÓN",
    desc: "Gana 5 misiones en el Cinturón de Ceniza",
    icon: "crown",
    tier: null,
    agg: "sum",
    goal: 5,
    reward: 30,
    pt: 18,
    progress: (r) => (r.victory && r.stageId === "ash" ? 1 : 0),
  },
  {
    id: "w_arsenal",
    title: "ARSENAL DE CAMPAÑA",
    desc: "Consigue 15 evoluciones de arma",
    icon: "wrench",
    tier: null,
    agg: "sum",
    goal: 15,
    reward: 30,
    pt: 18,
    progress: (r) => r.evolutions,
  }
];

/* ---------------- 8 desafíos mayores de temporada (acumulativos de vida) ---------------- */
export const SEASON_CHALLENGES: SeasonChallengeTemplate[] = [
  {
    id: "s_kills_500",
    title: "CHATARRA ACUMULADA",
    desc: "Destruye 3.000 naves enemigas durante la temporada",
    icon: "crosshair",
    goal: 3000,
    reward: 40,
    pt: 25,
    progress: (p, b) => Math.max(0, p.stats.kills - b.kills),
  },
  {
    id: "s_kills_5000",
    title: "EXTERMINADOR",
    desc: "Destruye 15.000 naves enemigas durante la temporada",
    icon: "crosshair",
    goal: 15000,
    reward: 80,
    pt: 40,
    progress: (p, b) => Math.max(0, p.stats.kills - b.kills),
  },
  {
    id: "s_leviathan",
    title: "CAZA AL LEVIATÁN",
    desc: "Derrota a LEVIATÁN 2 veces durante la temporada",
    icon: "skull",
    goal: 2,
    reward: 60,
    pt: 30,
    progress: (p, b) =>
      Math.max(0, (p.stats.bossKills["leviathan"] ?? 0) - (b.bossKills["leviathan"] ?? 0)),
  },
  {
    id: "s_nemesis",
    title: "NÉMESIS CAÍDA",
    desc: "Derrota a NÉMESIS 2 veces durante la temporada",
    icon: "skull",
    goal: 2,
    reward: 70,
    pt: 35,
    progress: (p, b) =>
      Math.max(0, (p.stats.bossKills["nemesis"] ?? 0) - (b.bossKills["nemesis"] ?? 0)),
  },
  {
    id: "s_colossus",
    title: "COLOSO DERRIBADO",
    desc: "Derrota al COLOSO 2 veces durante la temporada",
    icon: "skull",
    goal: 2,
    reward: 70,
    pt: 35,
    progress: (p, b) =>
      Math.max(0, (p.stats.bossKills["colossus"] ?? 0) - (b.bossKills["colossus"] ?? 0)),
  },
  {
    id: "s_fleet",
    title: "FLOTA COMPLETA",
    desc: "Desbloquea 3 naves durante la temporada",
    icon: "shield",
    goal: 3,
    reward: 60,
    pt: 30,
    progress: (p, b) => p.ships.filter((id) => !b.ships.includes(id)).length,
  },
  {
    id: "s_arsenal",
    title: "ARSENAL",
    desc: "Utiliza 9 armas diferentes durante la temporada",
    icon: "zap",
    goal: 9,
    reward: 50,
    pt: 25,
    progress: (p, b) => p.weaponsUsed.filter((id) => !b.weaponsUsed.includes(id)).length,
  },
  {
    id: "s_wins",
    title: "VETERANO DE GUERRA",
    desc: "Gana 20 misiones durante la temporada",
    icon: "crown",
    goal: 20,
    reward: 80,
    pt: 40,
    progress: (p, b) => Math.max(0, p.stats.wins - b.wins),
  },
];

/* ---------------- Pase de Temporada: 20 niveles ---------------- */
// requiredPt es el PT acumulado necesario para alcanzar cada nivel.
const LEVEL_REQUIRED_PT = [
  0, 30, 70, 120, 180, 250, 330, 420, 530, 650, 780, 920, 1070, 1230, 1400, 1580, 1770, 1970,
  2180, 2350,
] as const;

const FREE_REWARDS: SeasonRewardNode["freeReward"][] = [
  { type: "CR", amount: 10, label: "10 CR" },
  { type: "CR", amount: 8, label: "8 CR" },
  { type: "TITLE", amount: 1, label: "Insignia: Recluta" },
  { type: "CR", amount: 12, label: "12 CR" },
  { type: "CR", amount: 16, label: "16 CR" },
  { type: "TITLE", amount: 1, label: "Insignia: Escolta" },
  { type: "CR", amount: 20, label: "20 CR" },
  { type: "CR", amount: 22, label: "22 CR" },
  { type: "CR", amount: 26, label: "26 CR" },
  { type: "TITLE", amount: 1, label: "Insignia: Vanguardia" },
  { type: "CR", amount: 30, label: "30 CR" },
  { type: "CR", amount: 34, label: "34 CR" },
  { type: "CR", amount: 38, label: "38 CR" },
  { type: "TITLE", amount: 1, label: "Insignia: Centinela" },
  { type: "CR", amount: 44, label: "44 CR" },
  { type: "CR", amount: 50, label: "50 CR" },
  { type: "CR", amount: 56, label: "56 CR" },
  { type: "TITLE", amount: 1, label: "Insignia: Cazador Estelar" },
  { type: "CR", amount: 64, label: "64 CR" },
  { type: "CR", amount: 80, label: "80 CR · Gran premio" },
];

const VIP_REWARDS: SeasonRewardNode["vipReward"][] = [
  { type: "CR", amount: 20, label: "20 CR" },
  { type: "SKIN", amount: 1, label: "Pintura: Ceniza Cromada" },
  { type: "CR", amount: 24, label: "24 CR" },
  { type: "CR", amount: 28, label: "28 CR" },
  { type: "SKIN", amount: 1, label: "Estela: Plasma Ámbar" },
  { type: "CR", amount: 34, label: "34 CR" },
  { type: "CR", amount: 40, label: "40 CR" },
  { type: "CR", amount: 46, label: "46 CR" },
  { type: "SKIN", amount: 1, label: "Pintura: Neón Nocturno" },
  { type: "TITLE", amount: 1, label: "Título: Ala Dorada" },
  { type: "CR", amount: 54, label: "54 CR" },
  { type: "CR", amount: 60, label: "60 CR" },
  { type: "CR", amount: 68, label: "68 CR" },
  { type: "SKIN", amount: 1, label: "Escudo: Halo Violeta" },
  { type: "CR", amount: 76, label: "76 CR" },
  { type: "CR", amount: 84, label: "84 CR" },
  { type: "CR", amount: 92, label: "92 CR" },
  { type: "SKIN", amount: 1, label: "Pintura: Eclipse Dorado" },
  { type: "CR", amount: 104, label: "104 CR" },
  { type: "TITLE", amount: 1, label: "Título: Comandante Supremo" },
];

export const SEASON_LEVELS: SeasonRewardNode[] = LEVEL_REQUIRED_PT.map((requiredPt, index) => ({
  level: index + 1,
  requiredPt,
  freeReward: FREE_REWARDS[index]!,
  vipReward: VIP_REWARDS[index]!,
}));

/** Nivel de temporada (1..20) alcanzado con el PT dado. */
export function seasonLevelFor(pt: number): number {
  let level = 1;
  for (const node of SEASON_LEVELS) if (pt >= node.requiredPt) level = node.level;
  return level;
}

export interface SeasonBarInfo {
  level: number;
  /** PT acumulado al que empieza el nivel actual. */
  floorPt: number;
  /** PT para el siguiente nivel, o null si ya está en el máximo. */
  nextPt: number | null;
  /** 0..1 dentro del tramo del nivel actual. */
  fraction: number;
}

export function getSeasonBarInfo(pt: number): SeasonBarInfo {
  const level = seasonLevelFor(pt);
  const node = SEASON_LEVELS[level - 1]!;
  const next = SEASON_LEVELS[level] ?? null;
  if (!next) return { level, floorPt: node.requiredPt, nextPt: null, fraction: 1 };
  const span = next.requiredPt - node.requiredPt;
  const fraction = Math.min(1, Math.max(0, (pt - node.requiredPt) / span));
  return { level, floorPt: node.requiredPt, nextPt: next.requiredPt, fraction };
}

/* ---------------- Calendario UTC ---------------- */

/** Fecha UTC "YYYY-MM-DD". Es la clave del reinicio diario. */
export function getUtcDateStr(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Lunes UTC de la semana actual "YYYY-MM-DD". Es la clave del reinicio semanal. */
export function getUtcWeekStr(now: number = Date.now()): string {
  const d = new Date(now);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday))
    .toISOString()
    .slice(0, 10);
}

/** Milisegundos hasta el próximo reinicio diario (medianoche UTC). */
export function getDailyTimeRemaining(now: number = Date.now()): number {
  const d = new Date(now);
  const nextMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(0, nextMidnight - now);
}

/** Milisegundos hasta el próximo reinicio semanal (lunes 00:00 UTC). */
export function getWeeklyTimeRemaining(now: number = Date.now()): number {
  const d = new Date(now);
  const daysAhead = (1 - d.getUTCDay() + 7) % 7 || 7;
  const nextMonday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysAhead);
  return Math.max(0, nextMonday - now);
}

/* ---------------- Selección determinística ---------------- */
function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const rnd = mulberry32(hashString(seed));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Las 5 misiones diarias: 2 básicas, 2 de piloto y 1 de élite. */
export function getActiveDailyMissions(dateStr: string): RunMissionTemplate[] {
  return DAILY_TIERS.flatMap((tier) =>
    seededShuffle(
      DAILY_MISSION_TEMPLATES.filter((m) => m.tier === tier),
      `DAILY:${dateStr}:${tier}`,
    ).slice(0, DAILY_PER_TIER[tier]),
  );
}

/** Las 15 misiones semanales de la semana UTC dada (lunes "YYYY-MM-DD"). */
export function getActiveWeeklyMissions(weekStr: string): RunMissionTemplate[] {
  return seededShuffle(WEEKLY_MISSION_TEMPLATES, `WEEKLY:${weekStr}`).slice(0, WEEKLY_PICK_COUNT);
}
