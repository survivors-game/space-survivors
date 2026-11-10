import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  DAILY_MISSION_TEMPLATES,
  SEASON_CHALLENGES,
  WEEKLY_MISSION_TEMPLATES,
  getActiveDailyMissions,
  getActiveWeeklyMissions,
  getUtcWeekStr,
} from "@/game/meta/missions";

type SeasonEvent = {
  id: string;
  name: string;
  description: string;
  starts_at: number;
  ends_at: number;
  reward_description: string;
  status: "DRAFT" | "ACTIVE" | "FINISHED";
  created_by: string;
  created_at: number;
  updated_at: number;
};
type SeasonPilot = {
  pilot_id: string;
  callsign: string;
  email: string | null;
  pt: number;
  season_id: string | null;
  daily_completed: number;
  weekly_completed: number;
};
type SeasonLog = {
  event_id: string;
  action: string;
  event_name: string;
  admin_email: string;
  created_at: number;
};
type SeasonPayload = {
  events: SeasonEvent[];
  ranking: SeasonPilot[];
  participants: number;
  activeEvents: number;
  logs: SeasonLog[];
  error?: string;
};
type EventDraft = {
  id: string;
  name: string;
  description: string;
  startsAt: string;
  endsAt: string;
  rewardDescription: string;
  status: "DRAFT" | "ACTIVE" | "FINISHED";
};
const emptyDraft = (): EventDraft => ({
  id: "",
  name: "",
  description: "",
  startsAt: "",
  endsAt: "",
  rewardDescription: "",
  status: "DRAFT",
});
const inputClass =
  "mt-1 h-10 w-full rounded border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-cyan-400/40";
const dateTimeValue = (value: number) => {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};
const dateLabel = (value: number) => new Date(value).toLocaleString("es-CO");

