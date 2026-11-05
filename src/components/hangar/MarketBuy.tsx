import { useMemo, useState } from "react";
import { MARKET_ITEMS, MARKET_RECENT_IDS } from "@/game/data/market";
import { MarketItemCard } from "@/components/hangar/MarketItemCard";

type MarketSort = "asc" | "desc" | "recent";

export function MarketBuy() {
  const [query, setQuery] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<MarketSort>("recent");
  const items = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return MARKET_ITEMS.filter(
      (item) =>
        item.nombre.toLocaleLowerCase().includes(search) &&
        (minPrice === "" || item.precioSol >= Number(minPrice)) &&
        (maxPrice === "" || item.precioSol <= Number(maxPrice)),
    ).sort((a, b) =>
      sort === "asc"
        ? a.precioSol - b.precioSol
        : sort === "desc"
          ? b.precioSol - a.precioSol
          : MARKET_RECENT_IDS.indexOf(a.id) - MARKET_RECENT_IDS.indexOf(b.id),
    );
  }, [query, minPrice, maxPrice, sort]);

  return (
    <section>
      <div className="mb-5 grid gap-3 border border-cyan-500/20 bg-[#0b0d1c]/70 p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="flex flex-col gap-2 text-[9px] uppercase tracking-widest text-white/45">
          BUSCAR POR NOMBRE
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-11 min-w-0 border border-white/15 bg-[#0b0d1c] px-3 text-xs text-white outline-none focus:border-cyan-300/70"
          />
        </label>
        <label className="flex flex-col gap-2 text-[9px] uppercase tracking-widest text-white/45">
          PRECIO MÍNIMO (SOL)
          <input
            type="number"
            min="0"
            step="0.01"
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value)}
            className="h-11 min-w-0 border border-white/15 bg-[#0b0d1c] px-3 text-xs text-white outline-none focus:border-cyan-300/70"
          />
        </label>
        <label className="flex flex-col gap-2 text-[9px] uppercase tracking-widest text-white/45">
          PRECIO MÁXIMO (SOL)
          <input
            type="number"
            min="0"
            step="0.01"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
            className="h-11 min-w-0 border border-white/15 bg-[#0b0d1c] px-3 text-xs text-white outline-none focus:border-cyan-300/70"
          />
        </label>
        <label className="flex flex-col gap-2 text-[9px] uppercase tracking-widest text-white/45">
          ORDENAR
          <select
            value={sort}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "asc" || value === "desc" || value === "recent") setSort(value);
            }}
            className="h-11 min-w-0 border border-white/15 bg-[#0b0d1c] px-3 text-xs text-white outline-none focus:border-cyan-300/70"
          >
            <option value="asc">PRECIO ASCENDENTE</option>
            <option value="desc">PRECIO DESCENDENTE</option>
            <option value="recent">MÁS RECIENTES</option>
          </select>
        </label>
      </div>
      {items.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <MarketItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <p className="border border-dashed border-cyan-400/20 p-8 text-center text-[10px] uppercase tracking-widest text-white/45">
          No hay objetos que coincidan con los filtros.
        </p>
      )}
    </section>
  );
}
