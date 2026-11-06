import { useEffect, useRef, useState } from "react";
import { Input } from "@/game/input";
import type { HudState } from "@/game/types";

type PlayerStats = NonNullable<HudState["playerStats"]>;
type StatKey = keyof PlayerStats;

interface CombatStatsOverlayProps {
  stats: PlayerStats | undefined;
}

/** Tiempo que la estadística se mantiene iluminada tras una mejora. */
const HIGHLIGHT_MS = 10000;

const ROWS: { key: StatKey; label: string; format: (s: PlayerStats) => string }[] = [
  { key: "damage", label: "DAÑO", format: (s) => `x${s.damage.toFixed(2)}` },
  { key: "attackSpeed", label: "VEL. ATAQUE", format: (s) => `x${s.attackSpeed.toFixed(2)}` },
  { key: "speed", label: "VELOCIDAD", format: (s) => `${Math.round(s.speed)}` },
  { key: "maxHp", label: "VIDA MÁX.", format: (s) => `${Math.round(s.maxHp)}` },
  { key: "armor", label: "ARMADURA", format: (s) => `${Math.round(s.armor)}` },
  { key: "regen", label: "REGENERACIÓN", format: (s) => `+${s.regen.toFixed(1)}/s` },
  { key: "critChance", label: "CRÍTICO", format: (s) => `${Math.round(s.critChance * 100)}%` },
  { key: "pickupRadius", label: "RECOGIDA", format: (s) => `${Math.round(s.pickupRadius)} px` },
  { key: "xpMult", label: "MULT. XP", format: (s) => `x${s.xpMult.toFixed(2)}` },
];

/** Panel discreto con los atributos reales de la nave durante la partida. */
export function CombatStatsOverlay({ stats }: CombatStatsOverlayProps) {
  const previous = useRef<PlayerStats | null>(null);
  // Guarda hasta qué momento (en ms) debe iluminarse cada estadística.
  const [highlighted, setHighlighted] = useState<Partial<Record<StatKey, number>>>({});

  useEffect(() => {
    if (!stats) return;
    const before = previous.current;
    previous.current = stats;
    if (!before) return;

    const improved = ROWS.map((row) => row.key).filter((key) => stats[key] > before[key] + 1e-6);
    if (improved.length === 0) return;

    const until = Date.now() + HIGHLIGHT_MS;
    setHighlighted((current) => {
      const next = { ...current };
      improved.forEach((key) => {
        next[key] = until;
      });
      return next;
    });

    window.setTimeout(() => {
      setHighlighted((current) => {
        const now = Date.now();
        const next: Partial<Record<StatKey, number>> = {};
        (Object.keys(current) as StatKey[]).forEach((key) => {
          const end = current[key];
          if (end !== undefined && end > now) next[key] = end;
        });
        return next;
      });
    }, HIGHLIGHT_MS + 50);
  }, [stats]);

  if (!stats) return null;

  const now = Date.now();
  // En móviles los controles táctiles ocupan la parte baja: el panel sube para no tapar los botones.
  const position = Input.isTouchDevice() ? "bottom-[10.5rem]" : "bottom-3";

  return (
    <div
      className={`pointer-events-none absolute right-3 z-20 flex w-[13.5rem] flex-col gap-1 bg-[#070814]/40 p-3 font-pixel text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] backdrop-blur-[2px] ${position}`}
    >
      {ROWS.map((row) => {
        const active = (highlighted[row.key] ?? 0) > now;
        return (
          <div
            key={row.key}
            className={`flex items-center justify-between gap-4 px-1.5 py-0.5 transition-colors duration-300 ${
              active
                ? "animate-pulse bg-cyan-300/50 text-cyan-50 shadow-[0_0_18px_#22f7ff,inset_0_0_10px_#22f7ff88]"
                : ""
            }`}
          >
            <span className="text-xs uppercase tracking-wide text-white/90">{row.label}</span>
            <span className="text-right text-[11px] tabular-nums text-white">
              {row.format(stats)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
