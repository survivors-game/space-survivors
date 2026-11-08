import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AllianceWars } from "@/components/AllianceWars";
import {
  MpAlert,
  MpBadge,
  MpEmpty,
  MpHeader,
  MpPanel,
  MpStat,
  MpTabs,
  roleLabel,
  roleTone,
} from "@/components/multiplayer/MultiplayerUI";

type AllianceMember = {
  pilot_id: string;
  callsign: string;
  role: "lider" | "teniente" | "miembro";
  joined_at: number;
};

type AllianceInvite = {
  invite_id: string;
  alliance_id: string;
  alliance_name: string;
  tag: string;
  invited_by: string;
  inviter_name: string;
  created_at: number;
};

type AllianceState = {
  alliance: {
    alliance_id: string;
    name: string;
    tag: string;
    level: number;
    leader_pilot_id: string;
    role: AllianceMember["role"];
    members: AllianceMember[];
  } | null;
  invites: AllianceInvite[];
  vip: boolean;
};

type RankedAlliance = {
  alliance_id: string;
  name: string;
  tag: string;
  level: number;
  war_wins: number;
  war_losses: number;
  member_count: number;
};

export type BossHelpInviteView = {
  sessionId: string;
  hostName: string;
  bossName: string;
  world: number;
};

async function allianceRequest<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    ...(body
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "No se pudo completar la operación de alianza.";
    throw new Error(error);
  }
  return payload as T;
}

type HubTab = "HQ" | "WARS" | "HELP";

