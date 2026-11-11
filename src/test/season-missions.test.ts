import { describe, expect, it } from "vitest";

import type { RunResult } from "@/game/types";
import {
  getActiveDailyMissions,
  getActiveWeeklyMissions,
  getDailyTimeRemaining,
  getWeeklyTimeRemaining,
  getUtcWeekStr,
  getSeasonBarInfo,
  getSeasonId,
  SEASON_CHALLENGES,
  SEASON_START_MS,
  SEASON_LENGTH_MS,
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
  it("elige 5 diarias deterministas: 2 básicas, 2 de piloto y 1 élite", () => {
    const a = getActiveDailyMissions("2026-11-08");
    const b = getActiveDailyMissions("2026-11-08");
    expect(a.map((m) => m.id)).toEqual(b.map((m) => m.id));
    expect(a).toHaveLength(5);
    expect(a.filter((m) => m.tier === "BASIC")).toHaveLength(2);
    expect(a.filter((m) => m.tier === "PILOT")).toHaveLength(2);
    expect(a.filter((m) => m.tier === "ELITE")).toHaveLength(1);
  });

  it("elige 15 semanales únicas", () => {
    const w = getActiveWeeklyMissions("2026-11-02");
    expect(w).toHaveLength(15);
    expect(new Set(w.map((m) => m.id)).size).toBe(15);
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

  it("convierte el progreso guardado a la nueva escala sin repetir recompensas", () => {
    const old = sanitize({
      ships: ["falcon"],
      weaponsUsed: ["laser"],
      season: {
        seasonId: getSeasonId(),
        pt: 480,
        claimedFree: [],
        claimedVip: [],
        baseline: { kills: 0, wins: 0, bossKills: {} },
      },
    });
    expect(old.season.pacingVersion).toBe(2);
    expect(old.season.pt).toBe(224);
    expect(seasonLevelFor(old.season.pt)).toBe(5);
    expect(old.season.baseline.ships).toEqual(["falcon"]);
    expect(old.season.baseline.weaponsUsed).toEqual(["laser"]);
  });

  it("conserva el nivel mínimo de recompensas que ya fueron reclamadas", () => {
    const old = sanitize({
      season: {
        seasonId: getSeasonId(),
        pt: 480,
        claimedFree: [6],
        claimedVip: [],
        baseline: { kills: 0, wins: 0, bossKills: {}, ships: ["falcon"], weaponsUsed: [] },
      },
    });
    expect(seasonLevelFor(old.season.pt)).toBe(6);
    expect(old.season.claimedFree).toContain(6);
  });

  it("normaliza valores corruptos de temporada", () => {
    const p = sanitize({
      season: {
        seasonId: getSeasonId(),
        pt: -5,
        claimedFree: [1, 99, "x", 1],
        dailyCompletedDate: "x",
      },
    });
    expect(p.season.pt).toBe(0);
    expect(p.season.claimedFree).toEqual([1]);
    expect(p.season.dailyCompletedDate).toBe("");
  });

  it("sobrevive a un ciclo JSON", () => {
    const base = applyRun(defaultProgress(), run({ victory: true }), Date.now()).progress;
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
    let out = defaultProgress();
    for (let i = 0; i < 4; i++) {
      out = applyRun(
        out,
        run({
          victory: true,
          stageId: "ash",
          time: 700,
          kills: 1000,
          level: 35,
          damageDealt: 200000,
          bossesDefeated: ["leviathan", "nemesis"],
          evolutions: 6,
        }),
        NOON_SUNDAY,
      ).progress;
    }
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
    let out = defaultProgress();
    for (let i = 0; i < 4; i++) {
      out = applyRun(
        out,
        run({
          victory: true,
          stageId: "ash",
          time: 700,
          kills: 1000,
          level: 35,
          damageDealt: 200000,
          bossesDefeated: ["leviathan", "nemesis"],
          evolutions: 6,
        }),
        NOON_SUNDAY,
      ).progress;
    }
    const done = getSeasonBoard(out, NOON_SUNDAY).daily.find((e) => e.completed)!;
    const claimed = claimPeriodMission(out, "DAILY", done.template.id, NOON_SUNDAY);
    if (!claimed.ok) throw new Error(claimed.reason);
    const tomorrow = Date.UTC(2026, 10, 9, 1, 0, 0);
    const next = applyRun(claimed.progress, run(), tomorrow).progress;
    expect(next.season.dailyCompletedIds).toEqual([]);
    expect(next.season.dailyCompletedDate).toBe("2026-11-09");
    expect(next.season.pt).toBe(done.template.pt);
  });

  it("el cofre se desbloquea con 4 diarias reclamadas y se reclama una vez", () => {
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
      if (!e.completed || claimedCount === 4) continue;
      const r = claimPeriodMission(p, "DAILY", e.template.id, NOON_SUNDAY);
      if (r.ok) {
        p = r.progress;
        claimedCount++;
      }
    }
    expect(claimedCount).toBe(4);
    const chest = claimDailyChest(p, NOON_SUNDAY);
    expect(chest.ok).toBe(true);
    if (!chest.ok) return;
    expect(claimDailyChest(chest.progress, NOON_SUNDAY).ok).toBe(false);
  });

  it("los desafíos mayores usan estadísticas de vida y se reclaman una vez", () => {
    const base = defaultProgress();
    const p = { ...base, stats: { ...base.stats, kills: 3000 } };
    const res = claimSeasonChallenge(p, "s_kills_500");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.progress.season.pt).toBe(SEASON_CHALLENGES.find((c) => c.id === "s_kills_500")!.pt);
    expect(claimSeasonChallenge(res.progress, "s_kills_500").ok).toBe(false);
  });
});

