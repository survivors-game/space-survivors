import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import server from "@/server";

const BUYER_ID = "plt_aaaaaaaaaaaaaaaaaaaaaaaa";
const SELLER_ID = "plt_bbbbbbbbbbbbbbbbbbbbbbbb";
const SESSION_TOKEN = "market-test-session";
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
        for (const statement of statements) await statement.run();
        db.exec("COMMIT");
        return statements.map(() => ({ meta: { changes: 1 } }));
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

const database = createD1Adapter();

function makeRequest(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
  token = SESSION_TOKEN,
) {
  return new Request(`https://game.example${path}`, {
    method,
    headers: {
      ...(method === "POST"
        ? { "content-type": "application/json", origin: "https://game.example" }
        : {}),
      cookie: `__Host-ss_session=${token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function requestJson<T>(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
  token = SESSION_TOKEN,
) {
  const response = await server.fetch(makeRequest(path, method, body, token), { DB: database });
  return { response, payload: (await response.json()) as T };
}

async function createListing(sellerId = SELLER_ID, status = "ACTIVO", itemId = "boss-ship") {
  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO pilots (pilot_id, callsign, obsidian, created_at, updated_at)
    VALUES (?, 'SELLER', 5, ?, ?)`,
  ).run(sellerId, now, now);
  db.prepare(
    `INSERT INTO pilot_inventory
    (id, pilot_id, item_id, item_name, item_type, quantity, is_locked, grant_source, created_at, updated_at)
    VALUES (?, ?, ?, 'BOSS SHIP', 'nave', 1, 1, 'boss', ?, ?)`,
  ).run(`inv-${itemId}`, sellerId, itemId, now, now);
  db.prepare(
    `INSERT INTO market_publish_attempts
      (id, pilot_id, inventory_id, created_at, obsidian_updated, inventory_updated)
    VALUES (?, ?, ?, ?, 1, 1)`,
  ).run(`attempt-${itemId}`, sellerId, `inv-${itemId}`, now);
  db.prepare(
    `INSERT INTO p2p_ads
    (id, seller_pilot_id, inventory_id, item_id, item_name, item_type,
      price, currency, payment_methods, payment_details, status, fee_paid, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'BOSS SHIP', 'nave', 100, 'COP',
      '["NEQUI"]', 'seller private payment data', ?, 1, ?, ?)`,
  ).run(`listing-${itemId}`, sellerId, `inv-${itemId}`, itemId, status, now, now);
  return `listing-${itemId}`;
}

describe("P2P purchase flow", () => {
  beforeEach(async () => {
    const initialized = await server.fetch(
      new Request("https://game.example/api/market/listings"),
      { DB: database },
    );
    expect(initialized.status).toBe(401);
    db.exec(`
      DELETE FROM p2p_orders;
      DELETE FROM p2p_ads;
      DELETE FROM market_publish_attempts;
      DELETE FROM pilot_inventory;
      DELETE FROM player_profiles;
      DELETE FROM auth_sessions;
      DELETE FROM player_accounts;
      DELETE FROM pilots;
    `);
    const now = Date.now();
    db.prepare(
      `INSERT INTO player_accounts (google_sub, email, pilot_id, created_at, updated_at)
      VALUES ('buyer-sub', 'buyer@example.com', ?, ?, ?)`,
    ).run(BUYER_ID, now, now);
    db.prepare(
      `INSERT INTO auth_sessions (token_hash, wallet_address, created_at, expires_at)
      VALUES (?, 'google:buyer-sub', ?, ?)`,
    ).run(SESSION_HASH, now, now + 60_000);
    db.prepare(
      `INSERT INTO pilots (pilot_id, callsign, obsidian, created_at, updated_at)
      VALUES (?, 'BUYER', 5, ?, ?)`,
    ).run(BUYER_ID, now, now);
    db.prepare(
      `INSERT INTO pilots (pilot_id, callsign, obsidian, created_at, updated_at)
      VALUES (?, 'SELLER', 5, ?, ?)`,
    ).run(SELLER_ID, now, now);
  });

  afterAll(() => db.close());

  it("completes a purchase and transfers the item exactly once", async () => {
    const listingId = await createListing();
    const bought = await requestJson<{
      order_id: string;
      payment_details: string;
      payment_methods: string[];
    }>("/api/market/buy", "POST", { listing_id: listingId });

    expect(bought.response.status).toBe(200);
    expect(bought.payload.payment_details).toBe("seller private payment data");
    expect(bought.payload.payment_methods).toEqual(["NEQUI"]);
    expect(
      db.prepare("SELECT obsidian FROM pilots WHERE pilot_id = ?").get(BUYER_ID)?.["obsidian"],
    ).toBe(4);

    const confirmed = await requestJson<{ status: string }>("/api/market/confirm", "POST", {
      order_id: bought.payload.order_id,
    });
    expect(confirmed.response.status).toBe(200);
    expect(confirmed.payload.status).toBe("COMPLETADA");
    expect(
      db
        .prepare("SELECT pilot_id, grant_source, quantity FROM pilot_inventory WHERE item_id = ?")
        .get("boss-ship"),
    ).toMatchObject({ pilot_id: BUYER_ID, grant_source: "market", quantity: 1 });
    expect(db.prepare("SELECT status FROM p2p_ads WHERE id = ?").get(listingId)?.["status"]).toBe(
      "VENDIDO",
    );

    const repeated = await requestJson("/api/market/confirm", "POST", {
      order_id: bought.payload.order_id,
    });
    expect(repeated.response.status).toBe(409);
  });

  it("cancels a pending order without refunding the commission", async () => {
    const listingId = await createListing();
    const bought = await requestJson<{ order_id: string }>("/api/market/buy", "POST", {
      listing_id: listingId,
    });

    const cancelled = await requestJson<{ status: string }>("/api/market/cancel", "POST", {
      order_id: bought.payload.order_id,
    });
    expect(cancelled.response.status).toBe(200);
    expect(cancelled.payload.status).toBe("CANCELADA");
    expect(
      db.prepare("SELECT obsidian FROM pilots WHERE pilot_id = ?").get(BUYER_ID)?.["obsidian"],
    ).toBe(4);
    expect(db.prepare("SELECT status FROM p2p_ads WHERE id = ?").get(listingId)?.["status"]).toBe(
      "ACTIVO",
    );
    expect(
      db.prepare("SELECT is_locked FROM pilot_inventory WHERE id = ?").get("inv-boss-ship")?.[
        "is_locked"
      ],
    ).toBe(0);
  });

  it("rejects buying one's own listing", async () => {
    const listingId = await createListing(BUYER_ID);
    const result = await requestJson("/api/market/buy", "POST", { listing_id: listingId });
    expect(result.response.status).toBe(400);
    expect(db.prepare("SELECT COUNT(*) AS count FROM p2p_orders").get()?.["count"]).toBe(0);
  });

  it("rejects inactive listings", async () => {
    const listingId = await createListing(SELLER_ID, "PAUSADO");
    const result = await requestJson("/api/market/buy", "POST", { listing_id: listingId });
    expect(result.response.status).toBe(409);
    expect(db.prepare("SELECT COUNT(*) AS count FROM p2p_orders").get()?.["count"]).toBe(0);
  });

  it("rejects purchases when the buyer cannot pay the commission", async () => {
    const listingId = await createListing();
    db.prepare("UPDATE pilots SET obsidian = 0 WHERE pilot_id = ?").run(BUYER_ID);

    const result = await requestJson("/api/market/buy", "POST", { listing_id: listingId });
    expect(result.response.status).toBe(400);
    expect(db.prepare("SELECT COUNT(*) AS count FROM p2p_orders").get()?.["count"]).toBe(0);
  });

  it("prevents duplicate pending orders and duplicate commission charges", async () => {
    const listingId = await createListing();
    const first = await requestJson("/api/market/buy", "POST", { listing_id: listingId });
    const second = await requestJson("/api/market/buy", "POST", { listing_id: listingId });

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(409);
    expect(db.prepare("SELECT COUNT(*) AS count FROM p2p_orders").get()?.["count"]).toBe(1);
    expect(
      db.prepare("SELECT obsidian FROM pilots WHERE pilot_id = ?").get(BUYER_ID)?.["obsidian"],
    ).toBe(4);
  });

  it("hides payment details from the public catalog and seller history", async () => {
    const listingId = await createListing();
    const catalog = await requestJson<{ listings: Record<string, unknown>[] }>(
      "/api/market/listings",
    );
    expect(catalog.response.status).toBe(200);
    expect(catalog.payload.listings[0]).not.toHaveProperty("payment_details");

    const bought = await requestJson<{ order_id: string }>("/api/market/buy", "POST", {
      listing_id: listingId,
    });
    const sellerToken = "seller-test-session";
    const sellerHash = createHash("sha256").update(sellerToken).digest("hex");
    const now = Date.now();
    db.prepare(
      `INSERT INTO player_accounts (google_sub, email, pilot_id, created_at, updated_at)
      VALUES ('seller-sub', 'seller@example.com', ?, ?, ?)`,
    ).run(SELLER_ID, now, now);
    db.prepare(
      `INSERT INTO auth_sessions (token_hash, wallet_address, created_at, expires_at)
      VALUES (?, 'google:seller-sub', ?, ?)`,
    ).run(sellerHash, now, now + 60_000);
    const sellerHistory = await requestJson<{ orders: { payment_details: string | null }[] }>(
      "/api/market/history",
      "GET",
      undefined,
      sellerToken,
    );
    expect(sellerHistory.payload.orders[0]?.payment_details).toBeNull();
    expect(bought.payload.order_id).toBeTruthy();
  });
});
