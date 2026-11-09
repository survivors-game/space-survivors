import { describe, expect, it } from "vitest";

import type { RunResult } from "@/game/types";
import {
  getActiveDailyMissions,
  getActiveWeeklyMissions,
  getDailyTimeRemaining,
  getWeeklyTimeRemaining,
  getUtcWeekStr,
  getSeasonBarInfo,
  seasonLevelFor,
} from "@/game/meta/missions";
import {
  applyRun,
  claimDailyChest,
  claimPeriodMission,
  claimSeasonChallenge,
  claimSeasonLevel,
  addSeasonPt,
  defaultProgress,
  getSeasonBoard,
  sanitize,
} from "@/game/meta/progress";

const run = (over: Partial<RunResult> = {}): RunResult => ({
  victory: false,
  finalBossDefeated: false,
  stageId: "nova",
  shipId: "falcon",
  time: 400,
  duration: 900,
  kills: 200,
  killsByType: { drone: 200 },
  bossesDefeated: [],
  level: 12,
  damageDealt: 30000,
  damageTaken: 10,
  energy: 0,
  evolutions: 2,
  weapons: [],
  maxPhase: 1,
  credits: 10,
  ...over,
});

const NOON_SUNDAY = Date.UTC(2026, 10, 8, 12, 0, 0);

describe("misiones de temporada: calendario y selección", () => {
  it("elige 6 diarias deterministas con 2 por tier", () => {
    const a = getActiveDailyMissions("2026-11-08");
    const b = getActiveDailyMissions("2026-11-08");
    expect(a.map((m) => m.id)).toEqual(b.map((m) => m.id));
    expect(a).toHaveLength(6);
    expect(a.filter((m) => m.tier === "BASIC")).toHaveLength(2);
    expect(a.filter((m) => m.tier === "PILOT")).toHaveLength(2);
    expect(a.filter((m) => m.tier === "ELITE")).toHaveLength(2);
  });

  it("elige 8 semanales únicas", () => {
    const w = getActiveWeeklyMissions("2026-11-02");
    expect(w).toHaveLength(8);
    expect(new Set(w.map((m) => m.id)).size).toBe(8);
  });

  it("calcula reinicios en UTC", () => {
    expect(getDailyTimeRemaining(NOON_SUNDAY)).toBe(12 * 3_600_000);
    expect(getWeeklyTimeRemaining(NOON_SUNDAY)).toBe(12 * 3_600_000);
    expect(getUtcWeekStr(NOON_SUNDAY)).toBe("2026-11-02");
    expect(getWeeklyTimeRemaining(Date.UTC(2026, 10, 2, 0, 0, 0))).toBe(7 * 86_400_000);
  });
});

describe("misiones de temporada: persistencia", () => {
  it("una partida antigua sin season conserva créditos, naves y estadísticas", () => {
    const old = {
      credits: 1234,
      ships: ["falcon"],
      selectedShip: "falcon",
      stats: { kills: 77 },
    };
    const p = sanitize(old);
    expect(p.credits).toBe(1234);
    expect(p.stats.kills).toBe(77);
    expect(p.season).toEqual(defaultProgress().season);
  });

  it("normaliza valores corruptos de temporada", () => {
    const p = sanitize({
      season: { pt: -5, claimedFree: [1, 99, "x", 1], dailyCompletedDate: "x" },
    });
    expect(p.season.pt).toBe(0);
    expect(p.season.claimedFree).toEqual([1]);
    expect(p.season.dailyCompletedDate).toBe("");
  });

  it("sobrevive a un ciclo JSON", () => {
    const base = applyRun(defaultProgress(), run({ victory: true }), NOON_SUNDAY).progress;
    expect(sanitize(JSON.parse(JSON.stringify(base))).season).toEqual(base.season);
  });
});

