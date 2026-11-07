import { describe, expect, it } from "vitest";
import server from "@/server";

describe("leaderboard boss obsidian ranking", () => {
  it("orders by boss obsidian, excludes zero and legacy balance entries, and limits to 100", async () => {
    const entries = Array.from({ length: 101 }, (_, index) => ({
      pilot_id: `plt_${index.toString().padStart(24, "0")}`,
      callsign: `PILOTO ${index}`,
      boss_obsidian: index + 1,
      score: 1000 - index,
    }));
    entries.push({
      pilot_id: "plt_999999999999999999999999",
      callsign: "SIN BOSSES",
      boss_obsidian: 0,
      score: 5000,
    });
    const leaderboard = {
      async get() {
        return JSON.stringify([
          ...entries,
          { pilot_id: "legacy", callsign: "BALANCE", obsidian: 9999, score: 9999 },
        ]);
      },
    };

    const response = await server.fetch(new Request("https://game.example/api/leaderboard"), {
      LEADERBOARD: leaderboard,
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      entries: Array<{ boss_obsidian: number; callsign: string }>;
    };
    expect(result.entries).toHaveLength(100);
    expect(result.entries[0]).toMatchObject({ callsign: "PILOTO 100", boss_obsidian: 101 });
    expect(result.entries.at(-1)).toMatchObject({ callsign: "PILOTO 1", boss_obsidian: 2 });
  });
});
