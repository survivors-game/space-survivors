import { useEffect, useState, type ReactNode } from "react";
import { Check, LockKeyhole } from "lucide-react";
import { spriteUrl } from "@/game/sprites";
import {
  DAILY_CHEST,
  DAILY_TIERS,
  SEASON_LEVELS,
  SEASON_MAX_LEVEL,
  SEASON_NAME,
  getDailyTimeRemaining,
  getSeasonBarInfo,
  getWeeklyTimeRemaining,
  type MissionIcon,
  type MissionTier,
} from "@/game/meta/missions";
import {
  claimDailyChest,
  claimPeriodMission,
  claimSeasonChallenge,
  claimSeasonLevel,
  getSeasonBoard,
  type BuyResult,
  type Progress,
} from "@/game/meta/progress";

type SeasonTab = "DAILY" | "WEEKLY" | "CHALLENGES" | "PASS";

interface MissionsSectionProps {
  progress: Progress;
  /** Estado VIP calculado en el servidor con hasVip (vip.ts). */
  hasVip: boolean;
  onCommit: (next: Progress) => void;
  onNotice: (message: string) => void;
  onClaimed?: () => void;
}

/* Sprites ya existentes del juego (src/game/art.ts). */
const MISSION_SPRITE: Record<MissionIcon, string> = {
  target: "ic_crit",
  zap: "ic_speed",
  skull: "ic_damage",
  shield: "ic_shield",
  flame: "ic_plasma",
  clock: "ic_rate",
  wrench: "ic_evo",
  crown: "ic_nova",
  radar: "ic_arc",
  cpu: "ic_engine",
  crosshair: "ic_lock",
};

const TIER_STYLE: Record<MissionTier, { label: string; color: string }> = {
  BASIC: { label: "BÁSICO", color: "#00f0ff" },
  PILOT: { label: "PILOTO", color: "#a3e635" },
  ELITE: { label: "ÉLITE", color: "#d946ef" },
};

const WEEKLY_COLOR = "#d946ef";
const CHALLENGE_COLOR = "#fb7185";
const GOLD = "#ffd700";

const fmt = (n: number) => Math.floor(n).toLocaleString();
const pad = (n: number) => String(n).padStart(2, "0");

