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
const PINK = "#ff4d9d";
const GREEN = "#4ade80";

const HEX_CLIP = "polygon(25% 6.7%, 75% 6.7%, 100% 50%, 75% 93.3%, 25% 93.3%, 0% 50%)";
const CUT_CLIP =
  "polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px)";

const KEYFRAMES = `
@keyframes ph-pulse {
  0%, 100% { box-shadow: 0 0 16px rgba(34,211,238,.4), 0 0 30px rgba(255,0,85,.2); }
  50% { box-shadow: 0 0 30px rgba(34,211,238,.85), 0 0 52px rgba(255,0,85,.45); }
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
  const attack = clamp01((ship.dmg / ship.cd - 0.9) / 0.35);
  const defense = clamp01(
    0.25 + ((ship.hp - 80) / 70) * 0.5 + (ship.armor / 2) * 0.15 + (ship.shield / 30) * 0.1,
  );
  const speed = clamp01(0.2 + ((ship.speed - 200) / 75) * 0.8);
  return { attack, defense, speed };
}

interface StatBarProps {
  label: string;
  value: number;
  color: string;
  Icon: LucideIcon;
}

function StatBar({ label, value, color, Icon }: StatBarProps) {
  const filled = Math.round(value * SEGMENTS);
  return (
    <div className="flex items-center gap-3">
      <div
        className="flex w-32 shrink-0 items-center gap-2 text-sm font-bold uppercase tracking-wide"
        style={{ color }}
      >
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="flex flex-1 gap-1">
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const on = i < filled;
          return (
            <span
              key={i}
              className="h-3.5 flex-1 rounded-[2px]"
              style={
                on
                  ? { background: color, boxShadow: `0 0 8px ${color}aa` }
                  : { background: "rgba(255,255,255,0.08)" }
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
      className="group relative flex min-h-[124px] flex-col justify-between overflow-hidden rounded-lg border bg-black/60 p-4 text-left transition hover:-translate-y-0.5 hover:bg-white/5"
      style={{
        borderColor: `${color}77`,
        boxShadow: `inset 0 0 22px ${color}12`,
      }}
    >
      <span
        className="absolute inset-x-0 top-0 h-[2px] opacity-80"
        style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }}
      />
      <span
        className="flex h-12 w-12 items-center justify-center rounded-md border"
        style={{ color, borderColor: `${color}90`, background: `${color}16` }}
      >
        <Icon className="h-6 w-6" />
      </span>
      <span>
        <span
          className="block text-base font-bold uppercase leading-snug tracking-wide"
          style={{ color }}
        >
          {label}
        </span>
        <span className="mt-1 block text-sm uppercase tracking-wide text-white/65">{sub}</span>
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
  const shipImage = useMemo(() => spriteUrl(selectedShip.sprite, 4), [selectedShip.sprite]);
  const stats = computeShipStats(selectedShip);
  const initial = pilotName.trim().charAt(0).toUpperCase() || "P";
  const shortId =
    pilotId.length > 8 ? `${pilotId.slice(0, 8).toUpperCase()}…` : pilotId.toUpperCase();
  const pips = Math.min(5, Math.max(1, Math.round(selectedStage.difficulty * 2)));
  const hasHazard = selectedStage.hazard !== "none";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 text-white">
      <style>{KEYFRAMES}</style>

      {/* CABECERA */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-cyan-400/30 bg-black/60 px-4 py-2.5 sm:max-w-xl">
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
            <div className="truncate text-lg font-bold leading-tight">
              {allianceTag ? <span className="text-fuchsia-300">[{allianceTag}] </span> : null}
              {pilotName}
            </div>
            <div className="truncate text-sm tracking-wide text-cyan-300/80">ID {shortId}</div>
          </div>

          <button
            type="button"
            onClick={onOpenProfile}
            className="shrink-0 rounded-md border border-fuchsia-400/60 px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-fuchsia-200 transition hover:bg-fuchsia-500/20"
          >
            Perfil
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenVip}
            disabled={!onOpenVip}
            title="Membresía VIP"
            className="rounded-full transition enabled:hover:brightness-125 disabled:cursor-default"
          >
            {vipActive ? (
              <span
                className="ph-vip inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold uppercase tracking-wide"
                style={{
                  color: GOLD,
                  borderColor: `${GOLD}aa`,
                  background: "rgba(255,215,0,0.1)",
                  boxShadow: "0 0 14px rgba(255,215,0,0.35)",
                }}
              >
                <Sparkles className="h-4 w-4" />★ VIP Pilot
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-cyan-400/30 px-4 py-2 text-sm font-bold uppercase tracking-wide text-cyan-300/70">
                Estándar
              </span>
            )}
          </button>

          <div className="flex items-center gap-2 rounded-md border border-cyan-400/50 bg-cyan-400/5 px-3 py-1.5">
            <span className="text-xs font-bold text-cyan-300">CR</span>
            <span className="text-base font-bold tabular-nums text-cyan-100">{fmt(credits)}</span>
          </div>

          <div
            className="flex items-center gap-2 rounded-md border bg-[#ff0055]/5 px-3 py-1.5"
            style={{ borderColor: `${MAGENTA}99`, boxShadow: `0 0 10px ${MAGENTA}33` }}
          >
            <span className="text-xs font-bold" style={{ color: MAGENTA }}>
              OBS
            </span>
            <span className="text-base font-bold tabular-nums text-pink-100">{fmt(obsidian)}</span>
          </div>
        </div>
      </header>

      {/* BAHÍA + CONSOLA */}
      <main className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Bahía de la nave equipada */}
        <section
          className="bg-linear-to-br from-cyan-400/60 via-cyan-400/10 to-fuchsia-500/50 p-px"
          style={{ clipPath: CUT_CLIP }}
        >
          <div
            className="flex h-full flex-col gap-4 bg-[#06070f]/95 p-5"
            style={{ clipPath: CUT_CLIP }}
          >
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest">
              <span className="text-cyan-300/80">Bahía de hangar</span>
              <span className="flex items-center gap-1.5 text-[#4ade80]">
                <span className="h-2 w-2 rounded-full bg-[#4ade80]" /> Equipada
              </span>
            </div>

            <div className="relative flex h-[260px] items-end justify-center overflow-hidden rounded-md border border-cyan-400/20 bg-[radial-gradient(ellipse_at_bottom,rgba(34,211,238,0.14),transparent_70%)] sm:h-[300px]">
              <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(34,211,238,0.25)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.25)_1px,transparent_1px)] [background-size:24px_24px]" />
              <div className="absolute bottom-4 h-3 w-2/3 rounded-full bg-cyan-400/25 shadow-[0_0_20px_rgba(34,211,238,0.45)]" />
              <img
                src={shipImage}
                alt={selectedShip.name}
                draggable={false}
                className="relative z-10 mb-7 h-[72%] w-auto max-w-[80%] object-contain drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]"
                style={{ imageRendering: "pixelated" }}
              />
            </div>

            <div>
              <div className="font-arcade text-base leading-relaxed text-cyan-300 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)] sm:text-lg">
                {selectedShip.name}
              </div>
              <div className="text-base text-white/70">{selectedShip.role}</div>
            </div>

            <div className="space-y-3">
              <StatBar label="Ataque" value={stats.attack} color={ORANGE} Icon={Flame} />
              <StatBar label="Blindaje" value={stats.defense} color={CYAN} Icon={Shield} />
              <StatBar label="Velocidad" value={stats.speed} color={VIOLET} Icon={Zap} />
            </div>

            <div className="mt-auto space-y-2 rounded-md border border-fuchsia-500/40 bg-fuchsia-500/5 p-4">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-fuchsia-200">
                <span>Sector de despliegue</span>
                <span className="flex gap-1">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span
                      key={i}
                      className="h-2 w-2"
                      style={{ background: i < pips ? MAGENTA : "rgba(255,255,255,0.15)" }}
                    />
                  ))}
                </span>
              </div>
              <div className="font-arcade text-sm leading-relaxed text-white sm:text-base">
                {selectedStage.name}
              </div>
              <div className="text-sm text-white/70">{selectedStage.subtitle}</div>
              <div
                className="flex items-center gap-2 text-sm font-semibold"
                style={{ color: hasHazard ? "#fbbf24" : GREEN }}
              >
                {hasHazard ? (
                  <TriangleAlert className="h-4 w-4 shrink-0" />
                ) : (
                  <Shield className="h-4 w-4 shrink-0" />
                )}
                <span>{selectedStage.hazardName}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Consola de acciones */}
        <section className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onDeploy}
            className="ph-pulse group relative flex min-h-24 w-full items-center justify-center gap-4 overflow-hidden rounded-lg border-2 border-cyan-300 bg-linear-to-r from-cyan-500/30 via-fuchsia-600/30 to-cyan-500/30 px-4 py-5 transition hover:brightness-125 active:scale-[0.99]"
          >
            <span className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-white/15 opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
            <Rocket className="h-8 w-8 shrink-0 text-cyan-200 drop-shadow-[0_0_6px_rgba(34,211,238,0.9)]" />
            <span className="font-arcade text-sm leading-relaxed text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)] sm:text-base">
              DESPLEGAR AL COMBATE
            </span>
          </button>

          <div className="grid flex-1 grid-cols-2 gap-3">
            <ActionTile
              label="Hangar & mejoras"
              sub="Arsenal y módulos"
              Icon={Wrench}
              color={CYAN}
              onClick={onOpenHangar}
            />
            <ActionTile
              label="Misiones & pase"
              sub="Objetivos diarios"
              Icon={Trophy}
              color={GOLD}
              onClick={onOpenMissions}
            />
            <ActionTile
              label="Centro multijugador"
              sub="Guerras y alianza"
              Icon={Users}
              color={VIOLET}
              onClick={onOpenAlliance}
            />
            <ActionTile
              label="Mercado P2P"
              sub="Intercambio OBS"
              Icon={ShoppingCart}
              color={PINK}
              onClick={onOpenMarket}
            />
          </div>
        </section>
      </main>

      {/* TELEMETRÍA */}
      <footer className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex items-center justify-between rounded-lg border border-cyan-400/30 bg-black/60 px-5 py-3">
          <span className="text-sm font-bold uppercase tracking-wide text-white/70">
            Misiones completadas
          </span>
          <span className="font-arcade text-xl tabular-nums text-cyan-300">{fmt(runs)}</span>
        </div>
        <div
          className="flex items-center justify-between rounded-lg border bg-black/60 px-5 py-3"
          style={{ borderColor: `${ORANGE}55` }}
        >
          <span className="text-sm font-bold uppercase tracking-wide text-white/70">
            Bajas enemigas
          </span>
          <span className="font-arcade text-xl tabular-nums" style={{ color: ORANGE }}>
            {fmt(kills)}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-violet-400/40 bg-black/60 px-5 py-3">
          <span className="text-sm font-bold uppercase tracking-wide text-white/70">
            Naves en flota
          </span>
          <span className="font-arcade text-xl tabular-nums text-violet-300">
            {fmt(shipsCount)}
          </span>
        </div>
      </footer>
    </div>
  );
}

export default PilotHub;
