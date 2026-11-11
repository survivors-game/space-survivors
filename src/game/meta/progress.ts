// Permanent progression, persisted in localStorage (the storage the original
// template already used). Pure functions + a tiny subscribable store.
import type { RunResult } from "../types";
import { SHIPS } from "../data/ships";
import { STAGES, stageById } from "../data/stages";
import {
  MODULE_UNLOCK_LEVEL,
  hangarBonuses,
  moduleById,
  moduleSwapCost,
  upgradeById,
  upgradeCost,
  upgradeRequirement,
} from "./upgrades";
import {
  DAILY_CHEST,
  SEASON_CHALLENGES,
  SEASON_LEVELS,
  SEASON_MAX_LEVEL,
  getActiveDailyMissions,
  getActiveWeeklyMissions,
  getSeasonId,
  getUtcDateStr,
  getUtcWeekStr,
  seasonLevelFor,
  type RunMissionTemplate,
  type SeasonBaseline,
  type SeasonChallengeTemplate,
} from "./missions";

export interface RunSummary {
  date: number;
  stageId: string;
  shipId: string;
  victory: boolean;
  time: number;
  kills: number;
  level: number;
  credits: number;
}

/**
 * Estado del Centro de Operaciones de Temporada.
 * - `seasonId` identifica la temporada (S01, S02...). Si no coincide con la vigente,
 *   el progreso de temporada se reinicia; los créditos y naves nunca se tocan.
 * - `baseline` guarda las estadísticas de vida al inicio de la temporada, para que los
 *   desafíos midan solo lo jugado dentro de la temporada.
 * - `dailyCompletedDate` / `weeklyCompletedWeek` son los sellos de ventana UTC.
 */
export interface SeasonProgress {
  seasonId: string;
  /** Versión de la escala de puntos aplicada al pase. */
  pacingVersion: number;
  baseline: SeasonBaseline;
  pt: number;
  claimedFree: number[];
  claimedVip: number[];
  dailyCompletedDate: string;
  dailyCompletedIds: string[];
  dailyProgress: Record<string, number>;
  weeklyCompletedWeek: string;
  weeklyCompletedIds: string[];
  weeklyProgress: Record<string, number>;
  seasonClaimedIds: string[];
}

export interface Progress {
  v: 1;
  credits: number;
  ships: string[];
  selectedShip: string;
  selectedStage: string;
  upgrades: Record<string, number>;
  /** Módulo de especialización elegido por mejora (solo desde nivel 10). */
  modules: Record<string, string>;
  stats: {
    runs: number;
    wins: number;
    deaths: number;
    kills: number;
    timePlayed: number;
    creditsEarned: number;
    maxLevel: number;
    evolutions: number;
    bestKills: number;
    damageDealt: number;
    bestTime: Record<string, number>;
    bossKills: Record<string, number>;
  };
  bestiary: Record<string, number>;
  weaponsUsed: string[];
  stages: string[];
  stagesCleared: string[];
  /** Legacy: misiones antiguas. Se conserva para no perder datos guardados. */
  claimed: string[];
  history: RunSummary[];
  season: SeasonProgress;
}

const EMPTY_BASELINE: SeasonBaseline = {
  kills: 0,
  wins: 0,
  bossKills: {},
  ships: ["falcon"],
  weaponsUsed: [],
};

function baselineOf(p: Progress): SeasonBaseline {
  return {
    kills: p.stats.kills,
    wins: p.stats.wins,
    bossKills: { ...p.stats.bossKills },
    ships: [...p.ships],
    weaponsUsed: [...p.weaponsUsed],
  };
}

/** Temporada vacía para `seasonId`, con la línea base dada. */
function freshSeason(seasonId: string, baseline: SeasonBaseline): SeasonProgress {
  return {
    seasonId,
    pacingVersion: 2,
    baseline,
    pt: 0,
    claimedFree: [],
    claimedVip: [],
    dailyCompletedDate: "",
    dailyCompletedIds: [],
    dailyProgress: {},
    weeklyCompletedWeek: "",
    weeklyCompletedIds: [],
    weeklyProgress: {},
    seasonClaimedIds: [],
  };
}

