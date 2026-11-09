import type { LucideIcon } from "lucide-react";
import {
  Rocket,
  Wrench,
  Trophy,
  Users,
  ShoppingCart,
  Shield,
  Sparkles,
  Flame,
  Zap,
  Award,
} from "lucide-react";
import { MenuHeroShip } from "@/components/game/MenuHeroShip";
import type { ShipDef as ShipConfig } from "@/game/data/ships";
import type { StageDef as StageConfig } from "@/game/data/stages";

export interface PilotHubProps {
  pilotName: string;
  pilotId: string;
  vipActive: boolean;
  credits: number;
  obsidian: number;
  runs: number;
  kills: number;
  shipsCount: number;
  selectedShip: ShipConfig;
  selectedStage: StageConfig;
  allianceTag?: string | null;
  onDeploy: () => void;
  onOpenHangar: () => void;
  onOpenMissions: () => void;
  onOpenAlliance: () => void;
  onOpenMarket: () => void;
  onOpenProfile: () => void;
}

const SEGMENTS = 10;
const CYAN = "#22d3ee";
const MAGENTA = "#ff0055";
const GOLD = "#ffd700";
const VIOLET = "#c4a1ff";
const ORANGE = "#ff8a3d";

const HEX_CLIP =
  "polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0% 50%)";

const KEYFRAMES = `
@keyframes ph-pulse {
  0%, 100% { box-shadow: 0 0 18px rgba(34,211,238,.45), 0 0 40px rgba(255,0,85,.25); }
  50% { box-shadow: 0 0 34px rgba(34,211,238,.9), 0 0 70px rgba(255,0,85,.5); }
}
@keyframes ph-gold {
  0%, 100% { text-shadow: 0 0 6px rgba(255,215,0,.6); }
  50% { text-shadow: 0 0 14px rgba(255,215,0,1), 0 0 24px rgba(255,215,0,.6); }
}
.ph-pulse { animation: ph-pulse 2s ease-in-out infinite; }
.ph-gold { animation: ph-gold 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .ph-pulse, .ph-gold { animation: none; }
}
`;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const fmt = (n: number) => n.toLocaleString("es-CO");

/** Normalizes the ship's real stats (see src/game/data/ships.ts) into 0..1 bars. */
function computeShipStats(ship: ShipConfig) {
  const attack = clamp01(((ship.dmg / ship.cd) - 0.9) / 0.35);
  const defense = clamp01(
    0.25 +
      ((ship.hp - 80) / 70) * 0.5 +
      (ship.armor / 2) * 0.15 +
      (ship.shield / 30) * 0.1,
  );
  const speed = clamp01(0.2 + ((ship.speed - 200) / 75) * 0.8);
  return { attack, defense, speed };
}

interface PowerBarProps {
  label: string;
  value: number;
  color: string;
  Icon: LucideIcon;
}

function PowerBar({ label, value, color, Icon }: PowerBarProps) {
  const filled = Math.round(value * SEGMENTS);
  return (
    <div className="space-y-1.5">
      <div
        className="flex items-center gap-1.5 font-pixel text-[11px] tracking-widest"
        style={{ color }}
      >
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="flex gap-1">
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const on = i < filled;
          return (
            <span
              key={i}
              className="h-2.5 flex-1 rounded-[2px] transition-all duration-300"
              style={
                on
                  ? {
                      background: `linear-gradient(to top, ${color}66, ${color})`,
                      boxShadow: `0 0 8px ${color}aa`,
                    }
                  : { background: "rgba(255,255,255,0.06)" }
              }
            />
          );
        })}
      </div>
    </div>
  );
}

