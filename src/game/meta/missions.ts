// Hangar missions: long-term objectives with credit rewards.
import type { Progress } from "./progress";

export interface MissionDef {
  id: string;
  name: string;
  desc: string;
  goal: number;
  reward: number;
  icon: string;
  metric: (p: Progress) => number;
}

export const MISSIONS: MissionDef[] = [
  { id: "first_flight", name: "PRIMER DESPEGUE", desc: "Completa tu primera misión", goal: 1, reward: 100, icon: "ic_speed", metric: (p) => p.stats.runs },
  { id: "kills_500", name: "CAZADOR DE CHATARRA", desc: "Destruye 500 naves enemigas", goal: 500, reward: 250, icon: "ic_crit", metric: (p) => p.stats.kills },
  { id: "kills_5000", name: "EXTERMINADOR", desc: "Destruye 5000 naves enemigas", goal: 5000, reward: 1200, icon: "ic_damage", metric: (p) => p.stats.kills },
  { id: "boss_leviathan", name: "CAZA AL LEVIATÁN", desc: "Derrota a LEVIATÁN", goal: 1, reward: 400, icon: "ic_nova", metric: (p) => p.stats.bossKills["leviathan"] ?? 0 },
  { id: "boss_nemesis", name: "NÉMESIS CAÍDA", desc: "Derrota a NÉMESIS", goal: 1, reward: 700, icon: "ic_arc", metric: (p) => p.stats.bossKills["nemesis"] ?? 0 },
  { id: "boss_colossus", name: "COLOSO DERRIBADO", desc: "Derrota al COLOSO", goal: 1, reward: 1200, icon: "ic_shield", metric: (p) => p.stats.bossKills["colossus"] ?? 0 },
  { id: "win_1", name: "SUPERVIVIENTE", desc: "Gana una misión completa", goal: 1, reward: 800, icon: "ic_xp", metric: (p) => p.stats.wins },
  { id: "level_25", name: "VETERANO", desc: "Alcanza el nivel 25 en una partida", goal: 25, reward: 500, icon: "ic_evo", metric: (p) => p.stats.maxLevel },
  { id: "evolve", name: "INGENIERO", desc: "Evoluciona un arma", goal: 1, reward: 400, icon: "ic_evo", metric: (p) => p.stats.evolutions },
  { id: "survive_ash", name: "TRAVESÍA DE CENIZA", desc: "Sobrevive 10 minutos en el Cinturón de Ceniza", goal: 600, reward: 700, icon: "ic_armor", metric: (p) => p.stats.bestTime["ash"] ?? 0 },
  { id: "stages_all", name: "EXPLORADOR", desc: "Desbloquea los cuatro escenarios", goal: 4, reward: 900, icon: "ic_field", metric: (p) => p.stages.length },
  { id: "fleet", name: "FLOTA COMPLETA", desc: "Desbloquea las cuatro naves", goal: 4, reward: 1500, icon: "ic_drones", metric: (p) => p.ships.length },
  { id: "marathon", name: "MARATÓN", desc: "Acumula 60 minutos de combate", goal: 3600, reward: 600, icon: "ic_rate", metric: (p) => p.stats.timePlayed },
  { id: "arsenal", name: "ARSENAL", desc: "Usa las 9 armas y módulos", goal: 9, reward: 800, icon: "ic_laser", metric: (p) => p.weaponsUsed.length },
];