export function defaultSeason(): SeasonProgress {
  return freshSeason(getSeasonId(), EMPTY_BASELINE);
}

export function defaultProgress(): Progress {
  return {
    v: 1,
    credits: 0,
    ships: ["falcon"],
    selectedShip: "falcon",
    selectedStage: "nova",
    upgrades: {},
    modules: {},
    stats: {
      runs: 0,
      wins: 0,
      deaths: 0,
      kills: 0,
      timePlayed: 0,
      creditsEarned: 0,
      maxLevel: 0,
      evolutions: 0,
      bestKills: 0,
      damageDealt: 0,
      bestTime: {},
      bossKills: {},
    },
    bestiary: {},
    weaponsUsed: [],
    stages: ["nova"],
    stagesCleared: [],
    claimed: [],
    history: [],
    season: defaultSeason(),
  };
}

/** Sanea el bloque de temporada. Datos viejos o corruptos caen a valores limpios. */
function sanitizeSeason(raw: unknown): SeasonProgress {
  if (!raw || typeof raw !== "object") return defaultSeason();
  const r = raw as Partial<Record<keyof SeasonProgress, unknown>>;
  const ids = (v: unknown): string[] =>
    Array.isArray(v)
      ? Array.from(new Set(v.filter((x): x is string => typeof x === "string")))
      : [];
  const levels = (v: unknown): number[] =>
    Array.isArray(v)
      ? Array.from(
          new Set(
            v.filter((x): x is number => Number.isInteger(x) && x >= 1 && x <= SEASON_MAX_LEVEL),
          ),
        )
      : [];
  const counters = (v: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (v && typeof v === "object")
      for (const [k, n] of Object.entries(v))
        if (typeof n === "number" && Number.isFinite(n) && n >= 0) out[k] = n;
    return out;
  };
  const stamp = (v: unknown): string =>
    typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
  const num = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  const rawBase = (r.baseline ?? {}) as Partial<SeasonBaseline>;
  const pt = num(r.pt);
  return {
    seasonId: typeof r.seasonId === "string" ? r.seasonId : "",
    pacingVersion: Math.floor(num(r.pacingVersion)),
    baseline: {
      kills: num(rawBase.kills),
      wins: num(rawBase.wins),
      bossKills: counters(rawBase.bossKills),
      ships: ids(rawBase.ships),
      weaponsUsed: ids(rawBase.weaponsUsed),
    },
    pt: Math.floor(pt),
    claimedFree: levels(r.claimedFree),
    claimedVip: levels(r.claimedVip),
    dailyCompletedDate: stamp(r.dailyCompletedDate),
    dailyCompletedIds: ids(r.dailyCompletedIds),
    dailyProgress: counters(r.dailyProgress),
    weeklyCompletedWeek: stamp(r.weeklyCompletedWeek),
    weeklyCompletedIds: ids(r.weeklyCompletedIds),
    weeklyProgress: counters(r.weeklyProgress),
    seasonClaimedIds: ids(r.seasonClaimedIds),
  };
}

/**
 * Si la temporada guardada no es la vigente (o nunca existió), la reinicia.
 * La nueva línea base son las estadísticas actuales, así que los desafíos empiezan en cero.
 * Créditos, naves, mejoras y estadísticas no se tocan.
 */
function renewSeason(p: Progress, now: number): void {
  const id = getSeasonId(now);
  if (p.season.seasonId !== id) p.season = freshSeason(id, baselineOf(p));
}

