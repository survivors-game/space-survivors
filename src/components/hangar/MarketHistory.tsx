import { MOCK_MARKET_HISTORY } from "@/game/data/market";

export function MarketHistory() {
  return (
    <div className="space-y-2">
      {MOCK_MARKET_HISTORY.map((entry) => (
        <article
          key={entry.id}
          className="grid gap-3 border border-white/10 bg-[#0b0d1c]/75 p-4 text-[9px] uppercase tracking-wider sm:grid-cols-[1fr_0.7fr_1.2fr_1fr_auto] sm:items-center"
        >
          <span className="text-white/45">{entry.fecha}</span>
          <span className={entry.tipo === "COMPRA" ? "text-cyan-200" : "text-[#ff9ab9]"}>
            {entry.tipo}
          </span>
          <span className="text-white">{entry.objeto}</span>
          <span className="text-white/50">{entry.contraparte}</span>
          <span className="font-arcade text-[9px] tabular-nums text-[#ffd700]">
            {entry.montoSol.toFixed(2)} SOL
          </span>
        </article>
      ))}
    </div>
  );
}
