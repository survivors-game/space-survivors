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
}

export const DAILY_TIERS: readonly MissionTier[] = ["BASIC", "PILOT", "ELITE"];
export const DAILY_PER_TIER = 2;
export const WEEKLY_PICK_COUNT = 8;

/** Cofre diario: se desbloquea al reclamar 5 de las 6 misiones diarias. */
export const DAILY_CHEST = {
  id: "CHEST",
  threshold: 5,
  reward: 20,
  pt: 25,
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
    goal: 1,
    reward: 5,
    pt: 5,
    progress: () => 1,
  },
  {
    id: "d_basic_kills",
    title: "BARRIDO DE CHATARRA",
    desc: "Destruye 60 naves enemigas",
    icon: "crosshair",
    tier: "BASIC",
    agg: "sum",
    goal: 60,
    reward: 5,
    pt: 5,
    progress: (r) => r.kills,
  },
  {
    id: "d_basic_survive",
    title: "CONTROL DE PERÍMETRO",
    desc: "Sobrevive 5 minutos en una sola partida",
    icon: "clock",
    tier: "BASIC",
    agg: "max",
    goal: 300,
    reward: 4,
    pt: 5,
    progress: (r) => r.time,
  },
  {
    id: "d_basic_level",
    title: "ESCALADA INICIAL",
    desc: "Alcanza el nivel 10 en una partida",
    icon: "zap",
    tier: "BASIC",
    agg: "max",
    goal: 10,
    reward: 4,
    pt: 5,
    progress: (r) => r.level,
  },
  {
    id: "d_pilot_kills",
    title: "ESCUADRÓN ACTIVO",
    desc: "Destruye 180 naves enemigas",
    icon: "crosshair",
    tier: "PILOT",
    agg: "sum",
    goal: 180,
    reward: 8,
    pt: 10,
    progress: (r) => r.kills,
  },
  {
    id: "d_pilot_win",
    title: "SUPERVIVIENTE DEL DÍA",
    desc: "Gana una misión",
    icon: "shield",
    tier: "PILOT",
    agg: "sum",
    goal: 1,
    reward: 10,
    pt: 12,
    progress: (r) => (r.victory ? 1 : 0),
  },
  {
    id: "d_pilot_damage",
    title: "SOBRECARGA",
    desc: "Inflige 25.000 de daño en total",
    icon: "flame",
    tier: "PILOT",
    agg: "sum",
    goal: 25000,
    reward: 8,
    pt: 10,
    progress: (r) => Math.round(r.damageDealt),
  },
  {
    id: "d_pilot_runs",
    title: "DOBLE TURNO",
    desc: "Completa 2 misiones",
    icon: "radar",
    tier: "PILOT",
    agg: "sum",
    goal: 2,
    reward: 7,
    pt: 10,
    progress: () => 1,
  },
  {
    id: "d_elite_boss",
    title: "CAZADOR DE JEFES",
    desc: "Derrota a un jefe",
    icon: "skull",
    tier: "ELITE",
    agg: "sum",
    goal: 1,
    reward: 16,
    pt: 15,
    progress: (r) => r.bossesDefeated.length,
  },
  {
    id: "d_elite_evo",
    title: "INGENIERO DE CAMPO",
    desc: "Consigue 2 evoluciones de arma",
    icon: "wrench",
    tier: "ELITE",
    agg: "sum",
    goal: 2,
    reward: 14,
    pt: 15,
    progress: (r) => r.evolutions,
  },
  {
    id: "d_elite_lvl20",
    title: "ALTA PRESIÓN",
    desc: "Alcanza el nivel 20 en una partida",
    icon: "cpu",
    tier: "ELITE",
    agg: "max",
    goal: 20,
    reward: 14,
    pt: 15,
    progress: (r) => r.level,
  },
  {
    id: "d_elite_win_ash",
    title: "DOMINIO DE CENIZA",
    desc: "Gana una misión en el Cinturón de Ceniza",
    icon: "crown",
    tier: "ELITE",
    agg: "sum",
    goal: 1,
    reward: 15,
    pt: 15,
    progress: (r) => (r.victory && r.stageId === "ash" ? 1 : 0),
  },
];