/** Merge unknown/corrupt stored data onto defaults. */
export function sanitize(raw: unknown): Progress {
  const d = defaultProgress();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<Progress>;
  const num = (v: unknown, f: number) => (typeof v === "number" && Number.isFinite(v) ? v : f);
  const arr = (v: unknown, f: string[]) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : f;
  const rec = (v: unknown) => {
    const out: Record<string, number> = {};
    if (v && typeof v === "object")
      for (const [k, n] of Object.entries(v))
        if (typeof n === "number" && Number.isFinite(n)) out[k] = n;
    return out;
  };
  const strRec = (v: unknown) => {
    const out: Record<string, string> = {};
    if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) if (typeof x === "string") out[k] = x;
    return out;
  };
  const s = (r.stats ?? {}) as Partial<Progress["stats"]>;
  const p: Progress = {
    v: 1,
    credits: Math.max(0, num(r.credits, 0)),
    ships: Array.from(new Set(["falcon", ...arr(r.ships, [])])).filter((id) =>
      SHIPS.some((x) => x.id === id),
    ),
    selectedShip: typeof r.selectedShip === "string" ? r.selectedShip : "falcon",
    selectedStage: typeof r.selectedStage === "string" ? r.selectedStage : "nova",
    upgrades: rec(r.upgrades),
    modules: strRec(r.modules),
    stats: {
      runs: num(s.runs, 0),
      wins: num(s.wins, 0),
      deaths: num(s.deaths, 0),
      kills: num(s.kills, 0),
      timePlayed: num(s.timePlayed, 0),
      creditsEarned: num(s.creditsEarned, 0),
      maxLevel: num(s.maxLevel, 0),
      evolutions: num(s.evolutions, 0),
      bestKills: num(s.bestKills, 0),
      damageDealt: num(s.damageDealt, 0),
      bestTime: rec(s.bestTime),
      bossKills: rec(s.bossKills),
    },
    bestiary: rec(r.bestiary),
    weaponsUsed: arr(r.weaponsUsed, []),
    stages: Array.from(new Set(["nova", ...arr(r.stages, [])])).filter((id) =>
      STAGES.some((x) => x.id === id),
    ),
    stagesCleared: arr(r.stagesCleared, []),
    claimed: arr(r.claimed, []),
    history: Array.isArray(r.history) ? (r.history as RunSummary[]).slice(0, 10) : [],
    // Partidas anteriores a la temporada no traen `season`: se inicializa limpio.
    season: sanitizeSeason(r.season),
  };
  if (!p.ships.includes(p.selectedShip)) p.selectedShip = "falcon";
  if (!p.stages.includes(p.selectedStage)) p.selectedStage = "nova";
  if (p.season.pacingVersion < 2) {
    const scaledPt = Math.round((p.season.pt * 2350) / 5040);
    const claimedLevel = Math.max(0, ...p.season.claimedFree, ...p.season.claimedVip);
    const claimedFloor = claimedLevel ? (SEASON_LEVELS[claimedLevel - 1]?.requiredPt ?? 0) : 0;
    p.season.pt = Math.min(2350, Math.max(scaledPt, claimedFloor));
    p.season.pacingVersion = 2;
  }
  const savedBaseline = (r.season as Partial<SeasonProgress> | undefined)?.baseline as
    Partial<SeasonBaseline> | undefined;
  if (savedBaseline && !Array.isArray(savedBaseline.ships)) p.season.baseline.ships = [...p.ships];
  if (savedBaseline && !Array.isArray(savedBaseline.weaponsUsed))
    p.season.baseline.weaponsUsed = [...p.weaponsUsed];
  renewSeason(p, Date.now());
  return p;
}

/** Porcentaje de créditos que realmente se entrega (20% = recompensas reducidas un 80%). */
export const CREDIT_REWARD_MULT = 0.2;

/** Credits awarded for a run. */
export function computeRunCredits(
  r: Pick<RunResult, "credits" | "time" | "level" | "victory" | "stageId" | "duration">,
  salvageBonus: number,
) {
  const stage = stageById(r.stageId);
  const base =
    r.credits + Math.floor(r.time / 60) * 15 * (900 / Math.max(300, r.duration)) + r.level * 4;
  const mult = stage.rewardMult * (1 + salvageBonus) * (r.victory ? 1.5 : 1);
  return Math.max(0, Math.round(base * mult * CREDIT_REWARD_MULT));
}

export interface ApplyOutcome {
  progress: Progress;
  credits: number;
  newStages: string[];
  newBests: string[];
}

/* ---------------- Temporada: ventanas y avance ---------------- */