export function PilotHub({
  pilotName,
  pilotId,
  vipActive,
  credits,
  obsidian,
  runs,
  kills,
  shipsCount,
  selectedShip,
  selectedStage,
  allianceTag,
  onDeploy,
  onOpenHangar,
  onOpenMissions,
  onOpenAlliance,
  onOpenMarket,
  onOpenProfile,
}: PilotHubProps) {
  const stats = computeShipStats(selectedShip);
  const initial = pilotName.trim().charAt(0).toUpperCase() || "P";
  const shortId =
    pilotId.length > 8
      ? `${pilotId.slice(0, 8).toUpperCase()}…`
      : pilotId.toUpperCase();

  const quickAccess = [
    {
      label: "[HANGAR & MEJORAS]",
      code: "ARSENAL",
      Icon: Wrench,
      color: CYAN,
      onClick: onOpenHangar,
    },
    {
      label: "[MISIONES & PASE]",
      code: "OBJETIVOS",
      Icon: Trophy,
      color: GOLD,
      onClick: onOpenMissions,
    },
    {
      label: "[CENTRO MULTIJUGADOR]",
      code: "ALIANZA",
      Icon: Users,
      color: VIOLET,
      onClick: onOpenAlliance,
    },
    {
      label: "[MERCADO P2P]",
      code: "INTERCAMBIO",
      Icon: ShoppingCart,
      color: MAGENTA,
      onClick: onOpenMarket,
    },
  ];

  const telemetry = [
    { label: "MISIONES", value: runs, Icon: Award, color: CYAN },
    { label: "BAJAS TOTALES", value: kills, Icon: Flame, color: ORANGE },
    { label: "NAVES EN FLOTA", value: shipsCount, Icon: Rocket, color: VIOLET },
  ];

  return (
    <div className="relative w-full font-pixel text-white">
      <style>{KEYFRAMES}</style>

      {/* 1. BARRA SUPERIOR DE CABINA */}
      <header className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-cyan-400/40 bg-black/50 px-3 py-2 shadow-[0_0_18px_rgba(34,211,238,0.15)]">
          <div
            className="relative h-12 w-11 shrink-0 p-[2px]"
            style={{
              clipPath: HEX_CLIP,
              background: `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`,
            }}
          >
            <div
              className="flex h-full w-full items-center justify-center bg-[#07070f] font-arcade text-sm text-cyan-200"
              style={{ clipPath: HEX_CLIP }}
            >
              {initial}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate font-arcade text-[10px] leading-relaxed text-white">
              {allianceTag ? (
                <span className="text-fuchsia-300">[{allianceTag}] </span>
              ) : null}
              {pilotName}
            </div>
            <div className="truncate text-[11px] tracking-wider text-cyan-300/70">
              ID {shortId}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenProfile}
            className="shrink-0 rounded border border-fuchsia-400/60 px-2 py-1 text-[11px] text-fuchsia-200 transition hover:bg-fuchsia-500/20"
          >
            [PERFIL]
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {vipActive ? (
            <span
              className="ph-gold inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-arcade text-[10px]"
              style={{
                color: GOLD,
                borderColor: GOLD,
                background: "rgba(255,215,0,0.08)",
                boxShadow: "0 0 14px rgba(255,215,0,0.35)",
              }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              ★ VIP PILOT
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/25 px-3 py-1.5 text-[11px] tracking-widest text-cyan-400/50">
              ESTÁNDAR
            </span>
          )}

          <div className="flex items-center gap-2 rounded-lg border border-cyan-400/60 bg-cyan-400/5 px-3 py-1.5 shadow-[0_0_12px_rgba(34,211,238,0.25)]">
            <span className="text-[10px] text-cyan-300">CR</span>
            <span className="font-arcade text-xs tabular-nums text-cyan-100">
              {fmt(credits)}
            </span>
          </div>

          <div
            className="flex items-center gap-2 rounded-lg border bg-[#ff0055]/5 px-3 py-1.5"
            style={{
              borderColor: `${MAGENTA}99`,
              boxShadow: `0 0 12px ${MAGENTA}40`,
            }}
          >
            <span className="text-[10px]" style={{ color: MAGENTA }}>
              OBS
            </span>
            <span className="font-arcade text-xs tabular-nums text-pink-100">
              {fmt(obsidian)}
            </span>
          </div>
        </div>
      </header>

      {/* 2. ZONA CENTRAL */}
      <main className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Columna izquierda: Bahía de la nave */}
        <section className="relative overflow-hidden rounded-2xl border border-cyan-400/30 bg-black/60 p-4 shadow-[inset_0_0_40px_rgba(34,211,238,0.08)]">
          <span className="pointer-events-none absolute left-2 top-2 h-4 w-4 border-l-2 border-t-2 border-cyan-400/70" />
          <span className="pointer-events-none absolute right-2 top-2 h-4 w-4 border-r-2 border-t-2 border-cyan-400/70" />
          <span className="pointer-events-none absolute bottom-2 left-2 h-4 w-4 border-b-2 border-l-2 border-cyan-400/70" />
          <span className="pointer-events-none absolute bottom-2 right-2 h-4 w-4 border-b-2 border-r-2 border-cyan-400/70" />

          <div className="mb-2 text-[10px] tracking-[0.3em] text-cyan-400/60">
            BAHÍA DE LA NAVE
          </div>

          <div className="relative h-[240px] w-full sm:h-[300px]">
            <MenuHeroShip ship={selectedShip} />
          </div>

          <h2 className="mt-2 font-arcade text-base text-cyan-300 drop-shadow-[0_0_10px_rgba(34,211,238,0.9)] sm:text-lg">
            {selectedShip.name}
          </h2>

          <div className="mt-4 space-y-3">
            <PowerBar
              label="ATAQUE"
              value={stats.attack}
              color={ORANGE}
              Icon={Flame}
            />
            <PowerBar
              label="BLINDAJE"
              value={stats.defense}
              color={CYAN}
              Icon={Shield}
            />
            <PowerBar
              label="VELOCIDAD"
              value={stats.speed}
              color={VIOLET}
              Icon={Zap}
            />
          </div>

          <div className="mt-4 rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/5 px-3 py-2 text-[11px] tracking-wider text-fuchsia-200">
            {`SECTOR DE DESPLIEGUE: ${selectedStage.name}`}
          </div>
        </section>

        {/* Columna derecha: Consola táctica de acceso rápido */}
        <section className="flex flex-col gap-4">
          <button
            type="button"
            onClick={onDeploy}
            className="ph-pulse group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl border-2 border-cyan-300 bg-linear-to-r from-cyan-500/25 via-fuchsia-500/25 to-cyan-500/25 px-4 py-7 font-arcade text-sm text-white transition hover:scale-[1.01] hover:brightness-110 active:scale-[0.99] sm:text-base"
          >
            <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/20 opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
            <Rocket className="h-6 w-6 text-cyan-200 drop-shadow-[0_0_6px_rgba(34,211,238,0.9)]" />
            <span className="drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]">
              [DESPLEGAR AL COMBATE]
            </span>
          </button>

          <div className="grid flex-1 grid-cols-2 gap-3">
            {quickAccess.map(({ label, code, Icon, color, onClick }) => (
              <button
                key={label}
                type="button"
                onClick={onClick}
                className="group flex flex-col items-start gap-3 rounded-xl border border-white/15 bg-black/50 p-4 text-left transition hover:-translate-y-0.5 hover:bg-white/5 hover:shadow-[0_0_18px_rgba(34,211,238,0.3)]"
                style={{ borderColor: `${color}55` }}
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg border"
                  style={{
                    color,
                    borderColor: `${color}80`,
                    background: `${color}14`,
                    boxShadow: `0 0 10px ${color}40`,
                  }}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[11px] leading-snug tracking-wider text-white">
                  {label}
                </span>
                <span className="text-[9px] tracking-[0.25em] text-white/40">
                  {code}
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>

      {/* 3. PANEL INFERIOR: Telemetría de servicio */}
      <footer className="mt-4 grid grid-cols-3 gap-3">
        {telemetry.map(({ label, value, Icon, color }) => (
          <div
            key={label}
            className="rounded-xl border border-white/10 bg-black/60 p-3 text-center"
          >
            <div
              className="flex items-center justify-center gap-1.5 text-[9px] tracking-widest text-white/50 sm:text-[10px]"
            >
              <Icon className="h-3 w-3" style={{ color }} />
              {label}
            </div>
            <div
              className="mt-2 font-arcade text-xl tabular-nums sm:text-2xl"
              style={{
                color,
                textShadow: `0 0 10px ${color}aa`,
              }}
            >
              {fmt(value)}
            </div>
          </div>
        ))}
      </footer>
    </div>
  );
}

export default PilotHub;