import { Input } from "@/game/input";
import type { HudState } from "@/game/types";

interface CombatStatsOverlayProps {
  stats: HudState["playerStats"] | undefined;
}

/** Panel discreto con los atributos reales de la nave durante la partida. */
export function CombatStatsOverlay({ stats }: CombatStatsOverlayProps) {
  if (!stats) return null;

  const rows: { label: string; value: string }[] = [
    { label: "DAÑO", value: `x${stats.damage.toFixed(2)}` },
    { label: "VEL. ATAQUE", value: `x${stats.attackSpeed.toFixed(2)}` },
    { label: "VELOCIDAD", value: `${Math.round(stats.speed)}` },
    { label: "VIDA MÁX.", value: `${Math.round(stats.maxHp)}` },
    { label: "ARMADURA", value: `${Math.round(stats.armor)}` },
    { label: "REGENERACIÓN", value: `+${stats.regen.toFixed(1)}/s` },
    { label: "CRÍTICO", value: `${Math.round(stats.critChance * 100)}%` },
    { label: "RECOGIDA", value: `${Math.round(stats.pickupRadius)} px` },
    { label: "MULT. XP", value: `x${stats.xpMult.toFixed(2)}` },
  ];

  // En móviles los controles táctiles ocupan la parte baja: el panel sube para no tapar los botones.
  const position = Input.isTouchDevice() ? "bottom-[10.5rem]" : "bottom-3";

  return (
    <div
      className={`pointer-events-none absolute right-3 z-20 bg-[#070814]/40 p-2 font-pixel text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] backdrop-blur-[2px] ${position}`}
    >
      <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-[8px] uppercase tracking-[0.12em] text-white/75">{row.label}</dt>
            <dd className="text-right font-arcade text-[9px] tabular-nums text-white">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