/** Devuelve la temporada con los sellos UTC al día; si la ventana cambió, vacía sus contadores. */
function rolled(s: SeasonProgress, now: number): SeasonProgress {
  const today = getUtcDateStr(now);
  const week = getUtcWeekStr(now);
  const next: SeasonProgress = { ...s };
  if (s.dailyCompletedDate !== today) {
    next.dailyCompletedDate = today;
    next.dailyCompletedIds = [];
    next.dailyProgress = {};
  }
  if (s.weeklyCompletedWeek !== week) {
    next.weeklyCompletedWeek = week;
    next.weeklyCompletedIds = [];
    next.weeklyProgress = {};
  }
  return next;
}

function addRunMetric(counters: Record<string, number>, t: RunMissionTemplate, r: RunResult) {
  const value = t.progress(r);
  const prev = counters[t.id] ?? 0;
  counters[t.id] = t.agg === "max" ? Math.max(prev, value) : prev + value;
}

/** Suma el aporte de una partida a todas las misiones diarias y semanales activas. */
function accumulateSeasonRun(s: SeasonProgress, r: RunResult, now: number): SeasonProgress {
  const base = rolled(s, now);
  const daily: Record<string, number> = { ...base.dailyProgress };
  for (const t of getActiveDailyMissions(base.dailyCompletedDate)) addRunMetric(daily, t, r);
  const weekly: Record<string, number> = { ...base.weeklyProgress };
  for (const t of getActiveWeeklyMissions(base.weeklyCompletedWeek)) addRunMetric(weekly, t, r);
  return { ...base, dailyProgress: daily, weeklyProgress: weekly };
}

export function applyRun(prev: Progress, r: RunResult, now: number = Date.now()): ApplyOutcome {
  const p: Progress = structuredClone(prev);
  // Antes de sumar la partida: la línea base debe ser el estado previo a esta partida.
  renewSeason(p, now);
  const credits = computeRunCredits(r, hangarBonuses(p.upgrades, p.modules).salvage);
  p.credits += credits;
  const st = p.stats;
  st.runs += 1;
  if (r.victory) st.wins += 1;
  else st.deaths += 1;
  st.kills += r.kills;
  st.timePlayed += r.time;
  st.creditsEarned += credits;
  st.evolutions += r.evolutions;
  st.damageDealt += Math.round(r.damageDealt);
  const newBests: string[] = [];
  if (r.level > st.maxLevel) {
    st.maxLevel = r.level;
    newBests.push("level");
  }
  if (r.kills > st.bestKills) {
    st.bestKills = r.kills;
    newBests.push("kills");
  }
  // best time is stored in mission-minute equivalent seconds (normalised to 15 min)
  const norm = (r.time / Math.max(1, r.duration)) * 900;
  if (norm > (st.bestTime[r.stageId] ?? 0)) {
    st.bestTime[r.stageId] = Math.round(norm);
    newBests.push("time");
  }
  for (const [k, n] of Object.entries(r.killsByType)) p.bestiary[k] = (p.bestiary[k] ?? 0) + n;
  for (const b of r.bossesDefeated) {
    st.bossKills[b] = (st.bossKills[b] ?? 0) + 1;
    p.bestiary[b] = (p.bestiary[b] ?? 0) + 1;
  }
  for (const w of r.weapons) if (!p.weaponsUsed.includes(w.id)) p.weaponsUsed.push(w.id);
  // stage unlocks: defeat the first boss (LEVIATÁN) or win to open the next sector
  const newStages: string[] = [];
  if (r.victory && !p.stagesCleared.includes(r.stageId)) p.stagesCleared.push(r.stageId);
  if (r.victory || r.bossesDefeated.includes("leviathan")) {
    const next = STAGES.find((s) => s.unlockAfter === r.stageId);
    if (next && !p.stages.includes(next.id)) {
      p.stages.push(next.id);
      newStages.push(next.id);
    }
  }
  p.history = [
    {
      date: now,
      stageId: r.stageId,
      shipId: r.shipId,
      victory: r.victory,
      time: r.time,
      kills: r.kills,
      level: r.level,
      credits,
    },
    ...p.history,
  ].slice(0, 10);
  p.season = accumulateSeasonRun(p.season, r, now);
  return { progress: p, credits, newStages, newBests };
}

export type BuyResult = { ok: true; progress: Progress } | { ok: false; reason: string };

export interface UpgradeRequirementState {
  label: string;
  progress: number;
  goal: number;
  met: boolean;
}

