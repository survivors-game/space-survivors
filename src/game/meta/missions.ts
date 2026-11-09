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
  progress: (p: Progress) => number;
}

export const SEASON_NAME = "TEMPORADA 01";
export const SEASON_MAX_LEVEL = 20;

export const DAILY_TIERS: readonly MissionTier[] = ["BASIC", "PILOT", "ELITE"];
export const DAILY_PER_TIER = 2;
export const WEEKLY_PICK_COUNT = 8;

/** Cofre diario: se desbloquea al reclamar 5 de las 6 misiones diarias. */
export const DAILY_CHEST = {
  id: "CHEST",
  threshold: 5,
  reward: 150,
  pt: 50,
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
    reward: 40,
    pt: 10,
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
    reward: 40,
    pt: 10,
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
    reward: 35,
    pt: 10,
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
    reward: 35,
    pt: 10,
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
    reward: 90,
    pt: 20,
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
    reward: 110,
    pt: 25,
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
    reward: 85,
    pt: 20,
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
    reward: 80,
    pt: 20,
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
    reward: 180,
    pt: 35,
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
    reward: 150,
    pt: 30,
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
    reward: 160,
    pt: 30,
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
    reward: 170,
    pt: 35,
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
    reward: 400,
    pt: 80,
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
    reward: 500,
    pt: 100,
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
    reward: 600,
    pt: 120,
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
    reward: 550,
    pt: 110,
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
    reward: 450,
    pt: 90,
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
    reward: 480,
    pt: 95,
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
    reward: 350,
    pt: 70,
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
    reward: 420,
    pt: 85,
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
    reward: 500,
    pt: 100,
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
    reward: 500,
    pt: 100,
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
    reward: 480,
    pt: 95,
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
    reward: 520,
    pt: 100,
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
    reward: 150,
    pt: 150,
    progress: (p) => p.stats.kills,
  },
  {
    id: "s_kills_5000",
    title: "EXTERMINADOR",
    desc: "Destruye 5.000 naves enemigas en total",
    icon: "crosshair",
    goal: 5000,
    reward: 400,
    pt: 400,
    progress: (p) => p.stats.kills,
  },
  {
    id: "s_leviathan",
    title: "CAZA AL LEVIATÁN",
    desc: "Derrota a LEVIATÁN",
    icon: "skull",
    goal: 1,
    reward: 250,
    pt: 200,
    progress: (p) => p.stats.bossKills["leviathan"] ?? 0,
  },
  {
    id: "s_nemesis",
    title: "NÉMESIS CAÍDA",
    desc: "Derrota a NÉMESIS",
    icon: "skull",
    goal: 1,
    reward: 300,
    pt: 250,
    progress: (p) => p.stats.bossKills["nemesis"] ?? 0,
  },
  {
    id: "s_colossus",
    title: "COLOSO DERRIBADO",
    desc: "Derrota al COLOSO",
    icon: "skull",
    goal: 1,
    reward: 350,
    pt: 300,
    progress: (p) => p.stats.bossKills["colossus"] ?? 0,
  },
  {
    id: "s_fleet",
    title: "FLOTA COMPLETA",
    desc: "Desbloquea las cuatro naves",
    icon: "shield",
    goal: 4,
    reward: 300,
    pt: 200,
    progress: (p) => p.ships.length,
  },
  {
    id: "s_arsenal",
    title: "ARSENAL",
    desc: "Usa las 9 armas y módulos",
    icon: "zap",
    goal: 9,
    reward: 200,
    pt: 150,
    progress: (p) => p.weaponsUsed.length,
  },
  {
    id: "s_wins",
    title: "VETERANO DE GUERRA",
    desc: "Gana 10 misiones en total",
    icon: "crown",
    goal: 10,
    reward: 300,
    pt: 250,
    progress: (p) => p.stats.wins,
  },
];

/* ---------------- Pase de Temporada: 20 niveles ---------------- */
// requiredPt es el PT acumulado necesario para alcanzar cada nivel.
const LEVEL_REQUIRED_PT = [
  0, 100, 250, 450, 700, 1000, 1350, 1750, 2200, 2700, 3250, 3850, 4500, 5200, 5950, 6750, 7600,
  8500, 9450, 10500,
] as const;

const FREE_REWARDS: SeasonRewardNode["freeReward"][] = [
  { type: "CR", amount: 50, label: "50 CR" },
  { type: "CR", amount: 40, label: "40 CR" },
  { type: "TITLE", amount: 1, label: "Insignia: Recluta" },
  { type: "CR", amount: 60, label: "60 CR" },
  { type: "CR", amount: 80, label: "80 CR" },
  { type: "TITLE", amount: 1, label: "Insignia: Escolta" },
  { type: "CR", amount: 100, label: "100 CR" },
  { type: "CR", amount: 110, label: "110 CR" },
  { type: "CR", amount: 130, label: "130 CR" },
  { type: "TITLE", amount: 1, label: "Insignia: Vanguardia" },
  { type: "CR", amount: 150, label: "150 CR" },
  { type: "CR", amount: 170, label: "170 CR" },
  { type: "CR", amount: 190, label: "190 CR" },
  { type: "TITLE", amount: 1, label: "Insignia: Centinela" },
  { type: "CR", amount: 220, label: "220 CR" },
  { type: "CR", amount: 250, label: "250 CR" },
  { type: "CR", amount: 280, label: "280 CR" },
  { type: "TITLE", amount: 1, label: "Insignia: Cazador Estelar" },
  { type: "CR", amount: 320, label: "320 CR" },
  { type: "CR", amount: 400, label: "400 CR · Gran premio" },
];

const VIP_REWARDS: SeasonRewardNode["vipReward"][] = [
  { type: "CR", amount: 90, label: "90 CR" },
  { type: "SKIN", amount: 1, label: "Pintura: Ceniza Cromada" },
  { type: "CR", amount: 120, label: "120 CR" },
  { type: "CR", amount: 140, label: "140 CR" },
  { type: "SKIN", amount: 1, label: "Estela: Plasma Ámbar" },
  { type: "CR", amount: 170, label: "170 CR" },
  { type: "CR", amount: 200, label: "200 CR" },
  { type: "CR", amount: 230, label: "230 CR" },
  { type: "SKIN", amount: 1, label: "Pintura: Neón Nocturno" },
  { type: "TITLE", amount: 1, label: "Título: Ala Dorada" },
  { type: "CR", amount: 270, label: "270 CR" },
  { type: "CR", amount: 300, label: "300 CR" },
  { type: "CR", amount: 340, label: "340 CR" },
  { type: "SKIN", amount: 1, label: "Escudo: Halo Violeta" },
  { type: "CR", amount: 380, label: "380 CR" },
  { type: "CR", amount: 420, label: "420 CR" },
  { type: "CR", amount: 460, label: "460 CR" },
  { type: "SKIN", amount: 1, label: "Pintura: Eclipse Dorado" },
  { type: "CR", amount: 520, label: "520 CR" },
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
  const daysAhead = ((1 - d.getUTCDay() + 7) % 7) || 7;
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