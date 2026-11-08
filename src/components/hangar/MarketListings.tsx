import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatP2PPrice, P2P_COUNTRIES, type P2PMyAd } from "@/game/data/market";

interface MarketListingsProps {
  ads: P2PMyAd[];
  isLoading: boolean;
  onToggleAd: (adId: string) => Promise<void>;
  onCancelAd: (adId: string) => Promise<void>;
}

function AdActions({
  ad,
  disabled,
  onToggleAd,
  onCancelAd,
}: {
  ad: P2PMyAd;
  disabled: boolean;
  onToggleAd: (adId: string) => Promise<void>;
  onCancelAd: (adId: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const canChange = ad.status === "ACTIVO" || ad.status === "PAUSADO";

  const act = async (action: (adId: string) => Promise<void>) => {
    setBusy(true);
    try {
      await action(ad.id);
    } catch {
      return;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex shrink-0 gap-2">
      {canChange ? (
        <>
          <Button
            type="button"
            disabled={disabled || busy}
            variant="outline"
            onClick={() => void act(onToggleAd)}
            className="font-arcade h-9 rounded-none border-cyan-300/35 px-2 text-[7px] uppercase tracking-widest text-cyan-100"
          >
            {ad.status === "ACTIVO" ? "PAUSAR" : "REACTIVAR"}
          </Button>
          <Button
            type="button"
            disabled={disabled || busy}
            variant="outline"
            onClick={() => void act(onCancelAd)}
            className="font-arcade h-9 rounded-none border-[#ff0055]/35 px-2 text-[7px] uppercase tracking-widest text-[#ff9ab9]"
          >
            CANCELAR
          </Button>
        </>
      ) : (
        <span className="text-[8px] uppercase tracking-widest text-white/35">{ad.status}</span>
      )}
    </div>
  );
}

export function MarketListings({ ads, isLoading, onToggleAd, onCancelAd }: MarketListingsProps) {
  if (isLoading && !ads.length) {
    return (
      <p className="border border-cyan-500/20 bg-[#0b0d1c]/70 p-8 text-center text-[10px] uppercase tracking-widest text-white/45">
        SINCRONIZANDO ANUNCIOS...
      </p>
    );
  }
  if (!ads.length) {
    return (
      <p className="border border-dashed border-cyan-400/20 p-8 text-center text-[10px] uppercase tracking-widest text-white/45">
        TODAVÍA NO TIENES ANUNCIOS.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {ads.map((ad) => (
        <article key={ad.id} className="min-w-0 border border-cyan-500/20 bg-[#0b0d1c]/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-arcade truncate text-[8px] uppercase tracking-wide text-white">
                {ad.itemName}
              </h3>
              <p className="mt-2 text-[8px] uppercase tracking-widest text-white/45">
                {ad.itemType} · <span className="text-[#ff9ab9]">{ad.status}</span>
              </p>
            </div>
            <span className="font-arcade whitespace-nowrap text-[8px] tabular-nums text-[#ffd700]">
              {formatP2PPrice(ad.priceMinor, ad.currency)}
            </span>
          </div>
          <p className="mt-3 text-[8px] uppercase tracking-widest text-white/40">
            {P2P_COUNTRIES[ad.country].label} ·{" "}
            {ad.paymentMethods.map((method) => method.label).join(" · ")}
          </p>
          <div className="mt-3 space-y-1 border-t border-white/10 pt-3">
            {Object.entries(ad.paymentData).map(([method, details]) => (
              <p key={method} className="break-words text-[9px] text-white/65">
                <span className="text-cyan-100">{method}:</span> {details}
              </p>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-3">
            <AdActions
              ad={ad}
              disabled={isLoading}
              onToggleAd={onToggleAd}
              onCancelAd={onCancelAd}
            />
          </div>
        </article>
      ))}
    </div>
  );
}
