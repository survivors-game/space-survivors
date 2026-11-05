// Player ships. Positions (engines, guns, lights) are in art pixels relative
// to the sprite centre, nose pointing up (-y).
export interface ShipDef {
  id: string;
  name: string;
  role: string;
  desc: string;
  sprite: string;
  cost: number;
  hp: number;
  speed: number;
  dmg: number;
  cd: number;
  pickup: number;
  armor: number;
  regen: number;
  crit: number;
  shield: number;
  startWeapon: string;
  engines: { x: number; y: number }[];
  guns: { x: number; y: number }[];
  lights: { x: number; y: number; color: string }[];
  trail: string;
  ability: string;
}

export const SHIPS: ShipDef[] = [
  {
    id: "falcon",
    name: "HALCÓN NOVA",
    role: "Interceptor polivalente",
    desc: "Casco equilibrado y láser de pulso de serie. Ideal para aprender a sobrevivir.",
    sprite: "ship_falcon",
    cost: 0,
    hp: 100,
    speed: 235,
    dmg: 1,
    cd: 1,
    pickup: 90,
    armor: 0,
    regen: 0,
    crit: 0.05,
    shield: 0,
    startWeapon: "laser",
    engines: [{ x: -2, y: 10 }, { x: 0, y: 10 }, { x: 2, y: 10 }],
    guns: [{ x: -7, y: -1 }, { x: 7, y: -1 }],
    lights: [{ x: -9, y: 5, color: "#ff3df2" }, { x: 9, y: 5, color: "#25f4ff" }],
    trail: "#25f4ff",
    ability: "Recalibración: +1 reroll por partida",
  },
  {
    id: "spectre",
    name: "ESPECTRO",
    role: "Asaltante furtivo",
    desc: "La nave más rápida de la flota. Menos blindaje, misiles guiados y críticos letales.",
    sprite: "ship_spectre",
    cost: 900,
    hp: 80,
    speed: 275,
    dmg: 1.05,
    cd: 0.95,
    pickup: 100,
    armor: 0,
    regen: 0,
    crit: 0.12,
    shield: 0,
    startWeapon: "missile",
    engines: [{ x: 0, y: 9 }],
    guns: [{ x: -6, y: -3 }, { x: 6, y: -3 }],
    lights: [{ x: -8, y: 5, color: "#ff3df2" }, { x: 8, y: 5, color: "#ff3df2" }],
    trail: "#ff3df2",
    ability: "Propulsor fantasma: impulso con recarga -30%",
  },
  {
    id: "bastion",
    name: "BASTIÓN",
    role: "Cañonera pesada",
    desc: "Blindaje grueso, escudo integrado y cañón de plasma. Lenta pero casi indestructible.",
    sprite: "ship_bastion",
    cost: 2200,
    hp: 150,
    speed: 200,
    dmg: 1.1,
    cd: 1.05,
    pickup: 80,
    armor: 2,
    regen: 0.3,
    crit: 0.03,
    shield: 30,
    startWeapon: "plasma",
    engines: [{ x: -6, y: 9 }, { x: -3, y: 9 }, { x: 3, y: 9 }, { x: 6, y: 9 }],
    guns: [{ x: -6, y: -6 }, { x: 6, y: -6 }],
    lights: [{ x: -10, y: 2, color: "#ffd23f" }, { x: 10, y: 2, color: "#ffd23f" }],
    trail: "#ffb347",
    ability: "Escudo integrado de 30 puntos",
  },
  {
    id: "chimera",
    name: "QUIMERA",
    role: "Nave biotecnológica",
    desc: "Casco vivo que se regenera y genera un campo eléctrico. Atrae la energía desde lejos.",
    sprite: "ship_chimera",
    cost: 4000,
    hp: 110,
    speed: 245,
    dmg: 1,
    cd: 0.92,
    pickup: 140,
    armor: 1,
    regen: 0.8,
    crit: 0.06,
    shield: 0,
    startWeapon: "field",
    engines: [{ x: -4, y: 8 }, { x: 4, y: 8 }],
    guns: [{ x: -8, y: -4 }, { x: 8, y: -4 }],
    lights: [{ x: -9, y: 4, color: "#7dff4f" }, { x: 9, y: 4, color: "#25f4ff" }],
    trail: "#7dff4f",
    ability: "Regeneración orgánica +0.8 PS/s",
  },
];

export const shipById = (id: string) => SHIPS.find((s) => s.id === id) ?? SHIPS[0]!;
