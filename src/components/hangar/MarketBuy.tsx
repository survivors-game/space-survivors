import { useMemo, useState } from "react";
import { MARKET_ITEMS, MARKET_RECENT_IDS } from "@/game/data/market";
import { MarketItemCard } from "@/components/hangar/MarketItemCard";

type MarketSort = "asc" | "desc" | "recent";

export function MarketBuy() {
  const [query, setQuery] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sort, setSort] = useState<MarketSort>("recent");
  const [page, setPage] = useState(1);
  const pageSize = 25;
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
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const visibleItems = items.slice((page - 1) * pageSize, page * pageSize);

  return (
    <section>
      <div className="mb-5 grid gap-3 border border-cyan-500/20 bg-[#0b0d1c]/70 p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="flex flex-col gap-2 text-[9px] uppercase tracking-widest text-white/45">
          BUSCAR POR NOMBRE
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
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
            onChange={(event) => {
              setMinPrice(event.target.value);
              setPage(1);
            }}
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
            onChange={(event) => {
              setMaxPrice(event.target.value);
              setPage(1);
            }}
            className="h-11 min-w-0 border border-white/15 bg-[#0b0d1c] px-3 text-xs text-white outline-none focus:border-cyan-300/70"
          />
        </label>
        <label className="flex flex-col gap-2 text-[9px] uppercase tracking-widest text-white/45">
          ORDENAR
          <select
            value={sort}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "asc" || value === "desc" || value === "recent") {
                setSort(value);
                setPage(1);
              }
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
        <div>
          {visibleItems.map((item) => (
            <MarketItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <p className="border border-dashed border-cyan-400/20 p-8 text-center text-[10px] uppercase tracking-widest text-white/45">
          No hay objetos que coincidan con los filtros.
        </p>
      )}
      <nav
        aria-label="Paginación del mercado"
        className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3"
      >
        <button
          type="button"
          disabled={page === 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          className="min-h-11 border border-cyan-400/30 px-3 text-[9px] font-bold uppercase tracking-widest text-cyan-100 transition hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
        >
          ANTERIOR
        </button>
        <span aria-live="polite" className="text-[9px] uppercase tracking-widest text-white/55">
          PÁGINA {page} / {pageCount} · {items.length} OBJETOS
        </span>
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
          className="min-h-11 border border-cyan-400/30 px-3 text-[9px] font-bold uppercase tracking-widest text-cyan-100 transition hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:border-white/10 disabled:text-white/30"
        >
          SIGUIENTE
        </button>
      </nav>
    </section>
  );
}
