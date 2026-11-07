import { useEffect, useState } from "react";
import { WEAPONS } from "@/game/data/weapons";
import { spriteUrl } from "@/game/sprites";
import type { HudState } from "@/game/types";

/** Orden fijo de las 9 mejoras activas en la barra. */
const SLOT_IDS = [
  "laser",
  "spread",
  "missile",
  "drones",
  "plasma",
  "field",
  "shield",
  "nova",
  "arc",
];

interface WeaponHotbarProps {
  weapons: HudState["weapons"] | undefined;
}

/** Barra superior con las 9 mejoras activas: iluminadas si el jugador las tiene, atenuadas si no. */
export function WeaponHotbar({ weapons }: WeaponHotbarProps) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    setUrls(Object.fromEntries(WEAPONS.map((w) => [w.icon, spriteUrl(w.icon, 3)])));
  }, []);

  return (
    <div
      aria-label="Mejoras activas"
      className="pointer-events-none absolute left-1/2 top-[5.25rem] xl:top-2 z-20 flex -translate-x-1/2 gap-1 sm:gap-1.5"
    >
      {SLOT_IDS.map((id) => {
        const def = WEAPONS.find((w) => w.id === id);
        const owned = weapons?.find((w) => w.id === id);
        const src = def ? urls[def.icon] : undefined;

        return (
          <div
            key={id}
            className={`relative grid size-8 place-items-center overflow-hidden rounded-full border bg-[#070814]/55 sm:size-11 ${
              owned ? "border-cyan-300/70 shadow-[0_0_12px_#22f7ff88]" : "border-white/10"
            }`}
          >
            {src ? (
              <img
                src={src}
                alt=""
                className={`size-5 object-contain [image-rendering:pixelated] sm:size-7 -translate-y-[3px] sm:-translate-y-[5px] ${
                  owned ? "" : "grayscale brightness-[0.3] opacity-40"
                }`}
              />
            ) : null}
            {owned ? (
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 font-arcade text-[8px] leading-none text-white drop-shadow-[0_0_2px_#000]">
                {owned.level}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