describe("misiones de temporada: avance y reclamos", () => {
  it("una partida suma progreso a las misiones diarias activas", () => {
    const out = applyRun(defaultProgress(), run({ victory: true }), NOON_SUNDAY);
    expect(out.progress.season.dailyCompletedDate).toBe("2026-11-08");
    for (const m of getActiveDailyMissions("2026-11-08")) {
      expect(out.progress.season.dailyProgress[m.id]).toBeDefined();
    }
    expect(out.progress.stats.runs).toBe(1);
  });

  it("reclama una diaria completada una sola vez, con PT y CR de la plantilla", () => {
    const out = applyRun(defaultProgress(), run({ victory: true }), NOON_SUNDAY).progress;
    const done = getSeasonBoard(out, NOON_SUNDAY).daily.find((e) => e.completed && !e.claimed);
    expect(done).toBeDefined();
    const id = done!.template.id;
    const claimed = claimPeriodMission(out, "DAILY", id, NOON_SUNDAY);
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    expect(claimed.progress.season.pt).toBe(done!.template.pt);
    expect(claimed.progress.credits).toBe(out.credits + done!.template.reward);
    expect(claimPeriodMission(claimed.progress, "DAILY", id, NOON_SUNDAY).ok).toBe(false);
  });

  it("no reclama una misión incompleta", () => {
    const res = claimPeriodMission(
      defaultProgress(),
      "DAILY",
      getActiveDailyMissions("2026-11-08")[0]!.id,
      NOON_SUNDAY,
    );
    expect(res.ok).toBe(false);
  });

  it("al cambiar de día vacía contadores y reclamos, pero conserva el PT", () => {
    const out = applyRun(defaultProgress(), run({ victory: true }), NOON_SUNDAY).progress;
    const done = getSeasonBoard(out, NOON_SUNDAY).daily.find((e) => e.completed)!;
    const claimed = claimPeriodMission(out, "DAILY", done.template.id, NOON_SUNDAY);
    if (!claimed.ok) throw new Error(claimed.reason);
    const tomorrow = Date.UTC(2026, 10, 9, 1, 0, 0);
    const next = applyRun(claimed.progress, run(), tomorrow).progress;
    expect(next.season.dailyCompletedIds).toEqual([]);
    expect(next.season.dailyCompletedDate).toBe("2026-11-09");
    expect(next.season.pt).toBe(done.template.pt);
  });

  it("el cofre se desbloquea con 5 diarias reclamadas y se reclama una vez", () => {
    let p = applyRun(
      defaultProgress(),
      run({
        victory: true,
        kills: 999,
        bossesDefeated: ["leviathan"],
        evolutions: 9,
        level: 25,
        time: 1000,
        damageDealt: 999999,
      }),
      NOON_SUNDAY,
    ).progress;
    let claimedCount = 0;
    for (const e of getSeasonBoard(p, NOON_SUNDAY).daily) {
      if (!e.completed || claimedCount === 5) continue;
      const r = claimPeriodMission(p, "DAILY", e.template.id, NOON_SUNDAY);
      if (r.ok) {
        p = r.progress;
        claimedCount++;
      }
    }
    expect(claimedCount).toBe(5);
    const chest = claimDailyChest(p, NOON_SUNDAY);
    expect(chest.ok).toBe(true);
    if (!chest.ok) return;
    expect(claimDailyChest(chest.progress, NOON_SUNDAY).ok).toBe(false);
  });

  it("los desafíos mayores usan estadísticas de vida y se reclaman una vez", () => {
    const base = defaultProgress();
    const p = { ...base, stats: { ...base.stats, kills: 500 } };
    const res = claimSeasonChallenge(p, "s_kills_500");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.progress.season.pt).toBe(150);
    expect(claimSeasonChallenge(res.progress, "s_kills_500").ok).toBe(false);
  });
});

describe("pase de temporada", () => {
  it("calcula el nivel según el PT acumulado", () => {
    expect(seasonLevelFor(0)).toBe(1);
    expect(seasonLevelFor(260)).toBe(3);
    expect(seasonLevelFor(999_999)).toBe(20);
    expect(getSeasonBarInfo(999_999).nextPt).toBeNull();
  });

  it("bloquea el carril VIP sin VIP y lo permite con VIP", () => {
    const p = addSeasonPt(defaultProgress(), 260);
    expect(claimSeasonLevel(p, "FREE", 2, false).ok).toBe(true);
    expect(claimSeasonLevel(p, "FREE", 4, false).ok).toBe(false);
    const noVip = claimSeasonLevel(p, "VIP", 1, false);
    expect(noVip.ok).toBe(false);
    const withVip = claimSeasonLevel(p, "VIP", 1, true);
    expect(withVip.ok).toBe(true);
    if (withVip.ok) expect(withVip.progress.credits).toBe(p.credits + 90);
  });
});
