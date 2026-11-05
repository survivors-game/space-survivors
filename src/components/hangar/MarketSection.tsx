import { useState } from "react";
import { MarketBuy } from "@/components/hangar/MarketBuy";
import { MarketHistory } from "@/components/hangar/MarketHistory";
import { MarketListings } from "@/components/hangar/MarketListings";
import { MarketSell } from "@/components/hangar/MarketSell";

type MarketTab = "COMPRAR" | "VENDER" | "MIS LISTADOS" | "HISTORIAL";
type NavigationTab = { label: MarketTab; disabled: false } | { label: "OFERTAS"; disabled: true };

const TABS: NavigationTab[] = [
  { label: "COMPRAR", disabled: false },
  { label: "VENDER", disabled: false },
  { label: "OFERTAS", disabled: true },
  { label: "MIS LISTADOS", disabled: false },
  { label: "HISTORIAL", disabled: false },
];

export function MarketSection() {
  const [activeTab, setActiveTab] = useState<MarketTab>("COMPRAR");

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
      {activeTab === "COMPRAR" ? <MarketBuy /> : null}
      {activeTab === "VENDER" ? <MarketSell /> : null}
      {activeTab === "MIS LISTADOS" ? <MarketListings /> : null}
      {activeTab === "HISTORIAL" ? <MarketHistory /> : null}
    </div>
  );
}