/** HH:MM:SS para el reinicio diario. */
function formatHms(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** Días : Horas para el reinicio semanal. */
function formatDh(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  return `${Math.floor(h / 24)}D : ${h % 24}H`;
}

/* Botones con colores explícitos: el texto siempre es visible. */
type Tone = "cyan" | "gold" | "off" | "done";
const TONE: Record<Tone, string> = {
  cyan: "border-cyan-300/70 bg-cyan-300/15 text-cyan-100 hover:bg-cyan-300/25",
  gold: "border-[#ffd700]/70 bg-[#ffd700]/15 text-[#ffd700] hover:bg-[#ffd700]/25",
  off: "border-white/15 bg-white/[0.04] text-white/45",
  done: "border-white/10 bg-transparent text-white/35",
};
const BTN =
  "h-8 min-w-[6.5rem] shrink-0 border px-3 text-[10px] font-bold uppercase tracking-widest transition disabled:cursor-not-allowed";

function ActionButton({
  tone,
  disabled,
  onClick,
  children,
  className = "",
}: {
  tone: Tone;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${BTN} ${TONE[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

/** Sprite del juego; si aún no carga o no existe, muestra un punto de color. */
function SpriteIcon({ id, color }: { id: string; color: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    try {
      setSrc(spriteUrl(id, 3));
    } catch {
      setSrc(null);
    }
  }, [id]);
  return (
    <span
      className="grid size-9 shrink-0 place-items-center border bg-black/40"
      style={{ borderColor: `${color}66` }}
    >
      {src ? (
        <img src={src} alt="" className="size-7 [image-rendering:pixelated]" />
      ) : (
        <span className="size-2" style={{ background: color }} />
      )}
    </span>
  );
}

export function MissionsSection({
  progress,
  hasVip,
  onCommit,
  onNotice,
  onClaimed,
}: MissionsSectionProps) {
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<SeasonTab>("DAILY");

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const board = getSeasonBoard(progress, now);
  const bar = getSeasonBarInfo(progress.season.pt);
  const pt = progress.season.pt;

  const apply = (result: BuyResult, okMessage: string) => {
    if (result.ok) {
      onCommit(result.progress);
      onClaimed?.();
      onNotice(okMessage);
    } else {
      onNotice(result.reason);
    }
  };

  const rewardMsg = (reward: number, points: number) =>
    `Recompensa reclamada · +${fmt(reward)} CR · +${fmt(points)} PT`;

  const tabs: { id: SeasonTab; label: string; count: string }[] = [
    { id: "DAILY", label: "DIARIAS", count: `${board.dailyClaimedCount}/6` },
    { id: "WEEKLY", label: "SEMANALES", count: `${board.weeklyClaimedCount}/8` },
    { id: "CHALLENGES", label: "DESAFÍOS", count: `${board.challengeClaimedCount}/8` },
    { id: "PASS", label: "PASE", count: `NV ${bar.level}/${SEASON_MAX_LEVEL}` },
  ];

  return (
    <section className="mt-4 min-w-0 space-y-4 lg:col-start-2">
      {/* Cabecera: nivel, PT y reinicios */}
      <header className="border border-cyan-400/30 bg-[#070914]/90 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[9px] uppercase tracking-[0.25em] text-cyan-300/70">
              CENTRO DE OPERACIONES · {SEASON_NAME}
            </p>
            <p className="font-arcade mt-1.5 text-base text-[#00f0ff] drop-shadow-[0_0_10px_#00f0ff80] sm:text-xl">
              NIVEL {bar.level}
              <span className="text-white/40"> / {SEASON_MAX_LEVEL}</span>
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-white/55 tabular-nums">
              {fmt(pt)} PT
              {bar.nextPt !== null
                ? ` · ${fmt(bar.nextPt - pt)} PT PARA EL NIVEL ${bar.level + 1}`
                : " · NIVEL MÁXIMO"}
            </p>
          </div>
          <div className="flex gap-2">
            <Countdown label="REINICIO DIARIO" value={formatHms(getDailyTimeRemaining(now))} />
            <Countdown label="REINICIO SEMANAL" value={formatDh(getWeeklyTimeRemaining(now))} />
          </div>
        </div>
        <div
          role="progressbar"
          aria-label="Progreso de PT hacia el siguiente nivel"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(bar.fraction * 100)}
          className="mt-3 flex gap-0.5"
        >
          {Array.from({ length: 20 }, (_, i) => (
            <span
              key={i}
              className={`h-2 flex-1 ${
                i < Math.floor(bar.fraction * 20)
                  ? "bg-[#00f0ff] shadow-[0_0_6px_#00f0ff88]"
                  : "bg-white/10"
              }`}
            />
          ))}
        </div>
      </header>

      {/* Pestañas */}
      <div role="tablist" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`h-9 border px-2 text-[10px] font-bold uppercase tracking-widest transition ${
                active
                  ? "border-cyan-300/70 bg-cyan-300/15 text-cyan-100"
                  : "border-cyan-500/20 bg-[#0b0d1c] text-white/55 hover:text-cyan-100"
              }`}
            >
              {t.label} <span className="text-[#ffd700]">{t.count}</span>
            </button>
          );
        })}
      </div>

      {tab === "DAILY" ? (
        <div className="space-y-4">
          {DAILY_TIERS.map((tier) => {
            const style = TIER_STYLE[tier];
            const entries = board.daily.filter((e) => e.template.tier === tier);
            return (
              <section key={tier} className="border border-cyan-500/20 bg-[#0b0d1c]/80">
                <h3
                  className="border-b border-cyan-500/15 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em]"
                  style={{ color: style.color }}
                >
                  {style.label}
                </h3>
                <ul>
                  {entries.map((e) => (
                    <MissionRow
                      key={e.template.id}
                      icon={e.template.icon}
                      title={e.template.title}
                      desc={e.template.desc}
                      tag={style.label}
                      accent={style.color}
                      current={e.progress}
                      goal={e.template.goal}
                      reward={e.template.reward}
                      pt={e.template.pt}
                      completed={e.completed}
                      claimed={e.claimed}
                      onClaim={() =>
                        apply(
                          claimPeriodMission(progress, "DAILY", e.template.id),
                          rewardMsg(e.template.reward, e.template.pt),
                        )
                      }
                    />
                  ))}
                </ul>
              </section>
            );
          })}

          {/* Cofre diario */}
          <div className="flex flex-wrap items-center gap-4 border border-[#ffd700]/35 bg-[#0b0d1c]/80 p-3">
            <SpriteIcon id="ic_salvage" color={GOLD} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#ffd700]">
                COFRE DIARIO
              </p>
              <p className="mt-0.5 text-[10px] text-white/50">
                Reclama {DAILY_CHEST.threshold} de 6 misiones · +{fmt(DAILY_CHEST.reward)} CR · +
                {DAILY_CHEST.pt} PT
              </p>
              <div
                className="mt-2 flex gap-0.5"
                aria-label={`${board.chest.claimedCount} de ${board.chest.threshold}`}
              >
                {Array.from({ length: board.chest.threshold }, (_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-8 ${i < board.chest.claimedCount ? "bg-[#ffd700]" : "bg-white/10"}`}
                  />
                ))}
              </div>
            </div>
            <ActionButton
              tone={board.chest.claimed ? "done" : board.chest.claimable ? "gold" : "off"}
              disabled={!board.chest.claimable}
              onClick={() =>
                apply(claimDailyChest(progress), rewardMsg(DAILY_CHEST.reward, DAILY_CHEST.pt))
              }
            >
              {board.chest.claimed
                ? "ABIERTO"
                : board.chest.claimable
                  ? "RECLAMAR"
                  : `${board.chest.claimedCount}/${board.chest.threshold}`}
            </ActionButton>
          </div>
        </div>
      ) : null}

      {tab === "WEEKLY" ? (
        <section className="border border-cyan-500/20 bg-[#0b0d1c]/80">
          <ul>
            {board.weekly.map((e) => (
              <MissionRow
                key={e.template.id}
                icon={e.template.icon}
                title={e.template.title}
                desc={e.template.desc}
                tag="SEMANAL"
                accent={WEEKLY_COLOR}
                current={e.progress}
                goal={e.template.goal}
                reward={e.template.reward}
                pt={e.template.pt}
                completed={e.completed}
                claimed={e.claimed}
                onClaim={() =>
                  apply(
                    claimPeriodMission(progress, "WEEKLY", e.template.id),
                    rewardMsg(e.template.reward, e.template.pt),
                  )
                }
              />
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "CHALLENGES" ? (
        <section className="border border-cyan-500/20 bg-[#0b0d1c]/80">
          <ul>
            {board.challenges.map((e) => (
              <MissionRow
                key={e.template.id}
                icon={e.template.icon}
                title={e.template.title}
                desc={e.template.desc}
                tag="DESAFÍO MAYOR"
                accent={CHALLENGE_COLOR}
                current={e.progress}
                goal={e.template.goal}
                reward={e.template.reward}
                pt={e.template.pt}
                completed={e.completed}
                claimed={e.claimed}
                onClaim={() =>
                  apply(
                    claimSeasonChallenge(progress, e.template.id),
                    rewardMsg(e.template.reward, e.template.pt),
                  )
                }
              />
            ))}
          </ul>
        </section>
      ) : null}

      {tab === "PASS" ? (
        <section className="border border-cyan-500/20 bg-[#070914]/80">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-500/20 px-3 py-2 text-[9px] font-bold uppercase tracking-widest">
            <span className="text-cyan-100/70">
              GRATUITO · {progress.season.claimedFree.length}/{SEASON_MAX_LEVEL}
            </span>
            <span className={hasVip ? "text-[#ffd700]" : "text-white/50"}>
              {hasVip
                ? `VIP ACTIVO · ${progress.season.claimedVip.length}/${SEASON_MAX_LEVEL}`
                : "SIN VIP · el carril VIP solo se puede ver"}
            </span>
          </div>

          <div className="grid grid-cols-[2.5rem_4rem_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b border-white/10 px-3 py-2 text-[9px] font-bold uppercase tracking-widest text-white/40">
            <span>NV</span>
            <span>PT</span>
            <span className="text-cyan-200/70">GRATUITO</span>
            <span className="text-[#ffd700]/80">VIP</span>
          </div>

          <div className="max-h-[30rem] overflow-y-auto [scrollbar-width:thin]">
            <ul>
              {SEASON_LEVELS.map((node) => {
                const reached = bar.level >= node.level;
                const freeClaimed = progress.season.claimedFree.includes(node.level);
                const vipClaimed = progress.season.claimedVip.includes(node.level);
                return (
                  <li
                    key={node.level}
                    className={`grid grid-cols-[2.5rem_4rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 border-b border-white/5 px-3 py-2 ${
                      reached ? "" : "opacity-60"
                    }`}
                  >
                    <span
                      className={`font-arcade text-[11px] ${reached ? "text-cyan-200" : "text-white/40"}`}
                    >
                      {pad(node.level)}
                    </span>
                    <span className="text-[10px] tabular-nums text-white/45">
                      {fmt(node.requiredPt)}
                    </span>

                    {/* Carril gratuito */}
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="truncate text-[10px] text-white/80">
                        {node.freeReward.label}
                      </span>
                      <ActionButton
                        tone={freeClaimed ? "done" : reached ? "cyan" : "off"}
                        disabled={!reached || freeClaimed}
                        onClick={() =>
                          apply(
                            claimSeasonLevel(progress, "FREE", node.level, hasVip),
                            `Nivel ${node.level} gratuito reclamado`,
                          )
                        }
                        className="h-7 min-w-[5.5rem]"
                      >
                        {freeClaimed ? "RECLAMADO" : "RECLAMAR"}
                      </ActionButton>
                    </div>

                    {/* Carril VIP */}
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="block truncate text-[10px] text-white/80">
                          {node.vipReward.label}
                        </span>
                        {!hasVip ? (
                          <span className="mt-0.5 inline-block border border-[#ffd700]/50 px-1 text-[7px] font-bold uppercase tracking-widest text-[#ffd700]">
                            REQUIERE VIP
                          </span>
                        ) : null}
                      </div>
                      <ActionButton
                        tone={vipClaimed ? "done" : reached && hasVip ? "gold" : "off"}
                        disabled={!reached || !hasVip || vipClaimed}
                        onClick={() =>
                          apply(
                            claimSeasonLevel(progress, "VIP", node.level, hasVip),
                            `Nivel ${node.level} VIP reclamado`,
                          )
                        }
                        className="h-7 min-w-[5.5rem]"
                      >
                        {vipClaimed ? (
                          <>
                            <Check className="size-3" /> RECLAMADO
                          </>
                        ) : !hasVip ? (
                          <>
                            <LockKeyhole className="size-3" /> VIP
                          </>
                        ) : reached ? (
                          "RECLAMAR"
                        ) : (
                          "BLOQUEADO"
                        )}
                      </ActionButton>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function Countdown({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-cyan-400/20 bg-black/30 px-2.5 py-1.5">
      <p className="text-[8px] tracking-[0.18em] text-white/45">{label}</p>
      <p className="font-arcade mt-1 text-[10px] tabular-nums text-cyan-100">{value}</p>
    </div>
  );
}

interface MissionRowProps {
  icon: MissionIcon;
  title: string;
  desc: string;
  tag: string;
  accent: string;
  current: number;
  goal: number;
  reward: number;
  pt: number;
  completed: boolean;
  claimed: boolean;
  onClaim: () => void;
}

/** Una misión como fila: sprite, nombre, barra, números, recompensa y botón. */
function MissionRow({
  icon,
  title,
  desc,
  tag,
  accent,
  current,
  goal,
  reward,
  pt,
  completed,
  claimed,
  onClaim,
}: MissionRowProps) {
  const shown = Math.min(current, goal);
  const percentage = Math.min(100, Math.round((shown / goal) * 100));
  const barColor = claimed ? "#ffffff55" : completed ? GOLD : accent;

  return (
    <li
      className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b border-cyan-500/15 px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_11rem_6.5rem_6.5rem] sm:gap-x-4 ${
        claimed ? "opacity-50" : ""
      }`}
    >
      <SpriteIcon id={MISSION_SPRITE[icon]} color={accent} />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white">{title}</h3>
          <span
            className="text-[8px] font-bold uppercase tracking-widest"
            style={{ color: accent }}
          >
            {tag}
          </span>
        </div>
        <p className="mt-0.5 text-[10px] text-white/50">{desc}</p>
      </div>

      <div className="col-span-2 sm:col-span-1">
        <div className="mb-1 flex justify-between text-[9px] tabular-nums text-white/55">
          <span>
            {fmt(shown)} / {fmt(goal)}
          </span>
          <span>{percentage}%</span>
        </div>
        <div
          className="h-1.5 bg-white/10"
          role="progressbar"
          aria-label={`Progreso: ${title}`}
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full transition-[width] duration-300"
            style={{ width: `${percentage}%`, background: barColor }}
          />
        </div>
      </div>

      <div className="flex gap-3 text-[10px] font-bold tabular-nums sm:flex-col sm:gap-0.5 sm:text-right">
        <span className="text-[#ffd700]">+{fmt(reward)} CR</span>
        <span className="text-[#00f0ff]">+{fmt(pt)} PT</span>
      </div>

      <ActionButton
        tone={claimed ? "done" : completed ? "gold" : "off"}
        disabled={!completed || claimed}
        onClick={onClaim}
        className="col-span-2 w-full sm:col-span-1 sm:w-auto"
      >
        {claimed ? (
          <>
            <Check className="size-3" /> RECLAMADA
          </>
        ) : completed ? (
          "RECLAMAR"
        ) : (
          "EN CURSO"
        )}
      </ActionButton>
    </li>
  );
}
