import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  P2P_COUNTRIES,
  P2P_FEE_OBSIDIAN,
  P2P_PRICE_LIMITS,
  P2P_USDT_NETWORKS,
  formatP2PPrice,
  parseP2PPriceToMinor,
  type P2PCountry,
  type P2PPayMethod,
  type P2PPaymentMethodChoice,
  type P2PInventoryItem,
  type P2PPublishInput,
  type P2PUsdtNetwork,
} from "@/game/data/market";

interface MarketSellProps {
  inventory: P2PInventoryItem[];
  obsidian: number | null;
  selectedShipId: string;
  isLoading: boolean;
  onPublish: (input: P2PPublishInput) => Promise<void>;
}

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
  const [country, setCountry] = useState<P2PCountry>("CO");
  const [selectedMethods, setSelectedMethods] = useState<P2PPayMethod[]>(["NEQUI"]);
  const [network, setNetwork] = useState<P2PUsdtNetwork | "">("");
  const [paymentDetails, setPaymentDetails] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!sellableInventory.some((item) => item.id === inventoryId)) {
      setInventoryId(sellableInventory[0]?.id ?? "");
    }
  }, [inventoryId, sellableInventory]);

  const config = P2P_COUNTRIES[country];
  const currency = config.currency;
  const limits = P2P_PRICE_LIMITS[currency];
  const priceMinor = parseP2PPriceToMinor(price);
  const usdtSelected = country === "OTHER" && selectedMethods.includes("USDT");
  const activeChoices: P2PPaymentMethodChoice[] = [];
  selectedMethods.forEach((method) => {
    if (method === "USDT") {
      if (network) {
        activeChoices.push({ method, network, details: paymentDetails[`USDT:${network}`] ?? "" });
      }
      return;
    }
    activeChoices.push({ method, details: paymentDetails[method] ?? "" });
  });
  const validPrice = priceMinor !== null && priceMinor >= limits.min && priceMinor <= limits.max;
  const canPublish =
    !!inventoryId &&
    validPrice &&
    activeChoices.length === selectedMethods.length &&
    activeChoices.length > 0 &&
    activeChoices.every(
      (choice) => choice.details.trim().length > 0 && choice.details.length <= 500,
    ) &&
    obsidian !== null &&
    obsidian >= P2P_FEE_OBSIDIAN.publish &&
    !isLoading &&
    !submitting;

  const toggleMethod = (method: P2PPayMethod) => {
    setSelectedMethods((current) =>
      current.includes(method) ? current.filter((value) => value !== method) : [...current, method],
    );
  };

  const publish = async () => {
    if (!canPublish || priceMinor === null) return;
    setSubmitting(true);
    try {
      await onPublish({
        inventoryId,
        country,
        priceMinor,
        paymentMethods: activeChoices.map((choice) => ({
          ...choice,
          details: choice.details.trim(),
        })),
      });
      setPrice("");
      setPaymentDetails({});
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

        <label className="flex flex-col gap-2 text-[9px] uppercase tracking-widest text-white/45">
          PAÍS
          <select
            value={country}
            onChange={(event) => {
              const next = event.target.value as P2PCountry;
              setCountry(next);
              setSelectedMethods([]);
              setPaymentDetails({});
              setNetwork("");
            }}
            className="h-11 border border-white/15 bg-[#0b0d1c] px-3 text-xs text-white outline-none focus:border-cyan-300/70"
          >
            {Object.entries(P2P_COUNTRIES).map(([code, value]) => (
              <option key={code} value={code}>
                {value.label} · {value.currency}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-[9px] uppercase tracking-widest text-white/45">
          PRECIO EN {currency} · INGRESA LA UNIDAD NATURAL
          <input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder={currency === "COP" || currency === "VES" ? "1,500" : "10.50"}
            className="h-11 border border-white/15 bg-[#0b0d1c] px-3 text-xs text-[#ffd700] outline-none focus:border-cyan-300/70"
          />
          {priceMinor !== null ? (
            <span className="text-[8px] text-white/35">
              Se publicará como {formatP2PPrice(priceMinor, currency)} · {priceMinor} centavos
            </span>
          ) : null}
        </label>
        {price && !validPrice ? (
          <p role="alert" className="text-[10px] uppercase tracking-wider text-[#ff9ab9]">
            Precio inválido. Rango: {formatP2PPrice(limits.min, currency)} a{" "}
            {formatP2PPrice(limits.max, currency)}, con máximo dos decimales.
          </p>
        ) : null}

        <fieldset className="grid gap-2">
          <legend className="mb-2 text-[9px] uppercase tracking-widest text-white/45">
            MÉTODOS DE PAGO ACEPTADOS
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {config.methods.map(({ id, label }) => (
              <label
                key={id}
                className="flex min-h-10 items-center gap-2 border border-white/10 px-3 text-[9px] uppercase tracking-widest text-white/65"
              >
                <input
                  type="checkbox"
                  checked={selectedMethods.includes(id)}
                  onChange={() => toggleMethod(id)}
                  className="accent-cyan-300"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {usdtSelected ? (
          <label className="flex flex-col gap-2 text-[9px] uppercase tracking-widest text-white/45">
            RED USDT
            <select
              value={network}
              onChange={(event) => setNetwork(event.target.value as P2PUsdtNetwork | "")}
              className="h-11 border border-white/15 bg-[#0b0d1c] px-3 text-xs text-white"
            >
              <option value="">Selecciona la red</option>
              {P2P_USDT_NETWORKS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {activeChoices.map((choice) => {
          const key = choice.method === "USDT" ? `USDT:${choice.network}` : choice.method;
          const label =
            choice.method === "USDT"
              ? `USDT ${choice.network}`
              : (config.methods.find((option) => option.id === choice.method)?.label ??
                choice.method);
          return (
            <label
              key={key}
              className="flex flex-col gap-2 text-[9px] uppercase tracking-widest text-white/45"
            >
              DATOS DE PAGO · {label}
              <textarea
                maxLength={500}
                value={paymentDetails[key] ?? ""}
                onChange={(event) =>
                  setPaymentDetails((current) => ({ ...current, [key]: event.target.value }))
                }
                placeholder="Número de cuenta, teléfono, correo o wallet."
                className="min-h-20 resize-y border border-white/15 bg-[#0b0d1c] px-3 py-2 text-xs text-white outline-none placeholder:text-white/25 focus:border-cyan-300/70"
              />
              <span className="text-right text-[8px] normal-case text-white/30">
                {(paymentDetails[key] ?? "").length}/500 caracteres · texto plano
              </span>
            </label>
          );
        })}

        <p className="text-[9px] uppercase tracking-widest text-white/45">
          COMISIÓN DE PUBLICACIÓN ·{" "}
          <span className="text-[#d946ef] drop-shadow-[0_0_8px_#d946ef80]">
            {P2P_FEE_OBSIDIAN.publish} OBS
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