export interface UpgradeStatus {
  ok: boolean;
  /** Motivo en español si no se puede comprar. */
  reason: string;
  cost: number;
  requirement: UpgradeRequirementState | null;
}

/** Estado de compra del siguiente nivel de una mejora. Misma lógica que buyUpgrade. */
export function upgradeStatus(prev: Progress, id: string): UpgradeStatus {
  const u = upgradeById(id);
  if (!u) return { ok: false, reason: "Mejora desconocida", cost: Infinity, requirement: null };
  const lvl = prev.upgrades[id] ?? 0;
  const cost = upgradeCost(id, lvl);
  if (lvl >= u.max) return { ok: false, reason: "Nivel máximo", cost, requirement: null };
  const req = upgradeRequirement(id, lvl + 1);
  const requirement = req
    ? {
        label: req.label,
        progress: Math.min(req.progress(prev), req.goal),
        goal: req.goal,
        met: req.progress(prev) >= req.goal,
      }
    : null;
  if (prev.credits < cost)
    return { ok: false, reason: "Créditos insuficientes", cost, requirement };
  if (requirement && !requirement.met)
    return { ok: false, reason: `Requisito: ${requirement.label}`, cost, requirement };
  return { ok: true, reason: "", cost, requirement };
}

export function buyUpgrade(prev: Progress, id: string): BuyResult {
  const st = upgradeStatus(prev, id);
  if (!st.ok) return { ok: false, reason: st.reason };
  const p = structuredClone(prev);
  const lvl = prev.upgrades[id] ?? 0;
  p.credits -= st.cost;
  p.upgrades[id] = lvl + 1;
  return { ok: true, progress: p };
}

/**
 * Elige o cambia el módulo de una mejora en nivel 10. La primera elección es gratis;
 * cambiarlo cuesta CR.
 */
export function chooseUpgradeModule(
  prev: Progress,
  upgradeId: string,
  moduleId: string,
): BuyResult {
  const u = upgradeById(upgradeId);
  if (!u) return { ok: false, reason: "Mejora desconocida" };
  if ((prev.upgrades[upgradeId] ?? 0) < MODULE_UNLOCK_LEVEL)
    return { ok: false, reason: `Disponible al nivel ${MODULE_UNLOCK_LEVEL}` };
  if (!moduleById(upgradeId, moduleId)) return { ok: false, reason: "Módulo desconocido" };
  const current = prev.modules[upgradeId];
  if (current === moduleId) return { ok: false, reason: "Ya está instalado" };
  const cost = current ? moduleSwapCost(upgradeId) : 0;
  if (prev.credits < cost) return { ok: false, reason: "Créditos insuficientes" };
  const p = structuredClone(prev);
  p.credits -= cost;
  p.modules[upgradeId] = moduleId;
  return { ok: true, progress: p };
}

export function buyShip(prev: Progress, id: string): BuyResult {
  const s = SHIPS.find((x) => x.id === id);
  if (!s) return { ok: false, reason: "Nave desconocida" };
  if (prev.ships.includes(id)) return { ok: false, reason: "Ya desbloqueada" };
  if (prev.credits < s.cost) return { ok: false, reason: "Créditos insuficientes" };
  const p = structuredClone(prev);
  p.credits -= s.cost;
  p.ships.push(id);
  p.selectedShip = id;
  return { ok: true, progress: p };
}

/** Suma PT de temporada sin tocar créditos. */
export function addSeasonPt(prev: Progress, amount: number, now: number = Date.now()): Progress {
  const p = structuredClone(prev);
  renewSeason(p, now);
  p.season.pt += Math.max(0, Math.floor(amount));
  return p;
}

/** Acredita créditos y PT juntos (todas las recompensas de misiones pasan por aquí). */
function grant(p: Progress, credits: number, pt: number) {
  p.credits += credits;
  p.stats.creditsEarned += credits;
  p.season.pt += pt;
}

/* ---------------- Vistas de solo lectura para la UI ---------------- */

/** Temporada vigente para este progreso, sin mutar nada. */
export function currentSeason(p: Progress, now: number = Date.now()): SeasonProgress {
  const id = getSeasonId(now);
  return p.season.seasonId === id ? p.season : freshSeason(id, baselineOf(p.stats));
}

