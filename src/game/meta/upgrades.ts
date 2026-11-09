 // Permanent hangar upgrades. Levels 1..(eliteFrom-1) cost credits only and keep the
// original formula. From eliteFrom onward each level also needs a merit requirement that is
// checked with data Progress already tracks.
import type { Progress } from "./progress";

export interface HangarUpgrade {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** Nivel máximo. */
  max: number;
  /** Coste base en CR (nivel 1). */
  base: number;
  /** Primer nivel que exige mérito además de créditos. */
  eliteFrom: number;
  /** Coste en CR del nivel máximo; los niveles de élite crecen hasta este valor. */
  eliteTarget: number;
}

export const UPGRADES: HangarUpgrade[] = [
  {
    id: "hull",
    name: "BLINDAJE DE CASCO",
    icon: "ic_maxhp",
    desc: "+10 integridad máxima",
    max: 10,
    base: 120,
    eliteFrom: 6,
    eliteTarget: 4000,
  },
  {
    id: "engine",
    name: "MOTORES IÓNICOS",
    icon: "ic_engine",
    desc: "+4% velocidad de vuelo",
    max: 10,
    base: 120,
    eliteFrom: 6,
    eliteTarget: 4000,
  },
  {
    id: "power",
    name: "AMPLIFICADOR",
    icon: "ic_damage",
    desc: "+5% daño de armas",
    max: 10,
    base: 160,
    eliteFrom: 6,
    eliteTarget: 5500,
  },
  {
    id: "cooling",
    name: "DISIPADORES",
    icon: "ic_rate",
    desc: "-3% tiempo de recarga",
    max: 10,
    base: 160,
    eliteFrom: 6,
    eliteTarget: 5500,
  },
  {
    id: "magnet",
    name: "COLECTOR",
    icon: "ic_magnet",
    desc: "+10% radio de recolección",
    max: 10,
    base: 100,
    eliteFrom: 6,
    eliteTarget: 3000,
  },
  {
    id: "repair",
    name: "AUTORREPARACIÓN",
    icon: "ic_regen",
    desc: "+0.2 reparación por segundo",
    max: 10,
    base: 140,
    eliteFrom: 6,
    eliteTarget: 4500,
  },
  {
    id: "salvage",
    name: "RECUPERACIÓN",
    icon: "ic_salvage",
    desc: "+10% créditos por misión",
    max: 10,
    base: 200,
    eliteFrom: 6,
    eliteTarget: 5500,
  },
  {
    id: "reroll",
    name: "RECALIBRADOR",
    icon: "ic_reroll",
    desc: "+1 recalibración de mejoras por partida",
    max: 5,
    base: 300,
    eliteFrom: 4,
    eliteTarget: 1200,
  },
];

export const upgradeById = (id: string) => UPGRADES.find((u) => u.id === id);

/* ---------------- Mérito: requisitos para la etapa de élite ---------------- */

export interface MeritRequirement {
  label: string;
  goal: number;
  /** Lee solo datos que Progress ya guarda. */
  progress: (p: Progress) => number;
}

const bestSurvivalSec = (p: Progress) => Math.max(0, ...Object.values(p.stats.bestTime));
const bossKill = (id: string) => (p: Progress) => p.stats.bossKills[id] ?? 0;

