import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ChevronRight,
  Coins,
  Crown,
  Flame,
  Gem,
  Hexagon,
  Medal,
  MessageSquare,
  Radar,
  Rocket,
  Satellite,
  Shield,
  ShoppingCart,
  Star,
  Target,
  Trophy,
  TriangleAlert,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { spriteUrl } from "@/game/sprites";
import type { ShipDef } from "@/game/data/ships";
import type { StageDef } from "@/game/data/stages";
import { SEASON_LEVELS, getSeasonBarInfo } from "@/game/meta/missions";
import type { SeasonProgress } from "@/game/meta/progress";

export interface PilotHubProps {
  pilotName: string;
  pilotId: string;
  vipActive: boolean;
  credits: number;
  obsidian: number;
  runs: number;
  kills: number;
  season: SeasonProgress;
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
const AMBER = "#fbbf24";
const MAGENTA = "#ff0055";
const VIOLET = "#c4a1ff";
const ORANGE = "#ff8a3d";
const GREEN = "#4ade80";

/** Rango táctico derivado de las misiones completadas (de mayor a menor). */
const RANKS: { min: number; name: string }[] = [
  { min: 300, name: "AS DEL VACÍO" },
  { min: 150, name: "COMANDANTE" },
  { min: 75, name: "CAPITÁN" },
  { min: 30, name: "TENIENTE" },
  { min: 10, name: "CADETE" },
  { min: 0, name: "RECLUTA" },
];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const fmt = (n: number) => n.toLocaleString("es-CO");
const pad2 = (n: number) => String(n).padStart(2, "0");
const rankFor = (runs: number) => RANKS.find((r) => runs >= r.min)?.name ?? "RECLUTA";

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
    { label: "Cadencia", value: `x${(1 / ship.cd).toFixed(2)}` },
    { label: "Velocidad", value: `${Math.round(ship.speed)}` },
    { label: "Vida", value: `${Math.round(ship.hp)}` },
    { label: "Armadura", value: `${Math.round(ship.armor)}` },
    { label: "Regeneración", value: `+${ship.regen.toFixed(1)}/s` },
    { label: "Crítico", value: `${Math.round(ship.crit * 100)}%` },
    { label: "Rango de recogida", value: `${Math.round(ship.pickup)} px` },
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
    <div className="grid grid-cols-[104px_1fr_36px] items-center gap-2">
      <div
        className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider"
        style={{ color }}
      >
        <Icon className="size-3.5 shrink-0" />
        {label}
      </div>
      <div className="flex gap-[3px]">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className="h-2 flex-1"
            style={
              i < filled
                ? { background: color, boxShadow: `0 0 3px ${color}55` }
                : { background: "rgba(255,255,255,0.08)" }
            }
          />
        ))}
      </div>
      <span className="text-right text-[10px] tabular-nums text-white/70">
        {filled}/{SEGMENTS}
      </span>
    </div>
  );
}

interface ReadoutProps {
  label: string;
  value: string;
  color: string;
  Icon: LucideIcon;
}

function Readout({ label, value, color, Icon }: ReadoutProps) {
  return (
    <div className="flex flex-col items-end gap-1 leading-none">
      <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.2em] text-white/55">
        <Icon className="size-3" style={{ color }} />
        {label}
      </span>
      <span
        className="font-arcade text-[12px] tabular-nums"
        style={{ color, textShadow: `0 0 4px ${color}66` }}
      >
        {value}
      </span>
    </div>
  );
}

interface NavButtonProps {
  title: string;
  subtitle: string;
  Icon: LucideIcon;
  accent: string;
  onClick: () => void;
}