export interface SeasonBoardEntry {
  template: RunMissionTemplate;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export interface SeasonChallengeEntry {
  template: SeasonChallengeTemplate;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export interface SeasonBoard {
  dateStr: string;
  weekStr: string;
  daily: SeasonBoardEntry[];
  weekly: SeasonBoardEntry[];
  challenges: SeasonChallengeEntry[];
  dailyClaimedCount: number;
  weeklyClaimedCount: number;
  challengeClaimedCount: number;
  chest: { claimable: boolean; claimed: boolean; claimedCount: number; threshold: number };
}

/** Estado completo del tablero para hoy (UTC), sin mutar nada. */
export function getSeasonBoard(p: Progress, now: number = Date.now()): SeasonBoard {
  const dateStr = getUtcDateStr(now);
  const weekStr = getUtcWeekStr(now);
  const s = currentSeason(p, now);
  const dailyFresh = s.dailyCompletedDate === dateStr;
  const weeklyFresh = s.weeklyCompletedWeek === weekStr;
  const dailyDone = dailyFresh ? s.dailyCompletedIds : [];
  const dailyCounters: Record<string, number> = dailyFresh ? s.dailyProgress : {};
  const weeklyDone = weeklyFresh ? s.weeklyCompletedIds : [];
  const weeklyCounters: Record<string, number> = weeklyFresh ? s.weeklyProgress : {};

  const toEntries = (
    templates: RunMissionTemplate[],
    done: string[],
    counters: Record<string, number>,
  ): SeasonBoardEntry[] =>
    templates.map((template) => {
      const progress = counters[template.id] ?? 0;
      return {
        template,
        progress,
        completed: progress >= template.goal,
        claimed: done.includes(template.id),
      };
    });

  const daily = toEntries(getActiveDailyMissions(dateStr), dailyDone, dailyCounters);
  const weekly = toEntries(getActiveWeeklyMissions(weekStr), weeklyDone, weeklyCounters);
  const challenges: SeasonChallengeEntry[] = SEASON_CHALLENGES.map((template) => {
    const progress = template.progress(p, s.baseline);
    return {
      template,
      progress,
      completed: progress >= template.goal,
      claimed: s.seasonClaimedIds.includes(template.id),
    };
  });

  const dailyClaimedCount = daily.filter((e) => e.claimed).length;
  const chestClaimed = dailyDone.includes(DAILY_CHEST.id);
  return {
    dateStr,
    weekStr,
    daily,
    weekly,
    challenges,
    dailyClaimedCount,
    weeklyClaimedCount: weekly.filter((e) => e.claimed).length,
    challengeClaimedCount: challenges.filter((e) => e.claimed).length,
    chest: {
      claimable: !chestClaimed && dailyClaimedCount >= DAILY_CHEST.threshold,
      claimed: chestClaimed,
      claimedCount: dailyClaimedCount,
      threshold: DAILY_CHEST.threshold,
    },
  };
}

/** Número de recompensas pendientes de reclamar (para el badge del Hangar). */
export function getSeasonClaimableCount(
  p: Progress,
  hasVip: boolean,
  now: number = Date.now(),
): number {
  const board = getSeasonBoard(p, now);
  const s = currentSeason(p, now);
  let count =
    board.daily.filter((e) => e.completed && !e.claimed).length +
    board.weekly.filter((e) => e.completed && !e.claimed).length +
    board.challenges.filter((e) => e.completed && !e.claimed).length +
    (board.chest.claimable ? 1 : 0);
  const level = seasonLevelFor(s.pt);
  for (const node of SEASON_LEVELS) {
    if (node.level > level) break;
    if (!s.claimedFree.includes(node.level)) count += 1;
    if (hasVip && !s.claimedVip.includes(node.level)) count += 1;
  }
  return count;
}

/* ---------------- Reclamos ---------------- */

export function claimPeriodMission(
  prev: Progress,
  period: "DAILY" | "WEEKLY",
  id: string,
  now: number = Date.now(),
): BuyResult {
  const board = getSeasonBoard(prev, now);
  const entry = (period === "DAILY" ? board.daily : board.weekly).find((e) => e.template.id === id);
  if (!entry) return { ok: false, reason: "Misión no activa" };
  if (entry.claimed) return { ok: false, reason: "Ya reclamada" };
  if (!entry.completed) return { ok: false, reason: "Objetivo incompleto" };
  const p = structuredClone(prev);
  renewSeason(p, now);
  p.season = rolled(p.season, now);
  if (period === "DAILY") p.season.dailyCompletedIds.push(id);
  else p.season.weeklyCompletedIds.push(id);
  grant(p, entry.template.reward, entry.template.pt);
  return { ok: true, progress: p };
}

export function claimDailyChest(prev: Progress, now: number = Date.now()): BuyResult {
  const board = getSeasonBoard(prev, now);
  if (board.chest.claimed) return { ok: false, reason: "Cofre ya reclamado" };
  if (!board.chest.claimable) return { ok: false, reason: "Faltan misiones diarias" };
  const p = structuredClone(prev);
  renewSeason(p, now);
  p.season = rolled(p.season, now);
  p.season.dailyCompletedIds.push(DAILY_CHEST.id);
  grant(p, DAILY_CHEST.reward, DAILY_CHEST.pt);
  return { ok: true, progress: p };
}

export function claimSeasonChallenge(
  prev: Progress,
  id: string,
  now: number = Date.now(),
): BuyResult {
  const t = SEASON_CHALLENGES.find((x) => x.id === id);
  if (!t) return { ok: false, reason: "Desafío desconocido" };
  const s = currentSeason(prev, now);
  if (s.seasonClaimedIds.includes(id)) return { ok: false, reason: "Ya reclamado" };
  if (t.progress(prev, s.baseline) < t.goal) return { ok: false, reason: "Objetivo incompleto" };
  const p = structuredClone(prev);
  renewSeason(p, now);
  p.season.seasonClaimedIds.push(id);
  grant(p, t.reward, t.pt);
  return { ok: true, progress: p };
}

/**
 * Reclama un nivel del Pase. El carril VIP exige `hasVip`, que el llamador obtiene
 * del servidor (hasVip de vip.ts evaluado allí). Solo los premios CR acreditan créditos;
 * insignias y skins quedan registrados como reclamados.
 */
export function claimSeasonLevel(
  prev: Progress,
  track: "FREE" | "VIP",
  level: number,
  hasVip: boolean,
  now: number = Date.now(),
): BuyResult {
  const node = SEASON_LEVELS.find((n) => n.level === level);
  if (!node) return { ok: false, reason: "Nivel desconocido" };
  const s = currentSeason(prev, now);
  if (seasonLevelFor(s.pt) < level) return { ok: false, reason: "Nivel no alcanzado" };
  if (track === "VIP" && !hasVip) return { ok: false, reason: "Requiere VIP" };
  const claimedList = track === "FREE" ? s.claimedFree : s.claimedVip;
  if (claimedList.includes(level)) return { ok: false, reason: "Ya reclamado" };
  const reward: { type: string; amount: number } =
    track === "FREE" ? node.freeReward : node.vipReward;
  const p = structuredClone(prev);
  renewSeason(p, now);
  if (track === "FREE") p.season.claimedFree.push(level);
  else p.season.claimedVip.push(level);
  if (reward.type === "CR") grant(p, reward.amount, 0);
  return { ok: true, progress: p };
}

/* ---------------- store ---------------- */
const KEY = "space_survivors_progress_v1";
let state: Progress | null = null;
const listeners = new Set<() => void>();

function read(): Progress {
  if (state) return state;
  if (typeof window === "undefined") return defaultProgress();
  try {
    const raw = localStorage.getItem(KEY);
    state = sanitize(raw ? JSON.parse(raw) : null);
  } catch {
    state = defaultProgress();
  }
  return state;
}

export const ProgressStore = {
  get: read,
  set(p: Progress) {
    state = p;
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* storage unavailable */
    }
    listeners.forEach((l) => l());
  },
  update(fn: (p: Progress) => Progress) {
    this.set(fn(read()));
  },
  reset() {
    this.set(defaultProgress());
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
  /** For tests */
  _clearCache() {
    state = null;
  },
};
