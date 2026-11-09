import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ChevronRight,
  Flame,
  Rocket,
  ShoppingCart,
  Shield,
  Trophy,
  TriangleAlert,
  Users,
  Wrench,
  Zap,
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
const CYAN = "#00f0ff";
const GOLD = "#ffd700";
const MAGENTA = "#ff0055";
const VIOLET = "#c4a1ff";
const ORANGE = "#ff8a3d";
const GREEN = "#4ade80";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const fmt = (n: number) => n.toLocaleString("es-CO");

/** Normaliza las estadísticas reales de la nave (src/game/data/ships.ts) a 0..1. */
function computeShipBars(ship: ShipDef) {
  const attack = clamp01((ship.dmg / ship.cd - 0.9) / 0.35);
  const defense = clamp01(
    0.25 + ((ship.hp - 80) / 70) * 0.5 + (ship.armor / 2) * 0.15 + (ship.shield / 30) * 0.1,
  );
  const speed = clamp01(0.2 + ((ship.speed - 200) / 75) * 0.8);
  return { attack, defense, speed };
}

/** Mismas filas que el panel de estadísticas de combate, con los valores base de la nave. */
function shipCombatRows(ship: ShipDef): { label: string; value: string }[] {
  return [
    { label: "Daño", value: `x${ship.dmg.toFixed(2)}` },
    { label: "Vel. ataque", value: `x${(1 / ship.cd).toFixed(2)}` },
    { label: "Velocidad", value: `${Math.round(ship.speed)}` },
    { label: "Vida máx.", value: `${Math.round(ship.hp)}` },
    { label: "Armadura", value: `${Math.round(ship.armor)}` },
    { label: "Regeneración", value: `+${ship.regen.toFixed(1)}/s` },
    { label: "Crítico", value: `${Math.round(ship.crit * 100)}%` },
    { label: "Recogida", value: `${Math.round(ship.pickup)} px` },
  ];
}

interface BarProps {
  label: string;
  value: number;
  color: string;
  Icon: LucideIcon;
}

function Bar({ label, value, color, Icon }: BarProps) {
  const filled = Math.round(value * SEGMENTS);
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex w-24 shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
        style={{ color }}
      >
        <Icon className="size-3" />
        {label}
      </div>
      <div className="flex flex-1 gap-0.5">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className="h-1.5 flex-1"
            style={
              i < filled
                ? { background: color, boxShadow: `0 0 4px ${color}99` }
                : { background: "rgba(255,255,255,0.08)" }
            }
          />
        ))}
      </div>
    </div>
  );
}

interface MenuRowProps {
  label: string;
  Icon: LucideIcon;
  color: string;
  onClick: () => void;
}

