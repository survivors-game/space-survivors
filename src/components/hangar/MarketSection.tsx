import { useState } from "react";
import { MarketBuy } from "@/components/hangar/MarketBuy";
import { MarketHistory } from "@/components/hangar/MarketHistory";
import { MarketListings } from "@/components/hangar/MarketListings";
import { MarketSell } from "@/components/hangar/MarketSell";
import type {
  P2PAd,
  P2PHistoryOrder,
  P2PInventoryItem,
  P2PMyAd,
  P2PPurchaseOrder,
  P2PPublicListing,
  P2PPilotState,
  P2PPublishInput,
  P2PItemType,
  P2PCountry,
  P2PPayMethod,
} from "@/game/data/market";

type MarketTab = "COMPRAR" | "VENDER" | "MIS LISTADOS" | "HISTORIAL";
type NavigationTab = { label: MarketTab; disabled: false };

const TABS: NavigationTab[] = [
  { label: "COMPRAR", disabled: false },
  { label: "VENDER", disabled: false },
  { label: "MIS LISTADOS", disabled: false },
  { label: "HISTORIAL", disabled: false },
];

export interface MarketActions {
  pilotState: P2PPilotState | null;
  ads: P2PMyAd[];
  publicListings: P2PPublicListing[];
  listingPage: number;
  listingPages: number;
  history: P2PHistoryOrder[];
  selectedShipId: string;
  isLoading: boolean;
  error: string;
  onPublish: (input: P2PPublishInput) => Promise<void>;
  onToggleAd: (adId: string) => Promise<void>;
  onCancelAd: (adId: string) => Promise<void>;
  onLoadListings: (
    page: number,
    itemType: P2PItemType | "",
    country: P2PCountry | "",
    sort: "newest" | "price_asc" | "price_desc",
  ) => Promise<void>;
  onBuy: (listingId: string, method: P2PPayMethod, network?: string) => Promise<P2PPurchaseOrder>;
  onReportPayment: (orderId: string, reference: string, proofUrl: string) => Promise<void>;
  onReleaseOrder: (orderId: string) => Promise<void>;
  onOpenDispute: (orderId: string, reason: string, evidenceUrl: string) => Promise<void>;
  onCancelOrder: (orderId: string) => Promise<void>;
}

export function MarketSection({ actions }: { actions: MarketActions }) {
  const [activeTab, setActiveTab] = useState<MarketTab>("COMPRAR");
  const pilot = actions.pilotState;
  const inventory: P2PInventoryItem[] = pilot?.inventory ?? [];
  const ads: P2PAd[] = actions.ads;

  return (
    <div className="mt-6 space-y-6">
      <nav
        aria-label="Secciones del mercado"
        className="grid grid-cols-2 gap-2 border border-cyan-500/20 bg-[#0b0d1c]/70 p-2 sm:grid-cols-3 lg:grid-cols-5"
        role="tablist"
      >
        {TABS.map(({ label, disabled }) => {
          const active = label === activeTab;
          return (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              onClick={() => {
                if (!disabled) setActiveTab(label);
              }}
              className={`flex min-h-11 items-center justify-center gap-2 border px-2 py-2 text-[9px] font-black uppercase tracking-[0.1em] transition sm:text-[10px] ${disabled ? "cursor-not-allowed border-white/10 bg-[#0b0d1c]/60 text-white/30" : active ? "border-cyan-300/70 bg-cyan-300/10 text-cyan-100 shadow-[0_0_18px_#00f0ff18]" : "border-white/10 bg-[#0b0d1c]/60 text-white/45 hover:border-cyan-300/30 hover:text-cyan-100/75"}`}
            >
              {label}
              {disabled ? <span className="text-[7px] text-[#ff9ab9]">PRÓXIMAMENTE</span> : null}
            </button>
          );
        })}
      </nav>

      <div aria-live="polite">
        {actions.error ? (
          <p
            role="alert"
            className="border border-[#ff0055]/25 bg-[#ff0055]/5 p-3 text-[9px] uppercase tracking-widest text-[#ff9ab9]"
          >
            {actions.error}
          </p>
        ) : null}
      </div>
      {activeTab === "COMPRAR" ? (
        <MarketBuy
          listings={actions.publicListings}
          page={actions.listingPage}
          pages={actions.listingPages}
          isLoading={actions.isLoading}
          onLoadListings={actions.onLoadListings}
          onBuy={actions.onBuy}
          onReportPayment={actions.onReportPayment}
          onCancel={actions.onCancelOrder}
        />
      ) : null}
      {activeTab === "VENDER" ? (
        <MarketSell
          inventory={inventory}
          obsidian={pilot?.obsidian ?? null}
          selectedShipId={actions.selectedShipId}
          isLoading={actions.isLoading}
          onPublish={actions.onPublish}
        />
      ) : null}
      {activeTab === "MIS LISTADOS" ? (
        <MarketListings
          ads={ads}
          isLoading={actions.isLoading}
          onToggleAd={actions.onToggleAd}
          onCancelAd={actions.onCancelAd}
        />
      ) : null}
      {activeTab === "HISTORIAL" ? (
        <MarketHistory
          orders={actions.history}
          isLoading={actions.isLoading}
          onReportPayment={actions.onReportPayment}
          onReleaseOrder={actions.onReleaseOrder}
          onOpenDispute={actions.onOpenDispute}
          onCancel={actions.onCancelOrder}
        />
      ) : null}
    </div>
  );
}
