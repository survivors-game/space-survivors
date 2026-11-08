import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { INVENTORY_CATALOG_BY_ID } from "@/game/data/items";
import { SHIPS } from "@/game/data/ships";
import { spriteUrl } from "@/game/sprites";
import type { P2PInventoryItem } from "@/game/data/market";

export function InventorySection({
  inventory,
  selectedShipId,
}: {
  inventory: P2PInventoryItem[];
  selectedShipId: string;
}) {
  const [sprites, setSprites] = useState<Record<string, string>>({});
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const item of inventory) {
      const ship =
        item.itemType === "nave"
          ? SHIPS.find((candidate) => candidate.id === item.itemId)
          : undefined;
      const sprite = ship?.sprite ?? INVENTORY_CATALOG_BY_ID[item.itemId]?.sprite;
      if (sprite) {
        try {
          next[item.id] = spriteUrl(sprite, 4);
        } catch {
          /* Art for a future item can be added later. */
        }
      }
    }
    setSprites(next);
  }, [inventory]);

  if (!inventory.length) {
    return (
      <section className="border border-cyan-500/20 bg-[#0b0d1c]/70 p-6 text-center text-xs uppercase tracking-widest text-white/45">
        EL INVENTARIO ESTÁ VACÍO
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between border-b border-cyan-500/20 pb-3">
        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-cyan-100">
          INVENTARIO DEL PILOTO
        </h2>
        <span className="text-[9px] uppercase tracking-widest text-white/40">
          {inventory.length} artículos
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {inventory.map((item) => {
          const ship =
            item.itemType === "nave"
              ? SHIPS.find((candidate) => candidate.id === item.itemId)
              : undefined;
          const catalog = INVENTORY_CATALOG_BY_ID[item.itemId];
          const name = ship?.name ?? catalog?.label ?? item.itemName;
          const description =
            ship?.desc ??
            catalog?.description ??
            "Artículo del inventario. La ficha se puede ampliar desde el catálogo central.";
          const active = item.itemType === "nave" && item.itemId === selectedShipId;
          return (
            <article
              key={item.id}
              className="flex min-h-28 items-center gap-3 border border-cyan-500/20 bg-[#0b0d1c]/80 p-3"
            >
              <div className="grid size-16 shrink-0 place-items-center border border-cyan-300/15 bg-[#070814]/70">
                {sprites[item.id] ? (
                  <img
                    src={sprites[item.id]}
                    alt=""
                    className="max-h-14 max-w-14 object-contain [image-rendering:pixelated]"
                  />
                ) : (
                  <Package className="size-7 text-cyan-100/40" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[10px] font-black uppercase tracking-wider text-cyan-100">
                  {name}
                </h3>
                <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-white/45">
                  {description}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-[8px] font-bold uppercase tracking-widest">
                  <span className="text-[#ffd700]">×{item.quantity}</span>
                  <span className={item.isLocked ? "text-[#ff9ab9]" : "text-[#7dff4f]"}>
                    {item.isLocked ? "PUBLICADO / RESERVADO" : "DISPONIBLE"}
                  </span>
                  {active ? <span className="text-cyan-200">NAVE ACTIVA</span> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
