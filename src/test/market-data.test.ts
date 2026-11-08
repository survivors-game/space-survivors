import { describe, expect, it } from "vitest";
import {
  P2P_COUNTRIES,
  P2P_PRICE_LIMITS,
  formatP2PPrice,
  parseP2PPriceToMinor,
} from "@/game/data/market";

describe("P2P natural-price conversion", () => {
  it.each([
    ["1500", 150_000],
    ["1,500", 150_000],
    ["1.500", 150_000],
    ["0.50", 50],
    ["0,50", 50],
    ["1,234.56", null],
    ["1.234,56", null],
    ["1.234", 123_400],
    ["1.2345", null],
    ["-1", null],
  ])("converts %s to minor units", (input, expected) => {
    expect(parseP2PPriceToMinor(input)).toBe(expected);
  });

  it("defines the required country currencies and limits", () => {
    expect(
      Object.fromEntries(
        Object.entries(P2P_COUNTRIES).map(([key, value]) => [key, value.currency]),
      ),
    ).toEqual({
      CO: "COP",
      VE: "VES",
      PE: "PEN",
      BR: "BRL",
      CU: "USD",
      OTHER: "USD",
    });
    expect(P2P_PRICE_LIMITS).toEqual({
      COP: { min: 100, max: 500_000_000 },
      VES: { min: 100, max: 5_000_000_000 },
      PEN: { min: 50, max: 1_500_000 },
      BRL: { min: 50, max: 2_000_000 },
      USD: { min: 1, max: 1_000_000 },
    });
  });

  it("formats minor units as a natural currency value", () => {
    expect(formatP2PPrice(150_000, "COP")).toContain("1.500,00");
    expect(formatP2PPrice(50, "PEN")).toContain("0,50");
  });
});
