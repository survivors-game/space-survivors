 import { useMemo } from "react";
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
  TriangleAlert,
} from "lucide-react";
import { spriteUrl } from "@/game/sprites";
import type { ShipDef } from "@/game/data/ships";
import type { StageDef } from "@/game/data/stages";

export interface PilotHubProps {
  pilotName: string;
  pilotId: string;
  vipActive: boolean;
  credits: number;
  obsidian: number;
  runs: number;
  kills: number;
  shipsCount: number;
  selectedShip: ShipDef;
  selectedStage: StageDef;
  allianceTag?: string | null;
  onDeploy: () => void;
  onOpenHangar: () => void;
  onOpenMissions: () => void;
  onOpenAlliance: () => void;
  onOpenMarket: () => void;
  onOpenProfile: () => void;
  /** Abre la membresía VIP. Opcional: sin él, el distintivo no es interactivo. */
  onOpenVip?: () => void;
}

const SEGMENTS = 10;
const CYAN = "#22d3ee";
const MAGENTA = "#ff0055";
const GOLD = "#ffd700";
const VIOLET = "#c4a1ff";
const ORANGE = "#ff8a3d";
const GREEN = "#4ade80";

const HEX_CLIP =
  "polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0% 50%)";
const CUT_CLIP =
  "polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)";

const KEYFRAMES = `
@keyframes ph-pulse {
  0%, 100% { box-shadow: 0 0 14px rgba(34,211,238,.4), 0 0 26px rgba(255,0,85,.2); }
  50% { box-shadow: 0 0 26px rgba(34,211,238,.85), 0 0 46px rgba(255,0,85,.45); }
}
.ph-pulse { animation: ph-pulse 2.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .ph-pulse { animation: none; }
}
`;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const fmt = (n: number) => n.toLocaleString("es-CO");

/** Normaliza las estadísticas reales de la nave (src/game/data/ships.ts) a 0..1. */
function computeShipStats(ship: ShipDef) {
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
    <div className="flex items-center gap-2">
      <div
        className="flex w-[84px] shrink-0 items-center gap-1.5 text-[9px] tracking-widest"
        style={{ color }}
      >
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="flex flex-1 gap-[3px]">
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const on = i < filled;
          return (
            <span
              key={i}
              className="h-2 flex-1 rounded-[1px]"
              style={
                on
                  ? {
                      background: color,
                      boxShadow: `0 0 6px ${color}99`,
                    }
                  : { background: "rgba(255,255,255,0.07)" }
              }
            />
          );
        })}
      </div>
    </div>
  );
}

interface ActionTileProps {
  label: string;
  sub: string;
  Icon: LucideIcon;
  color: string;
  onClick: () => void;
}

