import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Coins, Sparkles, Trophy, Users, Zap, X, type LucideIcon } from "lucide-react";
import { VIP_DURATION_DAYS, formatVipTimeRemaining, hasVip } from "@/game/meta/vip";

export interface VipModalProps {
  open: boolean;
  onClose: () => void;
  vipUntil: number | null;
  obsidian: number | null;
}

interface Benefit {
  label: string;
  detail: string;
  Icon: LucideIcon;
  color: string;
}

type VipPayment = {
  id: string;
  tx_hash: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  created_at: number;
  rejection_reason: string | null;
};

const GOLD = "#ffd700";
const CYAN = "#00f0ff";
const VIOLET = "#c4a1ff";
const MAGENTA = "#ff4d9d";
const DAY_MS = 24 * 60 * 60 * 1000;

const BENEFITS: Benefit[] = [
  {
    label: "×20 probabilidad de drops",
    detail: "Multiplica por 20 la probabilidad de obtener reparaciones, imanes y PEM.",
    Icon: Zap,
    color: CYAN,
  },
  {
    label: "+20% créditos",
    detail: "Bonificación por cada nave enemiga destruida.",
    Icon: Coins,
    color: GOLD,
  },
  {
    label: "Distintivo en chat",
    detail: "[VIP] y nombre dorado en el canal global.",
    Icon: Sparkles,
    color: GOLD,
  },
  {
    label: "Pase de temporada élite",
    detail: "Carril exclusivo de recompensas.",
    Icon: Trophy,
    color: MAGENTA,
  },
  {
    label: "Comando de alianza",
    detail: "Fundar alianzas y liderar guerras.",
    Icon: Users,
    color: VIOLET,
  },
];

const statusLabel = (status: VipPayment["status"]) =>
  status === "PENDING" ? "Pendiente de revisión" : status === "APPROVED" ? "Aprobado" : "Rechazado";

