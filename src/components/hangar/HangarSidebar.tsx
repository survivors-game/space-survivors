import { Crosshair, ScrollText, ShoppingBag, Skull, Target, Wrench } from "lucide-react";

export type HangarTab = "UPGRADES" | "MISSIONS" | "BESTIARY" | "ARSENAL" | "PROFILE" | "MARKET";

interface HangarSidebarProps {
  activeTab: HangarTab;
  claimableCount: number;
  onTabChange: (tab: HangarTab) => void;
}

const HANGAR_SECTIONS = [
  { id: "UPGRADES", label: "MEJORAS", Icon: Wrench },
  { id: "MISSIONS", label: "MISIONES", Icon: Target },
  { id: "BESTIARY", label: "BESTIARIO", Icon: Skull },
  { id: "ARSENAL", label: "ARSENAL", Icon: Crosshair },
  { id: "PROFILE", label: "PERFIL", Icon: ScrollText },
  { id: "MARKET", label: "MERCADO", Icon: ShoppingBag },
] as const satisfies readonly { id: HangarTab; label: string; Icon: typeof Wrench }[];

export function HangarSidebar({ activeTab, claimableCount, onTabChange }: HangarSidebarProps) {
  return (
    <nav
      aria-label="Secciones del hangar"
      className="lg:sticky lg:top-8 lg:row-start-2 lg:row-span-4 lg:self-start"
      role="tablist"
    >
      <p className="font-arcade mb-3 hidden text-[8px] uppercase tracking-[0.16em] text-cyan-100/45 lg:block">
        SECCIONES
      </p>
      <div className="grid grid-cols-6 gap-1 border border-cyan-500/20 bg-[#0b0d1c]/70 p-1.5 sm:gap-2 sm:p-2 lg:flex lg:flex-col">
        {HANGAR_SECTIONS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-label={label}
              aria-selected={isActive}
              onClick={() => onTabChange(id)}
              className={`flex min-h-12 min-w-0 items-center justify-center gap-3 border px-1 py-2 text-[10px] font-black uppercase tracking-[0.14em] transition lg:justify-start lg:px-3 sm:text-xs ${isActive ? "border-cyan-300/70 bg-cyan-300/10 text-cyan-100 shadow-[0_0_18px_#00f0ff18]" : "border-white/10 bg-[#0b0d1c]/60 text-white/45 hover:border-cyan-300/30 hover:text-cyan-100/75"}`}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0 sm:size-5" />
              <span className="sr-only lg:not-sr-only">{label}</span>
              {id === "MISSIONS" && claimableCount > 0 ? (
                <span className="hidden min-w-5 items-center justify-center border border-[#ffd700]/60 bg-[#ffd700]/15 px-1.5 py-0.5 text-[9px] font-black text-[#ffd700] shadow-[0_0_12px_#ffd70055] lg:inline-flex">
                  {claimableCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