/** Requisitos por mejora, en orden: el índice 0 corresponde a `eliteFrom`. */
export const MERIT_REQUIREMENTS: Record<string, MeritRequirement[]> = {
  hull: [
    { label: "Completa 25 partidas", goal: 25, progress: (p) => p.stats.runs },
    { label: "Derrota 5 veces a LEVIATÁN", goal: 5, progress: bossKill("leviathan") },
    { label: "Sobrevive 10 minutos en una partida", goal: 600, progress: bestSurvivalSec },
    { label: "Alcanza el nivel 18 en una partida", goal: 18, progress: (p) => p.stats.maxLevel },
    { label: "Derrota 3 veces a NÉMESIS", goal: 3, progress: bossKill("nemesis") },
  ],
  engine: [
    { label: "Gana 3 misiones", goal: 3, progress: (p) => p.stats.wins },
    { label: "Supera 2 sectores", goal: 2, progress: (p) => p.stagesCleared.length },
    { label: "Destruye 300 naves en una partida", goal: 300, progress: (p) => p.stats.bestKills },
    { label: "Consigue 10 evoluciones de arma", goal: 10, progress: (p) => p.stats.evolutions },
    { label: "Gana 10 misiones", goal: 10, progress: (p) => p.stats.wins },
  ],
  power: [
    { label: "Inflige 100.000 de daño en total", goal: 100000, progress: (p) => p.stats.damageDealt },
    { label: "Consigue 5 evoluciones de arma", goal: 5, progress: (p) => p.stats.evolutions },
    { label: "Derrota 3 veces a COLOSO", goal: 3, progress: bossKill("colossus") },
    { label: "Destruye 600 naves en una partida", goal: 600, progress: (p) => p.stats.bestKills },
    { label: "Alcanza el nivel 20 en una partida", goal: 20, progress: (p) => p.stats.maxLevel },
  ],
  cooling: [
    { label: "Completa 15 partidas", goal: 15, progress: (p) => p.stats.runs },
    { label: "Sobrevive 5 minutos en una partida", goal: 300, progress: bestSurvivalSec },
    { label: "Supera 3 sectores", goal: 3, progress: (p) => p.stagesCleared.length },
    { label: "Derrota 2 veces a NÉMESIS", goal: 2, progress: bossKill("nemesis") },
    { label: "Destruye 5.000 naves en total", goal: 5000, progress: (p) => p.stats.kills },
  ],
  magnet: [
    { label: "Completa 10 partidas", goal: 10, progress: (p) => p.stats.runs },
    { label: "Alcanza el nivel 12 en una partida", goal: 12, progress: (p) => p.stats.maxLevel },
    { label: "Gana 5 misiones", goal: 5, progress: (p) => p.stats.wins },
    { label: "Destruye 3.000 naves en total", goal: 3000, progress: (p) => p.stats.kills },
    { label: "Derrota 4 veces a LEVIATÁN", goal: 4, progress: bossKill("leviathan") },
  ],
  repair: [
    { label: "Sobrevive 10 minutos en una partida", goal: 600, progress: bestSurvivalSec },
    { label: "Completa 30 partidas", goal: 30, progress: (p) => p.stats.runs },
    { label: "Derrota 3 veces a LEVIATÁN", goal: 3, progress: bossKill("leviathan") },
    { label: "Gana 15 misiones", goal: 15, progress: (p) => p.stats.wins },
    { label: "Derrota 2 veces a COLOSO", goal: 2, progress: bossKill("colossus") },
  ],
  salvage: [
    { label: "Acumula 20.000 CR ganados", goal: 20000, progress: (p) => p.stats.creditsEarned },
    { label: "Completa 20 partidas", goal: 20, progress: (p) => p.stats.runs },
    { label: "Gana 25 misiones", goal: 25, progress: (p) => p.stats.wins },
    { label: "Acumula 50.000 CR ganados", goal: 50000, progress: (p) => p.stats.creditsEarned },
    { label: "Derrota 5 veces a NÉMESIS", goal: 5, progress: bossKill("nemesis") },
  ],
  reroll: [
    { label: "Completa 10 partidas", goal: 10, progress: (p) => p.stats.runs },
    { label: "Derrota 2 veces a COLOSO", goal: 2, progress: bossKill("colossus") },
  ],
};

/** Requisito de mérito para comprar el nivel `nextLevel` (1-based), o null si no hay. */
export function upgradeRequirement(id: string, nextLevel: number): MeritRequirement | null {
  const u = upgradeById(id);
  if (!u || nextLevel < u.eliteFrom) return null;
  return (MERIT_REQUIREMENTS[id] ?? [])[nextLevel - u.eliteFrom] ?? null;
}

/* ---------------- Costes ---------------- */