export function VipModal({ open, onClose, vipUntil, obsidian }: VipModalProps) {
  const [walletAddress, setWalletAddress] = useState("");
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [payments, setPayments] = useState<VipPayment[]>([]);
  const [txHash, setTxHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const loadPurchaseInfo = useCallback(async () => {
    setLoading(true);
    try {
      const [infoResponse, purchasesResponse] = await Promise.all([
        fetch("/api/vip/payment-info", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/vip/purchases", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const [info, purchaseData] = (await Promise.all([
        infoResponse.json(),
        purchasesResponse.json(),
      ])) as [
        { wallet_address?: string; qr_url?: string | null; error?: string },
        { purchases?: VipPayment[]; error?: string },
      ];
      if (!infoResponse.ok) throw new Error(info.error ?? "No se pudo cargar la wallet de pago.");
      if (!purchasesResponse.ok)
        throw new Error(purchaseData.error ?? "No se pudo cargar el historial VIP.");
      setWalletAddress(info.wallet_address ?? "");
      setQrUrl(info.qr_url ?? null);
      setPayments(purchaseData.purchases ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo cargar la información de pago.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    void loadPurchaseInfo();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loadPurchaseInfo]);

  if (!open) return null;

  const now = Date.now();
  const active = hasVip({ vip_until: vipUntil }, now);
  const remainingMs = active && vipUntil !== null ? vipUntil - now : 0;
  const progress = Math.min(100, (remainingMs / (VIP_DURATION_DAYS * DAY_MS)) * 100);

  const submitPurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !txHash.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/vip/purchases", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tx_hash: txHash.trim() }),
      });
      const data = (await response.json()) as { error?: string; success?: boolean };
      if (!response.ok || !data.success)
        throw new Error(data.error ?? "No se pudo registrar el pago.");
      setTxHash("");
      setNotice(
        "Pago registrado. La administración verificará la transferencia y activará tu VIP.",
      );
      await loadPurchaseInfo();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar el pago.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Membresía VIP de flota"
      onClick={onClose}
    >
      <div
        className="my-auto w-full max-w-3xl border border-cyan-500/25 bg-[#0b0d1c] shadow-[0_0_30px_#00f0ff12]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-cyan-500/20 px-4 py-3">
          <div>
            <h2 className="font-arcade text-[10px] uppercase leading-relaxed text-[#ffd700]">
              Membresía VIP de flota
            </h2>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">
              Ventajas de piloto de élite · 30 días · 10 USDT
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-7 items-center justify-center border border-white/20 text-white/65 hover:text-white"
          >
            <X className="size-3.5" />
          </button>
        </header>

        <div className="grid gap-3 p-4 md:grid-cols-[220px_1fr]">
          <section className="space-y-3">
            <div className="border border-cyan-500/20 bg-black/40 p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">Estado</p>
              {active ? (
                <>
                  <p className="mt-1 font-arcade text-[10px] text-[#ffd700]">ACTIVO</p>
                  <p className="mt-1 text-xs text-white/85">
                    Expira en{" "}
                    <span className="font-bold text-[#ffd700]">
                      {formatVipTimeRemaining(vipUntil, now)}
                    </span>
                  </p>
                  <div className="mt-2 h-1.5 w-full bg-white/10">
                    <div className="h-full bg-[#ffd700]" style={{ width: `${progress}%` }} />
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-1 font-arcade text-[10px] text-cyan-300/70">ESTÁNDAR</p>
                  <p className="mt-1 text-xs text-white/65">Sin membresía activa.</p>
                </>
              )}
            </div>
            <div className="border border-cyan-500/20 bg-black/40 p-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">Tu saldo</p>
              <p className="mt-1 font-arcade text-[10px] text-[#ff4d9d]">{obsidian ?? "--"} OBS</p>
            </div>
            <section className="divide-y divide-white/10 border border-cyan-500/20 bg-black/30">
              {BENEFITS.map(({ label, detail, Icon, color }) => (
                <div key={label} className="flex items-center gap-3 px-3 py-2">
                  <Icon className="size-3.5 shrink-0" style={{ color }} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color }}>
                      {label}
                    </p>
                    <p className="text-[11px] text-white/60">{detail}</p>
                  </div>
                </div>
              ))}
            </section>
          </section>

          <section className="space-y-3">
            <div className="border border-emerald-400/30 bg-emerald-400/5 p-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-200">
                Comprar VIP · 10 USDT
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-white/65">
                Envía exactamente 10 USDT por la red Polygon a esta dirección. Después registra el
                hash de la transferencia. El VIP se activa cuando administración confirma el pago.
              </p>
              {qrUrl ? (
                <img
                  src={qrUrl}
                  alt="QR de pago VIP"
                  className="mx-auto my-3 max-h-36 border border-white/10 bg-white p-2"
                />
              ) : null}
              <div className="mt-2 break-all border border-white/10 bg-black/40 p-2 font-mono text-[10px] text-emerald-200">
                {loading
                  ? "Cargando wallet..."
                  : walletAddress || "Wallet no configurada por administración"}
              </div>
              <form onSubmit={(event) => void submitPurchase(event)} className="mt-3 space-y-2">
                <label
                  className="block text-[10px] uppercase tracking-wider text-white/60"
                  htmlFor="vip-tx-hash"
                >
                  Hash de la transferencia (TX)
                </label>
                <input
                  id="vip-tx-hash"
                  value={txHash}
                  onChange={(event) => setTxHash(event.target.value)}
                  placeholder="0x..."
                  maxLength={66}
                  className="h-10 w-full border border-white/15 bg-black/40 px-3 font-mono text-xs text-white outline-none focus:border-emerald-300"
                />
                <button
                  type="submit"
                  disabled={busy || loading || !walletAddress || txHash.trim().length !== 66}
                  className="w-full border border-emerald-300/60 bg-emerald-300 px-3 py-2 text-xs font-bold uppercase tracking-wider text-black disabled:opacity-40"
                >
                  {busy ? "Registrando..." : "Ya pagué · Registrar TX"}
                </button>
              </form>
              {error ? (
                <p role="alert" className="mt-2 text-xs text-rose-300">
                  {error}
                </p>
              ) : null}
              {notice ? (
                <p role="status" className="mt-2 text-xs text-emerald-200">
                  {notice}
                </p>
              ) : null}
            </div>
            <div className="border border-white/10 bg-black/20 p-3">
              <h3 className="text-[10px] uppercase tracking-wider text-white/65">
                Mis compras VIP
              </h3>
              {loading ? (
                <p className="mt-2 text-xs text-white/45">Cargando...</p>
              ) : payments.length ? (
                <ul className="mt-2 space-y-2">
                  {payments.map((payment) => (
                    <li
                      key={payment.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-[10px]"
                    >
                      <span className="font-mono text-white/55">
                        {payment.tx_hash.slice(0, 12)}…{payment.tx_hash.slice(-8)}
                      </span>
                      <span
                        className={
                          payment.status === "APPROVED"
                            ? "text-emerald-300"
                            : payment.status === "REJECTED"
                              ? "text-rose-300"
                              : "text-amber-200"
                        }
                      >
                        {statusLabel(payment.status)}
                      </span>
                      {payment.rejection_reason ? (
                        <span className="w-full text-rose-300">{payment.rejection_reason}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-white/45">Todavía no tienes compras registradas.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default VipModal;
