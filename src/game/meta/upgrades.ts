// Permanent hangar upgrades bought with credits.
export interface HangarUpgrade {
  id: string;
  name: string;
  icon: string;
  desc: string;
  max: number;
  base: number;
}

export const UPGRADES: HangarUpgrade[] = [
  {
    id: "hull",
    name: "BLINDAJE DE CASCO",
    icon: "ic_maxhp",
    desc: "+10 integridad máxima",
    max: 5,
    base: 120,
  },
  {
    id: "engine",
    name: "MOTORES IÓNICOS",
    icon: "ic_engine",
    desc: "+4% velocidad de vuelo",
    max: 5,
    base: 120,
  },
  {
    id: "power",
    name: "AMPLIFICADOR",
    icon: "ic_damage",
    desc: "+5% daño de armas",
    max: 5,
    base: 160,
  },
  {
    id: "cooling",
    name: "DISIPADORES",
    icon: "ic_rate",
    desc: "-3% tiempo de recarga",
    max: 5,
    base: 160,
  },
  {
    id: "magnet",
    name: "COLECTOR",
    icon: "ic_magnet",
    desc: "+10% radio de recolección",
    max: 5,
    base: 100,
  },
  {
    id: "repair",
    name: "AUTORREPARACIÓN",
    icon: "ic_regen",
    desc: "+0.2 reparación por segundo",
    max: 5,
    base: 140,
  },
  {
    id: "salvage",
    name: "RECUPERACIÓN",
    icon: "ic_salvage",
    desc: "+10% créditos por misión",
    max: 5,
    base: 200,
  },
  {
    id: "reroll",
    name: "RECALIBRADOR",
    icon: "ic_reroll",
    desc: "+1 recalibración de mejoras por partida",
    max: 3,
    base: 300,
  },
];

export const upgradeById = (id: string) => UPGRADES.find((u) => u.id === id);

/** Cost of buying the next level when currently at `level` (0-based). */
export function upgradeCost(id: string, level: number): number {
  const u = upgradeById(id);
  if (!u) return Infinity;
  return Math.round((u.base * Math.pow(1.65, level)) / 10) * 10;
}

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

export function hangarBonuses(levels: Record<string, number>): HangarBonuses {
  const l = (k: string) => levels[k] ?? 0;
  return {
    hp: l("hull") * 10,
    speed: l("engine") * 0.04,
    dmg: l("power") * 0.05,
    cd: l("cooling") * 0.03,
    magnet: l("magnet") * 0.1,
    regen: l("repair") * 0.2,
    salvage: l("salvage") * 0.1,
    rerolls: l("reroll"),
  };
}
