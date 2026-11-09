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
const DAY_MS = 24 * 60 * 60 * 1000;

const BENEFITS: Benefit[] = [
  {
    label: "+35% DROPS EN COMBATE",
    detail: "Más botiquines de reparación, imanes y PEM.",
    Icon: Zap,
    color: CYAN,
  },
  {
    label: "+20% CRÉDITOS",
    detail: "Bonificación de chatarra por cada nave enemiga destruida.",
    Icon: Coins,
    color: GOLD,
  },
  {
    label: "DISTINTIVO DORADO EN CHAT",
    detail: "Rango [VIP] y nombre en oro neón en el canal global.",
    Icon: Sparkles,
    color: GOLD,
  },
  {
    label: "PASE DE TEMPORADA ÉLITE",
    detail: "Desbloquea el carril exclusivo de recompensas de temporada.",
    Icon: Trophy,
    color: GOLD,
  },
  {
    label: "COMANDO DE ALIANZA",
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
  const canAfford = canAffordVip(obsidian ?? 0);
  const missing = Math.max(0, VIP_PRICE_OBSIDIAN - (obsidian ?? 0));

  const handlePurchase = async () => {
    if (busy) return;
    if (!canAfford) {
      setFeedback({
        tone: "error",
        text: `OBSIDIANA INSUFICIENTE · TE FALTAN ${missing} OBS`,
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await onPurchase();
      setFeedback({ tone: "ok", text: `VIP ACTIVADO · +${VIP_DURATION_DAYS} DÍAS` });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message.toUpperCase() : "NO SE PUDO ACTIVAR EL VIP",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 font-pixel text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Membresía VIP de flota"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-[#ffd700]/50 bg-[#07070f] shadow-[0_0_40px_rgba(255,215,0,0.25),inset_0_0_30px_rgba(34,211,238,0.06)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-[#ffd700]/25 px-4 py-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#ffd700]/70 bg-[#ffd700]/10 shadow-[0_0_14px_rgba(255,215,0,0.4)]"
            style={{ clipPath: "polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0% 50%)" }}
          >
            <Crown className="h-4 w-4 text-[#ffd700]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-arcade text-[10px] leading-relaxed text-[#ffd700] drop-shadow-[0_0_8px_rgba(255,215,0,0.6)]">
              MEMBRESÍA VIP DE FLOTA
            </div>
            <div className="text-[9px] tracking-widest text-white/50">
              OBS DISPONIBLE: <span className="text-[#ff4d9d]">{obsidian ?? "--"}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded border border-white/15 p-1 text-white/60 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="rounded border border-white/10 bg-black/50 p-3">
            <div className="flex items-center justify-between text-[9px] tracking-widest">
              <span className="text-white/50">ESTADO</span>
              {active ? (
                <span className="text-[#ffd700]">
                  ACTIVO · EXPIRA EN {formatVipTimeRemaining(vipUntil, now)}
                </span>
              ) : (
                <span className="text-cyan-400/60">ESTÁNDAR (INACTIVO)</span>
              )}
            </div>
            {active ? (
              <div className="mt-2 h-1.5 w-full bg-white/10">
                <div
                  className="h-full bg-[#ffd700] shadow-[0_0_8px_rgba(255,215,0,0.7)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            ) : null}
          </div>

          <ul className="grid gap-2 sm:grid-cols-2">
            {BENEFITS.map(({ label, detail, Icon, color }) => (
              <li
                key={label}
                className="flex gap-2.5 rounded border p-2.5"
                style={{ borderColor: `${color}55`, background: `${color}0d` }}
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded border"
                  style={{ color, borderColor: `${color}80` }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[8px] leading-relaxed tracking-wide" style={{ color }}>
                    [ {label} ]
                  </span>
                  <span className="block text-[8px] leading-relaxed text-white/50">{detail}</span>
                </span>
              </li>
            ))}
          </ul>

          {feedback ? (
            <p
              role="status"
              className={`border px-3 py-2 text-[9px] tracking-wider ${
                feedback.tone === "ok"
                  ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300"
                  : "border-rose-400/50 bg-rose-400/10 text-rose-300"
              }`}
            >
              {feedback.text}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void handlePurchase()}
            disabled={busy}
            className="flex h-12 w-full items-center justify-center gap-2 border-2 border-[#ffd700] bg-linear-to-r from-[#ffd700]/25 via-cyan-400/15 to-[#ffd700]/25 font-arcade text-[9px] uppercase tracking-wide text-white shadow-[0_0_20px_rgba(255,215,0,0.35)] transition hover:brightness-125 disabled:cursor-wait disabled:opacity-60"
          >
            {busy
              ? "PROCESANDO..."
              : `[ ${active ? "RENOVAR" : "ACTIVAR"} POR ${VIP_PRICE_OBSIDIAN} OBS (${VIP_DURATION_DAYS} DÍAS) ]`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default VipModal;