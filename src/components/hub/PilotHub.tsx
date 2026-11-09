import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Award,
  ChevronRight,
  Flame,
  Rocket,
  ShoppingCart,
  Shield,
  Sparkles,
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
    { label: "DAÑO", value: `x${ship.dmg.toFixed(2)}` },
    { label: "VEL. ATAQUE", value: `x${(1 / ship.cd).toFixed(2)}` },
    { label: "VELOCIDAD", value: `${Math.round(ship.speed)}` },
    { label: "VIDA MÁX.", value: `${Math.round(ship.hp)}` },
    { label: "ARMADURA", value: `${Math.round(ship.armor)}` },
    { label: "REGENERACIÓN", value: `+${ship.regen.toFixed(1)}/s` },
    { label: "CRÍTICO", value: `${Math.round(ship.crit * 100)}%` },
    { label: "RECOGIDA", value: `${Math.round(ship.pickup)} px` },
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
    <div className="flex items-center gap-3">
      <div
        className="flex w-36 shrink-0 items-center gap-2 text-sm font-bold uppercase tracking-wide"
        style={{ color }}
      >
        <Icon className="size-4" />
        {label}
      </div>
      <div className="flex flex-1 gap-1">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className="h-3 flex-1"
            style={
              i < filled
                ? { background: color, boxShadow: `0 0 8px ${color}99` }
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
  sub: string;
  Icon: LucideIcon;
  color: string;
  onClick: () => void;
}

