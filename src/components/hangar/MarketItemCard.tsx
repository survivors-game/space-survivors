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
    <div className="grid h-28 place-items-center border border-cyan-500/15 bg-[#070814]/70">
      {src ? (
        <img
          src={src}
          alt=""
          className="h-24 max-w-[80%] object-contain [image-rendering:pixelated]"
        />
      ) : (
        // Type icons are the documented fallback when an item has no sprite assignment.
        <Icon aria-label={`Ícono de ${TYPE_LABELS[item.tipo]}`} className="size-12 text-cyan-200" />
      )}
    </div>
  );
}

export function MarketItemCard({ item, status }: { item: MarketItem; status?: string }) {
  return (
    <article className="flex min-w-0 flex-col border border-cyan-500/25 bg-[#0b0d1c]/85 p-4 shadow-[inset_0_0_24px_#00f0ff08]">
      <ItemImage item={item} />
      <div className="mt-4 flex items-start justify-between gap-3">
        <h3 className="text-xs font-black uppercase tracking-[0.13em] text-white">{item.nombre}</h3>
        <span className="border border-cyan-400/25 bg-cyan-400/[0.07] px-2 py-1 text-[8px] font-bold uppercase tracking-widest text-cyan-100">
          {status ?? TYPE_LABELS[item.tipo]}
        </span>
      </div>
      <p className="mt-3 min-h-8 text-[10px] leading-5 text-white/50">{item.efecto}</p>
      <p className="mt-3 text-[9px] uppercase tracking-widest text-white/55">
        VENDEDOR · {item.vendedor}
      </p>
      <p className="font-arcade mt-4 text-[10px] tabular-nums text-[#ffd700] drop-shadow-[0_0_12px_#ffd70030]">
        {item.precioSol.toFixed(2)} SOL
      </p>
      <Button
        disabled
        variant="outline"
        className="font-arcade mt-4 h-11 w-full rounded-none border-white/10 text-[8px] uppercase tracking-widest text-white/35"
      >
        PRÓXIMAMENTE
      </Button>
    </article>
  );
}
