// @vitest-environment node
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import server from "@/server";

const BUYER_ID = "plt_aaaaaaaaaaaaaaaaaaaaaaaa";
const SELLER_ID = "plt_bbbbbbbbbbbbbbbbbbbbbbbb";
const ADMIN_ID = "plt_cccccccccccccccccccccccc";
const ADMIN_TOKEN = "market-admin-session";
const ADMIN_SESSION_TOKEN = "market-admin-panel";
const ADMIN_SESSION_HASH = createHash("sha256").update(ADMIN_SESSION_TOKEN).digest("hex");
const SESSION_TOKEN = "market-test-session";
const SESSION_HASH = createHash("sha256").update(SESSION_TOKEN).digest("hex");
const SELLER_TOKEN = "market-seller-session";
const SELLER_SESSION_HASH = createHash("sha256").update(SELLER_TOKEN).digest("hex");
const PUBLISH_INVENTORY_ID = "inv-publish-item";
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
          const prepared = db.prepare(query);
          if (/\\bRETURNING\\b/i.test(query)) {
            prepared.all(...(values as never[]) as never[]);
            const changes = Number(
              (db.prepare("SELECT changes() AS changes").get() as { changes: number }).changes,
            );
            return { meta: { changes }, results: [] };
          }
          const result = prepared.run(...(values as never[]));
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
    async batch(statements: Array<{ run(): Promise<{ meta: { changes: number }; results?: unknown[] }> }>) {
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

async function createListing(
  sellerId = SELLER_ID,
  status = "ACTIVO",
  itemId = "boss-ship",
  country = "CO",
) {
  const now = Date.now();
  const listingId = `ad_${createHash("sha256").update(itemId).digest("hex").slice(0, 16)}`;
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
      price, price_minor, currency, currency_code, country_code,
      payment_methods, payment_details, payment_data_json,
      status, fee_paid, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'BOSS SHIP', 'nave', 100, 10000, 'COP', 'COP', ?,
      '["NEQUI"]', 'seller private payment data', '{"NEQUI":"seller private payment data"}',
      ?, 1, ?, ?)`,
  ).run(listingId, sellerId, `inv-${itemId}`, itemId, country, status, now, now);
  return listingId;
}

describe("P2P purchase flow", () => {
  beforeEach(async () => {
    const initialized = await server.fetch(
      new Request("https://game.example/api/market/listings"),
      { DB: database },
    );
    expect(initialized.status).toBe(401);
    db.exec(`
      DELETE FROM p2p_dispute_messages;
      DELETE FROM p2p_disputes;
      DELETE FROM admin_market_logs;
      DELETE FROM admin_sessions;
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
    db.prepare(
      `INSERT INTO player_accounts (google_sub, email, pilot_id, created_at, updated_at)
      VALUES ('seller-sub', 'seller@example.com', ?, ?, ?)`,
    ).run(SELLER_ID, now, now);
    db.prepare(
      `INSERT INTO auth_sessions (token_hash, wallet_address, created_at, expires_at)
      VALUES (?, 'google:seller-sub', ?, ?)`,
    ).run(SELLER_SESSION_HASH, now, now + 60_000);
    db.prepare(
      `INSERT INTO pilot_inventory
      (id, pilot_id, item_id, item_name, item_type, quantity, is_locked, grant_source, created_at, updated_at)
      VALUES (?, ?, 'publish-item', 'PUBLISH ITEM', 'objeto', 1, 0, 'boss', ?, ?)`,
    ).run(PUBLISH_INVENTORY_ID, SELLER_ID, now, now);
    db.prepare(
      `INSERT INTO player_accounts (google_sub, email, pilot_id, created_at, updated_at)
      VALUES ('admin-sub', 'emprendedora.onlinevee@gmail.com', ?, ?, ?)`,
    ).run(ADMIN_ID, now, now);
    db.prepare(
      `INSERT INTO auth_sessions (token_hash, wallet_address, created_at, expires_at)
      VALUES (?, 'google:admin-sub', ?, ?)`,
    ).run(createHash("sha256").update(ADMIN_TOKEN).digest("hex"), now, now + 60_000);
    db.prepare(
      `INSERT INTO admin_sessions (token_hash, google_sub, created_at, expires_at)
      VALUES (?, 'admin-sub', ?, ?)`,
    ).run(ADMIN_SESSION_HASH, now, now + 60_000);
    db.prepare(
      `INSERT INTO pilots (pilot_id, callsign, obsidian, created_at, updated_at)
      VALUES (?, 'ADMIN', 5, ?, ?)`,
    ).run(ADMIN_ID, now, now);
  });

  afterAll(() => db.close());

  const publishAd = (body: Record<string, unknown>, token = SELLER_TOKEN) =>
    requestJson<{ success?: boolean; adId?: string; error?: string }>(
      "/api/market/publish",
      "POST",
      body,
      token,
    );

  const validPublishInput = (overrides: Record<string, unknown> = {}) => ({
    inventoryId: PUBLISH_INVENTORY_ID,
    country: "CO",
    priceMinor: 150_000,
    paymentMethods: [{ method: "NEQUI", details: "nequi@example.com" }],
    ...overrides,
  });

  it("completes a purchase and transfers the item exactly once", async () => {
    const listingId = await createListing();
    const bought = await requestJson<{
      order_id: string;
      payment_details: string;
      payment_method: { method: string; label: string };
    }>("/api/market/buy", "POST", { listing_id: listingId, payment_method: "NEQUI" });

    expect(bought.response.status).toBe(200);
    expect(bought.payload.payment_details).toBe("seller private payment data");
    expect(bought.payload.payment_method.method).toBe("NEQUI");
    expect(
      db.prepare("SELECT obsidian FROM pilots WHERE pilot_id = ?").get(BUYER_ID)?.["obsidian"],
    ).toBe(4);

    const reported = await requestJson<{ status: string }>("/api/market/report-payment", "POST", {
      order_id: bought.payload.order_id,
    });
    expect(reported.response.status).toBe(200);
    expect(reported.payload.status).toBe("PAGO_REPORTADO");
    const legacyConfirm = await requestJson("/api/market/confirm", "POST", {
      order_id: bought.payload.order_id,
    });
    expect(legacyConfirm.response.status).toBe(403);
    const buyerCannotRelease = await requestJson("/api/market/release", "POST", {
      order_id: bought.payload.order_id,
    });
    expect(buyerCannotRelease.response.status).toBe(403);
    const released = await requestJson<{ status: string }>(
      "/api/market/release",
      "POST",
      { order_id: bought.payload.order_id },
      SELLER_TOKEN,
    );
    expect(released.response.status).toBe(200);
    expect(released.payload.status).toBe("COMPLETADA");
    expect(
      db
        .prepare("SELECT pilot_id, grant_source, quantity FROM pilot_inventory WHERE item_id = ?")
        .get("boss-ship"),
    ).toMatchObject({ pilot_id: BUYER_ID, grant_source: "market", quantity: 1 });
    expect(db.prepare("SELECT status FROM p2p_ads WHERE id = ?").get(listingId)?.["status"]).toBe(
      "VENDIDO",
    );

    const repeated = await requestJson(
      "/api/market/release",
      "POST",
      {
        order_id: bought.payload.order_id,
      },
      SELLER_TOKEN,
    );
    expect(repeated.response.status).toBe(409);
  });

  it("keeps the listing reserved after the buyer reports payment", async () => {
    const listingId = await createListing();
    const bought = await requestJson<{ order_id: string }>("/api/market/buy", "POST", {
      listing_id: listingId,
      payment_method: "NEQUI",
    });
    expect(bought.response.status).toBe(200);
    const reported = await requestJson("/api/market/report-payment", "POST", {
      order_id: bought.payload.order_id,
    });
    expect(reported.response.status).toBe(200);

    const second = await requestJson("/api/market/buy", "POST", {
      listing_id: listingId,
      payment_method: "NEQUI",
    });
    expect(second.response.status).toBe(409);
    expect(db.prepare("SELECT COUNT(*) AS count FROM p2p_orders").get()?.["count"]).toBe(1);
    expect(
      db.prepare("SELECT obsidian FROM pilots WHERE pilot_id = ?").get(BUYER_ID)?.["obsidian"],
    ).toBe(4);
  });

  it("opens a dispute, stores the conversation and lets the administrator resolve it", async () => {
    const listingId = await createListing();
    const bought = await requestJson<{ order_id: string }>("/api/market/buy", "POST", {
      listing_id: listingId,
      payment_method: "NEQUI",
    });
    expect(bought.response.status).toBe(200);

    const opened = await requestJson<{ dispute_id: string; status: string }>(
      "/api/market/dispute",
      "POST",
      { order_id: bought.payload.order_id, reason: "El vendedor no reconoce el pago realizado." },
    );
    expect(opened.response.status).toBe(200);
    expect(opened.payload.status).toBe("DISPUTA");

    const reply = await requestJson(
      "/api/market/dispute/message",
      "POST",
      {
        order_id: bought.payload.order_id,
        message: "Adjunto la información para revisar el caso.",
        evidence_url: "https://example.com/proof",
      },
      SELLER_TOKEN,
    );
    expect(reply.response.status).toBe(200);

    const adminRequest = new Request("https://game.example/api/admin/market", {
      headers: {
        cookie: `__Host-ss_session=${ADMIN_TOKEN}; __Host-ss_admin=${ADMIN_SESSION_TOKEN}`,
      },
    });
    const adminList = await server.fetch(adminRequest, { DB: database });
    expect(adminList.status).toBe(200);
    const adminData = (await adminList.json()) as {
      disputes: { id: string }[];
      messages: unknown[];
    };
    expect(adminData.disputes).toHaveLength(1);
    expect(adminData.messages).toHaveLength(2);

    const resolve = await server.fetch(
      new Request("https://game.example/api/admin/market", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://game.example",
          cookie: `__Host-ss_session=${ADMIN_TOKEN}; __Host-ss_admin=${ADMIN_SESSION_TOKEN}`,
        },
        body: JSON.stringify({
          action: "resolve-buyer",
          disputeId: opened.payload.dispute_id,
          reason: "La prueba presentada respalda al comprador.",
        }),
      }),
      { DB: database },
    );
    expect(resolve.status).toBe(200);
    expect(((await resolve.json()) as { orderStatus: string }).orderStatus).toBe("COMPLETADA");
    expect(
      db.prepare("SELECT pilot_id FROM pilot_inventory WHERE item_id = 'boss-ship'").get()?.[
        "pilot_id"
      ],
    ).toBe(BUYER_ID);
  });

  it("resolves a dispute for the seller and returns the item to the listing", async () => {
    const listingId = await createListing();
    const bought = await requestJson<{ order_id: string }>("/api/market/buy", "POST", {
      listing_id: listingId,
      payment_method: "NEQUI",
    });
    const opened = await requestJson<{ dispute_id: string }>("/api/market/dispute", "POST", {
      order_id: bought.payload.order_id,
      reason: "El comprador no demuestra el pago.",
    });
    expect(opened.response.status).toBe(200);

    const resolved = await server.fetch(
      new Request("https://game.example/api/admin/market", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://game.example",
          cookie: `__Host-ss_session=${ADMIN_TOKEN}; __Host-ss_admin=${ADMIN_SESSION_TOKEN}`,
        },
        body: JSON.stringify({
          action: "resolve-seller",
          disputeId: opened.payload.dispute_id,
          reason: "No se acreditó evidencia suficiente del pago.",
        }),
      }),
      { DB: database },
    );
    expect(resolved.status).toBe(200);
    expect(((await resolved.json()) as { orderStatus: string }).orderStatus).toBe("CANCELADA");
    expect(db.prepare("SELECT status FROM p2p_ads WHERE id = ?").get(listingId)?.["status"]).toBe(
      "ACTIVO",
    );
    expect(
      db
        .prepare("SELECT pilot_id, is_locked FROM pilot_inventory WHERE id = 'inv-boss-ship'")
        .get(),
    ).toMatchObject({
      pilot_id: SELLER_ID,
      is_locked: 0,
    });
  });

  it("removes a listing administratively and unlocks the seller's item", async () => {
    const listingId = await createListing();
    const response = await server.fetch(
      new Request("https://game.example/api/admin/market", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://game.example",
          cookie: `__Host-ss_session=${ADMIN_TOKEN}; __Host-ss_admin=${ADMIN_SESSION_TOKEN}`,
        },
        body: JSON.stringify({
          action: "remove-listing",
          adId: listingId,
          reason: "Publicación incumple las reglas del mercado.",
        }),
      }),
      { DB: database },
    );
    expect(response.status).toBe(200);
    expect(db.prepare("SELECT status FROM p2p_ads WHERE id = ?").get(listingId)?.["status"]).toBe(
      "CANCELADO",
    );
    expect(
      db.prepare("SELECT is_locked FROM pilot_inventory WHERE id = 'inv-boss-ship'").get()?.[
        "is_locked"
      ],
    ).toBe(0);
  });

  it("cancels a pending order without refunding the commission", async () => {
    const listingId = await createListing();
    const bought = await requestJson<{ order_id: string }>("/api/market/buy", "POST", {
      listing_id: listingId,
      payment_method: "NEQUI",
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
    const result = await requestJson("/api/market/buy", "POST", {
      listing_id: listingId,
      payment_method: "NEQUI",
    });
    expect(result.response.status).toBe(400);
    expect(db.prepare("SELECT COUNT(*) AS count FROM p2p_orders").get()?.["count"]).toBe(0);
  });

  it("rejects inactive listings", async () => {
    const listingId = await createListing(SELLER_ID, "PAUSADO");
    const result = await requestJson("/api/market/buy", "POST", {
      listing_id: listingId,
      payment_method: "NEQUI",
    });
    expect(result.response.status).toBe(409);
    expect(db.prepare("SELECT COUNT(*) AS count FROM p2p_orders").get()?.["count"]).toBe(0);
  });

  it("rejects purchases when the buyer cannot pay the commission", async () => {
    const listingId = await createListing();
    db.prepare("UPDATE pilots SET obsidian = 0 WHERE pilot_id = ?").run(BUYER_ID);

    const result = await requestJson("/api/market/buy", "POST", {
      listing_id: listingId,
      payment_method: "NEQUI",
    });
    expect(result.response.status).toBe(400);
    expect(db.prepare("SELECT COUNT(*) AS count FROM p2p_orders").get()?.["count"]).toBe(0);
  });

  it("prevents duplicate pending orders and duplicate commission charges", async () => {
    const listingId = await createListing();
    const first = await requestJson("/api/market/buy", "POST", {
      listing_id: listingId,
      payment_method: "NEQUI",
    });
    const second = await requestJson("/api/market/buy", "POST", {
      listing_id: listingId,
      payment_method: "NEQUI",
    });

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
      payment_method: "NEQUI",
    });
    const sellerHistory = await requestJson<{ orders: { payment_details: string | null }[] }>(
      "/api/market/history",
      "GET",
      undefined,
      SELLER_TOKEN,
    );
    expect(sellerHistory.payload.orders[0]?.payment_details).toBeNull();
    expect(bought.payload.order_id).toBeTruthy();
  });

  it("filters public listings by country without exposing private payment fields", async () => {
    await createListing(SELLER_ID, "ACTIVO", "colombia-ship", "CO");
    await createListing(SELLER_ID, "ACTIVO", "brazil-ship", "BR");

    const result = await requestJson<{ listings: Record<string, unknown>[] }>(
      "/api/market/listings?country=BR",
    );
    expect(result.response.status).toBe(200);
    expect(result.payload.listings).toHaveLength(1);
    expect(result.payload.listings[0]).toMatchObject({ country: "BR" });
    expect(result.payload.listings[0]).not.toHaveProperty("payment_details");
    expect(result.payload.listings[0]).not.toHaveProperty("payment_data_json");
  });

  it("supports multiple payment methods and exposes their details only to the seller", async () => {
    const published = await publishAd(
      validPublishInput({
        paymentMethods: [
          { method: "PSE", details: "pse@example.com" },
          { method: "NEQUI", details: "+57 300 000 0000" },
        ],
      }),
    );
    expect(published.response.status).toBe(200);

    const sellerAds = await requestJson<{ ads: { paymentData: Record<string, string> }[] }>(
      "/api/market/my-ads",
      "GET",
      undefined,
      SELLER_TOKEN,
    );
    expect(sellerAds.payload.ads[0]?.paymentData).toEqual({
      PSE: "pse@example.com",
      NEQUI: "+57 300 000 0000",
    });

    const publicAds = await requestJson<{
      listings: { payment_methods: { label: string }[]; payment_data?: unknown }[];
    }>("/api/market/listings?country=CO");
    expect(publicAds.payload.listings[0]?.payment_methods.map((method) => method.label)).toEqual([
      "PSE",
      "Nequi",
    ]);
    expect(publicAds.payload.listings[0]).not.toHaveProperty("payment_data");
    const buyerAds = await requestJson<{ ads: unknown[] }>("/api/market/my-ads");
    expect(buyerAds.payload.ads).toEqual([]);
  });

  it("rejects fractional and out-of-range minor-unit prices", async () => {
    const invalidPrices: Array<{ country: string; priceMinor: number; methods: unknown[] }> = [
      { country: "CO", priceMinor: 100.5, methods: [{ method: "NEQUI", details: "x" }] },
      { country: "CO", priceMinor: 500_000_001, methods: [{ method: "NEQUI", details: "x" }] },
      { country: "CO", priceMinor: 99, methods: [{ method: "NEQUI", details: "x" }] },
      { country: "CO", priceMinor: 0, methods: [{ method: "NEQUI", details: "x" }] },
      { country: "CO", priceMinor: -1, methods: [{ method: "NEQUI", details: "x" }] },
      {
        country: "VE",
        priceMinor: 5_000_000_001,
        methods: [{ method: "PAGO_MOVIL", details: "x" }],
      },
      { country: "PE", priceMinor: 49, methods: [{ method: "YAPE", details: "x" }] },
      { country: "BR", priceMinor: 2_000_001, methods: [{ method: "PIX", details: "x" }] },
      {
        country: "CU",
        priceMinor: 1_000_001,
        methods: [{ method: "BANK_TRANSFER", details: "x" }],
      },
      { country: "OTHER", priceMinor: 0, methods: [{ method: "BINANCE_PAY", details: "x" }] },
      { country: "VE", priceMinor: 100, methods: [{ method: "PSE", details: "x" }] },
      { country: "US", priceMinor: 100, methods: [{ method: "PIX", details: "x" }] },
    ];

    for (const invalid of invalidPrices) {
      const result = await publishAd(
        validPublishInput({
          country: invalid.country,
          priceMinor: invalid.priceMinor,
          paymentMethods: invalid.methods,
        }),
      );
      expect(result.response.status).toBe(400);
    }
    expect(
      db.prepare("SELECT obsidian FROM pilots WHERE pilot_id = ?").get(SELLER_ID)?.["obsidian"],
    ).toBe(5);
  });

  it("strips HTML from payment data and enforces the per-method length limit", async () => {
    const published = await publishAd(
      validPublishInput({
        paymentMethods: [{ method: "PSE", details: "<b>Cuenta</b> <script>alert(1)</script>" }],
      }),
    );
    expect(published.response.status).toBe(200);

    const sellerAds = await requestJson<{ ads: { paymentData: Record<string, string> }[] }>(
      "/api/market/my-ads",
      "GET",
      undefined,
      SELLER_TOKEN,
    );
    expect(sellerAds.payload.ads[0]?.paymentData["PSE"]).toBe("Cuenta alert(1)");
    expect(sellerAds.payload.ads[0]?.paymentData["PSE"]).not.toMatch(/[<>]/);

    const tooLong = await publishAd(
      validPublishInput({
        inventoryId: "inv-publish-item-overflow",
        paymentMethods: [{ method: "NEQUI", details: "x".repeat(501) }],
      }),
    );
    expect(tooLong.response.status).toBe(400);
  });

  it("reveals only the selected payment details to the buyer after order creation", async () => {
    const published = await publishAd(
      validPublishInput({
        paymentMethods: [
          { method: "PSE", details: "checkout at pse.example" },
          { method: "NEQUI", details: "private phone number" },
        ],
      }),
    );
    expect(published.response.status).toBe(200);
    const bought = await requestJson<{
      payment_method: { method: string };
      payment_details: string;
    }>("/api/market/buy", "POST", {
      listing_id: published.payload.adId,
      payment_method: "PSE",
    });
    expect(bought.response.status).toBe(200);
    expect(bought.payload.payment_method.method).toBe("PSE");
    expect(bought.payload.payment_details).toBe("checkout at pse.example");
    expect(bought.payload.payment_details).not.toContain("private phone number");

    const history = await requestJson<{
      orders: { payment_method: { method: string } | null; payment_details: string | null }[];
    }>("/api/market/history");
    expect(history.payload.orders[0]?.payment_method?.method).toBe("PSE");
    expect(history.payload.orders[0]?.payment_details).toBe("checkout at pse.example");
  });

  it("allows legacy-origin objects to be listed, published, bought, and transferred", async () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO pilot_inventory
      (id, pilot_id, item_id, item_name, item_type, quantity, is_locked, grant_source, created_at, updated_at)
      VALUES ('inv-legacy-object', ?, 'legacy-object', 'LEGACY OBJECT', 'objeto', 2, 0, 'legacy', ?, ?)`,
    ).run(SELLER_ID, now, now);

    const state = await requestJson<{ inventory: { id: string }[] }>(
      "/api/market/pilot-state",
      "GET",
      undefined,
      SELLER_TOKEN,
    );
    expect(state.payload.inventory.map((item) => item.id)).toContain("inv-legacy-object");
    const published = await publishAd(validPublishInput({ inventoryId: "inv-legacy-object" }));
    expect(published.response.status).toBe(200);
    const catalog = await requestJson<{ listings: { listing_id: string; item_id: string }[] }>(
      "/api/market/listings",
    );
    expect(catalog.payload.listings).toContainEqual(
      expect.objectContaining({ listing_id: published.payload.adId, item_id: "legacy-object" }),
    );
    const bought = await requestJson<{ order_id: string }>("/api/market/buy", "POST", {
      listing_id: published.payload.adId,
      payment_method: "NEQUI",
    });
    expect(bought.response.status).toBe(200);
    const reported = await requestJson<{ status: string }>("/api/market/report-payment", "POST", {
      order_id: bought.payload.order_id,
    });
    expect(reported.response.status).toBe(200);
    const released = await requestJson<{ status: string }>(
      "/api/market/release",
      "POST",
      { order_id: bought.payload.order_id },
      SELLER_TOKEN,
    );
    expect(released.response.status).toBe(200);
    expect(
      db
        .prepare(
          "SELECT pilot_id, grant_source, quantity FROM pilot_inventory WHERE item_id = 'legacy-object'",
        )
        .get(),
    ).toMatchObject({ pilot_id: BUYER_ID, grant_source: "market", quantity: 2 });
  });

  it("allows starter objects such as the magnet to be published", async () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO pilot_inventory
      (id, pilot_id, item_id, item_name, item_type, quantity, is_locked, grant_source, created_at, updated_at)
      VALUES ('inv-starter-magnet', ?, 'iman', 'IMÁN', 'objeto', 5, 0, 'starter', ?, ?)`,
    ).run(SELLER_ID, now, now);

    const published = await publishAd(validPublishInput({ inventoryId: "inv-starter-magnet" }));
    expect(published.response.status).toBe(200);
    expect(
      db.prepare("SELECT is_locked FROM pilot_inventory WHERE id = 'inv-starter-magnet'").get(),
    ).toMatchObject({ is_locked: 1 });
  });

  it("allows legacy secondary ships but never the main ship or obsidian", async () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO pilot_inventory
      (id, pilot_id, item_id, item_name, item_type, quantity, is_locked, grant_source, created_at, updated_at)
      VALUES
      ('inv-legacy-ship', ?, 'raptor', 'RAPTOR', 'nave', 1, 0, 'legacy', ?, ?),
      ('inv-main-ship', ?, 'falcon', 'FALCON', 'nave', 1, 0, 'starter', ?, ?),
      ('inv-obsidian-item', ?, 'obsidian', 'OBSIDIAN', 'objeto', 10, 0, 'legacy', ?, ?)`,
    ).run(SELLER_ID, now, now, SELLER_ID, now, now, SELLER_ID, now, now);
    const secondaryShip = await publishAd(validPublishInput({ inventoryId: "inv-legacy-ship" }));
    expect(secondaryShip.response.status).toBe(200);
    const mainShip = await publishAd(validPublishInput({ inventoryId: "inv-main-ship" }));
    expect(mainShip.response.status).toBe(400);
    expect(mainShip.payload.error).toContain("nave básica");
    const obsidian = await publishAd(validPublishInput({ inventoryId: "inv-obsidian-item" }));
    expect(obsidian.response.status).toBe(400);
    expect(obsidian.payload.error).toContain("no está disponible");
  });

  it("requires a supported network for USDT payment methods", async () => {
    const missingNetwork = await publishAd(
      validPublishInput({
        country: "OTHER",
        paymentMethods: [{ method: "USDT", details: "wallet-address" }],
      }),
    );
    expect(missingNetwork.response.status).toBe(400);

    const published = await publishAd(
      validPublishInput({
        country: "OTHER",
        paymentMethods: [{ method: "USDT", network: "TRC20", details: "wallet-address" }],
      }),
    );
    expect(published.response.status).toBe(200);
    const catalog = await requestJson<{
      listings: { payment_methods: { method: string; network?: string }[] }[];
    }>("/api/market/listings?country=OTHER");
    expect(catalog.payload.listings[0]?.payment_methods).toContainEqual({
      method: "USDT",
      network: "TRC20",
      label: "USDT TRC20",
    });
  });

  it("persists combat pickups in the pilot inventory and consumes them atomically", async () => {
    const first = await requestJson<{ success: boolean; quantity: number }>(
      "/api/inventory/collect",
      "POST",
      { kind: "magnet" },
    );
    expect(first.response.status).toBe(200);
    expect(first.payload.quantity).toBe(1);

    const second = await requestJson<{ success: boolean; quantity: number }>(
      "/api/inventory/collect",
      "POST",
      { kind: "magnet" },
    );
    expect(second.response.status).toBe(200);
    expect(second.payload.quantity).toBe(2);

    const inventory = await requestJson<{ inventory: { itemId: string; quantity: number }[] }>(
      "/api/inventory/state",
    );
    expect(inventory.payload.inventory).toContainEqual(
      expect.objectContaining({ itemId: "iman", quantity: 2 }),
    );

    const used = await requestJson<{ success: boolean; quantity: number }>(
      "/api/inventory/use",
      "POST",
      { kind: "magnet" },
    );
    expect(used.response.status).toBe(200);
    expect(used.payload.quantity).toBe(1);

    const usedAgain = await requestJson<{ success?: boolean; error?: string }>(
      "/api/inventory/use",
      "POST",
      { kind: "magnet" },
    );
    expect(usedAgain.response.status).toBe(200);
    expect(usedAgain.payload.success).toBe(true);

    const exhausted = await requestJson<{ error: string }>("/api/inventory/use", "POST", {
      kind: "magnet",
    });
    expect(exhausted.response.status).toBe(409);
  });

  it("does not add combat pickups to an inventory stack reserved by the market", async () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO pilot_inventory
      (id, pilot_id, item_id, item_name, item_type, quantity, is_locked, grant_source, created_at, updated_at)
      VALUES ('inv-locked-magnet', ?, 'iman', 'IMÁN', 'objeto', 3, 1, 'starter', ?, ?)`,
    ).run(BUYER_ID, now, now);
    const collected = await requestJson<{ error: string }>("/api/inventory/collect", "POST", {
      kind: "magnet",
    });
    expect(collected.response.status).toBe(409);
    expect(
      db.prepare("SELECT quantity FROM pilot_inventory WHERE id = 'inv-locked-magnet'").get(),
    ).toMatchObject({ quantity: 3 });
  });
});
