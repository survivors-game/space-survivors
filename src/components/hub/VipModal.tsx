import { useEffect, useState } from "react";
import { Coins, Crown, Sparkles, Trophy, Users, Zap, X, type LucideIcon } from "lucide-react";
import {
  VIP_DURATION_DAYS,
  VIP_PRICE_OBSIDIAN,
  canAffordVip,
  formatVipTimeRemaining,
  hasVip,
} from "@/game/meta/vip";

export interface VipModalProps {
  open: boolean;
  onClose: () => void;
  /** Fecha de expiración del VIP devuelta por el servidor, o null. */
  vipUntil: number | null;
  /** Saldo actual de obsidiana del piloto, o null si aún no se conoce. */
  obsidian: number | null;
  /** Compra o renueva el VIP. Lanza un Error con el mensaje del servidor si falla. */
  onPurchase: () => Promise<void>;
}

interface Benefit {
  label: string;
  detail: string;
  Icon: LucideIcon;
  color: string;
}

const GOLD = "#ffd700";
const CYAN = "#22d3ee";
const VIOLET = "#c4a1ff";
const MAGENTA = "#ff4d9d";
const DAY_MS = 24 * 60 * 60 * 1000;

const BENEFITS: Benefit[] = [
  {
    label: "+35% drops en combate",
    detail: "Más botiquines de reparación, imanes y PEM en cada partida.",
    Icon: Zap,
    color: CYAN,
  },
  {
    label: "+20% créditos",
    detail: "Bonificación de chatarra por cada nave enemiga destruida.",
    Icon: Coins,
    color: GOLD,
  },
  {
    label: "Distintivo dorado en chat",
    detail: "Rango [VIP] y nombre en oro neón en el canal global.",
    Icon: Sparkles,
    color: GOLD,
  },
  {
    label: "Pase de temporada élite",
    detail: "Desbloquea el carril exclusivo de recompensas de temporada.",
    Icon: Trophy,
    color: MAGENTA,
  },
  {
    label: "Comando de alianza",
    detail: "Permiso para fundar alianzas espaciales y liderar guerras.",
    Icon: Users,
    color: VIOLET,
  },
];

interface Feedback {
  tone: "ok" | "error";
  text: string;
}

export function VipModal({ open, onClose, vipUntil, obsidian, onPurchase }: VipModalProps) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const now = Date.now();
  const active = hasVip({ vip_until: vipUntil }, now);
  const remainingMs = active && vipUntil !== null ? vipUntil - now : 0;
  const progress = Math.min(100, (remainingMs / (VIP_DURATION_DAYS * DAY_MS)) * 100);
  const balance = obsidian ?? 0;
  const canAfford = canAffordVip(balance);
  const missing = Math.max(0, VIP_PRICE_OBSIDIAN - balance);

  const handlePurchase = async () => {
    if (busy) return;
    if (!canAfford) {
      setFeedback({ tone: "error", text: `Obsidiana insuficiente: te faltan ${missing} OBS.` });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await onPurchase();
      setFeedback({ tone: "ok", text: `VIP activado: +${VIP_DURATION_DAYS} días de membresía.` });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "No se pudo activar el VIP.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 text-white sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Membresía VIP de flota"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#ffd700]/50 bg-[#07070f] shadow-[0_0_50px_rgba(255,215,0,0.25),inset_0_0_40px_rgba(34,211,238,0.05)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center gap-4 border-b border-[#ffd700]/25 px-6 py-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center border border-[#ffd700]/70 bg-[#ffd700]/10 shadow-[0_0_16px_rgba(255,215,0,0.4)]"
            style={{
              clipPath: "polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0% 50%)",
            }}
          >
            <Crown className="h-6 w-6 text-[#ffd700]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-arcade text-sm leading-relaxed text-[#ffd700] drop-shadow-[0_0_8px_rgba(255,215,0,0.6)] sm:text-base">
              MEMBRESÍA VIP DE FLOTA
            </h2>
            <p className="text-sm text-white/65">Eleva tu nave con ventajas de élite.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/20 text-white/70 transition hover:border-white/50 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-6 md:grid-cols-[320px_1fr]">
          <section className="flex flex-col gap-4">
            <div className="rounded-lg border border-white/15 bg-black/50 p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-white/60">Estado</p>
              {active ? (
                <>
                  <p className="mt-1 font-arcade text-base text-[#ffd700] drop-shadow-[0_0_8px_rgba(255,215,0,0.6)]">
                    ACTIVO
                  </p>
                  <p className="mt-2 text-lg text-white">
                    Expira en{" "}
                    <span className="font-bold text-[#ffd700]">
                      {formatVipTimeRemaining(vipUntil, now)}
                    </span>
                  </p>
                  <div className="mt-3 h-3 w-full bg-white/10">
                    <div
                      className="h-full bg-[#ffd700] shadow-[0_0_10px_rgba(255,215,0,0.7)]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-1 font-arcade text-base text-cyan-300/80">ESTÁNDAR</p>
                  <p className="mt-2 text-base text-white/70">Sin membresía activa.</p>
                </>
              )}
            </div>

            <div className="rounded-lg border border-white/15 bg-black/50 p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-white/60">Tu saldo</p>
              <p className="mt-1 font-arcade text-xl tabular-nums text-[#ff4d9d] drop-shadow-[0_0_8px_rgba(255,77,157,0.6)]">
                {obsidian ?? "--"} OBS
              </p>
              <p className="mt-2 text-sm text-white/65">
                Costo: {VIP_PRICE_OBSIDIAN} OBS por {VIP_DURATION_DAYS} días.
              </p>
            </div>

            {feedback ? (
              <p
                role="status"
                className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
                  feedback.tone === "ok"
                    ? "border-emerald-400/60 bg-emerald-400/10 text-emerald-300"
                    : "border-rose-400/60 bg-rose-400/10 text-rose-300"
                }`}
              >
                {feedback.text}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => void handlePurchase()}
              disabled={busy}
              className="mt-auto flex min-h-16 w-full items-center justify-center border-2 border-[#ffd700] bg-linear-to-r from-[#ffd700]/25 via-cyan-400/15 to-[#ffd700]/25 px-4 py-4 text-center font-arcade text-[11px] leading-relaxed text-white shadow-[0_0_22px_rgba(255,215,0,0.35)] transition hover:brightness-125 disabled:cursor-wait disabled:opacity-60 sm:text-xs"
            >
              {busy
                ? "PROCESANDO..."
                : `${active ? "RENOVAR" : "ACTIVAR"} POR ${VIP_PRICE_OBSIDIAN} OBS · ${VIP_DURATION_DAYS} DÍAS`}
            </button>
          </section>

          <section className="grid content-start gap-3 sm:grid-cols-2">
            {BENEFITS.map(({ label, detail, Icon, color }) => (
              <article
                key={label}
                className="flex gap-4 rounded-lg border p-4"
                style={{ borderColor: `${color}66`, background: `${color}0f` }}
              >
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border"
                  style={{ color, borderColor: `${color}90`, background: `${color}14` }}
                >
                  <Icon className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-bold leading-snug" style={{ color }}>
                    {label}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-white/75">{detail}</p>
                </div>
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

export default VipModal;
