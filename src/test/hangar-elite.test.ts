import { describe, expect, it } from "vitest";

import type { RunResult } from "@/game/types";
import {
  UPGRADES,
  hangarBonuses,
  moduleSwapCost,
  upgradeCost,
  upgradeById,
} from "@/game/meta/upgrades";
import {
  applyRun,
  buyUpgrade,
  chooseUpgradeModule,
  defaultProgress,
  sanitize,
  upgradeStatus,
  type Progress,
} from "@/game/meta/progress";

const run = (over: Partial<RunResult> = {}): RunResult => ({
  victory: false,
  finalBossDefeated: false,
  stageId: "nova",
  shipId: "falcon",
  time: 400,
  duration: 900,
  kills: 10,
  killsByType: {},
  bossesDefeated: [],
  level: 3,
  damageDealt: 100,
  damageTaken: 0,
  energy: 0,
  evolutions: 0,
  weapons: [],
  maxPhase: 1,
  credits: 0,
  ...over,
});

/** Progreso con niveles, créditos y estadísticas a medida. */
function make(opts: {
  credits?: number;
  upgrades?: Record<string, number>;
  modules?: Record<string, string>;
  stats?: Partial<Progress["stats"]>;
}): Progress {
  const p = defaultProgress();
  p.credits = opts.credits ?? 0;
  p.upgrades = opts.upgrades ?? {};
  p.modules = opts.modules ?? {};
  p.stats = { ...p.stats, ...(opts.stats ?? {}) };
  return p;
}

describe("etapa base (niveles 1-5): sin cambios", () => {
  it("el coste de los niveles 1-5 sigue la fórmula original", () => {
    for (const u of UPGRADES) {
      const lastBase = Math.min(5, u.max);
      for (let n = 1; n <= lastBase && n < u.eliteFrom; n++) {
        const expected = Math.round((u.base * Math.pow(1.65, n - 1)) / 10) * 10;
        expect(upgradeCost(u.id, n - 1)).toBe(expected);
      }
    }
  });

  it("los bonos de los niveles 1-5 son lineales como antes", () => {
    expect(hangarBonuses({ hull: 5 }).hp).toBe(50);
    expect(hangarBonuses({ hull: 4 }).hp).toBe(40);
    expect(hangarBonuses({ engine: 5 }).speed).toBeCloseTo(0.2);
    expect(hangarBonuses({ power: 5 }).dmg).toBeCloseTo(0.25);
    expect(hangarBonuses({ cooling: 5 }).cd).toBeCloseTo(0.15);
    expect(hangarBonuses({ magnet: 5 }).magnet).toBeCloseTo(0.5);
    expect(hangarBonuses({ repair: 5 }).regen).toBeCloseTo(1);
    expect(hangarBonuses({ salvage: 5 }).salvage).toBeCloseTo(0.5);
    expect(hangarBonuses({ reroll: 3 }).rerolls).toBe(3);
  });

  it("la recuperación de nivel 5 sube los créditos de misión igual que antes", () => {
    const base = applyRun(make({}), run({ victory: true, time: 600, level: 10 }), 0).credits;
    const withSalvage = applyRun(
      make({ upgrades: { salvage: 5 } }),
      run({ victory: true, time: 600, level: 10 }),
      0,
    ).credits;
    expect(withSalvage).toBeGreaterThan(base);
  });
});

describe("escala de costes", () => {
  it("el nivel 10 de cada atributo queda entre 3.000 y 6.000 CR", () => {
    for (const u of UPGRADES.filter((x) => x.id !== "reroll")) {
      const cost = upgradeCost(u.id, u.max - 1);
      expect(cost).toBeGreaterThanOrEqual(3000);
      expect(cost).toBeLessThanOrEqual(6000);
    }
  });

  it("los niveles 1-5 de los atributos cuestan lo mismo que en el juego original (~17.300 CR)", () => {
    const attributes = UPGRADES.filter((u) => u.id !== "reroll");
    const total = attributes.reduce((sum, u) => {
      let t = 0;
      for (let l = 0; l < 5; l++) t += upgradeCost(u.id, l);
      return sum + t;
    }, 0);
    expect(total).toBeGreaterThan(17000);
    expect(total).toBeLessThan(17600);
  });

  it("el RECALIBRADOR conserva sus niveles 1-3 originales", () => {
    const reroll = upgradeById("reroll")!;
    expect(upgradeCost("reroll", 0)).toBe(300);
    expect(upgradeCost("reroll", 1)).toBe(500);
    expect(upgradeCost("reroll", 2)).toBe(820);
    expect(reroll.eliteFrom).toBe(4);
  });
});

