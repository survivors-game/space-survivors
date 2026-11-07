import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  P2P_FEE_OBSIDIAN,
  P2P_PAY_METHODS,
  type P2PCurrency,
  type P2PInventoryItem,
  type P2PPayMethod,
  type P2PPublishInput,
} from "@/game/data/market";

interface MarketSellProps {
  inventory: P2PInventoryItem[];
  obsidian: number | null;
  selectedShipId: string;
  isLoading: boolean;
  onPublish: (input: P2PPublishInput) => Promise<void>;
}

const METHOD_LABELS: Record<P2PPayMethod, string> = {
  NEQUI: "NEQUI",
  DAVIPLATA: "DAVIPLATA",
  TRANSFERENCIA: "TRANSFERENCIA BANCARIA",
  PAYPAL: "PAYPAL",
};

export function MarketSell({
  inventory,
  obsidian,
  selectedShipId,
  isLoading,
  onPublish,
}: MarketSellProps) {
  const sellableInventory = inventory.filter(
    (item) =>
      !item.isLocked &&
      item.quantity > 0 &&
      item.itemId !== "falcon" &&
      !(item.itemType === "nave" && item.itemId === selectedShipId),
  );
  const [inventoryId, setInventoryId] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<P2PCurrency>("COP");
  const [methods, setMethods] = useState<P2PPayMethod[]>(["NEQUI"]);
  const [paymentDetails, setPaymentDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!sellableInventory.some((item) => item.id === inventoryId)) {
      setInventoryId(sellableInventory[0]?.id ?? "");
    }
  }, [inventoryId, sellableInventory]);

  const numericPrice = Number(price);
  const invalidPrice = price.trim() === "" || !Number.isFinite(numericPrice) || numericPrice <= 0;
  const canPublish =
    !!inventoryId &&
    !invalidPrice &&
    methods.length > 0 &&
    paymentDetails.trim().length > 0 &&
    obsidian !== null &&
    obsidian >= P2P_FEE_OBSIDIAN.publish &&
    !isLoading &&
    !submitting;

  const toggleMethod = (method: P2PPayMethod) => {
    setMethods((current) =>
      current.includes(method) ? current.filter((value) => value !== method) : [...current, method],
    );
  };

  const publish = async () => {
    if (!canPublish) return;
    setSubmitting(true);
    try {
      await onPublish({
        inventoryId,
        price: numericPrice,
        currency,
        methods,
        paymentDetails: paymentDetails.trim(),
      });
      setPrice("");
      setPaymentDetails("");
    } catch {
      return;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="max-w-2xl border border-cyan-500/20 bg-[#0b0d1c]/70 p-4 sm:p-6">
      <h2 className="font-arcade text-[9px] uppercase tracking-widest text-cyan-100">
        PUBLICAR OBJETO
      </h2>
      <div className="mt-5 grid gap-4">
        <label className="flex flex-col gap-2 text-[9px] uppercase tracking-widest text-white/45">
          OBJETO DEL INVENTARIO
          <select
            value={inventoryId}
            onChange={(event) => setInventoryId(event.target.value)}
            disabled={!sellableInventory.length || isLoading}
            className="h-11 border border-white/15 bg-[#0b0d1c] px-3 text-xs text-white outline-none focus:border-cyan-300/70 disabled:text-white/35"
          >
            {sellableInventory.length ? (
              sellableInventory.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.itemName}
                  {item.quantity > 1 ? ` ×${item.quantity}` : ""}
                </option>
              ))
            ) : (
              <option value="">No hay artículos disponibles</option>
            )}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
          <label className="flex flex-col gap-2 text-[9px] uppercase tracking-widest text-white/45">
            PRECIO
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className="h-11 border border-white/15 bg-[#0b0d1c] px-3 text-xs text-[#ffd700] outline-none focus:border-cyan-300/70"
            />
          </label>
          <label className="flex flex-col gap-2 text-[9px] uppercase tracking-widest text-white/45">
            MONEDA
            <select
              value={currency}
              onChange={(event) => setCurrency(event.target.value as P2PCurrency)}
              className="h-11 border border-white/15 bg-[#0b0d1c] px-3 text-xs text-white outline-none focus:border-cyan-300/70"
            >
              <option value="COP">COP</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>
        {invalidPrice && price.trim() ? (
          <p role="alert" className="text-[10px] uppercase tracking-wider text-[#ff9ab9]">
            Introduce un precio mayor que cero.
          </p>
        ) : null}

        <fieldset className="grid gap-2">
          <legend className="mb-2 text-[9px] uppercase tracking-widest text-white/45">
            MÉTODOS DE PAGO
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {P2P_PAY_METHODS.map((method) => (
              <label
                key={method}
                className="flex min-h-10 items-center gap-2 border border-white/10 px-3 text-[9px] uppercase tracking-widest text-white/65"
              >
                <input
                  type="checkbox"
                  checked={methods.includes(method)}
                  onChange={() => toggleMethod(method)}
                  className="accent-cyan-300"
                />
                {METHOD_LABELS[method]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-2 text-[9px] uppercase tracking-widest text-white/45">
          DATOS PARA EL PAGO
          <textarea
            maxLength={500}
            value={paymentDetails}
            onChange={(event) => setPaymentDetails(event.target.value)}
            placeholder="Indica cómo completar el pago acordado."
            className="min-h-20 resize-y border border-white/15 bg-[#0b0d1c] px-3 py-2 text-xs text-white outline-none placeholder:text-white/25 focus:border-cyan-300/70"
          />
        </label>
        <p className="text-[9px] uppercase tracking-widest text-white/45">
          COMISIÓN DE PUBLICACIÓN ·{" "}
          <span className="text-[#d946ef] drop-shadow-[0_0_8px_#d946ef80]">
            {P2P_FEE_OBSIDIAN.publish} OBS
          </span>
          {" · "}SALDO DISPONIBLE ·{" "}
          <span className="text-[#d946ef] drop-shadow-[0_0_8px_#d946ef80]">
            {obsidian === null ? "--" : obsidian.toLocaleString()} OBS
          </span>
        </p>
        <Button
          type="button"
          onClick={() => void publish()}
          disabled={!canPublish}
          variant="outline"
          className="font-arcade h-11 rounded-none border-cyan-300/50 text-[8px] uppercase tracking-widest text-cyan-100 disabled:border-white/10 disabled:text-white/35"
        >
          {isLoading || submitting ? "SINCRONIZANDO..." : "PUBLICAR · 1 OBS"}
        </Button>
      </div>
    </section>
  );
}