export function SeasonAdminSection() {
  const [data, setData] = useState<SeasonPayload | null>(null);
  const [draft, setDraft] = useState<EventDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/seasons", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const payload = (await response.json()) as SeasonPayload;
      if (!response.ok) throw new Error(payload.error || "No se pudo cargar la información.");
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar la información.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/admin/seasons", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(payload.error || "No se pudo guardar la operación.");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const startsAt = new Date(draft.startsAt).getTime();
    const endsAt = new Date(draft.endsAt).getTime();
    if (!draft.name.trim() || draft.description.trim().length < 5 ||
        !Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) {
      setError("Revisa el nombre, la descripción y las fechas de la temporada.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await send({
        action: draft.id ? "update" : "create",
        ...(draft.id ? { id: draft.id } : {}),
        name: draft.name.trim(),
        description: draft.description.trim(),
        startsAt,
        endsAt,
        rewardDescription: draft.rewardDescription.trim(),
        status: draft.status,
      });
      setDraft(emptyDraft());
      setNotice("Temporada guardada.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la temporada.");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (event: SeasonEvent, status: SeasonEvent["status"]) => {
    if (!window.confirm("¿Cambiar el estado de «" + event.name + "» a " + status + "?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await send({ action: "status", id: event.id, status });
      setNotice("Estado de temporada actualizado.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cambiar el estado.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (event: SeasonEvent) => {
    if (!window.confirm("¿Eliminar la temporada «" + event.name + "»?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await send({ action: "delete", id: event.id });
      setNotice("Temporada eliminada.");
      if (draft.id === event.id) setDraft(emptyDraft());
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar la temporada.");
    } finally {
      setBusy(false);
    }
  };

  const edit = (event: SeasonEvent) => {
    setDraft({
      id: event.id,
      name: event.name,
      description: event.description,
      startsAt: dateTimeValue(event.starts_at),
      endsAt: dateTimeValue(event.ends_at),
      rewardDescription: event.reward_description,
      status: event.status,
    });
    setError("");
    setNotice("Editando: " + event.name);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Eventos activos ahora", data?.activeEvents ?? 0],
          ["Pilotos con progreso de temporada", data?.participants ?? 0],
          ["Pilotos en ranking", data?.ranking.length ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="rounded border border-white/10 bg-white/[0.03] p-3">
            <p className="text-xs uppercase tracking-wider text-white/55">{label}</p>
            <p className="mt-2 font-arcade text-lg text-cyan-200">{loading ? "…" : value}</p>
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3 rounded border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs uppercase tracking-wider text-cyan-200">
            {draft.id ? "Editar temporada o evento" : "Crear temporada o evento"}
          </h3>
          {draft.id ? (
            <button type="button" onClick={() => setDraft(emptyDraft())} className="text-xs text-white/60 hover:text-white">
              Cancelar edición
            </button>
          ) : null}
        </div>
        <label className="block text-xs text-white/70">
          Nombre
          <input required minLength={3} maxLength={90} value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })} className={inputClass} />
        </label>
        <label className="block text-xs text-white/70">
          Descripción
          <textarea required minLength={5} maxLength={1200} rows={3} value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            className="mt-1 w-full rounded border border-white/10 bg-black/40 p-3 text-sm text-white outline-none focus:border-cyan-400/40" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-white/70">
            Inicio
            <input required type="datetime-local" value={draft.startsAt}
              onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} className={inputClass} />
          </label>
          <label className="block text-xs text-white/70">
            Finalización
            <input required type="datetime-local" value={draft.endsAt}
              onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} className={inputClass} />
          </label>
        </div>
        <label className="block text-xs text-white/70">
          Premios del evento (descripción)
          <input maxLength={500} value={draft.rewardDescription}
            onChange={(event) => setDraft({ ...draft, rewardDescription: event.target.value })}
            placeholder="Describe los premios; las entregas se realizan desde Premios y recompensas."
            className={inputClass} />
        </label>
        <label className="block text-xs text-white/70">
          Estado
          <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as EventDraft["status"] })} className={inputClass}>
            <option value="DRAFT">Borrador</option>
            <option value="ACTIVE">Activo</option>
            <option value="FINISHED">Finalizado</option>
          </select>
        </label>
        <button type="submit" disabled={busy} className="rounded bg-amber-400/90 px-4 py-2.5 text-xs font-bold uppercase text-black disabled:opacity-40">
          {busy ? "Guardando..." : draft.id ? "Guardar cambios" : "Crear temporada"}
        </button>
      </form>

      {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
      {notice ? <p role="status" className="text-sm text-emerald-300">{notice}</p> : null}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs uppercase tracking-wider text-cyan-200">Temporadas y eventos</h3>
          <button type="button" onClick={() => void load()} className="rounded border border-white/15 px-3 py-2 text-xs text-white/70">Actualizar</button>
        </div>
        <div className="overflow-x-auto rounded border border-white/10">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead className="bg-white/[0.03] text-white/55">
              <tr>{["Nombre", "Inicio", "Fin", "Estado", "Premios", "Acciones"].map((label) => <th key={label} className="px-3 py-2 font-normal">{label}</th>)}</tr>
            </thead>
            <tbody>
              {(data?.events ?? []).map((event) => (
                <tr key={event.id} className="border-t border-white/5 text-white/75">
                  <td className="px-3 py-3"><strong>{event.name}</strong><p className="mt-1 max-w-xs whitespace-normal text-white/45">{event.description}</p></td>
                  <td className="px-3 py-3">{dateLabel(event.starts_at)}</td>
                  <td className="px-3 py-3">{dateLabel(event.ends_at)}</td>
                  <td className="px-3 py-3">{event.status}</td>
                  <td className="px-3 py-3">{event.reward_description || "—"}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy} onClick={() => edit(event)} className="text-cyan-200">Editar</button>
                      {event.status !== "ACTIVE" ? <button type="button" disabled={busy} onClick={() => void changeStatus(event, "ACTIVE")} className="text-emerald-300">Activar</button> : <button type="button" disabled={busy} onClick={() => void changeStatus(event, "FINISHED")} className="text-amber-200">Finalizar</button>}
                      {event.status !== "DRAFT" ? <button type="button" disabled={busy} onClick={() => void changeStatus(event, "DRAFT")} className="text-white/60">Borrador</button> : null}
                      <button type="button" disabled={busy} onClick={() => void remove(event)} className="text-rose-300">Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !data?.events.length ? <p className="p-4 text-center text-xs text-white/45">Todavía no hay temporadas o eventos registrados.</p> : null}
          {loading ? <p className="p-4 text-center text-xs text-white/45">Cargando...</p> : null}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-cyan-200">Misiones configuradas en el juego</h3>
        <p className="text-xs text-white/45">Catálogo actual de misiones diarias, semanales y desafíos de temporada. Las reglas y recompensas base se definen en el sistema del juego.</p>
        <div className="grid gap-3 lg:grid-cols-3">
          {[
            { title: "Diarias activas", items: getActiveDailyMissions(new Date().toISOString().slice(0, 10)) },
            { title: "Semanales activas", items: getActiveWeeklyMissions(getUtcWeekStr()) },
            { title: "Desafíos de temporada", items: SEASON_CHALLENGES },
          ].map((group) => (
            <div key={group.title} className="overflow-hidden rounded border border-white/10">
              <h4 className="border-b border-white/10 px-3 py-2 text-xs text-cyan-100">{group.title}</h4>
              <div className="max-h-80 space-y-2 overflow-y-auto p-3">
                {group.items.map((mission) => (
                  <div key={mission.id} className="border-b border-white/5 pb-2 last:border-0">
                    <p className="text-xs font-bold text-white/80">{mission.title}</p>
                    <p className="mt-1 text-[11px] text-white/45">{mission.desc}</p>
                    <p className="mt-1 text-[11px] text-cyan-200">Meta: {mission.goal.toLocaleString("es-CO")} · Premio: {mission.reward} CR · {mission.pt} PT</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-white/45">Plantillas disponibles: {DAILY_MISSION_TEMPLATES.length} diarias y {WEEKLY_MISSION_TEMPLATES.length} semanales. Las entregas adicionales o correcciones se realizan en «Premios y recompensas».</p>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-wider text-cyan-200">Progreso y ranking de temporada</h3>
        <div className="overflow-x-auto rounded border border-white/10">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-white/[0.03] text-white/55">
              <tr>{["Pos.", "Piloto", "Temporada", "PT", "Diarias", "Semanales"].map((label) => <th key={label} className="px-3 py-2 font-normal">{label}</th>)}</tr>
            </thead>
            <tbody>
              {(data?.ranking ?? []).map((pilot, index) => (
                <tr key={pilot.pilot_id} className="border-t border-white/5 text-white/75">
                  <td className="px-3 py-2">{index + 1}</td>
                  <td className="px-3 py-2">{pilot.callsign}<p className="text-white/40">{pilot.email ?? pilot.pilot_id}</p></td>
                  <td className="px-3 py-2">{pilot.season_id ?? "—"}</td>
                  <td className="px-3 py-2 text-cyan-200">{pilot.pt.toLocaleString("es-CO")}</td>
                  <td className="px-3 py-2">{pilot.daily_completed}</td>
                  <td className="px-3 py-2">{pilot.weekly_completed}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !data?.ranking.length ? <p className="p-4 text-center text-xs text-white/45">Todavía no hay progreso de temporada guardado.</p> : null}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs uppercase tracking-wider text-cyan-200">Historial de administración</h3>
        <div className="overflow-hidden rounded border border-white/10">
          {(data?.logs ?? []).map((entry, index) => (
            <div key={entry.event_id + entry.created_at + index} className="flex flex-wrap justify-between gap-2 border-t border-white/5 px-3 py-2 text-xs text-white/65">
              <span>{entry.action} · {entry.event_name}</span>
              <span>{entry.admin_email}</span>
              <span>{dateLabel(entry.created_at)}</span>
            </div>
          ))}
          {!loading && !data?.logs.length ? <p className="p-4 text-center text-xs text-white/45">Sin operaciones registradas.</p> : null}
        </div>
      </section>
    </div>
  );
}
