// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Input } from "@/game/input";

describe("game input", () => {
  beforeEach(() => Input.attach());
  afterEach(() => Input.detach());

  it("keeps WASD movement available through the global input layer", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyD" }));

    const movement = Input.getMoveVector();
    expect(movement.x).toBeCloseTo(Math.SQRT1_2);
    expect(movement.y).toBeCloseTo(-Math.SQRT1_2);
    expect(movement.mag).toBe(1);
  });

  it("ignores non-finite touch input instead of poisoning movement", () => {
    Input.setTouch(Number.NaN, Number.POSITIVE_INFINITY, true);

    expect(Input.getMoveVector()).toEqual({ x: 0, y: 0, mag: 0 });
  });
});
