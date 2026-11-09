 import { useEffect, useState } from "react";
import {
  Award,
  Check,
  Clock,
  Crosshair,
  Cpu,
  Crown,
  Flame,
  LockKeyhole,
  Radar,
  Shield,
  Skull,
  Target,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

const TIER_STYLE: Record<MissionTier, { label: string; color: string }> = {
  BASIC: { label: "BÁSICO", color: "#00f0ff" },
  PILOT: { label: "PILOTO", color: "#a3e635" },
  ELITE: { label: "ÉLITE", color: "#d946ef" },
};

const ICONS: Record<MissionIcon, LucideIcon> = {
  target: Target,
  zap: Zap,
  skull: Skull,
  shield: Shield,
  flame: Flame,
  clock: Clock,
  wrench: Wrench,
  crown: Crown,
  radar: Radar,
  cpu: Cpu,
  crosshair: Crosshair,
};

const WEEKLY_ACCENT = "#d946ef";
const CHALLENGE_ACCENT = "#fb7185";
const SEGMENTS = 20;

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

function rewardMessage(reward: number, pt: number): string {
  return `Recompensa reclamada · +${fmt(reward)} CR · +${fmt(pt)} PT`;
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

  const tabs: { id: SeasonTab; label: string; count: string }[] = [
    { id: "DAILY", label: "DIARIAS", count: `(${board.dailyClaimedCount}/6)` },
    { id: "WEEKLY", label: "SEMANALES", count: `(${board.weeklyClaimedCount}/8)` },
    { id: "CHALLENGES", label: "DESAFÍOS TEMPORADA", count: `(${board.challengeClaimedCount}/8)` },
    { id: "PASS", label: "PASE DE TEMPORADA", count: `(NV ${bar.level}/${SEASON_MAX_LEVEL})` },
  ];

  return (
    <section className="mt-6 min-w-0 space-y-5 lg:col-start-2">
      {/* Cabecera táctica */}
      <header className="relative overflow-hidden border border-cyan-400/30 bg-[#070914]/90 p-4 shadow-[inset_0_0_30px_#00f0ff0a] sm:p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent"
        />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] text-cyan-300/70">
              CENTRO DE OPERACIONES · {SEASON_NAME}
            </p>
            <p className="font-arcade mt-2 text-lg text-[#00f0ff] drop-shadow-[0_0_12px_#00f0ff80] sm:text-2xl">
              NIVEL {bar.level}
              <span className="text-white/40"> / {SEASON_MAX_LEVEL}</span>
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-widest text-white/55 tabular-nums">
              {fmt(pt)} PT
              {bar.nextPt !== null
                ? ` · ${fmt(bar.nextPt - pt)} PT PARA EL NIVEL ${bar.level + 1}`
                : " · NIVEL MÁXIMO ALCANZADO"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
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
          className="mt-4 flex gap-1"
        >
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <span
              key={i}
              className={`h-2.5 flex-1 ${
                i < Math.floor(bar.fraction * SEGMENTS)
                  ? "bg-[#00f0ff] shadow-[0_0_8px_#00f0ff88]"
                  : "bg-white/10"
              }`}
            />
          ))}
        </div>
      </header>

      {/* Selector de pestañas */}
      <div role="tablist" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`min-h-11 border px-2 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition ${
                active
                  ? "border-cyan-300/70 bg-cyan-300/10 text-cyan-100 shadow-[0_0_14px_#00f0ff33]"
                  : "border-cyan-500/20 bg-[#0b0d1c]/70 text-white/50 hover:border-cyan-400/40 hover:text-cyan-100"
              }`}
            >
              {t.label} <span className="tabular-nums text-[#ffd700]">{t.count}</span>
            </button>
          );
        })}
      </div>

      {tab === "DAILY" ? (
        <div className="space-y-5">
          {DAILY_TIERS.map((tier) => {
            const style = TIER_STYLE[tier];
            const entries = board.daily.filter((e) => e.template.tier === tier);
            return (
              <section key={tier}>
                <h3
                  className="mb-3 flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.22em]"
                  style={{ color: style.color }}
                >
                  <span className="h-px w-6" style={{ background: style.color }} />
                  {style.label}
                  <span className="h-px flex-1 bg-white/10" />
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {entries.map((e) => (
                    <MissionCard
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
                          rewardMessage(e.template.reward, e.template.pt),
                        )
                      }
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {/* Cofre diario */}
          <article className="border border-[#ffd700]/35 bg-[#0b0d1c]/85 p-4 shadow-[inset_0_0_24px_#ffd70010]">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-12 shrink-0 place-items-center border border-[#ffd700]/50 text-[#ffd700] shadow-[0_0_18px_#ffd70033]">
                  <Award className="size-6" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-xs font-black uppercase tracking-[0.13em] text-[#ffd700]">
                    COFRE DIARIO
                  </h3>
                  <p className="mt-1 text-[10px] leading-4 text-white/45">
                    Reclama {DAILY_CHEST.threshold} de las 6 misiones diarias para abrirlo · +
                    {fmt(DAILY_CHEST.reward)} CR · +{DAILY_CHEST.pt} PT
                  </p>
                </div>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-56">
                <div className="flex gap-1" aria-label={`Misiones reclamadas: ${board.chest.claimedCount} de ${board.chest.threshold}`}>
                  {Array.from({ length: board.chest.threshold }, (_, i) => (
                    <span
                      key={i}
                      className={`h-2 flex-1 ${i < board.chest.claimedCount ? "bg-[#ffd700] shadow-[0_0_8px_#ffd70088]" : "bg-white/10"}`}
                    />
                  ))}
                </div>
                <Button
                  disabled={!board.chest.claimable}
                  onClick={() =>
                    apply(
                      claimDailyChest(progress),
                      rewardMessage(DAILY_CHEST.reward, DAILY_CHEST.pt),
                    )
                  }
                  variant="outline"
                  className={`font-arcade h-10 w-full rounded-none text-[8px] uppercase tracking-normal ${
                    board.chest.claimed
                      ? "border-white/10 text-white/35"
                      : board.chest.claimable
                        ? "border-[#ffd700]/70 bg-[#ffd700]/10 text-[#ffd700] shadow-[0_0_16px_#ffd70022] hover:bg-[#ffd700]/20"
                        : "border-cyan-400/20 text-cyan-100/45"
                  }`}
                >
                  {board.chest.claimed ? (
                    <>
                      <Check /> COFRE ABIERTO
                    </>
                  ) : board.chest.claimable ? (
                    "RECLAMAR COFRE"
                  ) : (
                    `BLOQUEADO · ${board.chest.claimedCount}/${board.chest.threshold}`
                  )}
                </Button>
              </div>
            </div>
          </article>
        </div>
      ) : null}

      {tab === "WEEKLY" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {board.weekly.map((e) => (
            <MissionCard
              key={e.template.id}
              icon={e.template.icon}
              title={e.template.title}
              desc={e.template.desc}
              tag="SEMANAL"
              accent={WEEKLY_ACCENT}
              current={e.progress}
              goal={e.template.goal}
              reward={e.template.reward}
              pt={e.template.pt}
              completed={e.completed}
              claimed={e.claimed}
              onClaim={() =>
                apply(
                  claimPeriodMission(progress, "WEEKLY", e.template.id),
                  rewardMessage(e.template.reward, e.template.pt),
                )
              }
            />
          ))}
        </div>
      ) : null}

      {tab === "CHALLENGES" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {board.challenges.map((e) => (
            <MissionCard
              key={e.template.id}
              icon={e.template.icon}
              title={e.template.title}
              desc={e.template.desc}
              tag="DESAFÍO MAYOR"
              accent={CHALLENGE_ACCENT}
              current={e.progress}
              goal={e.template.goal}
              reward={e.template.reward}
              pt={e.template.pt}
              completed={e.completed}
              claimed={e.claimed}
              onClaim={() =>
                apply(
                  claimSeasonChallenge(progress, e.template.id),
                  rewardMessage(e.template.reward, e.template.pt),
                )
              }
            />
          ))}
        </div>
      ) : null}

      {tab === "PASS" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border border-cyan-500/20 bg-[#0b0d1c]/85 p-3 text-[10px] uppercase tracking-widest">
            <span className="text-cyan-100/70">
              GRATUITO · {progress.season.claimedFree.length}/{SEASON_MAX_LEVEL} reclamados
            </span>
            <span className={hasVip ? "text-[#ffd700]" : "text-white/45"}>
              {hasVip
                ? `VIP ACTIVO · ${progress.season.claimedVip.length}/${SEASON_MAX_LEVEL} reclamados`
                : "SIN VIP · el carril VIP se puede inspeccionar, no reclamar"}
            </span>
          </div>

          <div className="overflow-x-auto pb-2">
            <div
              className="grid min-w-max gap-2"
              style={{ gridTemplateColumns: "7.5rem repeat(20, 9.5rem)" }}
            >
              <div className="sticky left-0 z-10 flex items-center bg-[#070914] pr-2 text-[9px] font-black uppercase tracking-[0.2em] text-white/45">
                NIVEL
              </div>
              {SEASON_LEVELS.map((node) => {
                const reached = bar.level >= node.level;
                return (
                  <div
                    key={`lvl-${node.level}`}
                    className={`border px-2 py-2 text-center ${
                      reached
                        ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-100 shadow-[0_0_12px_#00f0ff33]"
                        : "border-white/10 bg-white/[0.02] text-white/40"
                    }`}
                  >
                    <p className="font-arcade text-[10px]">{pad(node.level)}</p>
                    <p className="mt-1 text-[8px] tabular-nums text-white/45">
                      {fmt(node.requiredPt)} PT
                    </p>
                  </div>
                );
              })}

              <div className="sticky left-0 z-10 flex items-center bg-[#070914] pr-2 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-200">
                GRATUITO
              </div>
              {SEASON_LEVELS.map((node) => (
                <PassNode
                  key={`free-${node.level}`}
                  vip={false}
                  label={node.freeReward.label}
                  reached={bar.level >= node.level}
                  claimed={progress.season.claimedFree.includes(node.level)}
                  vipLocked={false}
                  onClaim={() =>
                    apply(
                      claimSeasonLevel(progress, "FREE", node.level, hasVip),
                      `Nivel ${node.level} gratuito reclamado`,
                    )
                  }
                />
              ))}

              <div className="sticky left-0 z-10 flex items-center bg-[#070914] pr-2 text-[9px] font-black uppercase tracking-[0.2em] text-[#ffd700]">
                VIP
              </div>
              {SEASON_LEVELS.map((node) => (
                <PassNode
                  key={`vip-${node.level}`}
                  vip
                  label={node.vipReward.label}
                  reached={bar.level >= node.level}
                  claimed={progress.season.claimedVip.includes(node.level)}
                  vipLocked={!hasVip}
                  onClaim={() =>
                    apply(
                      claimSeasonLevel(progress, "VIP", node.level, hasVip),
                      `Nivel ${node.level} VIP reclamado`,
                    )
                  }
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Countdown({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-cyan-400/20 bg-black/30 px-3 py-2">
      <p className="text-[9px] tracking-[0.2em] text-white/45">{label}</p>
      <p className="font-arcade mt-1 text-[11px] tabular-nums text-cyan-100">{value}</p>
    </div>
  );
}

interface MissionCardProps {
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

function MissionCard({
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
}: MissionCardProps) {
  const Icon = ICONS[icon];
  const shown = Math.min(current, goal);
  const percentage = Math.min(100, Math.round((shown / goal) * 100));
  return (
    <article
      className={`flex flex-col border bg-[#0b0d1c]/85 p-4 transition ${
        claimed
          ? "border-white/10 opacity-70"
          : completed
            ? "border-[#ffd700]/50 shadow-[0_0_22px_#ffd70022]"
            : "border-cyan-500/20 hover:border-cyan-400/45"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="grid size-10 shrink-0 place-items-center border bg-white/[0.03]"
          style={{ borderColor: `${accent}55`, color: accent }}
        >
          <Icon className="size-5" />
        </span>
        <span
          className="text-[9px] font-black uppercase tracking-[0.18em]"
          style={{ color: accent }}
        >
          {tag}
        </span>
      </div>
      <h3 className="mt-4 text-xs font-black uppercase tracking-[0.13em]">{title}</h3>
      <p className="mt-2 min-h-8 text-[10px] leading-4 text-white/45">{desc}</p>

      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-[9px] uppercase tracking-widest text-cyan-100/55">
          <span>PROGRESO</span>
          <span className="tabular-nums">
            {fmt(shown)} / {fmt(goal)}
          </span>
        </div>
        <div
          className="h-2 overflow-hidden border border-cyan-400/20 bg-[#151727]"
          role="progressbar"
          aria-label={`Progreso: ${title}`}
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full transition-[width] duration-300 ${
              claimed
                ? "bg-cyan-300/50"
                : completed
                  ? "bg-[#ffd700] shadow-[0_0_10px_#ffd70099]"
                  : "bg-[#00f0ff] shadow-[0_0_8px_#00f0ff55]"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-[10px] font-black tracking-widest tabular-nums">
        <span className="text-[#ffd700]">+{fmt(reward)} CR</span>
        <span className="text-[#00f0ff]">+{fmt(pt)} PT</span>
      </div>

      <Button
        disabled={!completed || claimed}
        onClick={onClaim}
        variant="outline"
        className={`font-arcade mt-4 h-10 w-full rounded-none px-1 text-[8px] uppercase tracking-normal ${
          claimed
            ? "border-white/10 text-cyan-100/35"
            : completed
              ? "border-[#ffd700]/70 bg-[#ffd700]/10 text-[#ffd700] shadow-[0_0_16px_#ffd70022] hover:bg-[#ffd700]/20"
              : "border-cyan-400/20 text-cyan-100/45"
        }`}
      >
        {claimed ? (
          <>
            <Check /> RECLAMADA
          </>
        ) : completed ? (
          "RECLAMAR"
        ) : (
          "EN CURSO"
        )}
      </Button>
    </article>
  );
}

interface PassNodeProps {
  vip: boolean;
  label: string;
  reached: boolean;
  claimed: boolean;
  vipLocked: boolean;
  onClaim: () => void;
}

function PassNode({ vip, label, reached, claimed, vipLocked, onClaim }: PassNodeProps) {
  const accent = vip ? "#ffd700" : "#00f0ff";
  const canClaim = reached && !claimed && !vipLocked;

  return (
    <article
      className={`relative flex min-h-36 flex-col border p-2.5 ${
        claimed
          ? "border-white/10 bg-white/[0.02] opacity-70"
          : vip && vipLocked
            ? "border-[#ffd700]/40 bg-[#14110a]/80 shadow-[inset_0_0_18px_#ffd70014]"
            : canClaim
              ? `bg-[#0b0d1c]/90 ${vip ? "border-[#ffd700]/70 shadow-[0_0_18px_#ffd70033]" : "border-cyan-300/60 shadow-[0_0_18px_#00f0ff33]"}`
              : "border-white/10 bg-[#0b0d1c]/60"
      }`}
    >
      {vip && vipLocked ? (
        <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center text-[#ffd700] drop-shadow-[0_0_6px_#ffd700]">
          <LockKeyhole className="size-3.5" />
        </span>
      ) : null}
      <p
        className="text-[8px] font-black uppercase tracking-[0.18em]"
        style={{ color: reached ? accent : "rgba(255,255,255,0.35)" }}
      >
        {vip ? "VIP" : "GRATUITO"}
      </p>
      {vip && vipLocked ? (
        <span className="mt-1.5 inline-block self-start border border-[#ffd700]/60 bg-[#ffd700]/10 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-widest text-[#ffd700] shadow-[0_0_10px_#ffd70033]">
          REQUIERE VIP
        </span>
      ) : null}
      <p className="mt-2 flex-1 text-[10px] leading-4 text-white/75">{label}</p>
      <Button
        disabled={!canClaim}
        onClick={onClaim}
        variant="outline"
        className={`font-arcade mt-2 h-8 w-full rounded-none px-1 text-[7px] uppercase tracking-normal ${
          claimed
            ? "border-white/10 text-white/35"
            : canClaim
              ? vip
                ? "border-[#ffd700]/70 bg-[#ffd700]/10 text-[#ffd700] hover:bg-[#ffd700]/20"
                : "border-cyan-300/70 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20"
              : "border-white/10 text-white/35"
        }`}
      >
        {claimed ? (
          <>
            <Check /> RECLAMADO
          </>
        ) : canClaim ? (
          "RECLAMAR"
        ) : vip && vipLocked ? (
          <>
            <LockKeyhole /> VIP
          </>
        ) : (
          "BLOQUEADO"
        )}
      </Button>
    </article>
  );
}