function ActionTile({ label, sub, Icon, color, onClick }: ActionTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[60px] items-center gap-2.5 rounded-md border bg-black/60 px-2.5 py-2 text-left transition hover:bg-white/5"
      style={{
        borderColor: `${color}66`,
        boxShadow: `inset 0 0 14px ${color}0d`,
      }}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded border"
        style={{
          color,
          borderColor: `${color}80`,
          background: `${color}14`,
        }}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">
        <span
          className="block truncate font-arcade text-[8px] leading-relaxed tracking-wide"
          style={{ color }}
        >
          {label}
        </span>
        <span className="block truncate text-[8px] tracking-[0.2em] text-white/45">
          {sub}
        </span>
      </span>
    </button>
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
  onOpenVip,
}: PilotHubProps) {
  const shipImage = useMemo(
    () => spriteUrl(selectedShip.sprite, 4),
    [selectedShip.sprite],
  );
  const stats = computeShipStats(selectedShip);
  const initial = pilotName.trim().charAt(0).toUpperCase() || "P";
  const shortId =
    pilotId.length > 8
      ? `${pilotId.slice(0, 8).toUpperCase()}…`
      : pilotId.toUpperCase();
  const pips = Math.min(5, Math.max(1, Math.round(selectedStage.difficulty * 2)));
  const hasHazard = selectedStage.hazard !== "none";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-3 font-pixel text-white">
      <style>{KEYFRAMES}</style>

      {/* A. CABECERA TÁCTICA */}
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md border border-cyan-400/30 bg-black/60 px-2.5 py-1.5 sm:max-w-md">
          <div
            className="relative h-9 w-8 shrink-0 p-[1.5px]"
            style={{
              clipPath: HEX_CLIP,
              background: `linear-gradient(135deg, ${CYAN}, ${MAGENTA})`,
            }}
          >
            <div
              className="flex h-full w-full items-center justify-center bg-[#07070f] font-arcade text-[10px] text-cyan-200"
              style={{ clipPath: HEX_CLIP }}
            >
              {initial}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate font-arcade text-[8px] leading-relaxed text-white">
              {allianceTag ? (
                <span className="text-fuchsia-300">[{allianceTag}] </span>
              ) : null}
              {pilotName}
            </div>
            <div className="truncate text-[9px] tracking-wider text-cyan-300/70">
              ID {shortId}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenProfile}
            className="shrink-0 rounded border border-fuchsia-400/50 px-1.5 py-0.5 text-[9px] text-fuchsia-200 transition hover:bg-fuchsia-500/20"
          >
            [PERFIL]
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={onOpenVip}
            disabled={!onOpenVip}
            title="Membresía VIP"
            className="rounded-full transition enabled:hover:brightness-125 disabled:cursor-default"
          >
          {vipActive ? (
            <span
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-arcade text-[8px]"
              style={{
                color: GOLD,
                borderColor: `${GOLD}aa`,
                background: "rgba(255,215,0,0.08)",
                boxShadow: "0 0 10px rgba(255,215,0,0.35)",
              }}
            >
              <Sparkles className="h-3 w-3" />
              ★ VIP PILOT
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-cyan-400/25 px-2.5 py-1 text-[9px] tracking-widest text-cyan-400/50">
              ESTÁNDAR
            </span>
          )}
          </button>

          <div className="flex items-center gap-1.5 rounded border border-cyan-400/50 bg-cyan-400/5 px-2 py-1">
            <span className="text-[8px] text-cyan-300">CR</span>
            <span className="font-arcade text-[9px] tabular-nums text-cyan-100">
              {fmt(credits)}
            </span>
          </div>

          <div
            className="flex items-center gap-1.5 rounded border bg-[#ff0055]/5 px-2 py-1"
            style={{
              borderColor: `${MAGENTA}99`,
              boxShadow: `0 0 8px ${MAGENTA}33`,
            }}
          >
            <span className="text-[8px]" style={{ color: MAGENTA }}>
              OBS
            </span>
            <span className="font-arcade text-[9px] tabular-nums text-pink-100">
              {fmt(obsidian)}
            </span>
          </div>
        </div>
      </header>

      {/* B + C. BAHÍA DE LA NAVE Y CONSOLA DE ACCIONES */}
      <main className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* B. Bahía de la nave equipada */}
        <section
          className="bg-linear-to-br from-cyan-400/60 via-cyan-400/10 to-fuchsia-500/50 p-px"
          style={{ clipPath: CUT_CLIP }}
        >
          <div
            className="flex h-full flex-col gap-2.5 bg-[#06070f]/95 p-3"
            style={{ clipPath: CUT_CLIP }}
          >
            <div className="flex items-center justify-between text-[8px] tracking-[0.25em] text-cyan-400/70">
              <span>BAHÍA DE HANGAR</span>
              <span className="text-[#4ade80]">● EQUIPADA</span>
            </div>

            <div className="relative flex h-[170px] items-end justify-center overflow-hidden rounded border border-cyan-400/15 bg-[radial-gradient(ellipse_at_bottom,rgba(34,211,238,0.12),transparent_70%)] sm:h-[190px]">
              <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(34,211,238,0.25)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.25)_1px,transparent_1px)] [background-size:20px_20px]" />
              <div className="absolute bottom-3 h-2.5 w-2/3 rounded-full bg-cyan-400/25 shadow-[0_0_18px_rgba(34,211,238,0.45)]" />
              <img
                src={shipImage}
                alt={selectedShip.name}
                draggable={false}
                className="relative z-10 mb-5 h-[70%] w-auto max-w-[80%] object-contain drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                style={{ imageRendering: "pixelated" }}
              />
            </div>

            <div>
              <div className="font-arcade text-[11px] leading-relaxed text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]">
                {selectedShip.name}
              </div>
              <div className="text-[9px] tracking-wider text-white/50">
                {selectedShip.role}
              </div>
            </div>

            <div className="space-y-1.5">
              <PowerBar label="ATAQUE" value={stats.attack} color={ORANGE} Icon={Flame} />
              <PowerBar label="BLINDAJE" value={stats.defense} color={CYAN} Icon={Shield} />
              <PowerBar label="VELOCIDAD" value={stats.speed} color={VIOLET} Icon={Zap} />
            </div>

            <div className="mt-auto space-y-1 rounded border border-fuchsia-500/35 bg-fuchsia-500/5 px-2.5 py-2">
              <div className="flex items-center justify-between text-[8px] tracking-[0.2em] text-fuchsia-200/80">
                <span>SECTOR DE DESPLIEGUE</span>
                <span className="flex gap-[2px]">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5"
                      style={{
                        background: i < pips ? MAGENTA : "rgba(255,255,255,0.12)",
                      }}
                    />
                  ))}
                </span>
              </div>
              <div className="font-arcade text-[9px] leading-relaxed text-white">
                {selectedStage.name}
              </div>
              <div className="truncate text-[8px] tracking-wider text-white/50">
                {selectedStage.subtitle}
              </div>
              <div
                className="flex items-center gap-1.5 text-[8px] tracking-wider"
                style={{ color: hasHazard ? "#fbbf24" : GREEN }}
              >
                {hasHazard ? (
                  <TriangleAlert className="h-3 w-3 shrink-0" />
                ) : (
                  <Shield className="h-3 w-3 shrink-0" />
                )}
                <span className="truncate">{selectedStage.hazardName}</span>
              </div>
            </div>
          </div>
        </section>

        {/* C. Consola de acciones */}
        <section className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onDeploy}
            className="ph-pulse group relative flex h-16 w-full items-center justify-center gap-3 overflow-hidden rounded-md border-2 border-cyan-300 bg-linear-to-r from-cyan-500/30 via-fuchsia-600/30 to-cyan-500/30 font-arcade text-[11px] text-white transition hover:brightness-125 active:scale-[0.99] sm:text-xs"
          >
            <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/15 opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
            <Rocket className="h-5 w-5 text-cyan-200 drop-shadow-[0_0_6px_rgba(34,211,238,0.9)]" />
            <span className="drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">
              [ DESPLEGAR AL COMBATE ]
            </span>
          </button>

          <div className="grid flex-1 grid-cols-2 gap-2">
            <ActionTile
              label="[ HANGAR & MEJORAS ]"
              sub="ARSENAL Y MÓDULOS"
              Icon={Wrench}
              color={CYAN}
              onClick={onOpenHangar}
            />
            <ActionTile
              label="[ MISIONES & PASE ]"
              sub="OBJETIVOS DIARIOS"
              Icon={Trophy}
              color={GOLD}
              onClick={onOpenMissions}
            />
            <ActionTile
              label="[ CENTRO MULTIJUGADOR ]"
              sub="GUERRAS Y ALIANZA"
              Icon={Users}
              color={VIOLET}
              onClick={onOpenAlliance}
            />
            <ActionTile
              label="[ MERCADO P2P ]"
              sub="INTERCAMBIO OBS"
              Icon={ShoppingCart}
              color="#ff4d9d"
              onClick={onOpenMarket}
            />
          </div>
        </section>
      </main>

      {/* D. Telemetría de servicio */}
      <footer className="flex flex-wrap items-center justify-around gap-x-4 gap-y-1.5 rounded-md border border-white/10 bg-black/60 px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[8px] tracking-widest text-white/50">MISIONES COMPLETADAS</span>
          <span className="font-arcade text-[11px] tabular-nums text-cyan-300">{fmt(runs)}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[8px] tracking-widest text-white/50">BAJAS ENEMIGAS</span>
          <span className="font-arcade text-[11px] tabular-nums" style={{ color: ORANGE }}>
            {fmt(kills)}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[8px] tracking-widest text-white/50">NAVES EN FLOTA</span>
          <span className="font-arcade text-[11px] tabular-nums text-violet-300">{fmt(shipsCount)}</span>
        </div>
      </footer>
    </div>
  );
}

export default PilotHub;