/** Cost of buying the next level when currently at `level` (0-based). */
export function upgradeCost(id: string, level: number): number {
  const u = upgradeById(id);
  if (!u) return Infinity;
  const n = level + 1;
  const k = u.eliteFrom - 1; // último nivel de etapa base
  const lastBaseCost = u.base * Math.pow(1.65, k - 1);
  // La élite crece de forma geométrica desde el último nivel base hasta eliteTarget en el máximo.
  const growth = Math.pow(u.eliteTarget / lastBaseCost, 1 / (u.max - k));
  const raw = n <= k ? u.base * Math.pow(1.65, n - 1) : lastBaseCost * Math.pow(growth, n - k);
  return Math.round(raw / 10) * 10;
}

/* ---------------- Bonos ---------------- */

/** Fracción del efecto que aporta cada nivel de élite (rendimientos decrecientes). */
export const ELITE_EFFICIENCY = 0.6;
/** Último nivel con efecto completo (los niveles 1-5 no cambian). */
const FULL_EFFECT_LEVELS = 5;

export interface HangarBonuses {
  hp: number;
  speed: number;
  dmg: number;
  cd: number;
  magnet: number;
  regen: number;
  salvage: number;
  rerolls: number;
}

/** Nivel efectivo: 1 por nivel hasta el 5, 0.6 por nivel a partir de ahí. */
export function effectiveLevel(level: number, u: HangarUpgrade): number {
  if (u.id === "reroll") return level;
  return level <= FULL_EFFECT_LEVELS
    ? level
    : FULL_EFFECT_LEVELS + ELITE_EFFICIENCY * (level - FULL_EFFECT_LEVELS);
}

/* ---------------- Módulos de especialización (nivel 10) ---------------- */

export const MODULE_UNLOCK_LEVEL = 10;

export type BonusKey = keyof HangarBonuses;
export interface ModuleEffect {
  /** Multiplica el bono final. */
  mul?: number;
  /** Suma al bono final (después de multiplicar). */
  add?: number;
}
export interface UpgradeModule {
  id: string;
  name: string;
  desc: string;
  effects: Partial<Record<BonusKey, ModuleEffect>>;
}

export const MODULES: Record<string, UpgradeModule[]> = {
  hull: [
    {
      id: "reinforced",
      name: "CASCO REFORZADO",
      desc: "+30% integridad · −0.03 velocidad",
      effects: { hp: { mul: 1.3 }, speed: { add: -0.03 } },
    },
    {
      id: "light",
      name: "CASCO LIGERO",
      desc: "−15% integridad · +0.03 velocidad",
      effects: { hp: { mul: 0.85 }, speed: { add: 0.03 } },
    },
  ],
  engine: [
    {
      id: "turbo",
      name: "PROPULSIÓN TURBO",
      desc: "+0.06 velocidad · −10 integridad",
      effects: { speed: { add: 0.06 }, hp: { add: -10 } },
    },
    {
      id: "tactical",
      name: "NAVEGACIÓN TÁCTICA",
      desc: "+25% radio de recolección · −0.02 velocidad",
      effects: { magnet: { mul: 1.25 }, speed: { add: -0.02 } },
    },
  ],
  power: [
    {
      id: "heavy",
      name: "IMPACTO PESADO",
      desc: "+12% daño · −3% recarga (más lenta)",
      effects: { dmg: { add: 0.12 }, cd: { add: -0.03 } },
    },
    {
      id: "rapid",
      name: "CADENCIA RÁPIDA",
      desc: "+8% recarga (más rápida) · −5% daño",
      effects: { cd: { add: 0.08 }, dmg: { add: -0.05 } },
    },
  ],
  cooling: [
    {
      id: "cryo",
      name: "CRIOGÉNICO",
      desc: "+8% recarga · +0.2 reparación/s",
      effects: { cd: { add: 0.08 }, regen: { add: 0.2 } },
    },
    {
      id: "extreme",
      name: "DISIPADOR EXTREMO",
      desc: "+12% recarga · −4% daño",
      effects: { cd: { add: 0.12 }, dmg: { add: -0.04 } },
    },
  ],
  magnet: [
    {
      id: "longrange",
      name: "IMÁN DE LARGO ALCANCE",
      desc: "×1.6 radio de recolección",
      effects: { magnet: { mul: 1.6 } },
    },
    {
      id: "pulse",
      name: "IMÁN PULSADO",
      desc: "×1.2 radio · +10% créditos por misión",
      effects: { magnet: { mul: 1.2 }, salvage: { add: 0.1 } },
    },
  ],
  repair: [
    {
      id: "nanoMax",
      name: "NANOBOTS MAYORES",
      desc: "×1.6 reparación · −5 integridad",
      effects: { regen: { mul: 1.6 }, hp: { add: -5 } },
    },
    {
      id: "precision",
      name: "NANOBOTS DE PRECISIÓN",
      desc: "×1.2 reparación · +10 integridad",
      effects: { regen: { mul: 1.2 }, hp: { add: 10 } },
    },
  ],
  salvage: [
    {
      id: "deepMining",
      name: "MINERÍA PROFUNDA",
      desc: "×1.5 créditos por misión",
      effects: { salvage: { mul: 1.5 } },
    },
    {
      id: "scavenger",
      name: "CARROÑERO",
      desc: "×1.2 créditos por misión · +0.2 radio de recolección",
      effects: { salvage: { mul: 1.2 }, magnet: { add: 0.2 } },
    },
  ],
};

