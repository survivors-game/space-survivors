import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MARKET_MIN_PRICE_SOL, MOCK_MY_MARKET_INVENTORY } from "@/game/data/market";

export function MarketSell() {
  const [itemId, setItemId] = useState(MOCK_MY_MARKET_INVENTORY[0]?.id ?? "");
  const [price, setPrice] = useState(MARKET_MIN_PRICE_SOL.toString());
  const numericPrice = Number(price);
  const invalid =
    price.trim() === "" || !Number.isFinite(numericPrice) || numericPrice < MARKET_MIN_PRICE_SOL;

  return (
    <section className="max-w-2xl border border-cyan-500/20 bg-[#0b0d1c]/70 p-4 sm:p-6">
      <h2 className="font-arcade text-[9px] uppercase tracking-widest text-cyan-100">
        PUBLICAR OBJETO
      </h2>
      <div className="mt-5 grid gap-4">
        <label className="flex flex-col gap-2 text-[9px] uppercase tracking-widest text-white/45">
          OBJETO DEL INVENTARIO
          <select
            value={itemId}
            onChange={(event) => setItemId(event.target.value)}
            className="h-11 border border-white/15 bg-[#0b0d1c] px-3 text-xs text-white outline-none focus:border-cyan-300/70"
          >
            {MOCK_MY_MARKET_INVENTORY.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-[9px] uppercase tracking-widest text-white/45">
          PRECIO MÍNIMO (SOL)
          <input
            type="number"
            min={MARKET_MIN_PRICE_SOL}
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            className="h-11 border border-white/15 bg-[#0b0d1c] px-3 text-xs text-[#ffd700] outline-none focus:border-cyan-300/70"
          />
        </label>
        {invalid ? (
          <p role="alert" className="text-[10px] uppercase tracking-wider text-[#ff9ab9]">
            {price.trim() === "" || !Number.isFinite(numericPrice)
              ? "Introduce un precio válido en SOL."
              : `El precio no puede ser menor que ${MARKET_MIN_PRICE_SOL.toFixed(2)} SOL.`}
          </p>
        ) : null}
        <p className="text-[9px] uppercase tracking-widest text-white/40">
          PRECIO MÍNIMO PERMITIDO · {MARKET_MIN_PRICE_SOL.toFixed(2)} SOL
        </p>
        <Button
          disabled
          variant="outline"
          className="font-arcade h-11 rounded-none border-white/10 text-[8px] uppercase tracking-widest text-white/35"
        >
          PRÓXIMAMENTE
        </Button>
      </div>
    </section>
  );
}
