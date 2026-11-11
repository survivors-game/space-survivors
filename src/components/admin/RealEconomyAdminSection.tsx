import { useCallback, useEffect, useState } from "react";
import { Banknote, Crown, RefreshCw, Trophy, Wallet } from "lucide-react";

type VipPayment = {
  id: string;
  pilot_id: string;
  amount_cents: number;
  currency: string;
  network: string;
  tx_hash: string;
  wallet_address: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  created_at: number;
  reviewed_at: number | null;
  rejection_reason: string | null;
  callsign: string;
  email: string | null;
};

type TicketRequest = {
  id: string;
  pilot_id: string;
  amount_cents: number;
  wallet_address: string;
  status: "PENDING" | "PAID" | "REJECTED";
  tx_hash: string | null;
  reason: string | null;
  created_at: number;
  callsign: string;
  email: string | null;
};

type PrizePayout = {
  id: string;
  cycle_id: string;
  ranking_type: "BOSSES" | "REFERRALS";
  position: number;
  pilot_id: string;
  score: number;
  prize_cents: number;
  status: "PENDING" | "PAID";
  tx_hash: string | null;
  created_at: number;
  paid_at: number | null;
  callsign: string;
  wallet_address: string;
};

type Payload = {
  distribution: {
    vip_price_usd: number;
    admin_usd: number;
    referral_usd: number;
    bosses_pool_usd: number;
    referrals_pool_usd: number;
  };
  cycle: { id: string; starts_at: number; ends_at: number };
  pools: { ranking_type: "BOSSES" | "REFERRALS"; total_cents: number }[];
  vip_payments: VipPayment[];
  ticket_requests: TicketRequest[];
  cycles: { id: string; starts_at: number; ends_at: number; status: string }[];
  payouts: PrizePayout[];
};

const money = (cents: number) => "$" + (cents / 100).toFixed(2) + " USDT";
const date = (value: number) => new Date(value).toLocaleString("es-CO");
const statusLabel = (value: string) =>
  value === "PENDING"
    ? "Pendiente"
    : value === "PAID" || value === "APPROVED"
      ? "Pagado / aprobado"
      : "Rechazado";

