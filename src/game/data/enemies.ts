// Enemy families (template section 11, re-designed as five ship families).
export type Behavior =
  "interceptor" | "hunter" | "destroyer" | "bomber" | "parasite" | "spawnling" | "generator";

export interface EnemyDef {
  id: string;
  name: string;
  family: string;
  desc: string;
  hp: number;
  dmg: number;
  speed: number;
  radius: number;
  xp: number;
  credits: number;
  sprite: string;
  scale: number;
  color: string;
  behavior: Behavior;
  knockResist: number;
  shootCD: number;
  shotSpeed: number;
  shotDmg: number;
  engines: { x: number; y: number }[];
  threat: number; // 1..5 for the bestiary
  hidden?: boolean;
}

export const ENEMIES: EnemyDef[] = [
  {
    id: "interceptor",
    name: "INTERCEPTOR",
    family: "Interceptores",
    desc: "Dardos pequeños y veloces que llegan en enjambres y formaciones en V.",
    hp: 20,
    dmg: 8,
    speed: 150,
    radius: 12,
    xp: 1,
    credits: 1,
    sprite: "en_interceptor",
    scale: 2.6,
    color: "#ff8a1f",
    behavior: "interceptor",
    knockResist: 0,
    shootCD: 0,
    shotSpeed: 0,
    shotDmg: 0,
    engines: [{ x: 0, y: 5 }],
    threat: 1,
  },
  {
    id: "hunter",
    name: "CAZADOR",
    family: "Cazadores",
    desc: "Persiguen sin descanso y se lanzan en embestidas cuando te tienen a tiro.",
    hp: 52,
    dmg: 14,
    speed: 125,
    radius: 15,
    xp: 3,
    credits: 3,
    sprite: "en_hunter",
    scale: 2.8,
    color: "#ff2d55",
    behavior: "hunter",
    knockResist: 0.2,
    shootCD: 0,
    shotSpeed: 0,
    shotDmg: 0,
    engines: [{ x: 0, y: 6 }],
    threat: 2,
  },
  {
    id: "destroyer",
    name: "DESTRUCTOR",
    family: "Destructores",
    desc: "Cruceros blindados, lentos y muy resistentes. Disparan andanadas de flak.",
    hp: 280,
    dmg: 22,
    speed: 55,
    radius: 28,
    xp: 14,
    credits: 12,
    sprite: "en_destroyer",
    scale: 3,
    color: "#7fa0ff",
    behavior: "destroyer",
    knockResist: 0.85,
    shootCD: 3.2,
    shotSpeed: 210,
    shotDmg: 14,
    engines: [
      { x: -2, y: 9 },
      { x: 2, y: 9 },
    ],
    threat: 3,
  },
  {
    id: "bomber",
    name: "BOMBARDERO",
    family: "Bombarderos",
    desc: "Mantienen la distancia, te rodean y lanzan bombas que estallan en área.",
    hp: 85,
    dmg: 12,
    speed: 95,
    radius: 20,
    xp: 5,
    credits: 5,
    sprite: "en_bomber",
    scale: 3,
    color: "#ff3df2",
    behavior: "bomber",
    knockResist: 0.3,
    shootCD: 2.4,
    shotSpeed: 260,
    shotDmg: 18,
    engines: [
      { x: -1, y: 6 },
      { x: 1, y: 6 },
    ],
    threat: 3,
  },
  {
    id: "parasite",
    name: "NAVE PARASITARIA",
    family: "Naves parasitarias",
    desc: "Organismos-nave que se acercan y liberan larvas de combate sin parar.",
    hp: 130,
    dmg: 14,
    speed: 70,
    radius: 18,
    xp: 7,
    credits: 6,
    sprite: "en_parasite",
    scale: 3,
    color: "#7dff4f",
    behavior: "parasite",
    knockResist: 0.4,
    shootCD: 3.4,
    shotSpeed: 0,
    shotDmg: 0,
    engines: [],
    threat: 4,
  },
  {
    id: "spawnling",
    name: "LARVA",
    family: "Naves parasitarias",
    desc: "Unidades diminutas liberadas por las naves parasitarias. Frágiles pero rapidísimas.",
    hp: 14,
    dmg: 6,
    speed: 175,
    radius: 7,
    xp: 0,
    credits: 0,
    sprite: "en_spawnling",
    scale: 2.4,
    color: "#b8ff6a",
    behavior: "spawnling",
    knockResist: 0,
    shootCD: 0,
    shotSpeed: 0,
    shotDmg: 0,
    engines: [],
    threat: 1,
  },
  {
    id: "generator",
    name: "GENERADOR DE ESCUDO",
    family: "Coloso",
    desc: "Nodos que alimentan el escudo del COLOSO. Destrúyelos para dañarlo.",
    hp: 380,
    dmg: 14,
    speed: 0,
    radius: 14,
    xp: 8,
    credits: 10,
    sprite: "en_generator",
    scale: 3,
    color: "#25f4ff",
    behavior: "generator",
    knockResist: 1,
    shootCD: 2.8,
    shotSpeed: 220,
    shotDmg: 12,
    engines: [],
    threat: 3,
    hidden: true,
  },
];

export const enemyById = (id: string) => ENEMIES.find((e) => e.id === id) ?? ENEMIES[0]!;
export const ENEMY_FAMILIES = ["interceptor", "hunter", "destroyer", "bomber", "parasite"] as const;
