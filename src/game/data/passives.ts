// Passive upgrades offered at level-up (template section 10, re-themed).
// Effects are applied by Engine.recomputeStats() from the stack counts.
export interface PassiveDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  maxStacks: number;
  color: string;
}

export const PASSIVES: PassiveDef[] = [
  {
    id: "damage",
    name: "NÚCLEO DE DAÑO",
    icon: "ic_damage",
    desc: "+12% daño de todas las armas",
    maxStacks: 5,
    color: "#ff2d55",
  },
  {
    id: "speed",
    name: "PROPULSORES",
    icon: "ic_speed",
    desc: "+8% velocidad y recarga de impulso",
    maxStacks: 5,
    color: "#7dff4f",
  },
  {
    id: "rate",
    name: "REFRIGERACIÓN",
    icon: "ic_rate",
    desc: "-8% tiempo de recarga de armas",
    maxStacks: 5,
    color: "#25f4ff",
  },
  {
    id: "maxhp",
    name: "BLINDAJE",
    icon: "ic_maxhp",
    desc: "+20 integridad máxima del casco",
    maxStacks: 5,
    color: "#c9d4ea",
  },
  {
    id: "armor",
    name: "PLACAS REACTIVAS",
    icon: "ic_armor",
    desc: "-1 daño recibido por impacto",
    maxStacks: 5,
    color: "#7884a8",
  },
  {
    id: "regen",
    name: "NANOBOTS",
    icon: "ic_regen",
    desc: "+0.4 reparación por segundo",
    maxStacks: 5,
    color: "#7dff4f",
  },
  {
    id: "magnet",
    name: "IMÁN DE ENERGÍA",
    icon: "ic_magnet",
    desc: "+25% radio de recolección",
    maxStacks: 5,
    color: "#ff3df2",
  },
  {
    id: "xp",
    name: "ANALIZADOR",
    icon: "ic_xp",
    desc: "+12% experiencia obtenida",
    maxStacks: 5,
    color: "#ffd23f",
  },
  {
    id: "crit",
    name: "MIRA TÁCTICA",
    icon: "ic_crit",
    desc: "+6% probabilidad de crítico (x2)",
    maxStacks: 5,
    color: "#ff2d55",
  },
];

export const passiveById = (id: string) => PASSIVES.find((p) => p.id === id);