export function AllianceProfile({
  obsidian,
  onObsidianChange,
  bossHelpInvite = null,
  onJoinBossHelp,
  onDismissBossHelp,
}: {
  obsidian: number | null;
  onObsidianChange: (value: number) => void;
  bossHelpInvite?: BossHelpInviteView | null;
  onJoinBossHelp?: () => void;
  onDismissBossHelp?: () => void;
}) {
  const [state, setState] = useState<AllianceState | null>(null);
  const [ranking, setRanking] = useState<RankedAlliance[]>([]);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<HubTab>("HQ");

  const refresh = useCallback(async () => {
    setError("");
    try {
      setState(await allianceRequest<AllianceState>("/api/alliance/mine"));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo cargar la alianza.",
      );
    } finally {
      setLoading(false);
    }
    try {
      const board = await allianceRequest<{ alliances: RankedAlliance[] }>(
        "/api/alliance/leaderboard",
      );
      setRanking(board.alliances ?? []);
    } catch {
      setRanking([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const runAction = async (
    path: string,
    body?: Record<string, unknown>,
    successMessage = "OPERACIÓN COMPLETADA",
  ) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await allianceRequest<{ obsidian?: number }>(path, body);
      if (typeof result.obsidian === "number") onObsidianChange(result.obsidian);
      setNotice(successMessage);
      await refresh();
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "No se pudo completar la operación.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const alliance = state?.alliance;
  const canManageMembers = alliance?.role === "lider" || alliance?.role === "teniente";
  const leader = alliance?.members.find((m) => m.role === "lider");
  const lieutenants = alliance?.members.filter((m) => m.role === "teniente").length ?? 0;
  const ownRank = alliance ? ranking.find((r) => r.alliance_id === alliance.alliance_id) : null;
  const ownRankPos = ownRank ? ranking.indexOf(ownRank) + 1 : null;

  const kickButton = (member: AllianceMember) => (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={busy}
      onClick={() =>
        void runAction("/api/alliance/kick", { pilot_id: member.pilot_id }, "MIEMBRO EXPULSADO")
      }
      className="h-8 rounded-none border-rose-400/30 bg-transparent text-[8px] uppercase text-rose-200 hover:bg-rose-500/10"
    >
      EXPULSAR
    </Button>
  );

  return (
    <div className="mt-6 space-y-4 lg:col-start-2">
      {/* Hub banner */}
      <div className="relative overflow-hidden border border-cyan-400/25 bg-[linear-gradient(120deg,#0b0d1c_0%,#160c2a_55%,#0b0d1c_100%)] px-4 py-4 sm:px-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(0deg,transparent_0,transparent_3px,rgba(0,240,255,0.08)_3px,rgba(0,240,255,0.08)_4px)]"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-fuchsia-300">
              RED MULTIJUGADOR
            </p>
            <h2 className="mt-1 text-lg font-black uppercase tracking-[0.16em] text-white sm:text-xl">
              CENTRO DE OPERACIONES
            </h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {alliance ? (
              <MpBadge tone="emerald">
                [{alliance.tag}] {alliance.name}
              </MpBadge>
            ) : (
              <MpBadge tone="muted">SIN ALIANZA</MpBadge>
            )}
            <MpBadge tone={state?.vip ? "amber" : "muted"}>
              VIP {state?.vip ? "ACTIVO" : "INACTIVO"}
            </MpBadge>
            <MpBadge tone="cyan">{obsidian?.toLocaleString() ?? "--"} OBS</MpBadge>
          </div>
        </div>
      </div>

      <MpTabs<HubTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "HQ", label: "Alianza", icon: "◆", count: state?.invites.length ?? 0 },
          { id: "WARS", label: "Guerras", icon: "⚔" },
          { id: "HELP", label: "Ayuda jefes", icon: "✚", count: bossHelpInvite ? 1 : 0 },
        ]}
      />

      {error ? <MpAlert kind="error">{error}</MpAlert> : null}
      {notice ? <MpAlert kind="notice">{notice}</MpAlert> : null}

      {loading ? (
        <MpPanel>
          <p className="animate-pulse text-[10px] uppercase tracking-[0.25em] text-cyan-200/70">
            ESTABLECIENDO ENLACE CON LA RED...
          </p>
        </MpPanel>
      ) : tab === "HQ" ? (
        <div className="space-y-4">
          {alliance ? (
            <>
              <MpPanel>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="grid h-16 w-16 shrink-0 place-items-center border-2 border-cyan-300/60 bg-gradient-to-br from-cyan-500/20 to-fuchsia-600/25 text-sm font-black tracking-widest text-white shadow-[0_0_24px_#00f0ff33] [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)]">
                    {alliance.tag}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] uppercase tracking-[0.25em] text-cyan-200">
                      PERFIL DE ALIANZA
                    </p>
                    <h3 className="mt-1 truncate text-lg font-black uppercase tracking-[0.14em]">
                      {alliance.name}
                    </h3>
                    <p className="mt-1 text-[9px] uppercase tracking-widest text-white/45">
                      LÍDER: <span className="text-amber-200">{leader?.callsign ?? "—"}</span> · TU
                      ROL:{" "}
                      <span className="text-fuchsia-200">
                        {roleLabel[alliance.role] ?? alliance.role}
                      </span>
                    </p>
                  </div>
                  {alliance.role !== "lider" ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void runAction("/api/alliance/leave", {}, "SALISTE DE LA ALIANZA")
                      }
                      className="rounded-none border-rose-400/40 bg-transparent text-[9px] uppercase text-rose-200 hover:bg-rose-500/10"
                    >
                      SALIR DE LA ALIANZA
                    </Button>
                  ) : null}
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MpStat label="Nivel" value={alliance.level} />
                  <MpStat
                    label="Tripulación"
                    value={`${alliance.members.length}/10`}
                    tone="fuchsia"
                  />
                  <MpStat
                    label="Guerras V/D"
                    value={ownRank ? `${ownRank.war_wins}/${ownRank.war_losses}` : "—"}
                    tone="emerald"
                  />
                  <MpStat
                    label="Ranking"
                    value={ownRankPos ? `#${ownRankPos}` : "—"}
                    tone="amber"
                  />
                </div>
              </MpPanel>

              <MpPanel tone="fuchsia">
                <MpHeader
                  kicker="TRIPULACIÓN"
                  title="Miembros y cargos"
                  tone="fuchsia"
                  aside={
                    <>
                      <MpBadge tone="amber">1 LÍDER</MpBadge>
                      <MpBadge tone="fuchsia">{lieutenants} TENIENTES</MpBadge>
                    </>
                  }
                />
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {alliance.members.map((member) => (
                    <li
                      key={member.pilot_id}
                      className="flex flex-wrap items-center justify-between gap-2 border border-white/10 bg-white/[0.02] px-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center border border-cyan-400/30 bg-cyan-400/10 text-[10px] font-black text-cyan-100">
                          {member.callsign.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold">{member.callsign}</p>
                          <MpBadge tone={roleTone[member.role] ?? "cyan"}>
                            {roleLabel[member.role] ?? member.role}
                          </MpBadge>
                        </div>
                      </div>
                      {member.role !== "lider" && alliance.role === "lider" ? (
                        <div className="flex gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void runAction(
                                "/api/alliance/promote",
                                {
                                  pilot_id: member.pilot_id,
                                  role: member.role === "teniente" ? "miembro" : "teniente",
                                },
                                member.role === "teniente"
                                  ? "ROL ACTUALIZADO"
                                  : "TENIENTE DESIGNADO",
                              )
                            }
                            className="h-8 rounded-none border-cyan-400/30 bg-transparent text-[8px] uppercase text-cyan-100 hover:bg-cyan-400/10"
                          >
                            {member.role === "teniente" ? "HACER MIEMBRO" : "PROMOVER"}
                          </Button>
                          {kickButton(member)}
                        </div>
                      ) : canManageMembers && member.role === "miembro" ? (
                        kickButton(member)
                      ) : null}
                    </li>
                  ))}
                </ul>
                {alliance.role === "lider" ? (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-rose-400/15 pt-4">
                    <p className="text-[9px] uppercase tracking-widest text-white/40">
                      ZONA DE MANDO · ACCIONES IRREVERSIBLES
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "¿Disolver esta alianza y eliminar todas sus invitaciones?",
                          )
                        ) {
                          void runAction("/api/alliance/dissolve", {}, "ALIANZA DISUELTA");
                        }
                      }}
                      className="rounded-none border-rose-400/40 bg-transparent text-[9px] uppercase text-rose-200 hover:bg-rose-500/10"
                    >
                      DISOLVER ALIANZA
                    </Button>
                  </div>
                ) : null}
              </MpPanel>
            </>
          ) : (
            <MpPanel>
              <MpHeader
                kicker="FUNDAR CORPORACIÓN"
                title="Crear alianza"
                aside={<MpBadge tone="amber">20 OBS · VIP</MpBadge>}
              />
              <p className="mt-3 text-[10px] leading-5 text-white/50">
                Requiere VIP activo y 20 OBS. Disponible: {obsidian?.toLocaleString() ?? "--"} OBS ·
                Estado VIP: {state?.vip ? "ACTIVO" : "INACTIVO"}
              </p>
              <form
                className="mt-4 grid gap-3 sm:grid-cols-[1fr_150px_auto]"
                onSubmit={(event) => {
                  event.preventDefault();
                  void runAction("/api/alliance/create", { name, tag }, "ALIANZA CREADA").then(
                    (success) => {
                      if (success) {
                        setName("");
                        setTag("");
                      }
                    },
                  );
                }}
              >
                <input
                  aria-label="Nombre de la alianza"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={3}
                  maxLength={20}
                  required
                  placeholder="NOMBRE (3-20)"
                  className="h-11 min-w-0 border border-cyan-400/30 bg-[#070814] px-3 text-xs uppercase text-white outline-none focus:border-cyan-300"
                />
                <input
                  aria-label="Etiqueta de la alianza"
                  value={tag}
                  onChange={(event) => setTag(event.target.value.toUpperCase())}
                  minLength={2}
                  maxLength={5}
                  pattern="[A-Za-z0-9]{2,5}"
                  required
                  placeholder="TAG (2-5)"
                  className="h-11 min-w-0 border border-cyan-400/30 bg-[#070814] px-3 text-xs uppercase text-white outline-none focus:border-cyan-300"
                />
                <Button
                  type="submit"
                  disabled={busy || !state?.vip || obsidian === null || obsidian < 20}
                  className="h-11 rounded-none bg-[#00f0ff] px-4 text-[9px] font-bold uppercase text-[#070814] hover:bg-cyan-200"
                >
                  CREAR · 20 OBS
                </Button>
              </form>
            </MpPanel>
          )}

          <MpPanel tone="fuchsia">
            <MpHeader
              kicker="TRANSMISIONES"
              title="Invitaciones pendientes"
              tone="fuchsia"
              aside={<MpBadge tone="fuchsia">{state?.invites.length ?? 0}</MpBadge>}
            />
            {state?.invites.length ? (
              <ul className="mt-4 space-y-2">
                {state.invites.map((invite) => (
                  <li
                    key={invite.invite_id}
                    className="flex flex-wrap items-center justify-between gap-3 border border-fuchsia-400/20 bg-fuchsia-400/[0.04] px-3 py-2.5"
                  >
                    <span className="text-xs">
                      <b>{invite.alliance_name}</b>{" "}
                      <span className="text-fuchsia-200">[{invite.tag}]</span>
                      <span className="block text-[9px] uppercase tracking-widest text-white/45">
                        Invitado por {invite.inviter_name}
                      </span>
                    </span>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || Boolean(alliance)}
                        onClick={() =>
                          void runAction(
                            "/api/alliance/accept",
                            { invite_id: invite.invite_id },
                            "INVITACIÓN ACEPTADA",
                          )
                        }
                        className="h-8 rounded-none bg-emerald-500/80 text-[8px] uppercase text-white hover:bg-emerald-500"
                      >
                        ACEPTAR
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void runAction(
                            "/api/alliance/reject",
                            { invite_id: invite.invite_id },
                            "INVITACIÓN RECHAZADA",
                          )
                        }
                        className="h-8 rounded-none border-rose-400/30 bg-transparent text-[8px] uppercase text-rose-200 hover:bg-rose-500/10"
                      >
                        RECHAZAR
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4">
                <MpEmpty
                  icon="✉"
                  tone="fuchsia"
                  title="Sin transmisiones entrantes"
                  text="Cuando una alianza te invite a su tripulación, la invitación aparecerá aquí."
                />
              </div>
            )}
          </MpPanel>

          <MpPanel tone="amber">
            <MpHeader
              kicker="CLASIFICACIÓN GALÁCTICA"
              title="Ranking de alianzas"
              tone="amber"
              aside={<MpBadge tone="amber">TOP {Math.min(ranking.length, 100) || 100}</MpBadge>}
            />
            {ranking.length ? (
              <ol className="mt-4 space-y-1.5">
                {ranking.slice(0, 10).map((row, index) => (
                  <li
                    key={row.alliance_id}
                    className={`grid grid-cols-[32px_1fr_auto] items-center gap-3 border px-3 py-2 text-xs ${
                      row.alliance_id === alliance?.alliance_id
                        ? "border-cyan-300/50 bg-cyan-400/10"
                        : "border-white/10 bg-white/[0.02]"
                    }`}
                  >
                    <span
                      className={`text-sm font-black tabular-nums ${
                        index === 0
                          ? "text-amber-300"
                          : index === 1
                            ? "text-slate-200"
                            : index === 2
                              ? "text-orange-300"
                              : "text-white/40"
                      }`}
                    >
                      #{index + 1}
                    </span>
                    <span className="min-w-0 truncate">
                      <b>{row.name}</b> <span className="text-fuchsia-200">[{row.tag}]</span>
                      <span className="block text-[9px] uppercase tracking-widest text-white/40">
                        NIVEL {row.level} · {row.member_count}/10 PILOTOS
                      </span>
                    </span>
                    <span className="text-right text-[10px] font-bold uppercase tabular-nums">
                      <span className="text-emerald-200">{row.war_wins}V</span>{" "}
                      <span className="text-rose-200">{row.war_losses}D</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mt-4">
                <MpEmpty
                  icon="★"
                  tone="amber"
                  title="Clasificación en espera"
                  text="El ranking se completa cuando las alianzas disputan sus primeras guerras."
                />
              </div>
            )}
          </MpPanel>
        </div>
      ) : tab === "WARS" ? (
        alliance ? (
          <AllianceWars allianceId={alliance.alliance_id} role={alliance.role} />
        ) : (
          <MpPanel tone="rose">
            <MpEmpty
              icon="⚔"
              tone="rose"
              title="Sala de guerra bloqueada"
              text="Únete o crea una alianza para declarar guerras, registrar naves y combatir hordas contra flotas rivales."
            />
          </MpPanel>
        )
      ) : (
        <div className="space-y-4">
          <MpPanel tone="fuchsia">
            <MpHeader
              kicker="CENTRO DE AUXILIO TÁCTICO"
              title="Solicitudes de ayuda contra jefes"
              tone="fuchsia"
              aside={
                bossHelpInvite ? (
                  <MpBadge tone="rose">SEÑAL ACTIVA</MpBadge>
                ) : (
                  <MpBadge tone="muted">SECTORES SEGUROS</MpBadge>
                )
              }
            />
            {bossHelpInvite ? (
              <div className="mt-4 overflow-hidden border border-fuchsia-300/50 bg-[radial-gradient(ellipse_at_top_right,_#3a0f3f_0%,_#0b0d1c_70%)] p-4 shadow-[0_0_30px_#ff4df022]">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-[#ff0055]/70 bg-[#ff0055]/10 text-2xl text-[#ff4d88] shadow-[0_0_24px_#ff005555]">
                    <span className="absolute inset-0 animate-ping rounded-full border border-[#ff0055]/40" />
                    ☠
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] uppercase tracking-[0.25em] text-rose-200">
                      JEFE DETECTADO · MUNDO {bossHelpInvite.world}
                    </p>
                    <p className="mt-1 truncate text-base font-black uppercase tracking-[0.12em]">
                      {bossHelpInvite.bossName}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-widest text-white/55">
                      Piloto en apuros:{" "}
                      <span className="text-fuchsia-200">{bossHelpInvite.hostName}</span>
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={!onJoinBossHelp}
                    onClick={onJoinBossHelp}
                    className="h-10 flex-1 rounded-none bg-fuchsia-600 text-[9px] font-bold uppercase text-white hover:bg-fuchsia-500"
                  >
                    DESPLEGAR COMO ESCOLTA
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!onDismissBossHelp}
                    onClick={onDismissBossHelp}
                    className="h-10 rounded-none border-white/20 bg-transparent text-[9px] uppercase text-white/70 hover:bg-white/5"
                  >
                    IGNORAR
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <MpEmpty
                  icon="✚"
                  tone="fuchsia"
                  title="Sin señales de auxilio"
                  text={
                    alliance
                      ? "Cuando un miembro de tu alianza pida ayuda contra un jefe, la alerta aparecerá aquí y en pantalla."
                      : "Únete a una alianza para recibir y enviar señales de auxilio contra jefes."
                  }
                />
              </div>
            )}
          </MpPanel>
          <MpPanel>
            <MpHeader kicker="PROTOCOLO" title="Cómo funciona la ayuda cooperativa" />
            <ol className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                [
                  "01",
                  "Pide ayuda",
                  "Durante un combate contra un jefe pulsa AYUDA! para alertar a tu alianza.",
                ],
                [
                  "02",
                  "Un aliado se une",
                  "El primer miembro que acepte entra como nave escolta en tu combate.",
                ],
                [
                  "03",
                  "Derrótenlo juntos",
                  "Ambas naves atacan al mismo jefe y comparten su barra de vida.",
                ],
              ].map(([step, title, text]) => (
                <li key={step} className="border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-lg font-black text-cyan-300/80">{step}</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest">{title}</p>
                  <p className="mt-1 text-[10px] leading-5 text-white/45">{text}</p>
                </li>
              ))}
            </ol>
          </MpPanel>
        </div>
      )}
    </div>
  );
}
