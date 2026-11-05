// Permanent progression, persisted in localStorage (the storage the original
// template already used). Pure functions + a tiny subscribable store.
import type { RunResult } from "../types";
import { SHIPS } from "../data/ships";
import { STAGES, stageById } from "../data/stages";
import { upgradeById, upgradeCost } from "./upgrades";
import { MISSIONS } from "./missions";

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

export interface Progress {
  v: 1;
  credits: number;
  ships: string[];
  selectedShip: string;
  selectedStage: string;
  upgrades: Record<string, number>;
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
  claimed: string[];
  history: RunSummary[];
}

export function defaultProgress(): Progress {
  return {
    v: 1,
    credits: 0,
    ships: ["falcon"],
    selectedShip: "falcon",
    selectedStage: "nova",
    upgrades: {},
    stats: {
      runs: 0, wins: 0, deaths: 0, kills: 0, timePlayed: 0, creditsEarned: 0,
      maxLevel: 0, evolutions: 0, bestKills: 0, damageDealt: 0, bestTime: {}, bossKills: {},
    },
    bestiary: {},
    weaponsUsed: [],
    stages: ["nova"],
    stagesCleared: [],
    claimed: [],
    history: [],
  };
}

/** Merge unknown/corrupt stored data onto defaults. */
export function sanitize(raw: unknown): Progress {
  const d = defaultProgress();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<Progress>;
  const num = (v: unknown, f: number) => (typeof v === "number" && Number.isFinite(v) ? v : f);
  const arr = (v: unknown, f: string[]) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : f);
  const rec = (v: unknown) => {
    const out: Record<string, number> = {};
    if (v && typeof v === "object") for (const [k, n] of Object.entries(v)) if (typeof n === "number" && Number.isFinite(n)) out[k] = n;
    return out;
  };
  const s = (r.stats ?? {}) as Partial<Progress["stats"]>;
  const p: Progress = {
    v: 1,
    credits: Math.max(0, num(r.credits, 0)),
    ships: Array.from(new Set(["falcon", ...arr(r.ships, [])])).filter((id) => SHIPS.some((x) => x.id === id)),
    selectedShip: typeof r.selectedShip === "string" ? r.selectedShip : "falcon",
    selectedStage: typeof r.selectedStage === "string" ? r.selectedStage : "nova",
    upgrades: rec(r.upgrades),
    stats: {
      runs: num(s.runs, 0), wins: num(s.wins, 0), deaths: num(s.deaths, 0), kills: num(s.kills, 0),
      timePlayed: num(s.timePlayed, 0), creditsEarned: num(s.creditsEarned, 0), maxLevel: num(s.maxLevel, 0),
      evolutions: num(s.evolutions, 0), bestKills: num(s.bestKills, 0), damageDealt: num(s.damageDealt, 0),
      bestTime: rec(s.bestTime), bossKills: rec(s.bossKills),
    },
    bestiary: rec(r.bestiary),
    weaponsUsed: arr(r.weaponsUsed, []),
    stages: Array.from(new Set(["nova", ...arr(r.stages, [])])).filter((id) => STAGES.some((x) => x.id === id)),
    stagesCleared: arr(r.stagesCleared, []),
    claimed: arr(r.claimed, []),
    history: Array.isArray(r.history) ? (r.history as RunSummary[]).slice(0, 10) : [],
  };
  if (!p.ships.includes(p.selectedShip)) p.selectedShip = "falcon";
  if (!p.stages.includes(p.selectedStage)) p.selectedStage = "nova";
  return p;
}

/** Credits awarded for a run. */
export function computeRunCredits(r: Pick<RunResult, "credits" | "time" | "level" | "victory" | "stageId" | "duration">, salvageLevel: number) {
  const stage = stageById(r.stageId);
  const base = r.credits + Math.floor(r.time / 60) * 15 * (900 / Math.max(300, r.duration)) + r.level * 4;
  const mult = stage.rewardMult * (1 + salvageLevel * 0.1) * (r.victory ? 1.5 : 1);
  return Math.max(0, Math.round(base * mult));
}

export interface ApplyOutcome {
  progress: Progress;
  credits: number;
  newStages: string[];
  newBests: string[];
}

export function applyRun(prev: Progress, r: RunResult): ApplyOutcome {
  const p: Progress = structuredClone(prev);
  const credits = computeRunCredits(r, p.upgrades["salvage"] ?? 0);
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
  if (r.level > st.maxLevel) { st.maxLevel = r.level; newBests.push("level"); }
  if (r.kills > st.bestKills) { st.bestKills = r.kills; newBests.push("kills"); }
  // best time is stored in mission-minute equivalent seconds (normalised to 15 min)
  const norm = (r.time / Math.max(1, r.duration)) * 900;
  if (norm > (st.bestTime[r.stageId] ?? 0)) { st.bestTime[r.stageId] = Math.round(norm); newBests.push("time"); }
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
    { date: Date.now(), stageId: r.stageId, shipId: r.shipId, victory: r.victory, time: r.time, kills: r.kills, level: r.level, credits },
    ...p.history,
  ].slice(0, 10);
  return { progress: p, credits, newStages, newBests };
}

export type BuyResult = { ok: true; progress: Progress } | { ok: false; reason: string };

export function buyUpgrade(prev: Progress, id: string): BuyResult {
  const u = upgradeById(id);
  if (!u) return { ok: false, reason: "Mejora desconocida" };
  const lvl = prev.upgrades[id] ?? 0;
  if (lvl >= u.max) return { ok: false, reason: "Nivel máximo" };
  const cost = upgradeCost(id, lvl);
  if (prev.credits < cost) return { ok: false, reason: "Créditos insuficientes" };
  const p = structuredClone(prev);
  p.credits -= cost;
  p.upgrades[id] = lvl + 1;
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

export function missionValue(p: Progress, id: string): number {
  const m = MISSIONS.find((x) => x.id === id);
  return m ? Math.min(m.goal, m.metric(p)) : 0;
}

export function claimMission(prev: Progress, id: string): BuyResult {
  const m = MISSIONS.find((x) => x.id === id);
  if (!m) return { ok: false, reason: "Misión desconocida" };
  if (prev.claimed.includes(id)) return { ok: false, reason: "Ya reclamada" };
  if (m.metric(prev) < m.goal) return { ok: false, reason: "Objetivo incompleto" };
  const p = structuredClone(prev);
  p.claimed.push(id);
  p.credits += m.reward;
  p.stats.creditsEarned += m.reward;
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
