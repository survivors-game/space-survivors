// @vitest-environment node
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import server from "@/server";

const ADMIN_ID = "plt_aaaaaaaaaaaaaaaaaaaaaaaa";
const REFERRER_ID = "plt_bbbbbbbbbbbbbbbbbbbbbbbb";
const INVITEE_ID = "plt_cccccccccccccccccccccccc";
const ADMIN_TOKEN = "real-economy-admin";
const REFERRER_TOKEN = "real-economy-referrer";
const INVITEE_TOKEN = "real-economy-invitee";
const ADMIN_HASH = createHash("sha256").update(ADMIN_TOKEN).digest("hex");
const REFERRER_HASH = createHash("sha256").update(REFERRER_TOKEN).digest("hex");
const INVITEE_HASH = createHash("sha256").update(INVITEE_TOKEN).digest("hex");
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

function request(
  path: string,
  token: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
  admin = false,
) {
  return new Request(`https://game.example${path}`, {
    method,
    headers: {
      ...(method === "POST"
        ? { "content-type": "application/json", origin: "https://game.example" }
        : {}),
      cookie: `__Host-ss_session=${token}${admin ? `; __Host-ss_admin=${ADMIN_TOKEN}` : ""}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function call<T>(
  path: string,
  token: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
  admin = false,
) {
  const response = await server.fetch(request(path, token, method, body, admin), { DB: database });
  return { response, payload: (await response.json()) as T };
}

describe("real-money VIP and ranking economy", () => {
  beforeAll(async () => {
    // Initialize the same D1 schema used by the Worker.
    await server.fetch(new Request("https://game.example/api/vip/payment-info"), { DB: database });
    db.exec("ALTER TABLE pilots ADD COLUMN vip_until INTEGER;");
    const now = Date.now();
    db.prepare(
      `INSERT INTO pilots
        (pilot_id,callsign,obsidian,boss_obsidian,referral_code,referred_by,welcome_claimed,created_at,updated_at,selected_ship_id,vip_until)
      VALUES (?, 'ADMIN', 5, 0, 'SG-ADM123', NULL, 1, ?, ?, 'falcon', NULL),
        (?, 'REFERRER', 5, 0, 'SG-REF123', NULL, 1, ?, ?, 'falcon', NULL),
        (?, 'INVITEE', 5, 0, 'SG-INV123', ?, 1, ?, ?, 'falcon', NULL)`,
    ).run(ADMIN_ID, now, now, REFERRER_ID, now, now, INVITEE_ID, REFERRER_ID, now, now);
    db.prepare(
      `INSERT INTO player_accounts (google_sub,email,pilot_id,created_at,updated_at)
      VALUES ('admin-sub','emprendedora.onlinevee@gmail.com',?,?,?),
        ('referrer-sub','referrer@example.com',?,?,?),
        ('invitee-sub','invitee@example.com',?,?,?)`,
    ).run(ADMIN_ID, now, now, REFERRER_ID, now, now, INVITEE_ID, now, now);
    db.prepare(
      `INSERT INTO auth_sessions (token_hash,wallet_address,created_at,expires_at)
      VALUES (?, 'google:admin-sub', ?, ?), (?, 'google:referrer-sub', ?, ?),
        (?, 'google:invitee-sub', ?, ?)`,
    ).run(
      ADMIN_HASH,
      now,
      now + 86400000,
      REFERRER_HASH,
      now,
      now + 86400000,
      INVITEE_HASH,
      now,
      now + 86400000,
    );
    db.prepare(
      "INSERT INTO admin_sessions (token_hash,google_sub,created_at,expires_at) VALUES (?,'admin-sub',?,?)",
    ).run(ADMIN_HASH, now, now + 86400000);
    db.prepare(
      "INSERT INTO admin_payment_settings (id,wallet_address,qr_url,updated_by,updated_at) VALUES (1,?,NULL,'admin',?)",
    ).run("0x" + "b".repeat(40), now);

    // Start the first 15-day ranking cycle before recording cycle activity.
    const rankings = await server.fetch(new Request("https://game.example/api/rewards/rankings"), {
      DB: database,
    });
    expect(rankings.status).toBe(200);
    db.prepare(
      "INSERT INTO referrals (referral_id,referrer_pilot_id,referred_pilot_id,redeemed_at) VALUES ('ref-real-1',?,?,?)",
    ).run(REFERRER_ID, INVITEE_ID, Date.now());
  });

  afterAll(() => db.close());

  it("approves a $10 USDT VIP purchase, grants one $1 ticket, and funds both rankings", async () => {
    const txHash = "0x" + "a".repeat(64);
    const submitted = await call<{ success?: boolean; id?: string }>(
      "/api/vip/purchases",
      INVITEE_TOKEN,
      "POST",
      { tx_hash: txHash },
    );
    expect(submitted.response.status).toBe(200);
    expect(submitted.payload.success).toBe(true);
    const paymentId = submitted.payload.id!;

    const approved = await call<{ success?: boolean; status?: string }>(
      "/api/admin/real-economy",
      ADMIN_TOKEN,
      "POST",
      { action: "approve-vip", id: paymentId },
      true,
    );
    expect(approved.response.status).toBe(200);
    expect(approved.payload).toEqual({ success: true, status: "APPROVED" });

    const repeatedApproval = await call<{ error?: string }>(
      "/api/admin/real-economy",
      ADMIN_TOKEN,
      "POST",
      { action: "approve-vip", id: paymentId },
      true,
    );
    expect(repeatedApproval.response.status).toBe(409);
    const reusedTx = await call<{ error?: string }>("/api/vip/purchases", INVITEE_TOKEN, "POST", {
      tx_hash: txHash,
    });
    expect(reusedTx.response.status).toBe(409);

    const vip = db.prepare("SELECT vip_until FROM pilots WHERE pilot_id=?").get(INVITEE_ID) as {
      vip_until: number;
    };
    expect(vip.vip_until).toBeGreaterThan(Date.now() + 29 * 86400000);

    expect(
      db
        .prepare("SELECT delta_cents FROM real_money_ticket_ledger WHERE pilot_id=?")
        .get(REFERRER_ID),
    ).toEqual({ delta_cents: 100 });
    expect(
      db
        .prepare(
          "SELECT ranking_type,amount_cents FROM ranking_pool_contributions ORDER BY ranking_type",
        )
        .all(),
    ).toEqual([
      { ranking_type: "BOSSES", amount_cents: 150 },
      { ranking_type: "REFERRALS", amount_cents: 150 },
    ]);

    const rankingResult = await server.fetch(
      new Request("https://game.example/api/rewards/rankings"),
      { DB: database },
    );
    const ranking = (await rankingResult.json()) as {
      referrals: Array<{ callsign: string; position: number; prize_usdt: number }>;
    };
    expect(ranking.referrals).toEqual([
      { position: 1, pilot_id: REFERRER_ID, callsign: "REFERRER", prize_usdt: 0.6 },
    ]);
    expect(ranking).not.toHaveProperty("pools");
    expect(ranking).not.toHaveProperty("distribution");

    const deniedAdminData = await call<{ error?: string }>(
      "/api/admin/real-economy",
      INVITEE_TOKEN,
    );
    expect(deniedAdminData.response.status).toBe(403);

    const adminData = await call<{
      distribution: {
        vip_price_usd: number;
        admin_usd: number;
        referral_usd: number;
        bosses_pool_usd: number;
        referrals_pool_usd: number;
      };
      totals: { approved_sales: number; admin_earned_cents: number; ranking_funded_cents: number };
      ticket_balances: Array<{ pilot_id: string; balance_cents: number }>;
    }>("/api/admin/real-economy", ADMIN_TOKEN, "GET", undefined, true);
    expect(adminData.response.status).toBe(200);
    expect(adminData.payload.distribution).toEqual({
      vip_price_usd: 10,
      admin_usd: 6,
      referral_usd: 1,
      bosses_pool_usd: 1.5,
      referrals_pool_usd: 1.5,
    });
    expect(adminData.payload.totals).toMatchObject({
      approved_sales: 1,
      admin_earned_cents: 600,
      ranking_funded_cents: 300,
    });
    expect(adminData.payload.ticket_balances).toContainEqual(
      expect.objectContaining({ pilot_id: REFERRER_ID, balance_cents: 100 }),
    );
  });

  it("records boss-rank progress only within the active 15-day cycle", async () => {
    db.prepare("UPDATE pilots SET boss_obsidian=50 WHERE pilot_id=?").run(INVITEE_ID);
    db.prepare(
      "INSERT INTO player_progress (pilot_id,progress_json,updated_at) VALUES (?,?,?)",
    ).run(INVITEE_ID, JSON.stringify({ stats: { kills: 123 } }), Date.now());
    let storedLeaderboard: string | null = null;
    const leaderboard = {
      async get() {
        return storedLeaderboard;
      },
      async put(_key: string, value: string) {
        storedLeaderboard = value;
      },
    };
    const response = await server.fetch(
      request("/api/leaderboard/update", INVITEE_TOKEN, "POST", {
        pilot_id: INVITEE_ID,
        callsign: "INVITEE",
        score: 123,
      }),
      { DB: database, LEADERBOARD: leaderboard },
    );
    expect(response.status).toBe(200);

    const rankings = await server.fetch(new Request("https://game.example/api/rewards/rankings"), {
      DB: database,
    });
    const payload = (await rankings.json()) as {
      bosses: Array<{ pilot_id: string; prize_usdt: number }>;
    };
    expect(payload.bosses).toEqual([
      { position: 1, pilot_id: INVITEE_ID, callsign: "INVITEE", prize_usdt: 0.6 },
    ]);
  });

  it("closes the 15-day cycle and creates payable USDT prizes with the registered Polygon wallet", async () => {
    const wallet = "0x" + "c".repeat(40);
    const saved = await call<{ success?: boolean }>("/api/rewards/wallet", REFERRER_TOKEN, "POST", {
      wallet_address: wallet,
    });
    expect(saved.response.status).toBe(200);
    expect(saved.payload.success).toBe(true);

    const cycle = db.prepare("SELECT id FROM ranking_cycles WHERE status='OPEN'").get() as {
      id: string;
    };
    const contribution = db
      .prepare("SELECT MAX(created_at) AS latest FROM ranking_pool_contributions")
      .get() as { latest: number };
    db.prepare("UPDATE ranking_cycles SET ends_at=? WHERE id=?").run(
      contribution.latest + 1,
      cycle.id,
    );
    await new Promise((resolve) => setTimeout(resolve, 5));

    const closed = await server.fetch(new Request("https://game.example/api/rewards/rankings"), {
      DB: database,
    });
    expect(closed.status).toBe(200);
    const payouts = db
      .prepare(
        "SELECT ranking_type,position,prize_cents,status FROM ranking_prize_payouts ORDER BY ranking_type",
      )
      .all();
    expect(payouts).toEqual([
      { ranking_type: "BOSSES", position: 1, prize_cents: 60, status: "PENDING" },
      { ranking_type: "REFERRALS", position: 1, prize_cents: 60, status: "PENDING" },
    ]);
    expect(
      db
        .prepare(
          "SELECT ranking_type,amount_cents FROM ranking_pool_reserves ORDER BY ranking_type",
        )
        .all(),
    ).toEqual([
      { ranking_type: "BOSSES", amount_cents: 90 },
      { ranking_type: "REFERRALS", amount_cents: 90 },
    ]);

    const adminPools = await call<{
      pools: Array<{ ranking_type: "BOSSES" | "REFERRALS"; total_cents: number }>;
    }>("/api/admin/real-economy", ADMIN_TOKEN, "GET", undefined, true);
    expect(adminPools.payload.pools).toEqual([
      { ranking_type: "BOSSES", total_cents: 90 },
      { ranking_type: "REFERRALS", total_cents: 90 },
    ]);

    const prize = db
      .prepare(
        "SELECT id FROM ranking_prize_payouts WHERE ranking_type='REFERRALS' AND status='PENDING'",
      )
      .get() as { id: string };
    const paid = await call<{ success?: boolean; status?: string }>(
      "/api/admin/real-economy",
      ADMIN_TOKEN,
      "POST",
      { action: "pay-prize", id: prize.id, tx_hash: "0x" + "e".repeat(64) },
      true,
    );
    expect(paid.response.status).toBe(200);
    expect(paid.payload).toEqual({ success: true, status: "PAID" });
  });

  it("reserves tickets until administration records the USDT payout", async () => {
    const wallet = "0x" + "c".repeat(40);
    const created = await call<{ success?: boolean; id?: string }>(
      "/api/rewards/tickets",
      REFERRER_TOKEN,
      "POST",
      { amount_usd: 1, wallet_address: wallet },
    );
    expect(created.response.status).toBe(200);
    expect(created.payload.success).toBe(true);

    const balance = await call<{ balance_cents: number; available_cents: number }>(
      "/api/rewards/tickets",
      REFERRER_TOKEN,
    );
    expect(balance.payload).toMatchObject({ balance_cents: 100, available_cents: 0 });

    const paid = await call<{ success?: boolean; status?: string }>(
      "/api/admin/real-economy",
      ADMIN_TOKEN,
      "POST",
      { action: "pay-ticket", id: created.payload.id, tx_hash: "0x" + "d".repeat(64) },
      true,
    );
    expect(paid.response.status).toBe(200);
    expect(paid.payload).toEqual({ success: true, status: "PAID" });

    const after = await call<{ balance_cents: number; available_cents: number }>(
      "/api/rewards/tickets",
      REFERRER_TOKEN,
    );
    expect(after.payload).toMatchObject({ balance_cents: 0, available_cents: 0 });

    const repeatedPayout = await call<{ error?: string }>(
      "/api/admin/real-economy",
      ADMIN_TOKEN,
      "POST",
      { action: "pay-ticket", id: created.payload.id, tx_hash: "0x" + "d".repeat(64) },
      true,
    );
    expect(repeatedPayout.response.status).toBe(409);
  });
});
