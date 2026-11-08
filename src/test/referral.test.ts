import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import server from "@/server";

const REFERRER_ID = "plt_aaaaaaaaaaaaaaaaaaaaaaaa";
const INVITEE_ID = "plt_bbbbbbbbbbbbbbbbbbbbbbbb";
const OTHER_ID = "plt_cccccccccccccccccccccccc";
const SESSION_TOKEN = "referral-test-session";
const SESSION_HASH = createHash("sha256").update(SESSION_TOKEN).digest("hex");
const db = new DatabaseSync(":memory:");

function createD1Adapter() {
  return {
    prepare(query: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...boundValues: unknown[]) {
          values = boundValues;
          return statement;
        },
        async run() {
          const result = db.prepare(query).run(...(values as never[]));
          return { meta: { changes: Number(result.changes) } };
        },
        async first<T>() {
          return (db.prepare(query).get(...(values as never[])) as T | undefined) ?? null;
        },
        async all<T>() {
          return { results: db.prepare(query).all(...(values as never[])) as T[] };
        },
      };
      return statement;
    },
    async batch(statements: Array<{ run(): Promise<{ meta: { changes: number } }> }>) {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

const database = createD1Adapter();

function makeRequest(path: string, method: "GET" | "POST" = "GET", body?: Record<string, unknown>) {
  return new Request(`https://game.example${path}`, {
    method,
    headers: {
      ...(method === "POST"
        ? { "content-type": "application/json", origin: "https://game.example" }
        : {}),
      cookie: `__Host-ss_session=${SESSION_TOKEN}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function requestJson<T>(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
) {
  const response = await server.fetch(makeRequest(path, method, body), { DB: database });
  return { response, payload: (await response.json()) as T };
}

async function redeem(code: string, claimedPilotId?: string) {
  return requestJson<{ success?: boolean; error?: string }>("/api/referral/redeem", "POST", {
    referral_code: code,
    ...(claimedPilotId ? { pilot_id: claimedPilotId } : {}),
  });
}

describe("referral system", () => {
  beforeEach(async () => {
    if (!db.prepare("SELECT name FROM sqlite_master WHERE name = 'referrals'").get()) {
      const initialized = await server.fetch(
        new Request("https://game.example/api/referral/my-code", {
          headers: { cookie: `__Host-ss_session=${SESSION_TOKEN}` },
        }),
        { DB: database },
      );
      expect(initialized.status).toBe(401);
    }

    db.exec(`
      DELETE FROM referrals;
      DELETE FROM pilot_inventory;
      DELETE FROM player_progress;
      DELETE FROM player_profiles;
      DELETE FROM auth_sessions;
      DELETE FROM player_accounts;
      DELETE FROM pilots;
    `);
    const now = Date.now();
    db.prepare(
      `INSERT INTO pilots
        (pilot_id, callsign, obsidian, boss_obsidian, referral_code, created_at, updated_at)
      VALUES (?, 'REFERRER', 10, 7, 'SG-REF123', ?, ?)`,
    ).run(REFERRER_ID, now - 20_000, now);
    db.prepare(
      `INSERT INTO pilots
        (pilot_id, callsign, obsidian, boss_obsidian, referral_code, created_at, updated_at)
      VALUES (?, 'INVITEE', 20, 12, 'SG-INV123', ?, ?)`,
    ).run(INVITEE_ID, now - 10_000, now);
    db.prepare(
      `INSERT INTO pilots
        (pilot_id, callsign, obsidian, boss_obsidian, referral_code, created_at, updated_at)
      VALUES (?, 'OTHER', 5, 0, 'SG-OTH123', ?, ?)`,
    ).run(OTHER_ID, now, now);
    db.prepare(
      `INSERT INTO player_accounts (google_sub, email, pilot_id, created_at, updated_at)
      VALUES ('invitee-sub', 'invitee@example.com', ?, ?, ?)`,
    ).run(INVITEE_ID, now, now);
    db.prepare(
      `INSERT INTO auth_sessions (token_hash, wallet_address, created_at, expires_at)
      VALUES (?, 'google:invitee-sub', ?, ?)`,
    ).run(SESSION_HASH, now, now + 60_000);
    db.prepare(
      `INSERT INTO player_profiles (pilot_id, display_name, updated_at)
      VALUES (?, 'INVITEE USER', ?), (?, 'REFERRER USER', ?)`,
    ).run(INVITEE_ID, now, REFERRER_ID, now);
  });

  afterAll(() => db.close());

  it("returns the authenticated pilot's invitation code and redemption status", async () => {
    const { response, payload } = await requestJson<{
      referral_code: string;
      has_redeemed: boolean;
    }>("/api/referral/my-code");

    expect(response.status).toBe(200);
    expect(payload).toEqual({ referral_code: "SG-INV123", has_redeemed: false });
  });

  it("redeems a valid code and grants rewards to both players without changing boss ranking", async () => {
    db.prepare(
      `INSERT INTO player_progress (pilot_id, progress_json, updated_at)
      VALUES (?, '{"v":1,"credits":25}', ?)`,
    ).run(INVITEE_ID, Date.now());

    const { response, payload } = await redeem("sg-ref123", OTHER_ID);

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(
      db
        .prepare("SELECT obsidian, boss_obsidian, referred_by FROM pilots WHERE pilot_id = ?")
        .get(INVITEE_ID),
    ).toEqual({ obsidian: 25, boss_obsidian: 12, referred_by: REFERRER_ID });
    expect(
      db.prepare("SELECT obsidian, boss_obsidian FROM pilots WHERE pilot_id = ?").get(REFERRER_ID),
    ).toEqual({ obsidian: 13, boss_obsidian: 7 });
    expect(
      db
        .prepare("SELECT json_extract(progress_json, '$.credits') AS credits FROM player_progress")
        .get(),
    ).toEqual({ credits: 125 });
    expect(
      db
        .prepare(
          "SELECT item_id, item_type, quantity, grant_source FROM pilot_inventory WHERE pilot_id = ?",
        )
        .get(INVITEE_ID),
    ).toEqual({ item_id: "iman", item_type: "objeto", quantity: 1, grant_source: "starter" });
    expect(db.prepare("SELECT COUNT(*) AS count FROM referrals").get()).toEqual({ count: 1 });
  });

  it("rejects redeeming a player's own invitation code", async () => {
    const { response, payload } = await redeem("SG-INV123");

    expect(response.status).toBe(400);
    expect(payload.error).toContain("propio");
    expect(db.prepare("SELECT COUNT(*) AS count FROM referrals").get()).toEqual({ count: 0 });
  });

  it("rejects a second redemption", async () => {
    expect((await redeem("SG-REF123")).response.status).toBe(200);
    const { response, payload } = await redeem("SG-OTH123");

    expect(response.status).toBe(409);
    expect(payload.error).toContain("Ya canjeaste");
    expect(db.prepare("SELECT COUNT(*) AS count FROM referrals").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT obsidian FROM pilots WHERE pilot_id = ?").get(INVITEE_ID)).toEqual({
      obsidian: 25,
    });
  });

  it("rejects a referral code that does not exist", async () => {
    const { response, payload } = await redeem("SG-MISS99");

    expect(response.status).toBe(404);
    expect(payload.error).toContain("no existe");
  });

  it("orders the referral leaderboard by referral count and returns referred players", async () => {
    const now = Date.now();
    const secondReferrer = "plt_dddddddddddddddddddddddd";
    const firstReferred = "plt_eeeeeeeeeeeeeeeeeeeeeeee";
    const secondReferred = "plt_ffffffffffffffffffffffff";
    const thirdReferred = "plt_111111111111111111111111";
    db.prepare(
      `INSERT INTO pilots (pilot_id, callsign, obsidian, boss_obsidian, referral_code, created_at, updated_at)
      VALUES (?, 'SECOND REFERRER', 5, 3, 'SG-SEC123', ?, ?),
        (?, 'FIRST REFERRED', 5, 4, 'SG-FIR123', ?, ?),
        (?, 'SECOND REFERRED', 5, 9, 'SG-SEC456', ?, ?),
        (?, 'THIRD REFERRED', 5, 6, 'SG-THI123', ?, ?)`,
    ).run(
      secondReferrer,
      now,
      now,
      firstReferred,
      now - 20_000,
      now,
      secondReferred,
      now - 10_000,
      now,
      thirdReferred,
      now,
      now,
    );
    db.prepare(
      `INSERT INTO player_profiles (pilot_id, display_name, updated_at)
      VALUES (?, 'SECOND REFERRER USER', ?), (?, 'FIRST REFERRED USER', ?),
        (?, 'SECOND REFERRED USER', ?), (?, 'THIRD REFERRED USER', ?)`,
    ).run(secondReferrer, now, firstReferred, now, secondReferred, now, thirdReferred, now);
    db.prepare(
      `INSERT INTO referrals (referral_id, referrer_pilot_id, referred_pilot_id, redeemed_at)
      VALUES ('ref-a', ?, ?, ?), ('ref-b', ?, ?, ?), ('ref-c', ?, ?, ?)`,
    ).run(
      REFERRER_ID,
      firstReferred,
      now,
      REFERRER_ID,
      secondReferred,
      now,
      secondReferrer,
      thirdReferred,
      now,
    );
    db.prepare("UPDATE player_accounts SET pilot_id = ? WHERE google_sub = 'invitee-sub'").run(
      REFERRER_ID,
    );

    const mine = await requestJson<{
      referrals: Array<{ callsign: string; boss_obsidian: number; created_at: number }>;
    }>("/api/referral/mine");
    const leaderboard = await requestJson<{
      entries: Array<{ callsign: string; total_referrals: number }>;
    }>("/api/referral/leaderboard");

    expect(mine.response.status).toBe(200);
    expect(mine.payload.referrals).toEqual([
      { callsign: "SECOND REFERRED USER", boss_obsidian: 9, created_at: now - 10_000 },
      { callsign: "FIRST REFERRED USER", boss_obsidian: 4, created_at: now - 20_000 },
    ]);
    expect(leaderboard.response.status).toBe(200);
    expect(leaderboard.payload.entries).toEqual([
      { callsign: "REFERRER USER", total_referrals: 2 },
      { callsign: "SECOND REFERRER USER", total_referrals: 1 },
    ]);
  });
});
