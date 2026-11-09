import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  HordeTrack,
  HpBar,
  PilotAvatar,
  ShipSprite,
  WarClock,
} from "@/components/multiplayer/WarSprites";

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

const statusLabel: Record<string, string> = {
  DECLARED: "PENDIENTE DE RESPUESTA",
  PREPARING: "PREPARACIÓN DE FLOTAS",
  ACTIVE: "COMBATE EN CURSO",
  COMPLETED: "FINALIZADA",
  REJECTED: "RECHAZADA",
  EXPIRED: "EXPIRADA",
  CANCELLED: "CANCELADA",
};

function Stat({
  label,
  value,
  tone = "cyan",
}: {
  label: string;
  value: string | number;
  tone?: "cyan" | "fuchsia" | "emerald" | "amber";
}) {
  const tones = {
    cyan: "border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-100",
    fuchsia: "border-fuchsia-300/20 bg-fuchsia-300/[0.06] text-fuchsia-100",
    emerald: "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100",
    amber: "border-amber-300/20 bg-amber-300/[0.06] text-amber-100",
  };
  return (
    <div className={`min-w-0 border p-3 ${tones[tone]}`}>
      <p className="text-[8px] font-bold uppercase tracking-[0.2em] opacity-60">{label}</p>
      <p className="mt-1 truncate text-lg font-black tabular-nums">{value}</p>
    </div>
  );
}