/* ---------------- 12 plantillas semanales (se eligen 8 cada semana) ---------------- */
export const WEEKLY_MISSION_TEMPLATES: RunMissionTemplate[] = [
  {
    id: "w_time",
    title: "MARATÓN SEMANAL",
    desc: "Acumula 60 minutos de combate",
    icon: "clock",
    tier: null,
    agg: "sum",
    goal: 3600,
    reward: 30,
    pt: 40,
    progress: (r) => r.time,
  },
  {
    id: "w_kills",
    title: "EXTERMINIO MASIVO",
    desc: "Destruye 2.000 naves enemigas",
    icon: "crosshair",
    tier: null,
    agg: "sum",
    goal: 2000,
    reward: 45,
    pt: 55,
    progress: (r) => r.kills,
  },
  {
    id: "w_bosses",
    title: "CAZA DE BESTIAS",
    desc: "Derrota 3 jefes",
    icon: "skull",
    tier: null,
    agg: "sum",
    goal: 3,
    reward: 55,
    pt: 65,
    progress: (r) => r.bossesDefeated.length,
  },
  {
    id: "w_wins",
    title: "MISIÓN PERFECTA",
    desc: "Gana 5 misiones",
    icon: "shield",
    tier: null,
    agg: "sum",
    goal: 5,
    reward: 50,
    pt: 60,
    progress: (r) => (r.victory ? 1 : 0),
  },
  {
    id: "w_evo",
    title: "INGENIERÍA AVANZADA",
    desc: "Consigue 6 evoluciones de arma",
    icon: "wrench",
    tier: null,
    agg: "sum",
    goal: 6,
    reward: 40,
    pt: 50,
    progress: (r) => r.evolutions,
  },
  {
    id: "w_damage",
    title: "NÚCLEO DE DAÑO",
    desc: "Inflige 400.000 de daño en total",
    icon: "flame",
    tier: null,
    agg: "sum",
    goal: 400000,
    reward: 45,
    pt: 50,
    progress: (r) => Math.round(r.damageDealt),
  },
  {
    id: "w_runs",
    title: "PILOTO DE RESISTENCIA",
    desc: "Completa 12 misiones",
    icon: "radar",
    tier: null,
    agg: "sum",
    goal: 12,
    reward: 30,
    pt: 40,
    progress: () => 1,
  },
  {
    id: "w_level",
    title: "ESCALADA",
    desc: "Alcanza el nivel 25 en una partida",
    icon: "cpu",
    tier: null,
    agg: "max",
    goal: 25,
    reward: 35,
    pt: 45,
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
    reward: 45,
    pt: 55,
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
    reward: 45,
    pt: 55,
    progress: bossHit("colossus"),
  },
  {
    id: "w_leviathan",
    title: "SEÑAL DEL LEVIATÁN",
    desc: "Derrota al LEVIATÁN 2 veces",
    icon: "skull",
    tier: null,
    agg: "sum",
    goal: 2,
    reward: 42,
    pt: 50,
    progress: bossHit("leviathan"),
  },
  {
    id: "w_survive",
    title: "CENIZA ETERNA",
    desc: "Sobrevive 15 minutos en una sola partida",
    icon: "clock",
    tier: null,
    agg: "max",
    goal: 900,
    reward: 45,
    pt: 55,
    progress: (r) => r.time,
  },
];

/* ---------------- 8 desafíos mayores de temporada (acumulativos de vida) ---------------- */
export const SEASON_CHALLENGES: SeasonChallengeTemplate[] = [
  {
    id: "s_kills_500",
    title: "CHATARRA ACUMULADA",
    desc: "Destruye 500 naves enemigas en total",
    icon: "crosshair",
    goal: 500,
    reward: 40,
    pt: 60,
    progress: (p, b) => Math.max(0, p.stats.kills - b.kills),
  },
  {
    id: "s_kills_5000",
    title: "EXTERMINADOR",
    desc: "Destruye 5.000 naves enemigas en total",
    icon: "crosshair",
    goal: 5000,
    reward: 120,
    pt: 150,
    progress: (p, b) => Math.max(0, p.stats.kills - b.kills),
  },
  {
    id: "s_leviathan",
    title: "CAZA AL LEVIATÁN",
    desc: "Derrota a LEVIATÁN",
    icon: "skull",
    goal: 1,
    reward: 80,
    pt: 100,
    progress: (p, b) =>
      Math.max(0, (p.stats.bossKills["leviathan"] ?? 0) - (b.bossKills["leviathan"] ?? 0)),
  },
  {
    id: "s_nemesis",
    title: "NÉMESIS CAÍDA",
    desc: "Derrota a NÉMESIS",
    icon: "skull",
    goal: 1,
    reward: 100,
    pt: 120,
    progress: (p, b) =>
      Math.max(0, (p.stats.bossKills["nemesis"] ?? 0) - (b.bossKills["nemesis"] ?? 0)),
  },
  {
    id: "s_colossus",
    title: "COLOSO DERRIBADO",
    desc: "Derrota al COLOSO",
    icon: "skull",
    goal: 1,
    reward: 120,
    pt: 140,
    progress: (p, b) =>
      Math.max(0, (p.stats.bossKills["colossus"] ?? 0) - (b.bossKills["colossus"] ?? 0)),
  },
  {
    id: "s_fleet",
    title: "FLOTA COMPLETA",
    desc: "Desbloquea las cuatro naves",
    icon: "shield",
    goal: 4,
    reward: 100,
    pt: 80,
    progress: (p) => p.ships.length,
  },
  {
    id: "s_arsenal",
    title: "ARSENAL",
    desc: "Usa las 9 armas y módulos",
    icon: "zap",
    goal: 9,
    reward: 60,
    pt: 60,
    progress: (p) => p.weaponsUsed.length,
  },
  {
    id: "s_wins",
    title: "VETERANO DE GUERRA",
    desc: "Gana 10 misiones en total",
    icon: "crown",
    goal: 10,
    reward: 100,
    pt: 120,
    progress: (p, b) => Math.max(0, p.stats.wins - b.wins),
  },
];

/* ---------------- Pase de Temporada: 20 niveles ---------------- */
// requiredPt es el PT acumulado necesario para alcanzar cada nivel.
const LEVEL_REQUIRED_PT = [
  0, 50, 120, 220, 340, 480, 650, 840, 1060, 1300, 1560, 1850, 2160, 2500, 2860, 3240, 3650, 4080,
  4540, 5040,
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

/** Las 6 misiones diarias de la fecha UTC dada: 2 por cada tier. */
export function getActiveDailyMissions(dateStr: string): RunMissionTemplate[] {
  return DAILY_TIERS.flatMap((tier) =>
    seededShuffle(
      DAILY_MISSION_TEMPLATES.filter((m) => m.tier === tier),
      `DAILY:${dateStr}:${tier}`,
    ).slice(0, DAILY_PER_TIER),
  );
}

/** Las 8 misiones semanales de la semana UTC dada (lunes "YYYY-MM-DD"). */
export function getActiveWeeklyMissions(weekStr: string): RunMissionTemplate[] {
  return seededShuffle(WEEKLY_MISSION_TEMPLATES, `WEEKLY:${weekStr}`).slice(0, WEEKLY_PICK_COUNT);
}