function MenuRow({ label, sub, Icon, color, onClick }: MenuRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-14 w-full items-center gap-4 border border-cyan-500/25 bg-[#0a0c1a]/85 px-4 text-left transition hover:border-cyan-300/70 hover:bg-cyan-400/5"
    >
      <Icon className="size-5 shrink-0" style={{ color }} />
      <span className="font-arcade flex-1 text-[10px] uppercase tracking-[0.06em] text-white group-hover:text-cyan-100">
        {label}
      </span>
      <span className="hidden text-xs uppercase tracking-wider text-white/50 sm:inline">{sub}</span>
      <ChevronRight className="size-4 shrink-0 text-white/40 group-hover:text-cyan-200" />
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
    <div className="mx-auto w-full max-w-[1440px] space-y-5 text-white">
      <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        {/* COLUMNA IZQUIERDA: nave equipada */}
        <section className="flex flex-col gap-5 border border-cyan-500/25 bg-[#0a0c1a]/85 p-5 shadow-[0_0_60px_#00f0ff0d]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div className="flex min-w-0 items-center gap-3">
              <Award className="size-5 shrink-0 text-cyan-300" />
              <div className="min-w-0">
                <p className="truncate text-base font-bold">
                  {allianceTag ? <span className="text-fuchsia-300">[{allianceTag}] </span> : null}
                  {pilotName}
                </p>
                <p className="text-xs uppercase tracking-wider text-white/50">ID {shortId}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenVip}
                disabled={!onOpenVip}
                className="border px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition enabled:hover:brightness-125 disabled:cursor-default"
                style={
                  vipActive
                    ? { color: GOLD, borderColor: `${GOLD}aa`, background: "rgba(255,215,0,0.08)" }
                    : { color: "rgba(0,240,255,0.6)", borderColor: "rgba(0,240,255,0.3)" }
                }
              >
                {vipActive ? "★ VIP Pilot" : "Estándar"}
              </button>
              <button
                type="button"
                onClick={onOpenProfile}
                className="border border-amber-400/50 bg-amber-400/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-300 hover:bg-amber-400/20"
              >
                Perfil
              </button>
            </div>
          </div>

          <div className="relative flex h-[300px] items-end justify-center overflow-hidden border border-cyan-500/20 bg-[radial-gradient(ellipse_at_bottom,rgba(0,240,255,0.14),transparent_70%)] lg:h-[360px]">
            <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(0,240,255,0.3)_1px,transparent_1px),linear-gradient(90deg,rgba(0,240,255,0.3)_1px,transparent_1px)] [background-size:28px_28px]" />
            <div className="absolute bottom-5 h-3 w-2/3 rounded-full bg-cyan-400/25 shadow-[0_0_20px_rgba(0,240,255,0.45)]" />
            <img
              src={shipImage}
              alt={selectedShip.name}
              draggable={false}
              className="relative z-10 mb-8 h-[72%] w-auto max-w-[80%] object-contain drop-shadow-[0_0_12px_rgba(0,240,255,0.5)]"
              style={{ imageRendering: "pixelated" }}
            />
          </div>

          <div>
            <h2 className="font-arcade text-base uppercase leading-relaxed text-cyan-200 drop-shadow-[0_0_8px_rgba(0,240,255,0.7)] sm:text-lg">
              {selectedShip.name}
            </h2>
            <p className="text-base text-white/70">{selectedShip.role}</p>
          </div>

          <div className="space-y-3">
            <Bar label="Ataque" value={bars.attack} color={ORANGE} Icon={Flame} />
            <Bar label="Blindaje" value={bars.defense} color={CYAN} Icon={Shield} />
            <Bar label="Velocidad" value={bars.speed} color={VIOLET} Icon={Zap} />
          </div>

          <div className="space-y-2 border border-fuchsia-500/35 bg-fuchsia-500/5 p-4">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-widest text-fuchsia-200">
              <span>Sector de despliegue</span>
              <span className="flex gap-1">
                {Array.from({ length: 5 }, (_, i) => (
                  <span
                    key={i}
                    className="size-2"
                    style={{ background: i < pips ? MAGENTA : "rgba(255,255,255,0.15)" }}
                  />
                ))}
              </span>
            </div>
            <p className="font-arcade text-sm leading-relaxed text-white sm:text-base">
              {selectedStage.name}
            </p>
            <p className="text-sm text-white/70">{selectedStage.subtitle}</p>
            <p
              className="flex items-center gap-2 text-sm font-semibold"
              style={{ color: hasHazard ? "#fbbf24" : GREEN }}
            >
              {hasHazard ? (
                <TriangleAlert className="size-4 shrink-0" />
              ) : (
                <Shield className="size-4 shrink-0" />
              )}
              {selectedStage.hazardName}
            </p>
          </div>
        </section>

        {/* COLUMNA DERECHA: PLAY, accesos compactos y estadísticas de combate */}
        <section className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onDeploy}
            className="flex h-20 w-full items-center justify-center gap-3 rounded-none border border-cyan-200 bg-[#00f0ff] font-arcade text-base uppercase tracking-[0.08em] text-[#070814] shadow-[0_0_34px_#00f0ff55] transition hover:bg-cyan-200"
          >
            <Rocket className="size-6" />
            PLAY
          </button>

          <MenuRow
            label="Hangar & mejoras"
            sub="Arsenal y módulos"
            Icon={Wrench}
            color={CYAN}
            onClick={onOpenHangar}
          />
          <MenuRow
            label="Misiones & pase"
            sub="Objetivos diarios"
            Icon={Trophy}
            color={GOLD}
            onClick={onOpenMissions}
          />
          <MenuRow
            label="Centro multijugador"
            sub="Guerras y alianza"
            Icon={Users}
            color={VIOLET}
            onClick={onOpenAlliance}
          />
          <MenuRow
            label="Mercado P2P"
            sub="Intercambio OBS"
            Icon={ShoppingCart}
            color={MAGENTA}
            onClick={onOpenMarket}
          />

          <div className="mt-2 border border-white/15 bg-[#070814]/85 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-cyan-200/80">
              Estadísticas de combate · base
            </p>
            <dl className="space-y-1.5">
              {combatRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-4 px-1 py-0.5"
                >
                  <dt className="text-sm uppercase tracking-wide text-white/80">{row.label}</dt>
                  <dd className="text-base tabular-nums text-white">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </div>

      {/* TELEMETRÍA */}
      <footer className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Misiones completadas", value: fmt(runs), color: CYAN },
          { label: "Bajas enemigas", value: fmt(kills), color: ORANGE },
          { label: "Naves en flota", value: fmt(shipsCount), color: VIOLET },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between border border-cyan-500/25 bg-[#0a0c1a]/85 px-5 py-3"
          >
            <span className="text-sm uppercase tracking-wide text-white/70">{item.label}</span>
            <span className="font-arcade text-base tabular-nums" style={{ color: item.color }}>
              {item.value}
            </span>
          </div>
        ))}
      </footer>
    </div>
  );
}

export default PilotHub;
