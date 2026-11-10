import { describe, expect, it } from "vitest";
import server from "@/server";

const PILOT_ID = "plt_0123456789abcdef01234567";
const PAYMENT_ID = "pay_0123456789abcdef0123";
const TX_HASH = "0x" + "a".repeat(64);
const ADMIN_EMAIL = "emprendedora.onlinevee@gmail.com";

function createDatabase(options?: { email?: string; adminSession?: boolean; paymentStatus?: string }) {
  let status = options?.paymentStatus ?? "PENDING";
  let batchCalls = 0;
  const runQueries: string[] = [];
  const db = {
    prepare(query: string) {
      let values: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          values = args;
          return this;
        },
        async run() {
          runQueries.push(query);
          return { meta: { changes: 1 } };
        },
        async first() {
          if (query.includes("FROM auth_sessions")) {
            return { wallet_address: "google:admin-sub", expires_at: Date.now() + 60_000 };
          }
          if (query.includes("FROM player_accounts") && query.includes("google_sub")) {
            return {
              google_sub: "admin-sub",
              email: options?.email ?? ADMIN_EMAIL,
              pilot_id: "plt_aaaaaaaaaaaaaaaaaaaaaaaa",
            };
          }
          if (query.includes("FROM admin_sessions")) {
            return options?.adminSession === false
              ? null
              : { token_hash: "valid-admin-session", google_sub: "admin-sub" };
          }
          if (query.includes("FROM admin_payment_settings")) {
            return { wallet_address: "0x" + "b".repeat(40), qr_url: null, updated_at: Date.now() };
          }
          if (query.includes("FROM obsidian_payment_requests WHERE id = ?")) {
            return {
              id: PAYMENT_ID,
              pilot_id: PILOT_ID,
              obsidian_amount: 50,
              currency: "USDT",
              network: "POLYGON",
              tx_hash: TX_HASH,
              status,
            };
          }
          if (query.includes("SELECT obsidian FROM pilots")) return { obsidian: 15 };
          return null;
        },
        async all() {
          return { results: [] };
        },
      };
    },
    async batch(statements: unknown[]) {
      batchCalls += 1;
      if (status === "PENDING") status = "APPROVED";
      return statements.map(() => ({ meta: { changes: 1 } }));
    },
  };
  return { db, getBatchCalls: () => batchCalls, getRunQueries: () => runQueries };
}

function adminRequest(path: string, method = "GET", body?: Record<string, unknown>, authorized = true) {
  return new Request(`https://game.example${path}`, {
    method,
    headers: {
      ...(method === "POST" ? { "content-type": "application/json", origin: "https://game.example" } : {}),
      ...(authorized ? { cookie: "__Host-ss_session=admin; __Host-ss_admin=admin-panel" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("administrative OBS payments", () => {
  it("requires the administrator's second-factor session", async () => {
    const mock = createDatabase({ adminSession: false });
    const response = await server.fetch(adminRequest("/api/admin/payments"), { DB: mock.db });
    expect(response.status).toBe(403);
  });

  it("rejects non-administrator accounts", async () => {
    const mock = createDatabase({ email: "player@example.com" });
    const response = await server.fetch(adminRequest("/api/admin/payments"), { DB: mock.db });
    expect(response.status).toBe(403);
  });

  it("returns wallet settings and payment history", async () => {
    const mock = createDatabase();
    const response = await server.fetch(adminRequest("/api/admin/payments"), { DB: mock.db });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      settings: { wallet_address: "0x" + "b".repeat(40) },
      payments: [],
    });
  });

  it("saves a valid Polygon wallet and rejects an invalid address", async () => {
    const mock = createDatabase();
    const valid = await server.fetch(
      adminRequest("/api/admin/payments", "POST", {
        action: "save-wallet",
        walletAddress: "0x" + "c".repeat(40),
        qrUrl: "https://example.com/payment-qr.png",
      }),
      { DB: mock.db },
    );
    expect(valid.status).toBe(200);
    expect(mock.getRunQueries().some((query) => query.includes("admin_payment_settings"))).toBe(true);

    const invalid = await server.fetch(
      adminRequest("/api/admin/payments", "POST", {
        action: "save-wallet",
        walletAddress: "not-a-wallet",
        qrUrl: "",
      }),
      { DB: mock.db },
    );
    expect(invalid.status).toBe(400);
  });

  it("credits OBS only once when a pending payment is approved", async () => {
    const mock = createDatabase();
    const first = await server.fetch(
      adminRequest("/api/admin/payments", "POST", { action: "approve", paymentId: PAYMENT_ID }),
      { DB: mock.db },
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      success: true,
      status: "APPROVED",
      balanceBefore: 15,
      balanceAfter: 65,
    });
    expect(mock.getBatchCalls()).toBe(1);

    const second = await server.fetch(
      adminRequest("/api/admin/payments", "POST", { action: "approve", paymentId: PAYMENT_ID }),
      { DB: mock.db },
    );
    expect(second.status).toBe(409);
    expect(mock.getBatchCalls()).toBe(1);
  });

  it("requires a reason to reject a payment", async () => {
    const mock = createDatabase();
    const response = await server.fetch(
      adminRequest("/api/admin/payments", "POST", {
        action: "reject",
        paymentId: PAYMENT_ID,
        reason: "no",
      }),
      { DB: mock.db },
    );
    expect(response.status).toBe(400);
    expect(mock.getBatchCalls()).toBe(0);
  });
});
