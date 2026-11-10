import { useEffect, useMemo, useState } from "react";

type AccessRow = {
  id: string;
  event: string;
  result: string;
  ip_hash: string;
  admin_email: string;
  created_at: number;
};
type AttemptRow = {
  ip_hash: string;
  attempts: number;
  window_started_at: number;
  blocked_until: number;
};
type ErrorRow = { id: string; route: string; error_message: string; created_at: number };
type OperationRow = {
  id: string;
  pilot_id: string;
  category: string;
  action: string;
  reason: string;
  admin_email: string;
  created_at: number;
};
type Payload = {
  summary?: { failedLogins: number; blockedIps: number; errors24h: number; operations: number };
  access?: AccessRow[];
  attempts?: AttemptRow[];
  errors?: ErrorRow[];
  operations?: OperationRow[];
  error?: string;
};
const panel = "rounded border border-white/10 bg-white/[0.03] p-4";
const stamp = (value: number) => (value ? new Date(value).toLocaleString("es-CO") : "—");

export function SecurityAdminSection() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"operations" | "access" | "incidents">("operations");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/security", { credentials: "same-origin" });
      const payload = (await response.json()) as Payload;
      if (!response.ok)
        throw new Error(payload.error || "No se pudo cargar seguridad y auditoría.");
      setData(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar la información.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const operations = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return (data?.operations ?? []).filter(
      (row) =>
        !term ||
        [row.category, row.action, row.pilot_id, row.reason, row.admin_email].some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(term),
        ),
    );
  }, [data, filter]);
  const access = (data?.access ?? []).filter(
    (row) =>
      !filter ||
      [row.event, row.result, row.ip_hash, row.admin_email].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(filter.toLowerCase()),
      ),
  );
  const errors = (data?.errors ?? []).filter(
    (row) =>
      !filter ||
      [row.route, row.error_message].some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(filter.toLowerCase()),
      ),
  );
  const tabs = [
    { id: "operations", label: "Operaciones" },
    { id: "access", label: "Accesos" },
    { id: "incidents", label: "Incidencias" },
  ] as const;
  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className={panel}>
          <p className="text-xs uppercase text-white/55">Operaciones registradas</p>
          <p className="mt-2 text-2xl font-bold text-cyan-200">{data?.summary?.operations ?? 0}</p>
        </div>
        <div className={panel}>
          <p className="text-xs uppercase text-white/55">Intentos fallidos acumulados</p>
          <p className="mt-2 text-2xl font-bold text-amber-200">
            {data?.summary?.failedLogins ?? 0}
          </p>
        </div>
        <div className={panel}>
          <p className="text-xs uppercase text-white/55">Bloqueos activos</p>
          <p className="mt-2 text-2xl font-bold text-amber-200">{data?.summary?.blockedIps ?? 0}</p>
        </div>
        <div className={panel}>
          <p className="text-xs uppercase text-white/55">Errores últimas 24 horas</p>
          <p className="mt-2 text-2xl font-bold text-rose-200">{data?.summary?.errors24h ?? 0}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={
              "rounded border px-3 py-2 text-xs " +
              (tab === item.id
                ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-100"
                : "border-white/10 text-white/60")
            }
          >
            {item.label}
          </button>
        ))}
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar en registros"
          className="h-9 min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-3 text-xs text-white"
        />
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded border border-white/15 px-3 py-2 text-xs text-white/70"
        >
          {loading ? "Cargando..." : "Actualizar"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      ) : null}
      {tab === "operations" ? (
        <div className="overflow-x-auto rounded border border-white/10">
          <table className="w-full min-w-[850px] text-left text-xs">
            <thead className="bg-white/[0.03] text-white/55">
              <tr>
                {["Fecha", "Área", "Acción", "Referencia", "Motivo / detalle", "Administrador"].map(
                  (x) => (
                    <th key={x} className="px-3 py-3 font-normal">
                      {x}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {operations.map((row) => (
                <tr key={row.category + row.id} className="border-t border-white/5 text-white/70">
                  <td className="px-3 py-2">{stamp(row.created_at)}</td>
                  <td className="px-3 py-2">{row.category}</td>
                  <td className="px-3 py-2">{row.action}</td>
                  <td className="px-3 py-2">{row.pilot_id || "—"}</td>
                  <td className="max-w-[260px] whitespace-normal px-3 py-2">{row.reason || "—"}</td>
                  <td className="px-3 py-2">{row.admin_email || "Registro anterior"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !operations.length ? (
            <p className="p-4 text-center text-xs text-white/40">
              No hay operaciones que coincidan.
            </p>
          ) : null}
        </div>
      ) : null}
      {tab === "access" ? (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded border border-white/10">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="bg-white/[0.03] text-white/55">
                <tr>
                  {["Fecha", "Evento", "Resultado", "Huella IP protegida", "Cuenta"].map((x) => (
                    <th key={x} className="px-3 py-3 font-normal">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {access.map((row) => (
                  <tr key={row.id} className="border-t border-white/5 text-white/70">
                    <td className="px-3 py-2">{stamp(row.created_at)}</td>
                    <td className="px-3 py-2">{row.event}</td>
                    <td className="px-3 py-2">{row.result}</td>
                    <td className="px-3 py-2">{row.ip_hash.slice(0, 16)}…</td>
                    <td className="px-3 py-2">{row.admin_email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!access.length ? (
              <p className="p-4 text-center text-xs text-white/40">
                No hay accesos registrados todavía.
              </p>
            ) : null}
          </div>
          <div className={panel}>
            <h3 className="text-xs uppercase tracking-wider text-white/65">
              Intentos y bloqueos actuales
            </h3>
            <div className="mt-3 space-y-2">
              {(data?.attempts ?? []).map((row) => (
                <div
                  key={row.ip_hash}
                  className="flex flex-wrap justify-between gap-2 border-t border-white/5 pt-2 text-xs text-white/65"
                >
                  <span>
                    Huella {row.ip_hash.slice(0, 16)}… · {row.attempts} intentos
                  </span>
                  <span>
                    {row.blocked_until > Date.now()
                      ? "Bloqueado hasta " + stamp(row.blocked_until)
                      : "Sin bloqueo activo"}
                  </span>
                </div>
              ))}
              {!data?.attempts?.length ? (
                <p className="text-xs text-white/40">
                  No hay intentos fallidos activos en el registro.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {tab === "incidents" ? (
        <div className="overflow-x-auto rounded border border-white/10">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="bg-white/[0.03] text-white/55">
              <tr>
                {["Fecha", "Ruta", "Detalle del error"].map((x) => (
                  <th key={x} className="px-3 py-3 font-normal">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {errors.map((row) => (
                <tr key={row.id} className="border-t border-white/5 text-white/70">
                  <td className="whitespace-nowrap px-3 py-2">{stamp(row.created_at)}</td>
                  <td className="px-3 py-2">{row.route}</td>
                  <td className="max-w-[520px] whitespace-normal px-3 py-2">{row.error_message}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!errors.length ? (
            <p className="p-4 text-center text-xs text-white/40">No hay errores guardados.</p>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-white/40">
        Las direcciones IP no se muestran: se guarda una huella generada mediante hash para
        identificar intentos repetidos sin exponer la IP original. Los registros nuevos comienzan
        desde la activación de esta auditoría; los registros antiguos solo aparecen si sus módulos
        ya guardaban historial.
      </p>
    </section>
  );
}
