import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared visual kit for the alliance / war / boss-help ecosystem (presentation only). */

type Tone = "cyan" | "fuchsia" | "amber" | "emerald" | "rose" | "muted";

const toneText: Record<Tone, string> = {
  cyan: "text-cyan-200",
  fuchsia: "text-fuchsia-200",
  amber: "text-amber-200",
  emerald: "text-emerald-200",
  rose: "text-rose-200",
  muted: "text-white/55",
};
const toneBorder: Record<Tone, string> = {
  cyan: "border-cyan-400/30",
  fuchsia: "border-fuchsia-400/30",
  amber: "border-amber-400/30",
  emerald: "border-emerald-400/30",
  rose: "border-rose-400/30",
  muted: "border-white/10",
};
const toneBg: Record<Tone, string> = {
  cyan: "bg-cyan-400/[0.06]",
  fuchsia: "bg-fuchsia-400/[0.06]",
  amber: "bg-amber-400/[0.06]",
  emerald: "bg-emerald-400/[0.06]",
  rose: "bg-rose-400/[0.06]",
  muted: "bg-white/[0.03]",
};
const toneDot: Record<Tone, string> = {
  cyan: "bg-cyan-300 shadow-[0_0_8px_#00f0ff]",
  fuchsia: "bg-fuchsia-300 shadow-[0_0_8px_#ff4df0]",
  amber: "bg-amber-300 shadow-[0_0_8px_#fbbf24]",
  emerald: "bg-emerald-300 shadow-[0_0_8px_#34d399]",
  rose: "bg-rose-300 shadow-[0_0_8px_#fb7185]",
  muted: "bg-white/40",
};

export function MpPanel({
  children,
  tone = "cyan",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden border bg-[#0b0d1c]/80 p-4 backdrop-blur-sm sm:p-5",
        toneBorder[tone],
        className,
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-cyan-300/70"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-fuchsia-300/70"
      />
      {children}
    </section>
  );
}

export function MpHeader({
  kicker,
  title,
  aside,
  tone = "cyan",
}: {
  kicker: string;
  title: ReactNode;
  aside?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className={cn("text-[9px] font-bold uppercase tracking-[0.25em]", toneText[tone])}>
          {kicker}
        </p>
        <h3 className="mt-1.5 truncate text-sm font-black uppercase tracking-[0.14em] text-white sm:text-base">
          {title}
        </h3>
      </div>
      {aside ? <div className="flex flex-wrap items-center gap-2">{aside}</div> : null}
    </div>
  );
}

export function MpBadge({ tone = "cyan", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.18em]",
        toneBorder[tone],
        toneBg[tone],
        toneText[tone],
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", toneDot[tone])} />
      {children}
    </span>
  );
}

export function MpStat({
  label,
  value,
  tone = "cyan",
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className={cn("border px-3 py-2.5", toneBorder[tone], toneBg[tone])}>
      <p className="text-[8px] uppercase tracking-[0.2em] text-white/45">{label}</p>
      <p className={cn("mt-1 text-sm font-black tabular-nums", toneText[tone])}>{value}</p>
    </div>
  );
}

export function MpEmpty({
  icon = "◎",
  title,
  text,
  tone = "cyan",
}: {
  icon?: string;
  title: string;
  text: string;
  tone?: Tone;
}) {
  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden border border-dashed px-4 py-8 text-center",
        toneBorder[tone],
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(0,240,255,0.08)_0%,_transparent_65%)]"
      />
      <div
        aria-hidden
        className={cn(
          "relative grid h-14 w-14 place-items-center rounded-full border text-xl",
          toneBorder[tone],
          toneText[tone],
        )}
      >
        <span className="absolute inset-0 animate-ping rounded-full border border-current opacity-20" />
        {icon}
      </div>
      <p
        className={cn(
          "relative mt-3 text-[10px] font-black uppercase tracking-[0.2em]",
          toneText[tone],
        )}
      >
        {title}
      </p>
      <p className="relative mt-1.5 max-w-sm text-[10px] leading-5 text-white/45">{text}</p>
    </div>
  );
}

export function MpMeter({ value, tone = "cyan" }: { value: number; tone?: Tone }) {
  const bar: Record<Tone, string> = {
    cyan: "from-cyan-500 to-cyan-200",
    fuchsia: "from-fuchsia-600 to-fuchsia-300",
    amber: "from-amber-600 to-amber-300",
    emerald: "from-emerald-600 to-emerald-300",
    rose: "from-rose-600 to-rose-300",
    muted: "from-white/30 to-white/60",
  };
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 w-full overflow-hidden bg-white/10">
      <div
        className={cn("h-full bg-gradient-to-r transition-all", bar[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function MpAlert({ kind, children }: { kind: "error" | "notice"; children: ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "border-l-2 px-3 py-2 text-[10px] uppercase tracking-wider",
        kind === "error"
          ? "border-rose-400 bg-rose-400/5 text-rose-200"
          : "border-cyan-300 bg-cyan-400/5 text-cyan-100",
      )}
    >
      {children}
    </p>
  );
}

export function MpTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: string; icon: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div
      role="tablist"
      className="grid grid-cols-3 gap-1 border border-cyan-400/20 bg-[#070814]/80 p-1"
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative flex min-w-0 flex-col items-center gap-1 px-2 py-2.5 text-[8px] font-bold uppercase tracking-[0.14em] transition sm:flex-row sm:justify-center sm:text-[9px]",
              selected
                ? "bg-gradient-to-b from-cyan-400/20 to-fuchsia-500/10 text-white shadow-[inset_0_-2px_0_#00f0ff]"
                : "text-white/45 hover:bg-white/5 hover:text-white/80",
            )}
          >
            <span className="text-sm leading-none">{tab.icon}</span>
            <span className="truncate">{tab.label}</span>
            {tab.count ? (
              <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-fuchsia-500 px-1 text-[8px] text-white">
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export const roleLabel: Record<string, string> = {
  lider: "LÍDER",
  teniente: "TENIENTE",
  miembro: "MIEMBRO",
};

export const roleTone: Record<string, Tone> = {
  lider: "amber",
  teniente: "fuchsia",
  miembro: "cyan",
};
