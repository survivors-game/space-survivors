import { useEffect, useState } from "react";
import { Input } from "@/game/input";

/**
 * Botón de impulso visible en PC, abajo a la izquierda. Se activa con la barra espaciadora
 * (o al pulsarlo). El anillo muestra la recarga. En pantallas táctiles no se muestra,
 * porque el botón TURBO del control táctil ya cumple esa función.
 */
export function BoostButton({ ready }: { ready: number }) {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);
  if (touch) return null;

  const pct = Math.round(Math.max(0, Math.min(1, ready)) * 100);
  const isReady = pct >= 100;
  const color = isReady ? "#00f0ff" : "#ff0055";

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex flex-col items-center gap-1.5">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Turbo"
        onPointerDown={(event) => {
          event.preventDefault();
          Input.queueBoost();
        }}
        className="pointer-events-auto grid size-16 place-items-center rounded-full transition active:scale-95"
        style={{
          background: `conic-gradient(${color} ${pct * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
          boxShadow: isReady ? "0 0 18px #00f0ff77" : "none",
        }}
      >
        <span
          className={`grid size-[84%] place-items-center rounded-full border bg-[#070814]/90 text-xs font-bold uppercase tracking-widest ${
            isReady ? "border-cyan-300/70 text-cyan-100" : "border-white/15 text-white/55"
          }`}
        >
          TURBO
        </span>
      </button>
      <span className="font-pixel text-[10px] uppercase tracking-widest text-white/80 drop-shadow-[0_1px_2px_#000]">
        ESPACIO · {isReady ? "LISTO" : `${pct}%`}
      </span>
    </div>
  );
}