function NavButton({ title, subtitle, Icon, accent, onClick }: NavButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[62px] flex-col justify-between overflow-hidden border p-3 text-left transition hover:brightness-125 active:translate-y-px"
      style={{
        borderColor: `${accent}55`,
        background: `linear-gradient(160deg, ${accent}1f 0%, #0b0d1c 70%)`,
        boxShadow: `inset 0 1px 0 ${accent}55, inset 0 -2px 0 rgba(0,0,0,0.5)`,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <Icon className="size-4 shrink-0" style={{ color: accent }} />
        <ChevronRight className="size-3.5 shrink-0 text-white/30 transition group-hover:text-white/70" />
      </div>
      <div className="mt-2">
        <p className="font-arcade text-[9px] uppercase leading-relaxed text-white">[ {title} ]</p>
        <p
          className="mt-1 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: accent }}
        >
          {subtitle}
        </p>
      </div>
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
  season,
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
  const rank = rankFor(runs);
  const plateId = `PLT-${pilotId
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 8)
    .toUpperCase()}`;
  const seasonBar = getSeasonBarInfo(season.pt);
  const seasonNumber = Number(season.seasonId.slice(1)) || 1;
  const nextSeasonNode = SEASON_LEVELS[seasonBar.level] ?? null;
  const seasonPct = seasonBar.fraction * 100;
  const seasonProgressText = seasonBar.nextPt === null
    ? `${fmt(season.pt)} PT · TEMPORADA COMPLETADA`
    : `${fmt(season.pt - seasonBar.floorPt)}/${fmt(seasonBar.nextPt - seasonBar.floorPt)} PT`;
  const nextRewardText = nextSeasonNode?.freeReward.label ?? "Temporada completada";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 p-2 text-white font-sans sm:p-4">
      {/* 1. CABECERA MILITAR Y CREDENCIAL */}
      <header className="flex flex-col gap-3 border border-cyan-500/30 bg-[#0b0d1c]/90 p-3 backdrop-blur-md lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex size-9 shrink-0 items-center justify-center">
            <Hexagon
              className="absolute inset-0 size-full"
              style={{ color: CYAN, filter: `drop-shadow(0 0 2px ${CYAN}55)` }}
              strokeWidth={1.5}
            />
            <span className="font-arcade text-[11px] text-cyan-100">
              {pilotName.charAt(0).toUpperCase() || "?"}
            </span>
          </div>
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-bold uppercase tracking-wider">
              {allianceTag ? <span className="text-fuchsia-300">[{allianceTag}] </span> : null}
              {pilotName}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.15em] text-white/55">
              <span className="tabular-nums">ID {plateId}</span>
              <span className="text-amber-300">RANGO: {rank}</span>
              <span className="flex items-center gap-1 text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#4ade80]" />
                EN LÍNEA
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 lg:gap-5">
          <Readout label="CR" value={fmt(credits)} color={CYAN} Icon={Hexagon} />
          <Readout label="OBS" value={fmt(obsidian)} color={MAGENTA} Icon={Star} />
          <button
            type="button"
            onClick={() => onOpenVip?.()}
            disabled={!onOpenVip}
            className="h-7 border px-3 text-[10px] font-bold uppercase tracking-wider transition enabled:hover:brightness-125 disabled:cursor-default"
            style={
              vipActive
                ? {
                    color: GOLD,
                    borderColor: `${GOLD}aa`,
                    background: `linear-gradient(180deg, ${GOLD}22, ${GOLD}08)`,
                    boxShadow: `0 0 6px ${GOLD}33, inset 0 0 8px ${GOLD}15`,
                  }
                : {
                    color: "rgba(0,240,255,0.6)",
                    borderColor: "rgba(0,240,255,0.25)",
                    background: "rgba(255,255,255,0.03)",
                  }
            }
          >
            [{vipActive ? "★ PILOTO VIP" : "MEMBRESÍA ESTÁNDAR"}]
          </button>
          <button
            type="button"
            onClick={onOpenProfile}
            className="h-7 px-3 text-[10px] font-bold uppercase tracking-wider text-amber-200 transition hover:brightness-125"
            style={{
              border: `1px solid ${AMBER}`,
              background: "linear-gradient(180deg, rgba(251,191,36,0.25), rgba(120,53,15,0.35))",
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -2px 0 rgba(0,0,0,0.45), 0 0 4px ${AMBER}33`,
            }}
          >
            [ PERFIL ]
          </button>
        </div>
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* 2. BAHÍA DE ATRAQUE Y TELEMETRÍA */}
        <div className="flex flex-col gap-3">
          <section className="flex flex-col border border-cyan-500/30 bg-[#0b0d1c]/90 backdrop-blur-md">
            <div className="flex items-center justify-between gap-2 border-b border-cyan-500/20 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em]">
              <span className="text-cyan-300">[BAY-01 // REJILLA MAGNÉTICA ACTIVA]</span>
              <span className="text-emerald-300">[SISTEMAS: 100%]</span>
            </div>

            <div
              className="relative h-[200px] overflow-hidden sm:h-[220px]"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 85%, rgba(0,240,255,0.12) 0%, rgba(124,58,237,0.08) 45%, transparent 75%)",
              }}
            >
              {/* Cuadrícula técnica de fondo */}
              <div
                className="absolute inset-0 opacity-25"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(0,240,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(0,240,255,0.35) 1px, transparent 1px)",
                  backgroundSize: "28px 28px",
                }}
              />

              {/* Plataforma de atraque */}
              <div
                className="absolute bottom-7 left-1/2 h-4 w-[70%] -translate-x-1/2"
                style={{
                  background: "linear-gradient(180deg, #2a3142 0%, #141826 100%)",
                  border: `1px solid ${CYAN}66`,
                  boxShadow: `0 0 8px ${CYAN}33, inset 0 1px 0 rgba(255,255,255,0.15)`,
                }}
              />

              {/* Clamps hidráulicos de precaución */}
              {(["left", "right"] as const).map((side) => (
                <div
                  key={side}
                  className="absolute bottom-7 h-16 w-5"
                  style={{
                    [side]: "15%",
                    background: "repeating-linear-gradient(45deg, #fde047 0 6px, #111827 6px 12px)",
                    border: "1px solid rgba(253,224,71,0.6)",
                    boxShadow: "0 0 4px rgba(253,224,71,0.15)",
                  }}
                />
              ))}

              {/* Nave activa */}
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-[30px]">
                <img
                  src={shipImage}
                  alt={selectedShip.name}
                  draggable={false}
                  className="relative z-10 h-[118px] w-auto max-w-[70%] object-contain drop-shadow-[0_0_4px_rgba(0,240,255,0.3)] sm:h-[136px]"
                  style={{ imageRendering: "pixelated" }}
                />
              </div>
            </div>

            <div className="space-y-3 border-t border-cyan-500/20 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-arcade text-[10px] uppercase leading-relaxed text-cyan-100 [text-shadow:0_0_4px_rgba(0,240,255,0.35)]">
                  {selectedShip.name}
                </h2>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
                  {selectedShip.role}
                </p>
              </div>

              <div className="space-y-2">
                <Bar label="Ataque" value={bars.attack} color={ORANGE} Icon={Flame} />
                <Bar label="Blindaje" value={bars.defense} color={CYAN} Icon={Shield} />
                <Bar label="Velocidad" value={bars.speed} color={VIOLET} Icon={Zap} />
              </div>

              <dl className="grid grid-cols-2 gap-x-5 border-t border-white/10 pt-3">
                {combatRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-2 border-b border-white/5 py-1"
                  >
                    <dt className="text-[10px] uppercase tracking-wide text-white/55">
                      {row.label}
                    </dt>
                    <dd className="text-[11px] tabular-nums text-white">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        </div>

        {/* 3. CONSOLA DE ACCIONES Y RADAR */}
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onDeploy}
            className="flex h-[40px] w-full items-center justify-center gap-2 border border-cyan-100/70 bg-[#00c2d1] font-arcade text-[9px] uppercase tracking-[0.12em] text-[#05060f] transition hover:brightness-105 active:translate-y-px"
            style={{
              boxShadow:
                "inset 0 -3px 0 rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.4), 0 0 10px rgba(0,240,255,0.2)",
            }}
          >
            <Rocket className="size-4" />
            DESPLEGAR AL COMBATE
          </button>

          <section className="space-y-3 border border-fuchsia-500/35 bg-[#0b0d1c]/90 p-3 backdrop-blur-md">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-300">
              <Radar className="size-3.5" />
              Radar de inteligencia del sector
            </div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="font-arcade text-[10px] uppercase leading-relaxed text-white">
                  {selectedStage.name}
                </p>
                <p className="text-[11px] text-white/55">{selectedStage.subtitle}</p>
              </div>
              <div className="flex shrink-0 gap-0.5" aria-label={`Dificultad ${pips} de 5`}>
                {Array.from({ length: 5 }, (_, i) => (
                  <Star
                    key={i}
                    className="size-3"
                    strokeWidth={1.5}
                    style={{
                      color: MAGENTA,
                      fill: i < pips ? MAGENTA : "none",
                      filter: i < pips ? `drop-shadow(0 0 2px ${MAGENTA}99)` : "none",
                    }}
                  />
                ))}
              </div>
            </div>
            <p
              className="flex items-center gap-2 border-t border-white/10 pt-2 text-[11px] font-semibold"
              style={{ color: hasHazard ? AMBER : GREEN }}
            >
              {hasHazard ? (
                <TriangleAlert className="size-3.5 shrink-0" />
              ) : (
                <Shield className="size-3.5 shrink-0" />
              )}
              {selectedStage.hazardName}
            </p>
          </section>

          <div className="grid grid-cols-2 gap-2">
            <NavButton
              title="HANGAR"
              subtitle="Mejoras & Naves"
              Icon={Wrench}
              accent={CYAN}
              onClick={onOpenHangar}
            />
            <NavButton
              title="MISIONES"
              subtitle="Pase & Desafíos"
              Icon={Trophy}
              accent={GOLD}
              onClick={onOpenMissions}
            />
            <NavButton
              title="ALIANZA"
              subtitle="Guerras & Escuadrón"
              Icon={Users}
              accent={VIOLET}
              onClick={onOpenAlliance}
            />
            <NavButton
              title="MERCADO"
              subtitle="Comercio P2P"
              Icon={ShoppingCart}
              accent={MAGENTA}
              onClick={onOpenMarket}
            />
          </div>

          <SupportAccess />
          <RewardsFeed />
        </div>
      </div>

      {/* 4. TIRA DE TEMPORADA Y TELEMETRÍA GLOBAL */}
      <footer className="space-y-3 border border-cyan-500/20 bg-[#0b0d1c]/90 p-3 backdrop-blur-md">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
          <div className="flex shrink-0 items-center gap-2">
            <Medal className="size-4" style={{ color: GOLD }} />
            <span
              className="font-arcade text-[9px] uppercase tracking-wider"
              style={{ color: GOLD }}
            >
              TEMPORADA {seasonNumber} · NIVEL {pad2(seasonBar.level)}/{SEASON_LEVELS.length}
            </span>
          </div>
          <div className="relative h-3 flex-1 overflow-hidden border border-amber-400/40 bg-black/50">
            <div
              className="h-full"
              style={{
                width: `${seasonPct}%`,
                background: `linear-gradient(90deg, ${GOLD}55, ${GOLD})`,
                boxShadow: `0 0 4px ${GOLD}55`,
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(90deg, transparent 0 9px, rgba(0,0,0,0.55) 9px 10px)",
              }}
            />
          </div>
          <span className="shrink-0 whitespace-nowrap text-[10px] tabular-nums text-white/75">
            {seasonProgressText} ·{" "}
            <span className="text-amber-300">SIGUIENTE RECOMPENSA: {nextRewardText}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 border-t border-white/10 pt-3 sm:grid-cols-3">
          {[
            { label: "MISIONES JUGADAS", value: fmt(runs), color: CYAN, Icon: Rocket },
            { label: "BAJAS ENEMIGAS", value: fmt(kills), color: ORANGE, Icon: Target },
            { label: "FLOTA DISPONIBLE", value: fmt(shipsCount), color: VIOLET, Icon: Satellite },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between border px-3 py-2"
              style={{ borderColor: `${item.color}33`, background: `${item.color}0d` }}
            >
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-white/60">
                <item.Icon className="size-3.5" style={{ color: item.color }} />
                {item.label}
              </span>
              <span
                className="font-arcade text-[11px] tabular-nums"
                style={{ color: item.color, textShadow: `0 0 3px ${item.color}66` }}
              >
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}

type RewardEntry = {
  id: string;
  source: "ADMIN" | "BOSS";
  kind: string;
  label: string;
  detail: string;
  quantity: number;
  created_at: number;
};

const REWARD_STYLE: Record<string, { Icon: LucideIcon; color: string; tag: string }> = {
  ship: { Icon: Rocket, color: CYAN, tag: "NAVE" },
  item: { Icon: Gem, color: VIOLET, tag: "OBJETO" },
  CR: { Icon: Coins, color: CYAN, tag: "CR" },
  OBS: { Icon: Star, color: MAGENTA, tag: "OBS" },
  VIP: { Icon: Crown, color: GOLD, tag: "VIP" },
};

/** Premios recibidos de la administración y de jefes. Se actualiza en tiempo real por WebSocket. */
function RewardsFeed() {
  const [rewards, setRewards] = useState<RewardEntry[]>([]);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let active = true;
    let retryDelay = 2000;
    const link: { socket: WebSocket | null; timer: number | undefined } = {
      socket: null,
      timer: undefined,
    };

    const load = async () => {
      try {
        const response = await fetch("/api/pilot/rewards", { credentials: "same-origin" });
        if (!response.ok) throw new Error("rewards");
        const data = (await response.json()) as { rewards?: RewardEntry[] };
        if (!active) return;
        setRewards(data.rewards ?? []);
        setFailed(false);
      } catch {
        if (active) setFailed(true);
      } finally {
        if (active) setLoaded(true);
      }
    };

    // Conexión persistente: el servidor avisa cuando hay un premio nuevo.
    // Si la conexión se corta, reintenta con espera creciente.
    const connect = () => {
      if (!active) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/pilot/rewards/ws`);
      link.socket = socket;
      socket.onopen = () => {
        retryDelay = 2000;
        setConnected(true);
        void load();
      };
      socket.onmessage = () => void load();
      socket.onclose = () => {
        link.socket = null;
        setConnected(false);
        if (!active) return;
        link.timer = window.setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      };
    };

    void load();
    connect();
    return () => {
      active = false;
      window.clearTimeout(link.timer);
      link.socket?.close();
    };
  }, []);

  return (
    <section className="flex flex-col border border-amber-400/30 bg-[#0b0d1c]/90 backdrop-blur-md">
      <div className="flex items-center justify-between gap-2 border-b border-amber-400/20 px-3 py-2">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-amber-200">
          <Trophy className="size-3.5" />
          Premios recibidos
        </span>
        <span
          className={`flex items-center gap-1 text-[10px] uppercase tracking-wider ${
            connected ? "text-emerald-300" : "text-white/45"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-white/30"}`}
          />
          {connected ? "En vivo" : "Reconectando..."}
        </span>
      </div>
      <div className="max-h-[260px] overflow-y-auto">
        {!loaded ? (
          <p className="px-3 py-3 text-xs text-white/50">Cargando premios...</p>
        ) : failed ? (
          <p className="px-3 py-3 text-xs text-rose-300">No se pudieron cargar los premios.</p>
        ) : rewards.length === 0 ? (
          <p className="px-3 py-3 text-xs text-white/50">
            Aún no has recibido premios. Derrota jefes o espera anuncios de la administración.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {rewards.map((reward) => {
              const style = REWARD_STYLE[reward.kind] ?? {
                Icon: Gem,
                color: VIOLET,
                tag: reward.kind,
              };
              const amount =
                reward.kind === "CR" || reward.kind === "OBS"
                  ? `+${fmt(reward.quantity)}`
                  : reward.quantity > 1
                    ? `×${fmt(reward.quantity)}`
                    : "";
              return (
                <li key={reward.id} className="flex items-center gap-3 px-3 py-2.5">
                  <style.Icon className="size-4 shrink-0" style={{ color: style.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                      <span
                        className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: style.color, border: `1px solid ${style.color}66` }}
                      >
                        {style.tag}
                      </span>
                      <span className="truncate">{reward.label}</span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-white/55">
                      {reward.source === "BOSS" ? "" : "Administración · "}
                      {reward.detail}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {amount ? (
                      <p className="text-sm font-bold tabular-nums" style={{ color: style.color }}>
                        {amount}
                      </p>
                    ) : null}
                    <p className="text-[11px] tabular-nums text-white/45">
                      {new Date(reward.created_at).toLocaleString("es-CO", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function SupportAccess() {
  type Ticket = {
    id: string;
    subject: string;
    category: string;
    status: string;
    updated_at: number;
  };
  type SupportMessage = {
    id: string;
    ticket_id: string;
    sender_role: string;
    message: string;
    created_at: number;
  };
  const [open, setOpen] = useState(false),
    [tickets, setTickets] = useState<Ticket[]>([]),
    [messages, setMessages] = useState<SupportMessage[]>([]),
    [subject, setSubject] = useState(""),
    [category, setCategory] = useState("TECNICO"),
    [description, setDescription] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const load = async () => {
    try {
      const r = await fetch("/api/support/tickets", { credentials: "same-origin" });
      const d = (await r.json()) as {
        tickets?: Ticket[];
        messages?: SupportMessage[];
        error?: string;
      };
      if (!r.ok) throw new Error(d.error || "No se pudieron cargar tus solicitudes.");
      setTickets(d.tickets ?? []);
      setMessages(d.messages ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar tus solicitudes.");
    }
  };
  useEffect(() => {
    if (open) void load();
  }, [open]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/support/tickets", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject, category, description }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error || "No se pudo enviar la solicitud.");
      setSubject("");
      setDescription("");
      setNotice("Solicitud enviada. Podrás consultar aquí su estado y las respuestas.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo enviar la solicitud.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex h-9 w-full items-center gap-2.5 border border-cyan-500/25 bg-[#0b0d1c]/90 px-3 text-left transition hover:border-cyan-300/60 hover:bg-cyan-400/5"
      >
        <MessageSquare className="size-3.5 shrink-0 text-cyan-300" />
        <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-white">
          Soporte técnico
        </span>
        <ChevronRight className="size-3 text-white/35 group-hover:text-cyan-200" />
      </button>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3">
          <section className="max-h-[90vh] w-full max-w-xl space-y-4 overflow-y-auto border border-cyan-400/30 bg-[#080a18] p-4 text-white shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-arcade text-xs text-cyan-200">SOPORTE TÉCNICO</h2>
              <button onClick={() => setOpen(false)} className="text-white/60">
                Cerrar
              </button>
            </div>
            <form onSubmit={submit} className="space-y-2">
              <input
                required
                minLength={4}
                maxLength={100}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Asunto"
                className="w-full border border-white/15 bg-black/30 px-3 py-2 text-sm"
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-white/15 bg-[#101326] px-3 py-2 text-sm"
              >
                <option value="TECNICO">Problema técnico</option>
                <option value="CUENTA">Cuenta</option>
                <option value="PAGOS">Pagos</option>
                <option value="MERCADO">Mercado P2P</option>
                <option value="OTRO">Otro</option>
              </select>
              <textarea
                required
                minLength={10}
                maxLength={2000}
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe el problema..."
                className="w-full border border-white/15 bg-black/30 px-3 py-2 text-sm"
              />
              <button
                disabled={busy}
                className="border border-cyan-300/50 bg-cyan-300 px-4 py-2 text-xs font-bold text-black disabled:opacity-40"
              >
                {busy ? "Enviando..." : "Enviar solicitud"}
              </button>
            </form>
            {error ? (
              <p role="alert" className="text-xs text-rose-300">
                {error}
              </p>
            ) : null}
            {notice ? <p className="text-xs text-emerald-300">{notice}</p> : null}
            <div className="space-y-2 border-t border-white/10 pt-3">
              <h3 className="text-[10px] uppercase tracking-widest text-white/60">
                Mis solicitudes
              </h3>
              {tickets.map((t) => (
                <article key={t.id} className="border border-white/10 p-3">
                  <p className="text-sm text-white">{t.subject}</p>
                  <p className="mt-1 text-xs text-white/50">
                    {t.category} ·{" "}
                    {t.status === "OPEN"
                      ? "Abierto"
                      : t.status === "IN_PROGRESS"
                        ? "En proceso"
                        : "Resuelto"}{" "}
                    · {new Date(t.updated_at).toLocaleString("es-CO")}
                  </p>
                  <div className="mt-2 space-y-1">
                    {messages
                      .filter((m) => m.ticket_id === t.id)
                      .map((m) => (
                        <p
                          key={m.id}
                          className="border-l border-cyan-300/40 pl-2 text-xs text-white/65"
                        >
                          <b className="text-cyan-200">
                            {m.sender_role === "ADMIN" ? "Soporte" : "Tú"}:
                          </b>{" "}
                          {m.message}
                        </p>
                      ))}
                  </div>
                </article>
              ))}
              {!tickets.length ? (
                <p className="text-xs text-white/40">Todavía no has enviado solicitudes.</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export default PilotHub;