export function RealEconomyAdminSection() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/real-economy", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = (await response.json()) as Payload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "No se pudo cargar la economía real.");
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar la economía real.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const action = async (
    id: string,
    operation: "approve-vip" | "reject-vip" | "pay-ticket" | "reject-ticket" | "pay-prize",
    extra: Record<string, string> = {},
  ) => {
    setBusyId(id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/real-economy", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: operation, id, ...extra }),
      });
      const result = (await response.json()) as { error?: string; success?: boolean };
      if (!response.ok || !result.success)
        throw new Error(result.error ?? "No se pudo completar la operación.");
      setNotice("Operación registrada correctamente.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la operación.");
    } finally {
      setBusyId("");
    }
  };

  const reject = (id: string, kind: "reject-vip" | "reject-ticket") => {
    const reason = window.prompt("Escribe el motivo del rechazo (mínimo 5 caracteres):");
    if (reason && reason.trim().length >= 5) void action(id, kind, { reason: reason.trim() });
  };

  const pay = (id: string, kind: "pay-ticket" | "pay-prize") => {
    const tx_hash = window.prompt("Pega el hash de la transferencia USDT realizada en Polygon:");
    if (tx_hash) void action(id, kind, { tx_hash: tx_hash.trim() });
  };

  const currentPool = (type: "BOSSES" | "REFERRALS") =>
    data?.pools.find((pool) => pool.ranking_type === type)?.total_cents ?? 0;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-white/55">
          Control privado de ventas VIP, tickets, fondos y pagos de premios.
        </p>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 border border-cyan-400/30 px-3 py-2 text-xs text-cyan-200 disabled:opacity-40"
        >
          <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>

      {error ? (
        <p
          role="alert"
          className="border border-rose-400/30 bg-rose-400/5 p-3 text-xs text-rose-200"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="border border-emerald-400/30 bg-emerald-400/5 p-3 text-xs text-emerald-200"
        >
          {notice}
        </p>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["Precio VIP", money(data.distribution.vip_price_usd * 100)],
              ["Tu parte", money(data.distribution.admin_usd * 100)],
              ["Referidos", money(data.distribution.referral_usd * 100)],
              ["Ranking Bosses", money(data.distribution.bosses_pool_usd * 100)],
              ["Ranking Invitaciones", money(data.distribution.referrals_pool_usd * 100)],
            ].map(([label, value]) => (
              <article key={label} className="border border-amber-400/20 bg-amber-400/[0.04] p-3">
                <p className="text-[10px] uppercase tracking-wider text-white/50">{label}</p>
                <p className="mt-2 text-sm font-bold text-amber-200">{value}</p>
              </article>
            ))}
          </div>

          <section className="border border-cyan-400/20 bg-black/20 p-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-200">
              <Wallet className="size-4" /> Fondos del ciclo actual · 15 días
            </div>
            <p className="mt-1 text-[10px] text-white/45">
              {date(data.cycle.starts_at)} — {date(data.cycle.ends_at)}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="border border-white/10 p-3">
                <p className="text-[10px] uppercase text-white/50">Ranking de Bosses</p>
                <p className="mt-1 text-lg font-bold text-emerald-300">
                  {money(currentPool("BOSSES"))}
                </p>
              </div>
              <div className="border border-white/10 p-3">
                <p className="text-[10px] uppercase text-white/50">Ranking de Invitaciones</p>
                <p className="mt-1 text-lg font-bold text-emerald-300">
                  {money(currentPool("REFERRALS"))}
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-200">
                <Crown className="size-4" /> Compras VIP pendientes
              </h3>
              <p className="mt-1 text-[10px] text-white/45">Verifica el TX en PolygonScan y confirma que llegaron 10 USDT a la wallet de cobro antes de aprobar.</p>
            </div>
            <div className="overflow-x-auto border border-white/10">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-white/5 text-white/55">
                  <tr>
                    <th className="p-2">Jugador</th>
                    <th className="p-2">Fecha</th>
                    <th className="p-2">Monto</th>
                    <th className="p-2">TX Polygon</th>
                    <th className="p-2">Estado</th>
                    <th className="p-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.vip_payments.map((payment) => (
                    <tr key={payment.id} className="border-t border-white/10">
                      <td className="p-2">
                        {payment.callsign}
                        <span className="block text-[10px] text-white/40">
                          {payment.email ?? payment.pilot_id}
                        </span>
                      </td>
                      <td className="p-2 whitespace-nowrap">{date(payment.created_at)}</td>
                      <td className="p-2">{money(payment.amount_cents)}</td>
                      <td className="p-2">
                        <a
                          className="font-mono text-cyan-200 underline"
                          href={`https://polygonscan.com/tx/${payment.tx_hash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {payment.tx_hash.slice(0, 12)}…
                        </a>
                      </td>
                      <td className="p-2">{statusLabel(payment.status)}</td>
                      <td className="p-2">
                        {payment.status === "PENDING" ? (
                          <div className="flex gap-1">
                            <button
                              disabled={busyId === payment.id}
                              onClick={() => void action(payment.id, "approve-vip")}
                              className="border border-emerald-400/30 px-2 py-1 text-emerald-200 disabled:opacity-40"
                            >
                              Aprobar
                            </button>
                            <button
                              disabled={busyId === payment.id}
                              onClick={() => reject(payment.id, "reject-vip")}
                              className="border border-rose-400/30 px-2 py-1 text-rose-200 disabled:opacity-40"
                            >
                              Rechazar
                            </button>
                          </div>
                        ) : (
                          <span className="text-white/35">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!data.vip_payments.length ? (
                    <tr>
                      <td colSpan={6} className="p-5 text-center text-white/40">
                        No hay compras VIP registradas.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-200">
              <Banknote className="size-4" /> Solicitudes de cobro de tickets
            </h3>
            <div className="overflow-x-auto border border-white/10">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-white/5 text-white/55">
                  <tr>
                    <th className="p-2">Jugador</th>
                    <th className="p-2">Monto</th>
                    <th className="p-2">Wallet Polygon</th>
                    <th className="p-2">Fecha</th>
                    <th className="p-2">Estado</th>
                    <th className="p-2">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ticket_requests.map((request) => (
                    <tr key={request.id} className="border-t border-white/10">
                      <td className="p-2">
                        {request.callsign}
                        <span className="block text-[10px] text-white/40">
                          {request.email ?? request.pilot_id}
                        </span>
                      </td>
                      <td className="p-2 font-bold text-emerald-200">
                        {money(request.amount_cents)}
                      </td>
                      <td className="max-w-48 break-all p-2 font-mono text-[10px] text-white/60">
                        {request.wallet_address}
                      </td>
                      <td className="p-2 whitespace-nowrap">{date(request.created_at)}</td>
                      <td className="p-2">{statusLabel(request.status)}</td>
                      <td className="p-2">
                        {request.status === "PENDING" ? (
                          <div className="flex gap-1">
                            <button
                              disabled={busyId === request.id}
                              onClick={() => pay(request.id, "pay-ticket")}
                              className="border border-emerald-400/30 px-2 py-1 text-emerald-200 disabled:opacity-40"
                            >
                              Pagado
                            </button>
                            <button
                              disabled={busyId === request.id}
                              onClick={() => reject(request.id, "reject-ticket")}
                              className="border border-rose-400/30 px-2 py-1 text-rose-200 disabled:opacity-40"
                            >
                              Rechazar
                            </button>
                          </div>
                        ) : request.tx_hash ? (
                          <a
                            className="font-mono text-cyan-200 underline"
                            href={`https://polygonscan.com/tx/${request.tx_hash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver TX
                          </a>
                        ) : (
                          <span className="text-white/35">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!data.ticket_requests.length ? (
                    <tr>
                      <td colSpan={6} className="p-5 text-center text-white/40">
                        No hay solicitudes de tickets.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-200">
              <Trophy className="size-4" /> Premios de rankings por pagar
            </h3>
            <div className="overflow-x-auto border border-white/10">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="bg-white/5 text-white/55">
                  <tr>
                    <th className="p-2">Ciclo</th>
                    <th className="p-2">Ranking</th>
                    <th className="p-2">Puesto</th>
                    <th className="p-2">Jugador</th>
                    <th className="p-2">Premio</th>
                    <th className="p-2">Estado</th>
                    <th className="p-2">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payouts.map((payout) => (
                    <tr key={payout.id} className="border-t border-white/10">
                      <td className="p-2 font-mono text-[10px] text-white/45">{payout.cycle_id}</td>
                      <td className="p-2">
                        {payout.ranking_type === "BOSSES" ? "Bosses" : "Invitaciones"}
                      </td>
                      <td className="p-2">{payout.position}.º</td>
                      <td className="p-2">{payout.callsign}</td>
                      <td className="p-2 font-bold text-emerald-200">
                        {money(payout.prize_cents)}
                      </td>
                      <td className="p-2">{statusLabel(payout.status)}</td>
                      <td className="p-2">
                        {payout.status === "PENDING" ? (
                          <button
                            disabled={busyId === payout.id}
                            onClick={() => pay(payout.id, "pay-prize")}
                            className="border border-emerald-400/30 px-2 py-1 text-emerald-200 disabled:opacity-40"
                          >
                            Registrar pago
                          </button>
                        ) : payout.tx_hash ? (
                          <a
                            className="font-mono text-cyan-200 underline"
                            href={`https://polygonscan.com/tx/${payout.tx_hash}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Ver TX
                          </a>
                        ) : (
                          "Pagado"
                        )}
                      </td>
                    </tr>
                  ))}
                  {!data.payouts.length ? (
                    <tr>
                      <td colSpan={7} className="p-5 text-center text-white/40">
                        Todavía no hay premios cerrados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : loading ? (
        <p className="py-8 text-center text-xs text-white/50">Cargando economía real...</p>
      ) : null}
    </section>
  );
}