export const moduleById = (upgradeId: string, moduleId: string): UpgradeModule | undefined =>
  (MODULES[upgradeId] ?? []).find((m) => m.id === moduleId);

/** Coste en CR de cambiar un módulo ya instalado. */
export function moduleSwapCost(upgradeId: string): number {
  const u = upgradeById(upgradeId);
  return u ? Math.round((u.eliteTarget * 0.1) / 10) * 10 : Infinity;
}

/**
 * Bonos finales que usa el motor. Los niveles 1-5 dan lo mismo que antes;
 * los niveles de élite dan menos por nivel, y el módulo instalado (nivel 10) ajusta el resultado.
 */
export function hangarBonuses(
  levels: Record<string, number>,
  modules: Record<string, string> = {},
): HangarBonuses {
  const eff = (id: string) => {
    const u = upgradeById(id);
    return u ? effectiveLevel(levels[id] ?? 0, u) : 0;
  };
  const b: HangarBonuses = {
    hp: eff("hull") * 10,
    speed: eff("engine") * 0.04,
    dmg: eff("power") * 0.05,
    cd: eff("cooling") * 0.03,
    magnet: eff("magnet") * 0.1,
    regen: eff("repair") * 0.2,
    salvage: eff("salvage") * 0.1,
    rerolls: levels["reroll"] ?? 0,
  };
  for (const u of UPGRADES) {
    if ((levels[u.id] ?? 0) < MODULE_UNLOCK_LEVEL) continue;
    const m = moduleById(u.id, modules[u.id] ?? "");
    if (!m) continue;
    for (const [key, fx] of Object.entries(m.effects) as [BonusKey, ModuleEffect][]) {
      b[key] = Math.max(0, b[key] * (fx.mul ?? 1) + (fx.add ?? 0));
    }
  }
  return b;
}

/** Texto corto del efecto de un nivel, para mostrar en la tienda del hangar. */
export function formatUpgradeEffect(id: string, level: number): string {
  const b = hangarBonuses({ [id]: level });
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  switch (id) {
    case "hull":
      return `${b.hp} integridad`;
    case "engine":
      return `+${pct(b.speed)} velocidad`;
    case "power":
      return `+${pct(b.dmg)} daño`;
    case "cooling":
      return `-${pct(b.cd)} recarga`;
    case "magnet":
      return `+${pct(b.magnet)} radio`;
    case "repair":
      return `${b.regen.toFixed(1)} reparación/s`;
    case "salvage":
      return `+${pct(b.salvage)} créditos`;
    case "reroll":
      return `${b.rerolls} recalibración${b.rerolls === 1 ? "" : "es"}`;
    default:
      return "";
  }
}