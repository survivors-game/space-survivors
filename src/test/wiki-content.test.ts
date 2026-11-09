 import { describe, expect, it } from "vitest";

import { ART } from "@/game/art";
import { BOSSES } from "@/game/data/bosses";
import { ENEMIES } from "@/game/data/enemies";
import { PASSIVES } from "@/game/data/passives";
import { SHIPS } from "@/game/data/ships";
import { WEAPONS } from "@/game/data/weapons";
import { STAGES } from "@/game/data/stages";
import { UPGRADES } from "@/game/meta/upgrades";

/** Sprites que la wiki muestra con los iconos de misiones y desafíos. */
const MISSION_SPRITES = [
  "ic_crit",
  "ic_speed",
  "ic_damage",
  "ic_shield",
  "ic_plasma",
  "ic_rate",
  "ic_evo",
  "ic_nova",
  "ic_arc",
  "ic_engine",
  "ic_lock",
];

describe("contenido de la wiki", () => {
  it("cada nave, enemigo, jefe, arma, pasiva y mejora tiene un sprite que existe", () => {
    const ids = [
      ...SHIPS.map((s) => s.sprite),
      ...ENEMIES.map((e) => e.sprite),
      ...BOSSES.map((b) => b.sprite),
      ...WEAPONS.map((w) => w.icon),
      ...PASSIVES.map((p) => p.icon),
      ...UPGRADES.map((u) => u.icon),
      ...MISSION_SPRITES,
    ];
    for (const id of ids) {
      expect(ART[id] ?? null).not.toBeNull();
    }
  });

  it("todos los sectores tienen nombre, subtítulo y descripción", () => {
    for (const s of STAGES) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.subtitle.length).toBeGreaterThan(0);
      expect(s.desc.length).toBeGreaterThan(0);
    }
  });

  it("cada arma evoluciona con una pasiva que existe en el juego", () => {
    for (const w of WEAPONS) {
      expect(PASSIVES.some((p) => p.id === w.evo.passive)).toBe(true);
    }
  });
});