import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Referral = {
  callsign: string;
  boss_obsidian: number;
  created_at: number;
};

type TicketRequest = {
  id: string;
  amount_cents: number;
  wallet_address: string;
  status: "PENDING" | "PAID" | "REJECTED";
  tx_hash: string | null;
  reason: string | null;
  created_at: number;
};

interface ReferralProfileProps {
  onRedeemed: () => void;
}

export function ReferralProfile({ onRedeemed }: ReferralProfileProps) {
  const [referralCode, setReferralCode] = useState("");
  const [hasRedeemed, setHasRedeemed] = useState(false);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [draftCode, setDraftCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [ticketAvailable, setTicketAvailable] = useState(0);
  const [ticketRequests, setTicketRequests] = useState<TicketRequest[]>([]);
  const [ticketAmount, setTicketAmount] = useState("1");
  const [ticketWallet, setTicketWallet] = useState("");
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketNotice, setTicketNotice] = useState("");
  const [ticketError, setTicketError] = useState("");
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletNotice, setWalletNotice] = useState("");
  const [walletError, setWalletError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [codeResponse, referralsResponse] = await Promise.all([
          fetch("/api/referral/my-code", { credentials: "same-origin", cache: "no-store" }),
          fetch("/api/referral/mine", { credentials: "same-origin", cache: "no-store" }),
        ]);
        const [codePayload, referralsPayload] = (await Promise.all([
          codeResponse.json(),
          referralsResponse.json(),
        ])) as [
          { referral_code?: string; has_redeemed?: boolean; error?: string },
          { referrals?: Referral[]; error?: string },
        ];
        if (
          !codeResponse.ok ||
          !codePayload.referral_code ||
          !referralsResponse.ok ||
          !Array.isArray(referralsPayload.referrals)
        ) {
          throw new Error(
            codePayload.error ??
              referralsPayload.error ??
              "No se pudieron cargar tus invitaciones.",
          );
        }
        if (active) {
          setReferralCode(codePayload.referral_code);
          setHasRedeemed(codePayload.has_redeemed === true);
          setReferrals(referralsPayload.referrals);
          setError("");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Error de conexión.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadTickets = async () => {
      try {
        const response = await fetch("/api/rewards/tickets", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const data = (await response.json()) as {
          balance_cents?: number;
          available_cents?: number;
          requests?: TicketRequest[];
        };
        if (!response.ok) return;
        if (active) {
          setTicketAvailable(data.available_cents ?? 0);
          setTicketRequests(data.requests ?? []);
        }
      } catch {
        if (active) setTicketError("No se pudo cargar el saldo de tickets.");
      }
    };
    void loadTickets();
    const timer = window.setInterval(() => void loadTickets(), 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/rewards/wallet", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response.json()) as { wallet_address?: string };
        if (active && response.ok) setTicketWallet(data.wallet_address ?? "");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const savePayoutWallet = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWalletSaving(true);
    setWalletError("");
    setWalletNotice("");
    try {
      const response = await fetch("/api/rewards/wallet", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet_address: ticketWallet.trim() }),
      });
      const data = (await response.json()) as { error?: string; success?: boolean };
      if (!response.ok || !data.success)
        throw new Error(data.error ?? "No se pudo guardar la wallet.");
      setWalletNotice("Wallet Polygon guardada para recibir premios.");
    } catch (cause) {
      setWalletError(cause instanceof Error ? cause.message : "No se pudo guardar la wallet.");
    } finally {
      setWalletSaving(false);
    }
  };

  const requestTicketPayout = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (ticketBusy) return;
    setTicketBusy(true);
    setTicketError("");
    setTicketNotice("");
    try {
      const response = await fetch("/api/rewards/tickets", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount_usd: Number(ticketAmount),
          wallet_address: ticketWallet.trim(),
        }),
      });
      const data = (await response.json()) as { error?: string; success?: boolean };
      if (!response.ok || !data.success)
        throw new Error(data.error ?? "No se pudo enviar la solicitud.");
      setTicketNotice("Solicitud enviada a administración.");
      const refresh = await fetch("/api/rewards/tickets", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const current = (await refresh.json()) as {
        balance_cents?: number;
        available_cents?: number;
        requests?: TicketRequest[];
      };
      if (refresh.ok) {
        setTicketAvailable(current.available_cents ?? 0);
        setTicketRequests(current.requests ?? []);
      }
    } catch (cause) {
      setTicketError(cause instanceof Error ? cause.message : "No se pudo enviar la solicitud.");
    } finally {
      setTicketBusy(false);
    }
  };

  const redeem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draftCode.trim() || redeeming || hasRedeemed) return;
    setRedeeming(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/referral/redeem", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ referral_code: draftCode }),
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error ?? "No se pudo canjear el código.");
      }
      setHasRedeemed(true);
      setDraftCode("");
      setMessage("Código canjeado: recibiste 5 OBS, 100 CR y 1 Imán.");
      onRedeemed();
      const referralsResponse = await fetch("/api/referral/mine", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const referralsPayload = (await referralsResponse.json()) as { referrals?: Referral[] };
      if (referralsResponse.ok && Array.isArray(referralsPayload.referrals)) {
        setReferrals(referralsPayload.referrals);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo canjear el código.");
    } finally {
      setRedeeming(false);
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(referralCode);
      setMessage("Código copiado.");
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo copiar el código.");
    }
  };

  return (
    <div className="space-y-5">
      <section className="border border-cyan-500/20 bg-[#0b0d1c]/75 p-4 sm:p-6">
        <h2 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
          Mi código de invitación
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <code className="border border-cyan-400/25 bg-[#070814] px-4 py-3 text-sm font-bold tracking-[0.18em] text-cyan-100">
            {loading ? "CARGANDO..." : referralCode || "—"}
          </code>
          <Button
            type="button"
            variant="outline"
            disabled={loading || !referralCode}
            onClick={() => void copyCode()}
            className="h-10 rounded-none border-cyan-400/30 text-[9px] uppercase tracking-wider text-cyan-100"
          >
            Copiar
          </Button>
        </div>
      </section>

      <section className="border border-cyan-500/20 bg-[#0b0d1c]/75 p-4 sm:p-6">
        <h2 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
          Ingresar código de invitación
        </h2>
        {hasRedeemed ? (
          <p className="text-xs text-cyan-100">Ya canjeaste un código de invitación</p>
        ) : (
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => void redeem(event)}
          >
            <input
              aria-label="Código de invitación"
              autoComplete="off"
              className="h-11 min-w-0 flex-1 border border-cyan-400/30 bg-[#070814] px-3 text-xs uppercase text-white outline-none focus:border-cyan-300 disabled:opacity-50"
              disabled={loading || redeeming}
              maxLength={9}
              onChange={(event) => setDraftCode(event.target.value.toUpperCase())}
              placeholder="SG-XXXXXX"
              value={draftCode}
            />
            <Button
              type="submit"
              disabled={loading || redeeming || !draftCode.trim()}
              className="h-11 rounded-none bg-[#00f0ff] px-5 text-[9px] font-bold uppercase text-[#070814] hover:bg-cyan-200"
            >
              {redeeming ? "CANJEANDO..." : "Canjear"}
            </Button>
          </form>
        )}
        {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
        {message ? <p className="mt-3 text-xs text-emerald-300">{message}</p> : null}
      </section>

      <section className="border border-emerald-400/25 bg-[#0b0d1c]/75 p-4 sm:p-6">
        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">
          Wallet Polygon para premios
        </h2>
        <p className="mt-1 text-xs text-white/55">
          Registra la dirección donde quieres recibir los premios de los rankings en USDT.
        </p>
        <form
          onSubmit={(event) => void savePayoutWallet(event)}
          className="mt-3 flex flex-col gap-2 sm:flex-row"
        >
          <input
            aria-label="Wallet Polygon para premios"
            value={ticketWallet}
            onChange={(event) => setTicketWallet(event.target.value)}
            placeholder="0x..."
            maxLength={42}
            className="h-10 min-w-0 flex-1 border border-white/15 bg-[#070814] px-3 font-mono text-xs text-white"
          />
          <Button
            type="submit"
            disabled={walletSaving}
            className="h-10 rounded-none bg-emerald-300 px-4 text-[9px] font-bold uppercase text-black hover:bg-emerald-200 disabled:opacity-40"
          >
            {walletSaving ? "Guardando..." : "Guardar wallet"}
          </Button>
        </form>
        {walletError ? (
          <p role="alert" className="mt-2 text-xs text-rose-300">
            {walletError}
          </p>
        ) : null}
        {walletNotice ? (
          <p role="status" className="mt-2 text-xs text-emerald-200">
            {walletNotice}
          </p>
        ) : null}
      </section>

      <section className="border border-emerald-400/25 bg-[#0b0d1c]/75 p-4 sm:p-6">
        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">
          Tickets de recompensa
        </h2>
        <form
          onSubmit={(event) => void requestTicketPayout(event)}
          className="mt-4 grid gap-2 sm:grid-cols-[110px_1fr_auto]"
        >
          <input
            aria-label="Cantidad de tickets a cobrar en USD"
            type="number"
            min="1"
            max={Math.floor(ticketAvailable / 100)}
            step="1"
            value={ticketAmount}
            onChange={(event) => setTicketAmount(event.target.value)}
            className="h-10 border border-white/15 bg-[#070814] px-3 text-xs text-white"
          />
          <input
            aria-label="Wallet Polygon para recibir USDT"
            value={ticketWallet}
            onChange={(event) => setTicketWallet(event.target.value)}
            placeholder="Wallet Polygon 0x..."
            maxLength={42}
            className="h-10 min-w-0 border border-white/15 bg-[#070814] px-3 font-mono text-xs text-white"
          />
          <Button
            type="submit"
            disabled={ticketBusy || ticketAvailable < 100}
            className="h-10 rounded-none bg-emerald-300 px-4 text-[9px] font-bold uppercase text-black hover:bg-emerald-200 disabled:opacity-40"
          >
            {ticketBusy ? "Enviando..." : "Solicitar cobro"}
          </Button>
        </form>
        {ticketError ? (
          <p role="alert" className="mt-2 text-xs text-rose-300">
            {ticketError}
          </p>
        ) : null}
        {ticketNotice ? (
          <p role="status" className="mt-2 text-xs text-emerald-200">
            {ticketNotice}
          </p>
        ) : null}
        {ticketRequests.length ? (
          <div className="mt-4 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-white/50">
              Solicitudes de cobro
            </p>
            {ticketRequests.map((request) => (
              <div
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-xs"
              >
                <span className="text-white/70">
                  ${(request.amount_cents / 100).toFixed(2)} USDT
                </span>
                <span
                  className={
                    request.status === "PAID"
                      ? "text-emerald-300"
                      : request.status === "REJECTED"
                        ? "text-rose-300"
                        : "text-amber-200"
                  }
                >
                  {request.status === "PAID"
                    ? "Pagado"
                    : request.status === "REJECTED"
                      ? "Rechazado"
                      : "Pendiente"}
                </span>
                {request.reason ? (
                  <span className="w-full text-rose-300">{request.reason}</span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="border border-cyan-500/20 bg-[#0b0d1c]/75 p-4 sm:p-6">
        <h2 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
          Mis Referidos
        </h2>
        {loading ? (
          <p className="py-4 text-center text-xs text-slate-400">Cargando referidos...</p>
        ) : referrals.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">Aún no has invitado a nadie</p>
        ) : (
          <div className="max-h-80 overflow-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-[#0b0d1c] text-[9px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-2 py-2">Nombre de usuario</th>
                  <th className="px-2 py-2 text-right">Nivel de Boss</th>
                  <th className="px-2 py-2 text-right">Fecha de registro</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((referral, index) => (
                  <tr
                    className="border-t border-slate-700/70"
                    key={`${referral.callsign}-${index}`}
                  >
                    <td className="px-2 py-2 text-white">{referral.callsign}</td>
                    <td className="px-2 py-2 text-right text-fuchsia-300">
                      {referral.boss_obsidian.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-300">
                      {new Date(referral.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
