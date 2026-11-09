 import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { WIKI_SECTIONS } from "./wikiSections";

/** Wiki del juego: panel lateral con secciones y contenido detallado. */
export function WikiPage({ onClose }: { onClose: () => void }) {
  const [activeId, setActiveId] = useState(WIKI_SECTIONS[0]?.id ?? "");
  const active = WIKI_SECTIONS.find((s) => s.id === activeId) ?? WIKI_SECTIONS[0];

  return (
    <section className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="font-arcade text-[10px] uppercase tracking-widest text-cyan-200">WIKI</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 items-center gap-1.5 border border-cyan-500/30 bg-[#0b0d1c]/80 px-2.5 text-[10px] font-bold uppercase tracking-widest text-cyan-100 hover:bg-cyan-300/10"
          >
            <ArrowLeft className="size-3.5" /> Volver
          </button>
        </div>
        <nav
          aria-label="Secciones de la wiki"
          className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {WIKI_SECTIONS.map((s) => {
            const Icon = s.icon;
            const isActive = s.id === activeId;
            return (
              <button
                key={s.id}
                type="button"
                aria-current={isActive ? "true" : undefined}
                onClick={() => setActiveId(s.id)}
                className={`flex shrink-0 items-center gap-2.5 border px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider transition ${
                  isActive
                    ? "border-cyan-300/70 bg-cyan-300/15 text-cyan-100 shadow-[0_0_14px_#00f0ff22]"
                    : "border-cyan-500/20 bg-[#0b0d1c]/80 text-white/60 hover:border-cyan-400/40 hover:text-cyan-100"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span className="whitespace-nowrap">{s.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <article className="min-w-0 border border-cyan-500/20 bg-[#070914]/85 p-5 sm:p-7">
        {active ? (
          <>
            <p className="font-arcade text-[10px] uppercase tracking-[0.25em] text-cyan-300/70">
              GUÍA DEL PILOTO
            </p>
            <h1 className="mb-6 mt-2 font-arcade text-base uppercase tracking-wider text-white sm:text-lg">
              {active.label}
            </h1>
            {active.content}
          </>
        ) : null}
      </article>
    </section>
  );
}

/** Marcador de la pestaña ROADMAP. Se completa en la siguiente sesión. */
export function RoadmapPage({ onClose }: { onClose: () => void }) {
  return (
    <section className="mt-6 border border-cyan-500/20 bg-[#070914]/85 p-6 sm:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="font-arcade text-base uppercase tracking-wider text-white sm:text-lg">
          ROADMAP
        </h1>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 items-center gap-1.5 border border-cyan-500/30 bg-[#0b0d1c]/80 px-2.5 text-[10px] font-bold uppercase tracking-widest text-cyan-100 hover:bg-cyan-300/10"
        >
          <ArrowLeft className="size-3.5" /> Volver
        </button>
      </div>
      <p className="text-sm leading-6 text-white/65">
        Esta sección mostrará las próximas novedades del juego. Se completa en la siguiente sesión.
      </p>
    </section>
  );
}