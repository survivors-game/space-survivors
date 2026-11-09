import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Procedural pixel-art sprites for the war room (presentation only, no game logic). */

const PALETTES: [string, string, string][] = [
  ["#00f0ff", "#7c3aed", "#e0fbff"],
  ["#ff4df0", "#3b82f6", "#ffe0fb"],
  ["#a78bfa", "#06b6d4", "#f5f3ff"],
  ["#22d3ee", "#db2777", "#ecfeff"],
];

// 9x9 pixel ship hulls (swept-wing, non-triangular). 1=hull 2=accent 3=cockpit
const HULLS = [
  [
    "....3....",
    "...131...",
    "..21112..",
    ".2211122.",
    "221.1.122",
    "2211.1122",
    ".22.1.22.",
    "..2...2..",
    ".........",
  ],
  [
    "...232...",
    "..21312..",
    "2.11111.2",
    "221111122",
    "22.111.22",
    "2..121..2",
    "...2.2...",
    "..2...2..",
    ".........",
  ],
  [
    "....1....",
    "..21312..",
    ".2211122.",
    "22111.122",
    "2.21112.2",
    "..2.1.2..",
    ".22...22.",
    ".........",
    ".........",
  ],
];

function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function ShipSprite({
  seed,
  size = 36,
  destroyed = false,
  className,
}: {
  seed: string;
  size?: number;
  destroyed?: boolean;
  className?: string;
}) {
  const h = hash(seed);
  const hull = HULLS[h % HULLS.length] ?? HULLS[0]!;
  const [c1, c2, c3] = PALETTES[(h >> 3) % PALETTES.length] ?? PALETTES[0]!;
  const colors: Record<string, string> = { "1": c1, "2": c2, "3": c3 };
  return (
    <svg
      viewBox="0 0 9 9"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      aria-hidden
      className={cn(
        "shrink-0",
        destroyed ? "opacity-40 grayscale" : "drop-shadow-[0_0_6px_rgba(0,240,255,0.55)]",
        className,
      )}
    >
      {hull.flatMap((row, y) =>
        row.split("").map((cell, x) =>
          colors[cell] ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colors[cell]} />
          ) : null,
        ),
      )}
      {!destroyed ? <rect x={4} y={8} width={1} height={1} fill="#fde047" opacity={0.9} /> : null}
    </svg>
  );
}

/** Pixel avatar frame with hex clip and status LED. */
export function PilotAvatar({ seed, alive }: { seed: string; alive: boolean }) {
  return (
    <div className="relative grid h-11 w-11 shrink-0 place-items-center bg-gradient-to-br from-cyan-400/25 to-fuchsia-600/25 [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]">
      <div className="absolute inset-[2px] bg-[#070814] [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]" />
      <ShipSprite seed={seed} size={28} destroyed={!alive} className="relative" />
      <span
        className={cn(
          "absolute bottom-1 right-1.5 h-1.5 w-1.5 rounded-full",
          alive ? "bg-emerald-300 shadow-[0_0_6px_#34d399]" : "bg-rose-400",
        )}
      />
    </div>
  );
}

/** Horde progress as 10 segmented cells. */
export function HordeTrack({ current, total = 10 }: { current: number; total?: number }) {
  return (
    <div className="grid grid-cols-10 gap-1">
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "now" : "next";
        return (
          <div key={n} className="min-w-0">
            <div
              className={cn(
                "h-2.5 skew-x-[-20deg]",
                state === "done" && "bg-gradient-to-r from-cyan-400 to-fuchsia-400",
                state === "now" && "animate-pulse bg-amber-300 shadow-[0_0_10px_#fbbf24]",
                state === "next" && "bg-white/10",
              )}
            />
            <p
              className={cn(
                "mt-1 text-center text-[7px] font-bold tabular-nums",
                state === "now" ? "text-amber-200" : "text-white/30",
              )}
            >
              {n}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** Segmented HP bar. */
export function HpBar({ percent, alive }: { percent: number; alive: boolean }) {
  const filled = Math.round(Math.max(0, Math.min(100, percent)) / 10);
  const color = !alive
    ? "bg-rose-500/70"
    : percent > 60
      ? "bg-emerald-300"
      : percent > 30
        ? "bg-amber-300"
        : "bg-rose-400";
  return (
    <div className="flex gap-[2px]">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={cn("h-1.5 flex-1", i < filled ? color : "bg-white/10")} />
      ))}
    </div>
  );
}

/** Elapsed mission clock since a timestamp (visual only). */
export function WarClock({ since, label }: { since: number; label: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const ms = since > 1e12 ? since : since * 1000;
  const secs = now ? Math.max(0, Math.floor((now - ms) / 1000)) : 0;
  const hh = Math.floor(secs / 3600);
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return (
    <div className="min-w-0 border border-cyan-300/30 bg-[#050712] px-3 py-1.5 text-center shadow-[inset_0_0_12px_rgba(0,240,255,0.15)]">
      <p className="text-[7px] uppercase tracking-[0.25em] text-cyan-200/55">{label}</p>
      <p className="font-mono text-base font-black tabular-nums tracking-widest text-cyan-100 [text-shadow:0_0_8px_#00f0ff] sm:text-lg">
        {hh > 0 ? `${hh}:` : ""}
        {mm}:{ss}
      </p>
    </div>
  );
}
