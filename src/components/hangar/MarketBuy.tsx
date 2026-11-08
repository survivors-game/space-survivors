import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  P2P_FEE_OBSIDIAN,
  type P2PPurchaseOrder,
  type P2PPublicListing,
  type P2PPayMethod,
  type P2PItemType,
} from "@/game/data/market";

type ListingSort = "newest" | "price_asc" | "price_desc";

interface MarketBuyProps {
  listings: P2PPublicListing[];
  page: number;
  pages: number;
  isLoading: boolean;
  onLoadListings: (page: number, itemType: P2PItemType | "", sort: ListingSort) => Promise<void>;
  onBuy: (listingId: string) => Promise<P2PPurchaseOrder>;
  onConfirm: (orderId: string) => Promise<void>;
  onCancel: (orderId: string) => Promise<void>;
}

const METHOD_LABELS: Record<P2PPayMethod, string> = {
  NEQUI: "NEQUI",
  DAVIPLATA: "DAVIPLATA",
  TRANSFERENCIA: "TRANSFERENCIA BANCARIA",
  PAYPAL: "PAYPAL",
};

export function MarketBuy({
  listings,
  page,
  pages,
  isLoading,
  onLoadListings,
  onBuy,
  onConfirm,
  onCancel,
}: MarketBuyProps) {
  const [itemType, setItemType] = useState<P2PItemType | "">("");
  const [sort, setSort] = useState<ListingSort>("newest");
  const [busyListing, setBusyListing] = useState("");
  const [busyOrder, setBusyOrder] = useState(false);
  const [order, setOrder] = useState<P2PPurchaseOrder | null>(null);
  const [error, setError] = useState("");

  const loadPage = useCallback(
    async (targetPage: number) => {
      setError("");
      try {
        await onLoadListings(targetPage, itemType, sort);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "No se pudieron cargar los anuncios.");
      }
    },
    [itemType, onLoadListings, sort],
  );

  useEffect(() => {
    void loadPage(1);
  }, [loadPage]);

  const buy = async (listingId: string) => {
    setBusyListing(listingId);
    setError("");
    try {
      setOrder(await onBuy(listingId));
      await loadPage(page);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo iniciar la compra.");
    } finally {
      setBusyListing("");
    }
  };

  const finishOrder = async (action: (orderId: string) => Promise<void>) => {
    if (!order) return;
    setBusyOrder(true);
    setError("");
    try {
      await action(order.order_id);
      setOrder(null);
      await loadPage(page);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo actualizar la orden.");
    } finally {
      setBusyOrder(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border border-cyan-500/20 bg-[#0b0d1c]/70 p-4">
        <div>
          <h2 className="font-arcade text-[9px] uppercase tracking-widest text-cyan-100">
            ANUNCIOS DEL MERCADO
          </h2>
          <p className="mt-2 text-[8px] uppercase tracking-widest text-white/40">
            COMISIÓN DE COMPRA · {P2P_FEE_OBSIDIAN.purchase} OBS · NO REEMBOLSABLE
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor="market-item-type">
            Filtrar por tipo
          </label>
          <select
            id="market-item-type"
            value={itemType}
            onChange={(event) => {
              const next = event.target.value;
              if (next === "" || next === "nave" || next === "objeto") setItemType(next);
            }}
            className="h-10 border border-white/15 bg-[#0b0d1c] px-3 text-[9px] uppercase text-white"
          >
            <option value="">TODOS LOS ARTÍCULOS</option>
            <option value="nave">NAVES</option>
            <option value="objeto">OBJETOS</option>
          </select>
          <label className="sr-only" htmlFor="market-sort">
            Ordenar anuncios
          </label>
          <select
            id="market-sort"
            value={sort}
            onChange={(event) => {
              const next = event.target.value;
              if (next === "newest" || next === "price_asc" || next === "price_desc") {
                setSort(next);
              }
            }}
            className="h-10 border border-white/15 bg-[#0b0d1c] px-3 text-[9px] uppercase text-white"
          >
            <option value="newest">MÁS RECIENTES</option>
            <option value="price_asc">PRECIO: MENOR A MAYOR</option>
            <option value="price_desc">PRECIO: MAYOR A MENOR</option>
          </select>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="border border-[#ff0055]/25 p-3 text-[9px] uppercase text-[#ff9ab9]"
        >
          {error}
        </p>
      ) : null}

      {order ? (
        <article className="space-y-3 border border-[#ffd700]/30 bg-[#ffd700]/[0.04] p-4">
          <h3 className="font-arcade text-[8px] uppercase tracking-widest text-[#ffd700]">
            ORDEN PENDIENTE · {order.order_id}
          </h3>
          <p className="text-[9px] uppercase text-white/65">
            Transfiere el pago al vendedor y confirma solo cuando lo hayas realizado.
          </p>
          <p className="text-[9px] uppercase text-cyan-100">
            MÉTODOS · {order.payment_methods.map((method) => METHOD_LABELS[method]).join(" · ")}
          </p>
          <p className="break-words text-xs text-white">{order.payment_details}</p>
          <p className="font-arcade text-[9px] text-[#ffd700]">
            {order.price.toLocaleString()} {order.price_currency} · COMISIÓN PAGADA:{" "}
            {order.commission_obsidian} OBS
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busyOrder}
              onClick={() => void finishOrder(onConfirm)}
              className="rounded-none bg-cyan-300 text-[8px] font-bold uppercase text-[#070814] hover:bg-cyan-200"
            >
              CONFIRMAR COMPRA
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busyOrder}
              onClick={() => void finishOrder(onCancel)}
              className="rounded-none border-[#ff0055]/35 text-[8px] uppercase text-[#ff9ab9]"
            >
              CANCELAR ORDEN · SIN REEMBOLSO
            </Button>
          </div>
        </article>
      ) : null}

      {isLoading && !listings.length ? (
        <p className="border border-cyan-500/20 p-8 text-center text-[10px] uppercase text-white/45">
          CARGANDO ANUNCIOS...
        </p>
      ) : listings.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing) => (
            <article
              key={listing.listing_id}
              className="border border-cyan-500/20 bg-[#0b0d1c]/70 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-arcade truncate text-[8px] uppercase text-white">
                    {listing.item_name}
                  </h3>
                  <p className="mt-2 text-[8px] uppercase tracking-widest text-white/45">
                    {listing.item_type} · VENDEDOR: {listing.seller_callsign}
                  </p>
                </div>
                <span className="font-arcade whitespace-nowrap text-[8px] text-[#ffd700]">
                  {listing.price.toLocaleString()} {listing.price_currency}
                </span>
              </div>
              <Button
                type="button"
                disabled={isLoading || !!busyListing || !!order}
                onClick={() => void buy(listing.listing_id)}
                className="mt-4 w-full rounded-none bg-cyan-300 text-[8px] font-bold uppercase text-[#070814] hover:bg-cyan-200"
              >
                {busyListing === listing.listing_id ? "CREANDO ORDEN..." : "COMPRAR · 1 OBS"}
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <p className="border border-dashed border-cyan-400/20 p-8 text-center text-[10px] uppercase tracking-widest text-white/45">
          NO HAY ANUNCIOS ACTIVOS PARA ESTE FILTRO.
        </p>
      )}

      <div className="flex items-center justify-between border border-white/10 p-3 text-[9px] uppercase text-white/55">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1 || isLoading}
          onClick={() => void loadPage(page - 1)}
          className="h-9 rounded-none border-white/15 text-[8px] uppercase"
        >
          ANTERIOR
        </Button>
        <span>
          PÁGINA {page} / {Math.max(1, pages)}
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={page >= pages || isLoading}
          onClick={() => void loadPage(page + 1)}
          className="h-9 rounded-none border-white/15 text-[8px] uppercase"
        >
          SIGUIENTE
        </Button>
      </div>
    </section>
  );
}
