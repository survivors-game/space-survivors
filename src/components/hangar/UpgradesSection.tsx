import { useEffect, useState, type ReactNode } from "react";
import { Check, Lock } from "lucide-react";
import { spriteUrl } from "@/game/sprites";
import {
  MODULES,
  MODULE_UNLOCK_LEVEL,
  UPGRADES,
  formatUpgradeEffect,
  moduleSwapCost,
  type HangarUpgrade,
} from "@/game/meta/upgrades";
import { upgradeStatus, type Progress, type UpgradeStatus } from "@/game/meta/progress";

interface UpgradesSectionProps {
  progress: Progress;
  onBuy: (upgradeId: string) => void;
  onChooseModule: (upgradeId: string, moduleId: string) => void;
}

const GOLD = "#ffd700";
const CYAN = "#00f0ff";
const fmt = (n: number) => Math.floor(n).toLocaleString();

type Tone = "cyan" | "gold" | "off" | "done";
const TONE: Record<Tone, string> = {
  cyan: "border-cyan-300/70 bg-cyan-300/15 text-cyan-100 hover:bg-cyan-300/25",
  gold: "border-[#ffd700]/70 bg-[#ffd700]/15 text-[#ffd700] hover:bg-[#ffd700]/25",
  off: "border-white/15 bg-white/[0.04] text-white/45",
  done: "border-white/10 bg-transparent text-white/35",
};

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
      className={`h-9 border px-3 text-xs font-bold uppercase tracking-widest transition disabled:cursor-not-allowed ${TONE[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

/** Sprite del juego; si no carga, muestra un punto de color. */
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
      className="grid size-10 shrink-0 place-items-center border bg-black/40"
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

export function UpgradesSection({ progress, onBuy, onChooseModule }: UpgradesSectionProps) {
  return (
    <section className="mt-4 min-w-0 space-y-4 lg:col-start-2">
      <div className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-widest">
        <span className="border border-cyan-300/40 bg-cyan-300/10 px-3 py-1.5 text-cyan-100">
          ETAPA BASE · NIVELES 1–5
        </span>
        <span className="border border-[#ffd700]/50 bg-[#ffd700]/10 px-3 py-1.5 text-[#ffd700]">
          ETAPA DE ÉLITE · NIVELES 6–10 · REQUIERE MÉRITO
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {UPGRADES.map((upgrade) => (
          <UpgradeCard
            key={upgrade.id}
            upgrade={upgrade}
            progress={progress}
            onBuy={() => onBuy(upgrade.id)}
            onChooseModule={(moduleId) => onChooseModule(upgrade.id, moduleId)}
          />
        ))}
      </div>
    </section>
  );
}

function UpgradeCard({
  upgrade,
  progress,
  onBuy,
  onChooseModule,
}: {
  upgrade: HangarUpgrade;
  progress: Progress;
  onBuy: () => void;
  onChooseModule: (moduleId: string) => void;
}) {
  const level = progress.upgrades[upgrade.id] ?? 0;
  const maxed = level >= upgrade.max;
  const status: UpgradeStatus = upgradeStatus(progress, upgrade.id);
  const req = status.requirement;
  const modules = MODULES[upgrade.id] ?? [];
  const chosen = progress.modules[upgrade.id];
  const showModules = level >= MODULE_UNLOCK_LEVEL && modules.length > 0;
  const swapCost = chosen ? moduleSwapCost(upgrade.id) : 0;

  return (
    <article className="flex flex-col gap-3 border border-cyan-500/20 bg-[#0b0d1c]/85 p-4 transition hover:border-cyan-400/45">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <SpriteIcon id={upgrade.icon} color={CYAN} />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-bold uppercase tracking-[0.12em] text-white">
              {upgrade.name}
            </h3>
            <p className="mt-0.5 text-xs text-white/55">{upgrade.desc}</p>
          </div>
        </div>
        <span className="shrink-0 text-xs font-bold tabular-nums text-cyan-200">
          {level}/{upgrade.max}
        </span>
      </div>

      {/* Barra con separador entre etapa base y élite */}
      <div>
        <div className="flex gap-0.5" aria-label={`Nivel ${level} de ${upgrade.max}`}>
          {Array.from({ length: upgrade.max }, (_, step) => {
            const filled = step < level;
            const elite = step >= upgrade.eliteFrom - 1;
            return (
              <span
                key={step}
                className={`h-2.5 flex-1 ${filled ? (elite ? "bg-[#ffd700] shadow-[0_0_6px_#ffd70066]" : "bg-[#00f0ff] shadow-[0_0_6px_#00f0ff55]") : "bg-white/10"} ${
                  step === upgrade.eliteFrom - 1 ? "ml-1.5" : ""
                }`}
              />
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] font-bold uppercase tracking-widest">
          <span className="text-cyan-200/70">BASE 1–{upgrade.eliteFrom - 1}</span>
          <span className="text-[#ffd700]/80">
            ÉLITE {upgrade.eliteFrom}–{upgrade.max}
          </span>
        </div>
      </div>

      {/* Efecto actual y siguiente */}
      <div className="text-xs">
        <span className="text-white/55">ACTUAL: </span>
        <span className="text-white">{formatUpgradeEffect(upgrade.id, level)}</span>
        {!maxed ? (
          <>
            <span className="text-white/35"> → </span>
            <span className="text-[#00f0ff]">{formatUpgradeEffect(upgrade.id, level + 1)}</span>
          </>
        ) : null}
      </div>

      {/* Requisito de mérito del siguiente nivel */}
      {!maxed && req ? (
        <div
          className={`border p-2.5 ${req.met ? "border-[#a3e635]/40 bg-[#a3e635]/5" : "border-[#ffd700]/35 bg-[#ffd700]/5"}`}
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className={req.met ? "text-[#a3e635]" : "text-white/85"}>{req.label}</span>
            {req.met ? (
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#a3e635]">
                <Check className="size-3.5" /> CUMPLIDO
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#ffd700]">
                <Lock className="size-3.5" /> BLOQUEADO
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 bg-white/10">
              <div
                className="h-full"
                style={{
                  width: `${Math.round((req.progress / req.goal) * 100)}%`,
                  background: req.met ? "#a3e635" : GOLD,
                }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-white/60">
              {fmt(req.progress)}/{fmt(req.goal)}
            </span>
          </div>
        </div>
      ) : null}

      {/* Compra */}
      {!maxed ? (
        <div className="mt-auto flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold tabular-nums text-[#ffd700]">
              {fmt(status.cost)} CR
            </span>
            <ActionButton
              tone={status.ok ? "cyan" : "off"}
              disabled={!status.ok}
              onClick={onBuy}
              className="min-w-[9rem]"
            >
              {status.ok ? `COMPRAR NV ${level + 1}` : "BLOQUEADO"}
            </ActionButton>
          </div>
          {!status.ok ? (
            <p className="text-[11px] leading-4 text-[#ffd700]">{status.reason}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-xs font-bold uppercase tracking-widest text-white/50">NIVEL MÁXIMO</p>
      )}

      {/* Módulos de especialización (nivel 10) */}
      {showModules ? (
        <div className="border-t border-[#ffd700]/25 pt-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[#ffd700]">
            MÓDULO DE ESPECIALIZACIÓN
          </p>
          <div className="grid gap-2">
            {modules.map((m) => {
              const selected = chosen === m.id;
              const canAfford = progress.credits >= swapCost;
              const disabled = selected || (!!chosen && !canAfford);
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChooseModule(m.id)}
                  className={`flex flex-col items-start gap-1 border p-2.5 text-left transition disabled:cursor-not-allowed ${
                    selected
                      ? "border-[#ffd700]/80 bg-[#ffd700]/15"
                      : "border-white/15 bg-white/[0.03] hover:border-[#ffd700]/50"
                  }`}
                >
                  <span className="flex w-full items-center justify-between gap-2 text-xs font-bold uppercase tracking-widest text-white">
                    {m.name}
                    {selected ? (
                      <span className="flex items-center gap-1 text-[10px] text-[#ffd700]">
                        <Check className="size-3.5" /> ACTIVO
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[11px] leading-4 text-white/65">{m.desc}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-white/50">
            {chosen
              ? `Cambiar de módulo cuesta ${fmt(swapCost)} CR.`
              : "Primera elección gratis. Después, cambiar cuesta CR."}
          </p>
        </div>
      ) : null}
    </article>
  );
}
