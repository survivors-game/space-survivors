import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";

interface RankingEntry {
  position: number;
  pilot_id: string;
  callsign: string;
  prize_usdt: number;
}

interface RankingPayload {
  cycle_ends_at: number;
  bosses: RankingEntry[];
  referrals: RankingEntry[];
}

const formatUsdt = (amount: number) => amount.toFixed(2) + " USDT";

export function Leaderboard() {
  const [rankings, setRankings] = useState<RankingPayload | null>(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"bosses" | "referrals">("bosses");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/rewards/rankings", { cache: "no-store" });
        const payload = (await response.json()) as RankingPayload & { error?: string };
        if (!response.ok || !Array.isArray(payload.bosses) || !Array.isArray(payload.referrals)) {
          throw new Error(payload.error ?? "No se pudieron cargar los premios.");
        }
        if (active) {
          setRankings(payload);
          setError("");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Error de conexión.");
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const entries = activeTab === "bosses" ? (rankings?.bosses ?? []) : (rankings?.referrals ?? []);

  return (
    <section
      aria-label="Clasificación global"
      className="border border-cyan-500/25 bg-[#0f172a] p-4 text-slate-100 shadow-[0_0_40px_#00f0ff0c] sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
          <Trophy className="size-4 text-[#ffd700]" />
          Clasificación · Premios
        </h2>
        <div aria-label="Tipos de ranking" className="flex gap-1" role="tablist">
          {[
            ["bosses", "Ranking de Bosses"],
            ["referrals", "Ranking de Invitaciones"],
          ].map(([tab, label]) => (
            <button
              aria-selected={activeTab === tab}
              className={`border px-2 py-2 text-[8px] uppercase tracking-wider transition ${activeTab === tab ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-100" : "border-white/10 text-white/45 hover:text-cyan-100"}`}
              key={tab}
              onClick={() => setActiveTab(tab as "bosses" | "referrals")}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-3 border-l-2 border-emerald-400/60 bg-emerald-400/5 px-3 py-2 text-[10px] leading-relaxed text-emerald-100/80">
        Los premios se pagarán en USDT mediante la red Polygon al finalizar el ciclo de 15 días. El monto mostrado es estimado y puede cambiar si cambia tu posición o crece el fondo.
      </p>

      {error ? (
        <p className="py-4 text-center text-xs text-rose-300">{error}</p>
      ) : !rankings ? (
        <p className="py-4 text-center text-xs text-slate-400">Cargando clasificación...</p>
      ) : entries.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">
          Aún no hay jugadores clasificados en este ciclo.
        </p>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-[#0f172a] text-[9px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-2 py-2">Puesto</th>
                <th className="px-2 py-2">Jugador</th>
                <th className="px-2 py-2 text-right">Premio acumulado</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr className="border-t border-slate-700/70" key={entry.pilot_id}>
                  <td className="px-2 py-2 font-semibold text-cyan-300">{entry.position}</td>
                  <td className="max-w-40 truncate px-2 py-2 text-white">{entry.callsign}</td>
                  <td className="px-2 py-2 text-right font-bold text-emerald-300">
                    {formatUsdt(entry.prize_usdt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rankings ? (
        <p className="mt-3 text-right text-[9px] text-slate-500">
          Cierre del ciclo: {new Date(rankings.cycle_ends_at).toLocaleString("es-CO")}
        </p>
      ) : null}
      <p className="mt-1 text-right text-[9px] text-slate-500">Actualización cada 30 segundos</p>
    </section>
  );
}
