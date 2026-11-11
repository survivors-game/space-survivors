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
  it("increases normal drops from horde 1 to horde 10", () => {
    const chances = Array.from({ length: HORDE_COUNT }, (_, index) =>
      world1PickupChanceAtHorde(index),
    );

    expect(chances[0]).toBe(0.002);
    expect(chances[1]).toBeCloseTo(0.0035);
    expect(chances[9]).toBeCloseTo(0.0155);
    for (let index = 1; index < chances.length; index++) {
      expect(chances[index]).toBeGreaterThan(chances[index - 1]!);
    }
  });

  it("gives elite enemies a higher, progressive drop chance", () => {
    expect(world1PickupChanceAtHorde(0, true)).toBe(0.015);
    expect(world1PickupChanceAtHorde(1, true)).toBeCloseTo(0.019);
    expect(world1PickupChanceAtHorde(9, true)).toBeCloseTo(0.051);
  });

  it("gives VIP a thirty-fivefold drop chance at every horde", () => {
    expect(world1PickupChanceAtHorde(0) * vipDropMultiplier(true)).toBeCloseTo(0.07);
    expect(world1PickupChanceAtHorde(9) * vipDropMultiplier(true)).toBeCloseTo(0.5425);
    expect(world1PickupChanceAtHorde(9, true) * vipDropMultiplier(true)).toBeCloseTo(1.785);
    expect(vipDropMultiplier(false)).toBe(1);
  });

  it("clamps out-of-range horde indices", () => {
    expect(world1PickupChanceAtHorde(-1)).toBe(0.002);
    expect(world1PickupChanceAtHorde(99)).toBe(0.0155);
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
