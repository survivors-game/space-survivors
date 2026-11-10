export const BOSS_COOLDOWN_MS = 60 * 60 * 1000;

export interface BossRewardDef {
  bossId: string;
  world: number;
  obsidian: number;
  shipChance: number;
  itemChance: number;
  rank: "D" | "C" | "B";
}

export const BOSS_REWARDS: BossRewardDef[] = [
  { bossId: "leviathan", world: 1, obsidian: 3, shipChance: 0.01, itemChance: 0.015, rank: "D" },
  { bossId: "nemesis", world: 2, obsidian: 5, shipChance: 0.01, itemChance: 0.015, rank: "C" },
  { bossId: "colossus", world: 3, obsidian: 8, shipChance: 0.01, itemChance: 0.015, rank: "B" },
];
