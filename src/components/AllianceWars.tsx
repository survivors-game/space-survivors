import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Opponent = {
  alliance_id: string;
  name: string;
  tag: string;
  level: number;
  member_count: number;
};
type War = {
  war_id: string;
  status: string;
  attacker_alliance_id: string;
  defender_alliance_id: string;
  attacker_name: string;
  attacker_tag: string;
  defender_name: string;
  defender_tag: string;
  winner_alliance_id: string | null;
  created_at: number;
  attacker_hordes_survived: number;
  defender_hordes_survived: number;
};
type Participant = {
  pilot_id: string;
  side?: string;
  alliance_id?: string;
  ship_id: string;
  hp?: number;
  max_hp?: number;
  alive?: number | boolean;
  buff?: { label: string };
  passive_upgrades_json?: string;
};
type Snapshot = {
  war_id: string;
  status: string;
  horde: number;
  participants: Participant[];
  enemy_hp?: { attacker: number; defender: number };
  horde_cleared?: { attacker: boolean; defender: boolean };
};
async function api<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    ...(body
      ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error
        : "No se pudo completar la operación.";
    throw new Error(message);
  }
  return data as T;
}
export function AllianceWars({ allianceId, role }: { allianceId: string; role: string }) {
  const [opponents, setOpponents] = useState<Opponent[]>([]),
    [wars, setWars] = useState<War[]>([]),
    [ships, setShips] = useState<{ item_id: string; item_name: string }[]>([]);
  const [rival, setRival] = useState(""),
    [shipId, setShipId] = useState(""),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    try {
      const [o, h, owned] = await Promise.all([
        api<{ opponents: Opponent[] }>("/api/alliance/war/opponents"),
        api<{ wars: War[] }>("/api/alliance/war/history"),
        api<{ ships: { item_id: string; item_name: string }[] }>("/api/alliance/war/ships"),
      ]);
      setOpponents(o.opponents);
      setWars(h.wars);
      setShips(owned.ships);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar guerras.");
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const active = wars.find((w) => ["DECLARED", "PREPARING", "ACTIVE"].includes(w.status));
  const loadSnapshot = useCallback(async () => {
    if (!active) return;
    try {
      setSnapshot(await api<Snapshot>(`/api/alliance/war/status/${active.war_id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar la batalla.");
    }
  }, [active]);
  useEffect(() => {
    void loadSnapshot();
    const timer = window.setInterval(() => void loadSnapshot(), 5000);
    return () => window.clearInterval(timer);
  }, [loadSnapshot]);
  const act = async (path: string, body: Record<string, unknown>, message: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(path, body);
      setNotice(message);
      await refresh();
      await loadSnapshot();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operación no completada.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-6 border-t border-cyan-400/20 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
          GUERRAS DE ALIANZA
        </h3>
        <span className="text-[9px] uppercase tracking-widest text-white/40">
          10 HORDAS · 20 MIN
        </span>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-xs text-rose-200">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="mt-3 text-xs text-cyan-200">
          {notice}
        </p>
      ) : null}
      {!active && role === "lider" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <select
            aria-label="Alianza rival"
            value={rival}
            onChange={(e) => setRival(e.target.value)}
            className="h-10 min-w-0 flex-1 border border-cyan-400/30 bg-[#070814] px-3 text-xs text-white"
          >
            <option value="">SELECCIONAR RIVAL</option>
            {opponents.map((o) => (
              <option key={o.alliance_id} value={o.alliance_id}>
                [{o.tag}] {o.name} · NIVEL {o.level} · {o.member_count}/10
              </option>
            ))}
          </select>
          <Button
            disabled={busy || !rival}
            onClick={() =>
              void act(
                "/api/alliance/war/declare",
                { defender_alliance_id: rival },
                "DECLARACIÓN ENVIADA",
              )
            }
            className="h-10 rounded-none bg-[#00f0ff] text-[9px] font-bold uppercase text-[#070814]"
          >
            DECLARAR GUERRA
          </Button>
        </div>
      ) : null}
      {active ? (
        <div className="mt-4 border border-fuchsia-400/20 bg-fuchsia-400/[0.04] p-3">
          <p className="text-[10px] font-bold uppercase text-fuchsia-200">
            {active.attacker_name} [{active.attacker_tag}] vs {active.defender_name} [
            {active.defender_tag}]
          </p>
          <p className="mt-1 text-[9px] uppercase tracking-widest text-white/50">
            ESTADO: {active.status} · GUERRA {active.war_id}
          </p>
          {active.status === "DECLARED" &&
          active.defender_alliance_id === allianceId &&
          role === "lider" ? (
            <div className="mt-3 flex gap-2">
              <Button
                disabled={busy}
                onClick={() =>
                  void act(
                    "/api/alliance/war/respond",
                    { war_id: active.war_id, decision: "ACCEPT" },
                    "GUERRA ACEPTADA",
                  )
                }
                className="h-8 rounded-none bg-emerald-500 text-[9px] uppercase"
              >
                ACEPTAR
              </Button>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() =>
                  void act(
                    "/api/alliance/war/respond",
                    { war_id: active.war_id, decision: "REJECT" },
                    "GUERRA RECHAZADA",
                  )
                }
                className="h-8 rounded-none border-rose-400/40 text-[9px] uppercase text-rose-200"
              >
                RECHAZAR
              </Button>
            </div>
          ) : null}
          {active.status === "PREPARING" ? (
            <div className="mt-3 space-y-3">
              <p className="text-[10px] text-white/60">
                Cada alianza debe registrar al menos 3 naves desbloqueadas. El líder inicia el
                combate.
              </p>
              <p className="text-[10px] text-cyan-100/70">
                Naves registradas:{" "}
                {snapshot?.participants.filter((p) => p.alliance_id === active.attacker_alliance_id)
                  .length ?? 0}
                /3 atacante ·{" "}
                {snapshot?.participants.filter((p) => p.alliance_id === active.defender_alliance_id)
                  .length ?? 0}
                /3 defensor
              </p>
              <div className="flex flex-wrap gap-2">
                <select
                  aria-label="Seleccionar nave"
                  value={shipId}
                  onChange={(e) => setShipId(e.target.value)}
                  className="h-9 min-w-0 flex-1 border border-cyan-400/30 bg-[#070814] px-2 text-xs text-white"
                >
                  <option value="">SELECCIONAR NAVE</option>
                  {ships.map((s) => (
                    <option key={s.item_id} value={s.item_id}>
                      {s.item_name}
                    </option>
                  ))}
                </select>
                <Button
                  disabled={busy || !shipId}
                  onClick={() =>
                    void act(
                      "/api/alliance/war/select-ship",
                      { war_id: active.war_id, ship_id: shipId },
                      "NAVE REGISTRADA",
                    )
                  }
                  className="h-9 rounded-none bg-cyan-400 text-[9px] uppercase text-[#070814]"
                >
                  REGISTRAR
                </Button>
                {role === "lider" ? (
                  <Button
                    disabled={
                      busy ||
                      (snapshot?.participants.filter(
                        (p) => p.alliance_id === active.attacker_alliance_id,
                      ).length ?? 0) < 3 ||
                      (snapshot?.participants.filter(
                        (p) => p.alliance_id === active.defender_alliance_id,
                      ).length ?? 0) < 3
                    }
                    onClick={() =>
                      void act(
                        "/api/alliance/war/start",
                        { war_id: active.war_id },
                        "COMBATE INICIADO",
                      )
                    }
                    className="h-9 rounded-none bg-fuchsia-500 text-[9px] uppercase"
                  >
                    INICIAR
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {active.status === "ACTIVE" ? (
            <div className="mt-3 space-y-3">
              <p className="text-xs font-bold text-white">HORDA {snapshot?.horde ?? 1}/10</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(["attacker", "defender"] as const).map((side) => (
                  <div key={side} className="border border-white/10 p-2">
                    <p className="text-[9px] uppercase text-cyan-200">
                      {side === "attacker" ? active.attacker_name : active.defender_name}
                    </p>
                    <p className="mt-1 text-[10px] text-white/60">
                      {snapshot?.participants.filter((p) => p.side === side && p.alive).length ?? 0}{" "}
                      NAVES ACTIVAS
                    </p>
                    <p className="text-[10px] text-white/50">
                      ENEMIGOS: {snapshot?.enemy_hp?.[side] ?? "—"}
                    </p>
                  </div>
                ))}
              </div>
              <ul className="space-y-1">
                {snapshot?.participants.map((p) => (
                  <li
                    key={p.pilot_id}
                    className="flex flex-wrap justify-between gap-2 text-[9px] text-white/55"
                  >
                    <span>
                      {p.ship_id.toUpperCase()} ·{" "}
                      {p.side === "attacker" ? active.attacker_name : active.defender_name} ·{" "}
                      {p.buff?.label ?? "MEJORA"}
                    </span>
                    <span>
                      {p.alive ? "ACTIVA" : "DESTRUIDA"} · {p.hp ?? 0}/{p.max_hp ?? 0} PS
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[9px] text-white/45">
                Las naves y el resultado se calculan en el servidor. Dispara para atacar la horda
                rival.
              </p>
              <Button
                disabled={busy}
                onClick={() =>
                  void act(
                    "/api/alliance/war/action",
                    { war_id: active.war_id, action: "fire" },
                    "DISPARO REGISTRADO",
                  )
                }
                className="h-9 rounded-none bg-cyan-400 text-[9px] font-bold uppercase text-[#070814]"
              >
                DISPARAR
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mt-4">
        <h4 className="text-[9px] font-bold uppercase tracking-widest text-white/55">HISTORIAL</h4>
        {wars.length ? (
          <ul className="mt-2 space-y-2">
            {wars.map((w) => (
              <li
                key={w.war_id}
                className="flex flex-wrap justify-between gap-2 border-b border-white/10 py-2 text-[10px]"
              >
                <span>
                  {w.attacker_name} [{w.attacker_tag}] vs {w.defender_name} [{w.defender_tag}]
                </span>
                <span className="uppercase text-cyan-200">
                  {w.status === "COMPLETED"
                    ? w.winner_alliance_id === allianceId
                      ? "VICTORIA"
                      : w.winner_alliance_id
                        ? "DERROTA"
                        : "EMPATE"
                    : w.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[10px] text-white/40">Aún no hay guerras registradas.</p>
        )}
      </div>
    </section>
  );
}
