import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { AllianceWars } from "@/components/AllianceWars";

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

export function AllianceProfile({
  obsidian,
  onObsidianChange,
}: {
  obsidian: number | null;
  onObsidianChange: (value: number) => void;
}) {
  const [state, setState] = useState<AllianceState | null>(null);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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

  return (
    <div className="mt-6 space-y-6 lg:col-start-2">
      {error ? (
        <p
          role="alert"
          className="border border-rose-400/30 bg-rose-400/5 p-3 text-xs text-rose-200"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="border border-cyan-400/30 bg-cyan-400/5 p-3 text-xs text-cyan-200"
        >
          {notice}
        </p>
      ) : null}
      {loading ? (
        <p className="text-xs uppercase tracking-widest text-white/50">CARGANDO ALIANZA...</p>
      ) : alliance ? (
        <section className="border border-cyan-500/20 bg-[#0b0d1c]/75 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[9px] uppercase tracking-[0.2em] text-cyan-200">
                ALIANZA <span className="text-fuchsia-300">[{alliance.tag}]</span>
              </p>
              <h2 className="mt-2 text-lg font-black uppercase tracking-widest">{alliance.name}</h2>
              <p className="mt-1 text-[9px] uppercase tracking-widest text-white/45">
                NIVEL {alliance.level} · {alliance.members.length}/10 MIEMBROS · TU ROL:{" "}
                {alliance.role}
              </p>
            </div>
            {alliance.role !== "lider" ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void runAction("/api/alliance/leave", {}, "SALISTE DE LA ALIANZA")}
                className="rounded-none border-rose-400/40 text-[9px] uppercase text-rose-200"
              >
                SALIR DE LA ALIANZA
              </Button>
            ) : null}
          </div>
          <ul className="mt-5 divide-y divide-white/10 border-y border-white/10">
            {alliance.members.map((member) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 py-3"
                key={member.pilot_id}
              >
                <span className="text-xs font-bold">
                  {member.callsign}{" "}
                  <span className="ml-1 text-[9px] uppercase text-cyan-200/65">{member.role}</span>
                </span>
                {member.role !== "lider" && alliance.role === "lider" ? (
                  <div className="flex gap-2">
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
                          member.role === "teniente" ? "ROL ACTUALIZADO" : "TENIENTE DESIGNADO",
                        )
                      }
                      className="h-8 rounded-none border-cyan-400/30 text-[8px] uppercase"
                    >
                      {member.role === "teniente" ? "HACER MIEMBRO" : "PROMOVER"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void runAction(
                          "/api/alliance/kick",
                          { pilot_id: member.pilot_id },
                          "MIEMBRO EXPULSADO",
                        )
                      }
                      className="h-8 rounded-none border-rose-400/30 text-[8px] uppercase text-rose-200"
                    >
                      EXPULSAR
                    </Button>
                  </div>
                ) : canManageMembers && member.role === "miembro" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void runAction(
                        "/api/alliance/kick",
                        { pilot_id: member.pilot_id },
                        "MIEMBRO EXPULSADO",
                      )
                    }
                    className="h-8 rounded-none border-rose-400/30 text-[8px] uppercase text-rose-200"
                  >
                    EXPULSAR
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {alliance.role === "lider" ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (window.confirm("¿Disolver esta alianza y eliminar todas sus invitaciones?")) {
                  void runAction("/api/alliance/dissolve", {}, "ALIANZA DISUELTA");
                }
              }}
              className="mt-5 rounded-none border-rose-400/40 text-[9px] uppercase text-rose-200"
            >
              DISOLVER ALIANZA
            </Button>
          ) : null}
          <AllianceWars allianceId={alliance.alliance_id} role={alliance.role} />
        </section>
      ) : (
        <section className="border border-cyan-500/20 bg-[#0b0d1c]/75 p-4 sm:p-6">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">
            CREAR ALIANZA
          </h2>
          <p className="mt-2 text-[10px] leading-5 text-white/50">
            Requiere VIP activo y 20 OBS. Disponible: {obsidian?.toLocaleString() ?? "--"} OBS
          </p>
          <p className="mt-1 text-[10px] text-white/45">
            Estado VIP: {state?.vip ? "ACTIVO" : "INACTIVO"}
          </p>
          <form
            className="mt-5 grid gap-3 sm:grid-cols-[1fr_150px_auto]"
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
              className="h-11 rounded-none bg-[#00f0ff] px-4 text-[9px] font-bold uppercase text-[#070814]"
            >
              CREAR · 20 OBS
            </Button>
          </form>
        </section>
      )}
      {state?.invites.length ? (
        <section className="border border-fuchsia-400/25 bg-fuchsia-400/[0.04] p-4 sm:p-6">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-fuchsia-200">
            INVITACIONES PENDIENTES
          </h2>
          <ul className="mt-3 space-y-3">
            {state.invites.map((invite) => (
              <li
                className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3"
                key={invite.invite_id}
              >
                <span className="text-xs">
                  <b>{invite.alliance_name}</b>{" "}
                  <span className="text-fuchsia-200">[{invite.tag}]</span> · por{" "}
                  {invite.inviter_name}
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
                    className="h-8 rounded-none bg-emerald-500/80 text-[8px] uppercase text-white"
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
                    className="h-8 rounded-none border-rose-400/30 text-[8px] uppercase text-rose-200"
                  >
                    RECHAZAR
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
