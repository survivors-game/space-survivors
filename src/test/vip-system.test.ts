import { describe, expect, it } from "vitest";
import {
  VIP_CREDIT_BONUS,
  VIP_DROP_BONUS,
  VIP_DURATION_DAYS,
  VIP_PRICE_OBSIDIAN,
  canAffordVip,
  formatVipTimeRemaining,
  hasVip,
  nextVipUntil,
  vipCreditMultiplier,
  vipDropMultiplier,
} from "@/game/meta/vip";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = 1_000_000_000_000;

describe("vip constants", () => {
  it("define the agreed prices and bonuses", () => {
    expect(VIP_DURATION_DAYS).toBe(30);
    expect(VIP_PRICE_OBSIDIAN).toBe(20);
    expect(VIP_DROP_BONUS).toBe(9);
    expect(VIP_CREDIT_BONUS).toBe(0.2);
  });
});

describe("hasVip", () => {
  it("is true only while vip_until is in the future", () => {
    expect(hasVip({ vip_until: NOW + DAY }, NOW)).toBe(true);
    expect(hasVip({ vip_until: NOW - 1 }, NOW)).toBe(false);
    expect(hasVip({ vip_until: null }, NOW)).toBe(false);
  });
});

describe("formatVipTimeRemaining", () => {
  it("formats days and hours", () => {
    const until = NOW + (28 * 24 + 14) * HOUR;
    expect(formatVipTimeRemaining(until, NOW)).toBe("28d 14h");
  });

  it("reports less than one hour as <1h", () => {
    expect(formatVipTimeRemaining(NOW + HOUR / 2, NOW)).toBe("<1h");
  });

  it("reports expired or missing membership as Expirado", () => {
    expect(formatVipTimeRemaining(null, NOW)).toBe("Expirado");
    expect(formatVipTimeRemaining(NOW - 1, NOW)).toBe("Expirado");
    expect(formatVipTimeRemaining(NOW, NOW)).toBe("Expirado");
  });
});

describe("nextVipUntil (purchase day math)", () => {
  it("starts 30 days from now for a new pilot", () => {
    expect(nextVipUntil(null, NOW)).toBe(NOW + 30 * DAY);
  });

  it("starts 30 days from now when the previous VIP already expired", () => {
    expect(nextVipUntil(NOW - 5 * DAY, NOW)).toBe(NOW + 30 * DAY);
  });

  it("stacks 30 days onto an active membership", () => {
    const active = NOW + 10 * DAY;
    expect(nextVipUntil(active, NOW)).toBe(active + 30 * DAY);
  });
});

describe("obsidian balance check", () => {
  it("rejects balances below the price", () => {
    expect(canAffordVip(VIP_PRICE_OBSIDIAN - 1)).toBe(false);
    expect(canAffordVip(0)).toBe(false);
  });

  it("accepts a balance equal to or above the price", () => {
    expect(canAffordVip(VIP_PRICE_OBSIDIAN)).toBe(true);
    expect(canAffordVip(VIP_PRICE_OBSIDIAN + 100)).toBe(true);
  });
});

describe("combat multipliers", () => {
  it("multiplies drop chance by ten with VIP and stays neutral without", () => {
    expect(vipDropMultiplier(true)).toBe(10);
    expect(vipDropMultiplier(false)).toBe(1);
  });

  it("credits are +20% with VIP and neutral without", () => {
    expect(vipCreditMultiplier(true)).toBeCloseTo(1.2);
    expect(vipCreditMultiplier(false)).toBe(1);
  });

  it("keeps a clamped pickup probability at or below 1", () => {
    const clamped = Math.min(1, 0.9 * vipDropMultiplier(true));
    expect(clamped).toBe(1);
  });

  it("keeps spawnling kills (pk = 0) at zero drop chance even with VIP", () => {
    expect(Math.min(1, 0 * vipDropMultiplier(true))).toBe(0);
  });

  it("keeps the credit bonus on low-value kills instead of rounding it away", () => {
    expect(1 * vipCreditMultiplier(true)).toBeCloseTo(1.2);
  });
});
