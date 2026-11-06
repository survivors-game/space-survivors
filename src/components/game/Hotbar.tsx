import { useEffect, useState } from "react";
import { HOTBAR_SLOTS, ITEMS } from "@/game/data/items";
import { spriteUrl } from "@/game/sprites";
import type { PickupKind } from "@/game/types";

interface Props {
  inventory: Record<PickupKind, number> | undefined;
  onUse: (kind: PickupKind) => unknown;
}

export function Hotbar({ inventory, onUse }: Props) {
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    setUrls(Object.fromEntries(ITEMS.map((i) => [i.sprite, spriteUrl(i.sprite, 3)])));
  }, []);

  const slots = Array.from({ length: HOTBAR_SLOTS }, (_, i) => ITEMS[i] ?? null);

  return (
    <div
      className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 gap-1 border border-cyan-300/15 bg-[#070814]/45 p-1"
      aria-label="Barra rápida de objetos"
    >
      {slots.map((item, i) => {
        if (!item) {
          return (
            <div
              key={`empty-${i}`}
              aria-hidden
              className="size-9 border border-white/10 bg-[#070814]/40"
            />
          );
        }
        const qty = inventory?.[item.kind] ?? 0;
        const src = urls[item.sprite];
        return (
          <button
            key={item.kind}
            type="button"
            title={`${item.label} (${qty})`}
            aria-label={`Activar ${item.label}, quedan ${qty}`}
            disabled={qty <= 0}
            onClick={(e) => {
              e.stopPropagation();
              onUse(item.kind);
            }}
            className="relative grid size-9 place-items-center border bg-[#070814]/70 transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-35"
            style={{
              borderColor: qty > 0 ? item.color : "rgba(255,255,255,0.15)",
              boxShadow: qty > 0 ? `0 0 8px ${item.color}55` : "none",
            }}
          >
            {src ? (
              <img src={src} alt="" className="size-6 object-contain [image-rendering:pixelated]" />
            ) : null}
            <span className="absolute bottom-0 right-0.5 font-arcade text-[7px] leading-none text-white drop-shadow-[0_0_2px_#000]">
              {qty}
            </span>
          </button>
        );
      })}
    </div>
  );
}