describe("pase de temporada", () => {
  it("calcula el nivel según el PT acumulado", () => {
    expect(seasonLevelFor(0)).toBe(1);
    expect(seasonLevelFor(130)).toBe(4);
    expect(seasonLevelFor(999_999)).toBe(20);
    expect(getSeasonBarInfo(999_999).nextPt).toBeNull();
  });

  it("bloquea el carril VIP sin VIP y lo permite con VIP", () => {
    const p = addSeasonPt(defaultProgress(), 130);
    expect(claimSeasonLevel(p, "FREE", 2, false).ok).toBe(true);
    expect(claimSeasonLevel(p, "FREE", 5, false).ok).toBe(false);
    const noVip = claimSeasonLevel(p, "VIP", 1, false);
    expect(noVip.ok).toBe(false);
    const withVip = claimSeasonLevel(p, "VIP", 1, true);
    expect(withVip.ok).toBe(true);
    if (withVip.ok) expect(withVip.progress.credits).toBe(p.credits + 20);
  });
});

describe("temporadas: identificador, reinicio y línea base", () => {
  it("numera las temporadas cada 30 días", () => {
    expect(getSeasonId(SEASON_START_MS)).toBe("S01");
    expect(getSeasonId(SEASON_START_MS + SEASON_LENGTH_MS - 1)).toBe("S01");
    expect(getSeasonId(SEASON_START_MS + SEASON_LENGTH_MS)).toBe("S02");
  });

  it("al cambiar de temporada reinicia el pase pero conserva créditos y naves", () => {
    const prev = defaultProgress();
    prev.credits = 500;
    prev.ships = ["falcon", "nova"];
    prev.season = { ...prev.season, seasonId: "S00", pt: 900 };
    const out = applyRun(prev, run(), SEASON_START_MS + 1000);
    expect(out.progress.season.seasonId).toBe("S01");
    expect(out.progress.season.pt).toBe(0);
    expect(out.progress.credits).toBe(prev.credits + out.credits);
    expect(out.progress.ships).toEqual(["falcon", "nova"]);
  });

  it("los desafíos de naves y armas no cuentan desbloqueos anteriores a la temporada", () => {
    const base = defaultProgress();
    const p = {
      ...base,
      ships: ["falcon", "nova", "ash", "omega"],
      weaponsUsed: ["laser", "spread", "missile"],
      season: {
        ...base.season,
        baseline: {
          ...base.season.baseline,
          ships: ["falcon", "nova", "ash", "omega"],
          weaponsUsed: ["laser", "spread", "missile"],
        },
      },
    };
    const board = getSeasonBoard(p, NOON_SUNDAY);
    expect(board.challenges.find((c) => c.template.id === "s_fleet")?.progress).toBe(0);
    expect(board.challenges.find((c) => c.template.id === "s_arsenal")?.progress).toBe(0);
  });

  it("los desafíos miden solo desde el inicio de la temporada", () => {
    // Jugador de una temporada anterior con 1000 kills de vida: al entrar a la nueva,
    // esas kills ya no deben contar para los desafíos.
    const base = defaultProgress();
    base.stats.kills = 1000;
    base.season = { ...base.season, seasonId: "S00" };
    const now = SEASON_START_MS + 1000;
    const started = applyRun(base, run({ kills: 0 }), now).progress;
    expect(started.season.baseline.kills).toBe(1000);
    expect(
      getSeasonBoard(started, now).challenges.find((c) => c.template.id === "s_kills_500")!
        .progress,
    ).toBe(0);
    const after = applyRun(started, run({ kills: 300 }), now).progress;
    expect(
      getSeasonBoard(after, now).challenges.find((c) => c.template.id === "s_kills_500")!.progress,
    ).toBe(300);
  });
});
