import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";

interface LeaderboardEntry {
  pilot_id: string;
  callsign: string;
  obsidian: number;
  score: number;
}

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const response = await fetch("/api/leaderboard", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as {
          entries?: LeaderboardEntry[];
          error?: string;
        } | null;
        if (!response.ok || !payload || !Array.isArray(payload.entries)) {
          throw new Error(payload?.error ?? "No se pudo cargar la clasificación.");
        }
        if (active) {
          setEntries(payload.entries);
          setError("");
        }
      } catch (cause) {
        console.error("No se pudo actualizar la clasificación:", cause);
        if (active) setError(cause instanceof Error ? cause.message : "Error de conexión.");
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <section
      aria-label="Clasificación global"
      className="border border-cyan-500/25 bg-[#0f172a] p-4 text-slate-100 shadow-[0_0_40px_#00f0ff0c] sm:p-5"
    >
      <h2 className="mb-4 flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-200">
        <Trophy className="size-4 text-[#ffd700]" />
        Clasificación global · Top 100
      </h2>
      {error ? (
        <p className="py-4 text-center text-xs text-rose-300">{error}</p>
      ) : entries.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-400">Aún no hay pilotos clasificados.</p>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-[#0f172a] text-[9px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">Piloto</th>
                <th className="px-2 py-2 text-right">OBS</th>
                <th className="px-2 py-2 text-right">Puntuación</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <tr className="border-t border-slate-700/70" key={entry.pilot_id}>
                  <td className="px-2 py-2 font-semibold text-cyan-300">{index + 1}</td>
                  <td className="max-w-40 truncate px-2 py-2 text-white">{entry.callsign}</td>
                  <td className="px-2 py-2 text-right text-fuchsia-300">
                    {entry.obsidian.toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-right font-bold text-[#ffd700]">
                    {entry.score.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-right text-[9px] text-slate-500">Actualización cada 30 segundos</p>
    </section>
  );
}
