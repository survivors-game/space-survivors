import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MARKET_ITEMS,
  MARKET_MIN_PRICE_SOL,
  MOCK_MY_MARKET_INVENTORY,
  type MarketItem,
  type MarketItemType,
} from "@/game/data/market";

const TYPE_LABELS: Record<MarketItemType, string> = {
  nave: "NAVE",
  iman: "IMÁN",
  regeneracion: "REGENERACIÓN",
};

function MarketItemCard({ item, inventory = false }: { item: MarketItem; inventory?: boolean }) {
  return (
    <article className="flex min-h-56 flex-col border border-cyan-500/25 bg-[#0b0d1c]/85 p-4 shadow-[inset_0_0_24px_#00f0ff08]">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xs font-black uppercase tracking-[0.13em] text-white">{item.nombre}</h3>
        <span className="border border-cyan-400/25 bg-cyan-400/[0.07] px-2 py-1 text-[8px] font-bold uppercase tracking-widest text-cyan-100">
          {TYPE_LABELS[item.tipo]}
        </span>
      </div>
      <p className="mt-3 min-h-8 text-[10px] leading-5 text-white/50">{item.efecto}</p>
      <div className="mt-4 flex items-center justify-between border-y border-white/10 py-3 text-[9px] uppercase tracking-widest">
        <span className="text-white/40">{inventory ? "PROPIETARIO" : "VENDEDOR"}</span>
        <span className="text-white/70">{item.vendedor}</span>
      </div>
      <p className="font-arcade mt-4 text-[10px] tabular-nums text-[#ffd700] drop-shadow-[0_0_12px_#ffd70030]">
        {item.precioSol.toFixed(2)} SOL
      </p>
      <Button
        disabled
        variant="outline"
        className="font-arcade mt-auto h-10 w-full rounded-none border-white/10 text-[8px] uppercase tracking-widest text-white/35"
      >
        {inventory ? "LISTAR" : "PRÓXIMAMENTE"}
      </Button>
    </article>
  );
}

export function MarketSection() {
  const [demoWallet, setDemoWallet] = useState(false);

  return (
    <div className="mt-6 space-y-8">
      <section className="flex flex-wrap items-center justify-between gap-4 border border-cyan-500/20 bg-[#0b0d1c]/70 p-4">
        <div>
          <h2 className="font-arcade text-[9px] uppercase tracking-[0.12em] text-cyan-100">
            MERCADO DE FLOTA
          </h2>
          <p className="mt-2 text-[9px] uppercase tracking-widest text-white/40">
            PRECIO MÍNIMO · {MARKET_MIN_PRICE_SOL.toFixed(2)} SOL
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Button
            type="button"
            aria-pressed={demoWallet}
            onClick={() => setDemoWallet((connected) => !connected)}
            className={`font-arcade h-12 rounded-none border px-4 text-[8px] uppercase tracking-widest ${demoWallet ? "border-cyan-300/70 bg-cyan-300/10 text-cyan-100 shadow-[0_0_18px_#00f0ff18]" : "border-cyan-400/40 bg-transparent text-cyan-100 hover:bg-cyan-300/10"}`}
          >
            {demoWallet ? "MODO DEMO ACTIVADO" : "CONECTAR WALLET"}
          </Button>
          {demoWallet ? (
            <p role="status" className="text-[8px] uppercase tracking-widest text-white/40">
              SIMULACIÓN VISUAL · SIN CONEXIÓN REAL
            </p>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
          OBJETOS EN VENTA
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {MARKET_ITEMS.map((item) => (
            <MarketItemCard key={item.id} item={item} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-[#ff9ab9]">
          MIS LISTADOS
        </h2>
        <p className="mb-4 text-[9px] uppercase tracking-widest text-white/40">
          INVENTARIO DE DEMOSTRACIÓN
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {MOCK_MY_MARKET_INVENTORY.map((item) => (
            <MarketItemCard key={item.id} item={item} inventory />
          ))}
        </div>
      </section>
    </div>
  );
}