function SideCard({
  name,
  tag,
  participants,
  enemyHp,
}: {
  name: string;
  tag: string;
  participants: Participant[];
  enemyHp: number | undefined;
}) {
  const alive = participants.filter((participant) => participant.alive).length;
  return (
    <div className="relative overflow-hidden border border-cyan-300/20 bg-[linear-gradient(160deg,#0a1024_0%,#090d1c_70%)] p-3 sm:p-4">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent"
      />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[8px] uppercase tracking-[0.2em] text-cyan-200/60">FLOTA</p>
          <h4 className="mt-1 truncate text-sm font-black uppercase tracking-wider text-white">
            {name}
          </h4>
        </div>
        <span className="shrink-0 border border-cyan-300/30 px-2 py-1 text-[10px] font-black text-cyan-100">
          [{tag}]
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Naves activas" value={`${alive}/${participants.length}`} tone="emerald" />
        <Stat label="Blindaje enemigo" value={enemyHp ?? "—"} tone="fuchsia" />
      </div>
      <div className="mt-3 space-y-2">
        {participants.length ? (
          participants.map((participant) => {
            const hp = Math.max(0, participant.hp ?? 0);
            const maxHp = Math.max(1, participant.max_hp ?? 1);
            const percent = Math.min(100, (hp / maxHp) * 100);
            return (
              <div
                key={participant.pilot_id}
                className={`flex items-center gap-3 border p-2 ${participant.alive ? "border-cyan-300/15 bg-cyan-300/[0.03]" : "border-rose-400/20 bg-rose-500/[0.04]"}`}
              >
                <PilotAvatar
                  seed={participant.ship_id + participant.pilot_id}
                  alive={!!participant.alive}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[9px] font-bold uppercase tracking-wider text-white/85">
                      {participant.ship_id}
                    </span>
                    <span
                      className={`shrink-0 text-[7px] font-bold uppercase tracking-wider ${participant.alive ? "text-emerald-200" : "text-rose-300"}`}
                    >
                      {participant.alive ? "● OPERATIVA" : "✕ DESTRUIDA"}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <HpBar percent={percent} alive={!!participant.alive} />
                  </div>
                  <p className="mt-1 flex justify-between gap-2 text-[7px] tabular-nums text-white/45">
                    <span className="truncate">
                      {participant.buff?.label ?? "SIN BONIFICACIÓN"}
                    </span>
                    <span className="shrink-0">
                      {hp}/{maxHp} PS
                    </span>
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <p className="py-3 text-center text-[9px] uppercase tracking-wider text-white/35">
            Sin naves registradas
          </p>
        )}
      </div>
    </div>
  );
}

export function AllianceWars({ allianceId, role }: { allianceId: string; role: string }) {
  const [opponents, setOpponents] = useState<Opponent[]>([]);
  const [wars, setWars] = useState<War[]>([]);
  const [ships, setShips] = useState<{ item_id: string; item_name: string }[]>([]);
  const [rival, setRival] = useState("");
  const [shipId, setShipId] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [opponentResult, historyResult, ownedShips] = await Promise.all([
        api<{ opponents: Opponent[] }>("/api/alliance/war/opponents"),
        api<{ wars: War[] }>("/api/alliance/war/history"),
        api<{ ships: { item_id: string; item_name: string }[] }>("/api/alliance/war/ships"),
      ]);
      setOpponents(opponentResult.opponents);
      setWars(historyResult.wars);
      setShips(ownedShips.ships);
      setError("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "No se pudo cargar el centro de guerras.",
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const active = wars.find((war) => ["DECLARED", "PREPARING", "ACTIVE"].includes(war.status));

  const loadSnapshot = useCallback(async () => {
    if (!active) {
      setSnapshot(null);
      return;
    }
    try {
      setSnapshot(await api<Snapshot>(`/api/alliance/war/status/${active.war_id}`));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo consultar la batalla.",
      );
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
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Operación no completada.");
    } finally {
      setBusy(false);
    }
  };

  const attackerParticipants =
    snapshot?.participants.filter(
      (participant) => participant.alliance_id === active?.attacker_alliance_id,
    ) ?? [];
  const defenderParticipants =
    snapshot?.participants.filter(
      (participant) => participant.alliance_id === active?.defender_alliance_id,
    ) ?? [];
  const canStart = attackerParticipants.length >= 3 && defenderParticipants.length >= 3;

  return (
    <section className="mt-5 space-y-4">
      <header className="relative overflow-hidden border border-fuchsia-300/25 bg-[linear-gradient(115deg,#0a1022_0%,#1b1030_55%,#090d1c_100%)] p-4 sm:p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(90deg,transparent_49.8%,rgba(0,240,255,.12)_50%,transparent_50.2%),linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:42px_42px]"
        />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[8px] font-bold uppercase tracking-[0.3em] text-fuchsia-200">
              COMANDO ESTRATÉGICO · MULTIJUGADOR
            </p>
            <h3 className="mt-1 text-lg font-black uppercase tracking-[0.14em] text-white sm:text-xl">
              Teatro de operaciones
            </h3>
            <p className="mt-1 text-[9px] uppercase tracking-wider text-white/45">
              10 HORDAS · 20 MINUTOS · COMBATE AUTORITATIVO
            </p>
          </div>
          <div className="border border-cyan-300/25 bg-cyan-300/[0.06] px-3 py-2 text-right">
            <p className="text-[8px] uppercase tracking-widest text-cyan-100/55">
              Alianzas disponibles
            </p>
            <p className="text-lg font-black tabular-nums text-cyan-100">{opponents.length}</p>
          </div>
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="border border-rose-400/30 bg-rose-950/30 px-3 py-2 text-[10px] text-rose-200"
        >
          {error}
        </div>
      ) : null}
      {notice ? (
        <div
          role="status"
          className="border border-emerald-400/25 bg-emerald-950/20 px-3 py-2 text-[10px] text-emerald-200"
        >
          {notice}
        </div>
      ) : null}

      {!active && role === "lider" ? (
        <div className="border border-cyan-300/20 bg-[#0b1020]/80 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[8px] uppercase tracking-[0.25em] text-cyan-200/60">
                INICIAR CONFLICTO
              </p>
              <h4 className="mt-1 text-sm font-black uppercase tracking-wider text-white">
                Seleccionar alianza rival
              </h4>
            </div>
            <span className="text-[8px] uppercase tracking-widest text-white/35">Solo líderes</span>
          </div>
          {opponents.length ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <select
                aria-label="Alianza rival"
                value={rival}
                onChange={(event) => setRival(event.target.value)}
                className="h-11 min-w-0 flex-1 border border-cyan-300/25 bg-[#070814] px-3 text-xs text-white"
              >
                <option value="">SELECCIONAR RIVAL</option>
                {opponents.map((opponent) => (
                  <option key={opponent.alliance_id} value={opponent.alliance_id}>
                    [{opponent.tag}] {opponent.name} · NIVEL {opponent.level} ·{" "}
                    {opponent.member_count}/10
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
                className="h-11 rounded-none bg-cyan-300 px-5 text-[9px] font-black uppercase tracking-wider text-[#070814] hover:bg-cyan-200"
              >
                Declarar guerra
              </Button>
            </div>
          ) : (
            <p className="mt-3 border border-white/10 bg-white/[0.025] p-3 text-[9px] uppercase tracking-wider text-white/40">
              No hay alianzas rivales disponibles en este momento.
            </p>
          )}
        </div>
      ) : null}

      {active ? (
        <div className="overflow-hidden border border-fuchsia-300/30 bg-[#0a0d1b]">
          <div className="border-b border-fuchsia-300/20 bg-fuchsia-300/[0.06] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[8px] uppercase tracking-[0.25em] text-fuchsia-200/70">
                ENFRENTAMIENTO ACTUAL
              </p>
              <span className="border border-fuchsia-300/30 bg-fuchsia-300/10 px-2 py-1 text-[7px] font-bold uppercase tracking-wider text-fuchsia-100 sm:text-[8px]">
                {statusLabel[active.status] ?? active.status}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4">
              <div className="flex min-w-0 flex-col items-center gap-1 text-center">
                <ShipSprite seed={active.attacker_tag} size={44} />
                <p className="w-full truncate text-[10px] font-black uppercase tracking-wider text-cyan-100 sm:text-xs">
                  {active.attacker_name}
                </p>
                <p className="text-[8px] text-cyan-200/50">[{active.attacker_tag}]</p>
              </div>
              <div className="flex flex-col items-center gap-2">
                <span className="text-xl font-black italic text-fuchsia-300 [text-shadow:0_0_12px_#ff4df0] sm:text-2xl">
                  VS
                </span>
                <WarClock since={active.created_at} label="T+ MISIÓN" />
              </div>
              <div className="flex min-w-0 flex-col items-center gap-1 text-center">
                <ShipSprite seed={active.defender_tag} size={44} className="rotate-180" />
                <p className="w-full truncate text-[10px] font-black uppercase tracking-wider text-fuchsia-100 sm:text-xs">
                  {active.defender_name}
                </p>
                <p className="text-[8px] text-fuchsia-200/50">[{active.defender_tag}]</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-px bg-white/10">
            <Stat
              label="Naves atacante"
              value={
                attackerParticipants.length || (active.status === "DECLARED" ? "Pendiente" : 0)
              }
              tone="cyan"
            />
            <Stat
              label="Naves defensor"
              value={
                defenderParticipants.length || (active.status === "DECLARED" ? "Pendiente" : 0)
              }
              tone="fuchsia"
            />
          </div>

          {active.status === "DECLARED" &&
          active.defender_alliance_id === allianceId &&
          role === "lider" ? (
            <div className="flex flex-col gap-2 p-4 sm:flex-row sm:justify-end">
              <Button
                disabled={busy}
                onClick={() =>
                  void act(
                    "/api/alliance/war/respond",
                    { war_id: active.war_id, decision: "ACCEPT" },
                    "GUERRA ACEPTADA",
                  )
                }
                className="h-10 rounded-none bg-emerald-500 text-[9px] font-black uppercase text-[#07110d]"
              >
                Aceptar desafío
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
                className="h-10 rounded-none border-rose-300/30 bg-transparent text-[9px] uppercase text-rose-200"
              >
                Rechazar
              </Button>
            </div>
          ) : null}

          {active.status === "PREPARING" ? (
            <div className="space-y-4 p-4 sm:p-5">
              <div>
                <p className="text-[8px] uppercase tracking-[0.25em] text-cyan-200/60">
                  FASE DE DESPLIEGUE
                </p>
                <h5 className="mt-1 text-xs font-black uppercase tracking-wider text-white">
                  Registrar flotas de combate
                </h5>
                <p className="mt-1 text-[9px] leading-relaxed text-white/45">
                  Cada alianza debe registrar al menos tres naves desbloqueadas antes de iniciar.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Stat
                  label="Flota atacante"
                  value={`${attackerParticipants.length}/3`}
                  tone="cyan"
                />
                <Stat
                  label="Flota defensora"
                  value={`${defenderParticipants.length}/3`}
                  tone="fuchsia"
                />
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  aria-label="Seleccionar nave"
                  value={shipId}
                  onChange={(event) => setShipId(event.target.value)}
                  className="h-10 min-w-0 flex-1 border border-cyan-300/25 bg-[#070814] px-3 text-xs text-white"
                >
                  <option value="">SELECCIONAR NAVE</option>
                  {ships.map((ship) => (
                    <option key={ship.item_id} value={ship.item_id}>
                      {ship.item_name}
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
                  className="h-10 rounded-none bg-cyan-300 px-4 text-[9px] font-black uppercase text-[#070814]"
                >
                  Registrar nave
                </Button>
                {role === "lider" ? (
                  <Button
                    disabled={busy || !canStart}
                    onClick={() =>
                      void act(
                        "/api/alliance/war/start",
                        { war_id: active.war_id },
                        "COMBATE INICIADO",
                      )
                    }
                    className="h-10 rounded-none bg-fuchsia-500 px-4 text-[9px] font-black uppercase text-white"
                  >
                    Iniciar combate
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {active.status === "ACTIVE" ? (
            <div className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[8px] uppercase tracking-[0.25em] text-fuchsia-200/60">
                    BATALLA EN CURSO
                  </p>
                  <h5 className="mt-1 text-lg font-black uppercase tracking-wider text-white">
                    HORDA {snapshot?.horde ?? 1}
                    <span className="text-white/35"> / 10</span>
                  </h5>
                </div>
                <span className="animate-pulse border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-[8px] font-bold uppercase tracking-widest text-rose-200">
                  Combate activo
                </span>
              </div>
              <div className="border border-white/10 bg-[#050712]/70 p-3">
                <p className="mb-2 text-[7px] uppercase tracking-[0.25em] text-white/40">
                  PROGRESO DE HORDAS
                </p>
                <HordeTrack current={snapshot?.horde ?? 1} />
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <SideCard
                  name={active.attacker_name}
                  tag={active.attacker_tag}
                  participants={attackerParticipants}
                  enemyHp={snapshot?.enemy_hp?.attacker}
                />
                <SideCard
                  name={active.defender_name}
                  tag={active.defender_tag}
                  participants={defenderParticipants}
                  enemyHp={snapshot?.enemy_hp?.defender}
                />
              </div>
              <div className="border border-amber-300/20 bg-amber-300/[0.04] p-3">
                <p className="text-[9px] leading-relaxed text-amber-100/75">
                  Las naves, el daño y el resultado se calculan en el servidor. Tu acción registra
                  un disparo para atacar la horda rival.
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
                  className="mt-3 h-11 w-full rounded-none bg-cyan-300 text-[10px] font-black uppercase tracking-[0.2em] text-[#070814] hover:bg-cyan-200"
                >
                  ⚡ Disparar
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="border border-cyan-300/15 bg-[#0b1020]/65 p-5 text-center sm:p-7">
          <div className="mx-auto grid h-12 w-12 place-items-center border border-cyan-300/25 bg-cyan-300/[0.06] text-xl text-cyan-100">
            ⚔
          </div>
          <p className="mt-3 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-100/70">
            Sector sin conflictos activos
          </p>
          <p className="mx-auto mt-2 max-w-md text-[10px] leading-relaxed text-white/40">
            Cuando se declare una guerra, aquí aparecerán los preparativos, las flotas y el
            desarrollo de la batalla.
          </p>
        </div>
      )}

      <div className="border border-white/10 bg-[#090d19]/70 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[8px] uppercase tracking-[0.25em] text-white/35">REGISTRO TÁCTICO</p>
            <h4 className="mt-1 text-xs font-black uppercase tracking-wider text-white">
              Historial de guerras
            </h4>
          </div>
          <span className="text-[9px] tabular-nums text-white/40">{wars.length} REGISTROS</span>
        </div>
        {wars.length ? (
          <ul className="mt-3 divide-y divide-white/10">
            {wars.map((war) => (
              <li
                key={war.war_id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3"
              >
                <div className="flex shrink-0 -space-x-2">
                  <ShipSprite seed={war.attacker_tag} size={24} />
                  <ShipSprite seed={war.defender_tag} size={24} className="rotate-180" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-bold uppercase text-white/85">
                    {war.attacker_name} <span className="text-fuchsia-200">VS</span>{" "}
                    {war.defender_name}
                  </p>
                  <p className="mt-1 text-[8px] uppercase tracking-wider text-white/35">
                    [{war.attacker_tag}] {war.attacker_hordes_survived ?? 0} ·{" "}
                    {war.defender_hordes_survived ?? 0} [{war.defender_tag}] HORDAS
                  </p>
                </div>
                {(() => {
                  const label =
                    war.status === "COMPLETED"
                      ? war.winner_alliance_id === allianceId
                        ? "VICTORIA"
                        : war.winner_alliance_id
                          ? "DERROTA"
                          : "EMPATE"
                      : (statusLabel[war.status] ?? war.status);
                  const tone =
                    label === "VICTORIA"
                      ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-200"
                      : label === "DERROTA"
                        ? "border-rose-300/40 bg-rose-400/10 text-rose-200"
                        : "border-white/15 bg-white/[0.03] text-cyan-100";
                  return (
                    <span
                      className={`max-w-[7.5rem] shrink-0 truncate border px-2 py-1 text-[7px] font-black uppercase tracking-wider sm:text-[8px] ${tone}`}
                    >
                      {label}
                    </span>
                  );
                })()}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 border border-dashed border-white/10 p-4 text-center text-[9px] uppercase tracking-wider text-white/35">
            Todavía no hay enfrentamientos registrados.
          </p>
        )}
      </div>
    </section>
  );
}
