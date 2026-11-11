import { describe, expect, it } from "vitest";
import {
  HORDE_COUNT,
  WORLD1_HORDES,
  WORLD1_HORDE_PRESSURE,
  WORLD1_MAX_ENEMIES,
  world1PickupChanceAtHorde,
} from "../game/timeline";
import { vipDropMultiplier } from "../game/meta/vip";

describe("World 1 horde pickup progression", () => {
  it("uses the agreed scarce, progressive normal drop probabilities", () => {
    const expected = [0.0005, 0.0008, 0.0011, 0.0014, 0.0017, 0.002, 0.0023, 0.0026, 0.0029, 0.0032];
    const chances = Array.from({ length: HORDE_COUNT }, (_, index) => world1PickupChanceAtHorde(index));
    expect(chances).toEqual(expected);
    for (let index = 1; index < chances.length; index++) {
      expect(chances[index]).toBeGreaterThan(chances[index - 1]!);
    }
  });

  it("keeps elite drop chances modest and progressive", () => {
    const expected = [0.001, 0.0015, 0.002, 0.0025, 0.003, 0.0035, 0.004, 0.0045, 0.005, 0.006];
    expect(Array.from({ length: HORDE_COUNT }, (_, index) => world1PickupChanceAtHorde(index, true))).toEqual(expected);
  });

  it("applies VIP x20 while preserving Free probabilities", () => {
    expect(vipDropMultiplier(true)).toBe(20);
    expect(vipDropMultiplier(false)).toBe(1);
    expect(world1PickupChanceAtHorde(0) * vipDropMultiplier(true)).toBeCloseTo(0.01);
    expect(world1PickupChanceAtHorde(9) * vipDropMultiplier(true)).toBeCloseTo(0.064);
    expect(world1PickupChanceAtHorde(9, true) * vipDropMultiplier(true)).toBeCloseTo(0.12);
  });

  it("gives larvae half the normal chance, including VIP", () => {
    expect(world1PickupChanceAtHorde(0, false, true)).toBe(0.00025);
    expect(world1PickupChanceAtHorde(9, false, true)).toBe(0.0016);
    expect(world1PickupChanceAtHorde(0, false, true) * vipDropMultiplier(true)).toBeCloseTo(0.005);
  });

  it("clamps out-of-range horde indices", () => {
    expect(world1PickupChanceAtHorde(-1)).toBe(0.0005);
    expect(world1PickupChanceAtHorde(99)).toBe(0.0032);
  });
});

describe("World 1 advanced horde composition", () => {
  it("keeps combat enemies in hordes 7 to 10 instead of using parasite-only waves", () => {
    for (const horde of WORLD1_HORDES.slice(6)) {
      expect(horde["hunter"]).toBeGreaterThan(0);
      expect(horde["destroyer"]).toBeGreaterThan(0);
      expect(horde["bomber"]).toBeGreaterThan(0);
      expect(Object.values(horde).reduce((sum, weight) => sum + weight, 0)).toBe(100);
    }
  });
});

describe("World 1 individual enemy difficulty progression", () => {
  it("increases enemy HP and damage in every horde without increasing spawn frequency", () => {
    expect(WORLD1_HORDE_PRESSURE).toHaveLength(HORDE_COUNT);
    for (let index = 0; index < WORLD1_HORDE_PRESSURE.length; index++) {
      const current = WORLD1_HORDE_PRESSURE[index]!;
      expect(current.spawn).toBe(1);
      expect(current.speed).toBe(1);
      if (index > 0) {
        const previous = WORLD1_HORDE_PRESSURE[index - 1]!;
        expect(current.hp).toBeGreaterThan(previous.hp);
        expect(current.damage).toBeGreaterThan(previous.damage);
      }
    }
    expect(WORLD1_HORDE_PRESSURE[0]!.hp).toBe(1);
    expect(WORLD1_HORDE_PRESSURE[9]!.hp).toBe(3);
    expect(WORLD1_HORDE_PRESSURE[0]!.damage).toBe(1);
    expect(WORLD1_HORDE_PRESSURE[9]!.damage).toBe(2);
    expect(WORLD1_MAX_ENEMIES).toBe(90);
  });
});