describe("mérito y créditos en la etapa de élite", () => {
  it("bloquea la compra del nivel 6 sin cumplir el requisito de mérito", () => {
    const p = make({ credits: 1_000_000, upgrades: { hull: 5 }, stats: { runs: 0 } });
    const res = buyUpgrade(p, "hull");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("Requisito: Completa 25 partidas");
  });

  it("permite la compra del nivel 6 al cumplir el requisito y tener CR", () => {
    const p = make({ credits: 1_000_000, upgrades: { hull: 5 }, stats: { runs: 25 } });
    const res = buyUpgrade(p, "hull");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.progress.upgrades["hull"]).toBe(6);
  });

  it("bloquea por créditos aunque el mérito esté cumplido", () => {
    const p = make({ credits: 0, upgrades: { hull: 5 }, stats: { runs: 25 } });
    const res = buyUpgrade(p, "hull");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("Créditos insuficientes");
  });

  it("no permite pasar del nivel máximo", () => {
    const p = make({ credits: 1_000_000, upgrades: { hull: 10 }, stats: { runs: 999 } });
    const res = buyUpgrade(p, "hull");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("Nivel máximo");
  });

  it("el estado de compra informa el progreso del requisito", () => {
    const p = make({ credits: 1_000_000, upgrades: { hull: 5 }, stats: { runs: 10 } });
    const st = upgradeStatus(p, "hull");
    expect(st.requirement).toEqual({
      label: "Completa 25 partidas",
      progress: 10,
      goal: 25,
      met: false,
    });
  });

  it("el RECALIBRADOR sube a 5 con mérito y el nivel 4 exige partidas", () => {
    const blocked = buyUpgrade(
      make({ credits: 1_000_000, upgrades: { reroll: 3 }, stats: { runs: 0 } }),
      "reroll",
    );
    expect(blocked.ok).toBe(false);
    const ok = buyUpgrade(
      make({ credits: 1_000_000, upgrades: { reroll: 3 }, stats: { runs: 10 } }),
      "reroll",
    );
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.progress.upgrades["reroll"]).toBe(4);
  });

  it("cada mejora de élite tiene requisitos propios (5 niveles, RECALIBRADOR 2)", () => {
    for (const u of UPGRADES) {
      const count = u.max - u.eliteFrom + 1;
      const st = upgradeStatus(make({ credits: 1e9, upgrades: { [u.id]: u.eliteFrom - 1 } }), u.id);
      expect(st.requirement).not.toBeNull();
      expect(count).toBeGreaterThan(0);
    }
    expect(upgradeById("reroll")!.max - upgradeById("reroll")!.eliteFrom + 1).toBe(2);
  });
});

describe("rendimientos decrecientes", () => {
  it("cada nivel de élite aporta menos que un nivel base", () => {
    const at5 = hangarBonuses({ hull: 5 }).hp;
    const at6 = hangarBonuses({ hull: 6 }).hp;
    const at10 = hangarBonuses({ hull: 10 }).hp;
    expect(at6 - at5).toBeCloseTo(6);
    expect(at10).toBe(80);
    expect(at10).toBeLessThan(100);
    expect(at10).toBeGreaterThan(50);
  });
});

describe("módulos de especialización", () => {
  it("el módulo solo se puede elegir desde el nivel 10", () => {
    const res = chooseUpgradeModule(make({ upgrades: { hull: 9 } }), "hull", "reinforced");
    expect(res.ok).toBe(false);
    const ok = chooseUpgradeModule(make({ upgrades: { hull: 10 } }), "hull", "reinforced");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.progress.modules["hull"]).toBe("reinforced");
  });

  it("la primera elección es gratis y cambiarlo cuesta CR", () => {
    const first = chooseUpgradeModule(
      make({ credits: 0, upgrades: { hull: 10 } }),
      "hull",
      "reinforced",
    );
    expect(first.ok).toBe(true);
    const poor = chooseUpgradeModule(
      make({ credits: 0, upgrades: { hull: 10 }, modules: { hull: "reinforced" } }),
      "hull",
      "light",
    );
    expect(poor.ok).toBe(false);
    const rich = make({
      credits: 1_000_000,
      upgrades: { hull: 10 },
      modules: { hull: "reinforced" },
    });
    const swap = chooseUpgradeModule(rich, "hull", "light");
    expect(swap.ok).toBe(true);
    if (swap.ok) expect(swap.progress.credits).toBe(1_000_000 - moduleSwapCost("hull"));
  });

  it("el módulo tiene efecto real sobre los bonos del motor", () => {
    const levels = { hull: 10, engine: 5 };
    const none = hangarBonuses(levels);
    const reinforced = hangarBonuses(levels, { hull: "reinforced" });
    const light = hangarBonuses(levels, { hull: "light" });
    expect(reinforced.hp).toBeGreaterThan(none.hp);
    expect(reinforced.speed).toBeLessThan(none.speed);
    expect(light.hp).toBeLessThan(none.hp);
    expect(light.speed).toBeGreaterThan(none.speed);
  });

  it("un módulo no se aplica antes del nivel 10", () => {
    const withModule = hangarBonuses({ hull: 9 }, { hull: "reinforced" });
    expect(withModule.hp).toBe(hangarBonuses({ hull: 9 }).hp);
  });

  it("no se puede elegir un módulo que no pertenece a la mejora", () => {
    const res = chooseUpgradeModule(make({ upgrades: { hull: 10 } }), "hull", "turbo");
    expect(res.ok).toBe(false);
  });
});

describe("compatibilidad con partidas guardadas", () => {
  it("una partida sin modules se carga con modules vacío y sin perder créditos", () => {
    const p = sanitize({ credits: 777, upgrades: { hull: 3 } });
    expect(p.modules).toEqual({});
    expect(p.credits).toBe(777);
    expect(p.upgrades["hull"]).toBe(3);
  });
});
