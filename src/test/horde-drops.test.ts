import { describe, expect, it } from "vitest";
import { world1PickupChanceAtHorde } from "../game/timeline";
import { vipDropMultiplier } from "../game/meta/vip";

describe("World 1 horde pickup progression", () => {
  it("increases normal enemy drops gradually from horde 1 to horde 10", () => {
    const chances = Array.from({ length: 10 }, (_, index) =>
      world1PickupChanceAtHorde(index),
    );

    expect(chances[0]).toBe(0.001);
    expect(chances[1]).toBe(0.0015);
    expect(chances[2]).toBe(0.002);
    expect(chances[9]).toBe(0.0055);
    for (let index = 1; index < chances.length; index++) {
      expect(chances[index]).toBeGreaterThan(chances[index - 1]!);
    }
  });

  it("also increases elite drops with each harder horde", () => {
    expect(world1PickupChanceAtHorde(0, true)).toBe(0.005);
    expect(world1PickupChanceAtHorde(1, true)).toBe(0.0055);
    expect(world1PickupChanceAtHorde(9, true)).toBe(0.0095);
  });

  it("keeps the tenfold VIP multiplier at every horde", () => {
    expect(world1PickupChanceAtHorde(0) * vipDropMultiplier(true)).toBe(0.01);
    expect(world1PickupChanceAtHorde(9) * vipDropMultiplier(true)).toBeCloseTo(0.055);
    expect(vipDropMultiplier(false)).toBe(1);
  });

  it("clamps out-of-range horde indices", () => {
    expect(world1PickupChanceAtHorde(-1)).toBe(0.001);
    expect(world1PickupChanceAtHorde(99)).toBe(0.0055);
  });
});
