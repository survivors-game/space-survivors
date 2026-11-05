import { useEffect, useState } from "react";
import { Heart, Magnet, Rocket, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type MarketItem, type MarketItemType } from "@/game/data/market";
import { spriteUrl } from "@/game/sprites";

const TYPE_LABELS: Record<MarketItemType, string> = {
  nave: "NAVE",
  iman: "IMÁN",
  regeneracion: "REGENERACIÓN",
};
const TYPE_ICONS: Record<MarketItemType, LucideIcon> = {
  nave: Rocket,
  iman: Magnet,
  regeneracion: Heart,
};
const ITEM_SPRITES: Record<string, string> = {
  "nave-espectro": "ship_spectre",
  "nave-bastion": "ship_bastion",
  "iman-cuantico": "ic_magnet",
  "iman-estelar": "ic_magnet",
  "nanobots-regenerativos": "ic_regen",
};

function ItemImage({ item }: { item: MarketItem }) {
  const [src, setSrc] = useState<string>();
  const Icon = TYPE_ICONS[item.tipo];
  const sprite = ITEM_SPRITES[item.id];

  useEffect(() => {
    if (sprite) setSrc(spriteUrl(sprite));
  }, [sprite]);

  return (
    <div className="grid size-full place-items-center bg-[#070814]/70">
      {src ? (
        <img src={src} alt="" className="size-full object-contain [image-rendering:pixelated]" />
      ) : (
        // Type icons are the documented fallback when an item has no sprite assignment.
        <Icon aria-label={`Ícono de ${TYPE_LABELS[item.tipo]}`} className="size-6 text-cyan-200" />
      )}
    </div>
  );
}

export function MarketItemCard({ item, status }: { item: MarketItem; status?: string }) {
  return (
    <article className="flex min-h-14 min-w-0 items-center gap-2 border-b border-white/10 px-1 py-1.5">
      <div className="size-10 shrink-0 overflow-hidden border border-cyan-400/35 bg-[#0b0d1c]">
        <ItemImage item={item} />
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <h3 className="font-arcade truncate text-[7px] uppercase tracking-wide text-white md:text-[8px]">
          {item.nombre}
        </h3>
        <p className="mt-1 truncate text-[7px] text-white/50 md:text-[9px]">
          <span className="text-cyan-100/70">{TYPE_LABELS[item.tipo]}</span>
          {status ? <span className="text-[#ff9ab9]"> · {status}</span> : null}
          <span>
            {" "}
            · {item.efecto} · {item.vendedor}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="font-arcade whitespace-nowrap text-right text-[7px] tabular-nums text-[#ffd700] drop-shadow-[0_0_8px_#ffd70030] md:text-[9px]">
          {item.precioSol.toFixed(2)} SOL
        </span>
        <Button
          disabled
          variant="outline"
          className="font-arcade h-11 min-w-0 rounded-none border-white/10 px-1 text-[6px] uppercase tracking-normal text-white/35 md:px-2 md:text-[7px]"
        >
          PRÓXIMAMENTE
        </Button>
      </div>
    </article>
  );
}
