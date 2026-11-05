// The four combat scenarios.
export type ObstacleKind = "debris" | "asteroids" | "spires" | "pillars";
export type HazardKind = "none" | "meteors" | "spores" | "lasers";

export interface StageDef {
  id: string;
  name: string;
  subtitle: string;
  desc: string;
  difficulty: number;
  dmgMult: number;
  rewardMult: number;
  bg: string;
  nebula: [string, string, string];
  star: string;
  accent: string;
  planet: string;
  obstacles: ObstacleKind;
  obstacleCount: number;
  hazard: HazardKind;
  hazardName: string;
  unlockAfter: string | null;
}

export const STAGES: StageDef[] = [
  {
    id: "nova",
    name: "ÓRBITA NOVA",
    subtitle: "Sector 01 · Campo inicial",
    desc: "Órbita de un gigante azul sembrada de restos de satélites. El punto de partida de toda resistencia.",
    difficulty: 1,
    dmgMult: 1,
    rewardMult: 1,
    bg: "#07061a",
    nebula: ["#1d2a8f", "#4b1d8f", "#0e5a8f"],
    star: "#bcd7ff",
    accent: "#25f4ff",
    planet: "planet_nova",
    obstacles: "debris",
    obstacleCount: 26,
    hazard: "none",
    hazardName: "Sin peligros ambientales",
    unlockAfter: null,
  },
  {
    id: "ash",
    name: "CINTURÓN DE CENIZA",
    subtitle: "Sector 02 · Campo de asteroides",
    desc: "Rocas ardientes a la deriva y lluvias de meteoritos. Usa los asteroides como cobertura.",
    difficulty: 1.3,
    dmgMult: 1.12,
    rewardMult: 1.35,
    bg: "#120808",
    nebula: ["#8f3a1d", "#5e1d2a", "#8f6a1d"],
    star: "#ffd9b8",
    accent: "#ff8a1f",
    planet: "planet_ash",
    obstacles: "asteroids",
    obstacleCount: 60,
    hazard: "meteors",
    hazardName: "Lluvia de meteoritos",
    unlockAfter: "nova",
  },
  {
    id: "abyss",
    name: "SECTOR ABISAL",
    subtitle: "Sector 03 · Territorio alienígena",
    desc: "Arrecifes bioluminiscentes y nubes de esporas corrosivas que frenan tu nave.",
    difficulty: 1.65,
    dmgMult: 1.25,
    rewardMult: 1.75,
    bg: "#040d12",
    nebula: ["#0e7a6a", "#5a1f86", "#1d8f5a"],
    star: "#c8fff2",
    accent: "#2be8c8",
    planet: "planet_abyss",
    obstacles: "spires",
    obstacleCount: 44,
    hazard: "spores",
    hazardName: "Nubes de esporas",
    unlockAfter: "ash",
  },
  {
    id: "omega",
    name: "NÚCLEO OMEGA",
    subtitle: "Sector 04 · Instalación enemiga",
    desc: "El corazón de la flota hostil. Pilones blindados y barreras láser que barren el suelo.",
    difficulty: 2.05,
    dmgMult: 1.4,
    rewardMult: 2.3,
    bg: "#0a0614",
    nebula: ["#8f1d4b", "#1d2a8f", "#6a1d8f"],
    star: "#ffc8e6",
    accent: "#ff3df2",
    planet: "planet_omega",
    obstacles: "pillars",
    obstacleCount: 40,
    hazard: "lasers",
    hazardName: "Barreras láser",
    unlockAfter: "abyss",
  },
];

export const stageById = (id: string) => STAGES.find((s) => s.id === id) ?? STAGES[0]!;
