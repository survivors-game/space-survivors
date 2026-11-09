 import { useEffect, useState } from "react";
import { Coins, Sparkles, Trophy, Users, Zap, X, type LucideIcon } from "lucide-react";
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
const CYAN = "#00f0ff";
const VIOLET = "#c4a1ff";
const MAGENTA = "#ff4d9d";
const DAY_MS = 24 * 60 * 60 * 1000;

const BENEFITS: Benefit[] = [
  { label: "+35% drops en combate", detail: "Más reparaciones, imanes y PEM.", Icon: Zap, color: CYAN },
  { label: "+20% créditos", detail: "Bonificación por cada nave enemiga destruida.", Icon: Coins, color: GOLD },
  { label: "Distintivo en chat", detail: "[VIP] y nombre dorado en el canal global.", Icon: Sparkles, color: GOLD },
  { label: "Pase de temporada élite", detail: "Carril exclusivo de recompensas.", Icon: Trophy, color: MAGENTA },
  { label: "Comando de alianza", detail: "Fundar alianzas y liderar guerras.", Icon: Users, color: VIOLET },
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
      setFeedback({ tone: "ok", text: `VIP activado: +${VIP_DURATION_DAYS} días.` });
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Membresía VIP de flota"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl border border-cyan-500/25 bg-[#0b0d1c] shadow-[0_0_30px_#00f0ff12]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-cyan-500/20 px-4 py-3">
          <div>
            <h2 className="font-arcade text-[10px] uppercase leading-relaxed text-[#ffd700]">
              Membresía VIP de flota
            </h2>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/45">
              Ventajas de piloto de élite
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
                    Expira en <span className="font-bold text-[#ffd700]">{formatVipTimeRemaining(vipUntil, now)}</span>
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
              <p className="mt-1 text-[11px] text-white/55">
                Costo: {VIP_PRICE_OBSIDIAN} OBS · {VIP_DURATION_DAYS} días
              </p>
            </div>

            {feedback ? (
              <p
                role="status"
                className={`border px-3 py-2 text-[11px] ${
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
              className="font-arcade h-9 w-full rounded-none border border-[#ffd700] bg-[#ffd700]/15 text-[9px] uppercase tracking-[0.04em] text-[#ffd700] transition hover:bg-[#ffd700]/25 disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? "PROCESANDO..." : `${active ? "Renovar" : "Activar"} · ${VIP_PRICE_OBSIDIAN} OBS`}
            </button>
          </section>

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
        </div>
      </div>
    </div>
  );
}

export default VipModal;