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
    expect(world1PickupChanceAtHorde(9, true) * vipDropMultiplier(true)).toBeCloseTo(1);
    expect(vipDropMultiplier(false)).toBe(1);
  });

  it("clamps out-of-range horde indices", () => {
    expect(world1PickupChanceAtHorde(-1)).toBe(0.002);
    expect(world1PickupChanceAtHorde(99)).toBe(0.0155);
  });
});

describe("World 1 advanced horde pressure", () => {
  it("keeps combat enemies in hordes 7 to 10 instead of using parasite-only waves", () => {
    for (const horde of WORLD1_HORDES.slice(6)) {
      expect(horde["hunter"]).toBeGreaterThan(0);
      expect(horde["destroyer"]).toBeGreaterThan(0);
      expect(horde["bomber"]).toBeGreaterThan(0);
      expect(Object.values(horde).reduce((sum, weight) => sum + weight, 0)).toBe(100);
    }
  });

  it("increases enemy durability, damage and spawn pressure through horde 10", () => {
    const advanced = WORLD1_HORDE_PRESSURE.slice(6);
    for (let index = 1; index < advanced.length; index++) {
      expect(advanced[index]!.hp).toBeGreaterThan(advanced[index - 1]!.hp);
      expect(advanced[index]!.damage).toBeGreaterThan(advanced[index - 1]!.damage);
      expect(advanced[index]!.spawn).toBeLessThan(advanced[index - 1]!.spawn);
    }
    expect(WORLD1_MAX_ENEMIES).toBe(90);
  });
});