function MenuRow({ label, Icon, color, onClick }: MenuRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-8 w-full items-center gap-2.5 border border-cyan-500/20 bg-[#0b0d1c]/80 px-2.5 text-left transition hover:border-cyan-300/60 hover:bg-cyan-400/5"
    >
      <Icon className="size-3.5 shrink-0" style={{ color }} />
      <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-white group-hover:text-cyan-100">
        {label}
      </span>
      <ChevronRight className="size-3 shrink-0 text-white/35 group-hover:text-cyan-200" />
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
  const bars = computeShipBars(selectedShip);
  const combatRows = shipCombatRows(selectedShip);
  const pips = Math.min(5, Math.max(1, Math.round(selectedStage.difficulty * 2)));
  const hasHazard = selectedStage.hazard !== "none";
  const shortId =
    pilotId.length > 8 ? `${pilotId.slice(0, 8).toUpperCase()}…` : pilotId.toUpperCase();

  return (
    <div className="mx-auto w-full max-w-5xl space-y-3 text-white">
      <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
        {/* Bahía de la nave equipada */}
        <section className="border border-cyan-500/20 bg-[#0b0d1c]/80 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-500/15 pb-2">
            <p className="text-[10px] uppercase tracking-[0.26em] text-cyan-300">
              Bahía de hangar · equipada
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-white">
                {allianceTag ? <span className="text-fuchsia-300">[{allianceTag}] </span> : null}
                {pilotName}
              </span>
              <span className="hidden text-[10px] uppercase tracking-wider text-white/40 sm:inline">
                ID {shortId}
              </span>
              <button
                type="button"
                onClick={onOpenVip}
                disabled={!onOpenVip}
                className="h-6 border px-2 text-[10px] font-bold uppercase tracking-wider transition enabled:hover:brightness-125 disabled:cursor-default"
                style={
                  vipActive
                    ? { color: GOLD, borderColor: `${GOLD}99`, background: "rgba(255,215,0,0.08)" }
                    : { color: "rgba(0,240,255,0.6)", borderColor: "rgba(0,240,255,0.25)" }
                }
              >
                {vipActive ? "★ VIP" : "Estándar"}
              </button>
              <button
                type="button"
                onClick={onOpenProfile}
                className="h-6 border border-amber-400/50 bg-amber-400/10 px-2 text-[10px] font-bold uppercase tracking-wider text-amber-300 hover:bg-amber-400/20"
              >
                Perfil
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_200px]">
            <div className="relative flex h-[200px] items-end justify-center overflow-hidden border border-cyan-500/15 bg-[radial-gradient(ellipse_at_bottom,rgba(0,240,255,0.12),transparent_70%)] lg:h-[240px]">
              <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(0,240,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.3)_1px,transparent_1px)] [background-size:22px_22px]" />
              <div className="absolute bottom-3 h-1.5 w-2/3 bg-cyan-400/25 shadow-[0_0_12px_rgba(0,240,255,0.4)]" />
              <img
                src={shipImage}
                alt={selectedShip.name}
                draggable={false}
                className="relative z-10 mb-5 h-[70%] w-auto max-w-[80%] object-contain drop-shadow-[0_0_8px_rgba(0,240,255,0.5)]"
                style={{ imageRendering: "pixelated" }}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div>
                <h2 className="font-arcade text-[10px] uppercase leading-relaxed text-cyan-200">
                  {selectedShip.name}
                </h2>
                <p className="text-[11px] text-white/60">{selectedShip.role}</p>
              </div>
              <div className="space-y-1.5">
                <Bar label="Ataque" value={bars.attack} color={ORANGE} Icon={Flame} />
                <Bar label="Blindaje" value={bars.defense} color={CYAN} Icon={Shield} />
                <Bar label="Velocidad" value={bars.speed} color={VIOLET} Icon={Zap} />
              </div>
              <div className="mt-auto space-y-1 border border-fuchsia-500/30 bg-fuchsia-500/5 p-2">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-fuchsia-200">
                  <span>Sector</span>
                  <span className="flex gap-0.5">
                    {Array.from({ length: 5 }, (_, i) => (
                      <span
                        key={i}
                        className="size-1.5"
                        style={{ background: i < pips ? MAGENTA : "rgba(255,255,255,0.15)" }}
                      />
                    ))}
                  </span>
                </div>
                <p className="font-arcade text-[9px] leading-relaxed text-white">
                  {selectedStage.name}
                </p>
                <p
                  className="flex items-center gap-1 text-[10px] font-semibold"
                  style={{ color: hasHazard ? "#fbbf24" : GREEN }}
                >
                  {hasHazard ? (
                    <TriangleAlert className="size-3 shrink-0" />
                  ) : (
                    <Shield className="size-3 shrink-0" />
                  )}
                  {selectedStage.hazardName}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Accesos y estadísticas de combate */}
        <aside className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onDeploy}
            className="font-arcade h-9 w-full rounded-none border border-cyan-200 bg-[#00f0ff] text-[9px] uppercase tracking-[0.06em] text-[#070814] shadow-[0_0_20px_#00f0ff40] transition hover:bg-cyan-200"
          >
            <span className="inline-flex items-center gap-2">
              <Rocket className="size-3.5" /> PLAY
            </span>
          </button>

          <MenuRow label="Hangar & mejoras" Icon={Wrench} color={CYAN} onClick={onOpenHangar} />
          <MenuRow label="Misiones & pase" Icon={Trophy} color={GOLD} onClick={onOpenMissions} />
          <MenuRow
            label="Centro multijugador"
            Icon={Users}
            color={VIOLET}
            onClick={onOpenAlliance}
          />
          <MenuRow label="Mercado P2P" Icon={ShoppingCart} color={MAGENTA} onClick={onOpenMarket} />

          <div className="mt-1 border border-cyan-500/20 bg-[#0b0d1c]/80 p-2.5">
            <p className="mb-1.5 text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">
              Combate · base
            </p>
            <dl className="space-y-0.5">
              {combatRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <dt className="text-[10px] uppercase tracking-wide text-white/65">{row.label}</dt>
                  <dd className="text-[11px] tabular-nums text-white">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>

      {/* Telemetría */}
      <footer className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          { label: "Misiones", value: fmt(runs), color: CYAN },
          { label: "Bajas enemigas", value: fmt(kills), color: ORANGE },
          { label: "Naves en flota", value: fmt(shipsCount), color: VIOLET },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between border border-cyan-500/20 bg-[#0b0d1c]/80 px-3 py-1.5"
          >
            <span className="text-[10px] uppercase tracking-wider text-white/55">{item.label}</span>
            <span className="font-arcade text-[10px] tabular-nums" style={{ color: item.color }}>
              {item.value}
            </span>
          </div>
        ))}
      </footer>
    </div>
  );
}

export default PilotHub;
