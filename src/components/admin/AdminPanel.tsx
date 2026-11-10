import { useCallback, useEffect, useState, type FormEvent } from "react";
import { SeasonAdminSection } from "./SeasonAdminSection";
import { SHIPS } from "@/game/data/ships";
import { INVENTORY_CATALOG } from "@/game/data/items";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Coins,
  Crown,
  FileClock,
  Gift,
  Headphones,
  KeyRound,
  LayoutDashboard,
  Lock,
  Menu,
  MessagesSquare,
  Search,
  Settings,
  Shield,
  ShoppingCart,
  Swords,
  Target,
  Users,
  Wallet,
  X,
} from "lucide-react";

/**
 * Panel de ADMINISTRACIÓN. Las secciones conectadas consultan y modifican datos
 * reales mediante endpoints protegidos del servidor.
 */

type SectionId =
  | "resumen"
  | "jugadores"
  | "economia"
  | "pagos"
  | "mercado"
  | "chat"
  | "anuncios"
  | "soporte"
  | "premios"
  | "misiones"
  | "alianzas"
  | "vip"
  | "seguridad"
  | "config";

interface Col {
  key: string;
  label: string;
}
interface SectionDef {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  desc: string;
  stats?: string[];
  filters?: string[];
  tables?: { title: string; cols: Col[] }[];
  form?: {
    title: string;
    fields: {
      label: string;
      type?: "text" | "textarea" | "select" | "toggle";
      options?: string[];
    }[];
    submit: string;
    danger?: boolean;
  };
  actions?: { label: string; danger?: boolean }[];
  note?: string;
}

const c = (...labels: string[]): Col[] => labels.map((l) => ({ key: l, label: l }));

const SECTIONS: SectionDef[] = [
  {
    id: "resumen",
    label: "Resumen",
    icon: LayoutDashboard,
    desc: "Estado general del juego",
    stats: [
      "Jugadores registrados",
      "Conectados ahora",
      "Pagos pendientes",
      "Disputas abiertas",
      "Alertas",
    ],
    tables: [{ title: "Alertas recientes", cols: c("Hora", "Tipo", "Detalle", "Estado") }],
  },
  {
    id: "jugadores",
    label: "Jugadores",
    icon: Users,
    desc: "Perfil, inventario, saldos y referidos",
    filters: ["Todos", "Activos", "VIP", "Suspendidos"],
    tables: [{ title: "Pilotos", cols: c("Piloto", "Correo", "CR", "OBS", "Referidos", "Estado") }],
    actions: [
      { label: "Ver perfil" },
      { label: "Ver inventario" },
      { label: "Suspender cuenta", danger: true },
    ],
  },
  {
    id: "economia",
    label: "Economía CR / OBS",
    icon: Coins,
    desc: "Saldos, movimientos e historial",
    stats: ["CR en circulación", "OBS en circulación", "Movimientos hoy"],
    filters: ["CR", "OBS", "Entradas", "Salidas"],
    tables: [{ title: "Movimientos", cols: c("Fecha", "Piloto", "Moneda", "Cantidad", "Motivo") }],
  },
  {
    id: "pagos",
    label: "Pagos OBS",
    icon: Wallet,
    desc: "Wallet, QR y transacciones",
    form: {
      title: "Configuración de cobro",
      fields: [
        { label: "Dirección de wallet" },
        { label: "Red", type: "select", options: ["Seleccionar red"] },
        { label: "Imagen QR (URL)" },
      ],
      submit: "Guardar configuración",
    },
    tables: [
      { title: "Pagos pendientes", cols: c("Fecha", "Piloto", "Monto", "Hash", "Estado") },
      { title: "Historial", cols: c("Fecha", "Piloto", "Monto", "Resultado") },
    ],
    actions: [{ label: "Aprobar pago" }, { label: "Rechazar pago", danger: true }],
  },
  {
    id: "mercado",
    label: "Mercado P2P",
    icon: ShoppingCart,
    desc: "Publicaciones, pedidos y disputas",
    filters: ["Publicaciones", "Pedidos", "Disputas"],
    tables: [
      {
        title: "Operaciones",
        cols: c("ID", "Vendedor", "Comprador", "Artículo", "Precio", "Estado"),
      },
    ],
    actions: [
      { label: "Resolver a favor del comprador" },
      { label: "Resolver a favor del vendedor" },
      { label: "Retirar publicación", danger: true },
    ],
  },
  {
    id: "chat",
    label: "Chat y comunidad",
    icon: MessagesSquare,
    desc: "Mensajes, denuncias y moderación",
    filters: ["Mensajes", "Denuncias"],
    tables: [
      { title: "Denuncias", cols: c("Fecha", "Denunciante", "Acusado", "Motivo", "Estado") },
    ],
    actions: [
      { label: "Advertir" },
      { label: "Silenciar 24h" },
      { label: "Expulsar del chat", danger: true },
    ],
  },
  {
    id: "anuncios",
    label: "Anuncios",
    icon: Bell,
    desc: "Avisos y noticias del juego",
    form: {
      title: "Nuevo anuncio",
      fields: [
        { label: "Título" },
        {
          label: "Tipo",
          type: "select",
          options: ["Noticia", "Evento", "Mantenimiento", "Temporada"],
        },
        { label: "Mensaje", type: "textarea" },
      ],
      submit: "Publicar anuncio",
    },
    tables: [{ title: "Anuncios publicados", cols: c("Fecha", "Título", "Tipo", "Estado") }],
  },
  {
    id: "soporte",
    label: "Soporte técnico",
    icon: Headphones,
    desc: "Tickets y consultas",
    filters: ["Abiertos", "En proceso", "Resueltos"],
    tables: [{ title: "Tickets", cols: c("ID", "Piloto", "Asunto", "Prioridad", "Estado") }],
    actions: [{ label: "Responder" }, { label: "Marcar resuelto" }],
  },
  {
    id: "premios",
    label: "Premios y recompensas",
    icon: Gift,
    desc: "Entregadas, pendientes e historial",
    filters: ["Pendientes", "Entregadas"],
    tables: [
      { title: "Recompensas", cols: c("Fecha", "Piloto", "Recompensa", "Origen", "Estado") },
    ],
  },
  {
    id: "misiones",
    label: "Misiones y temporadas",
    icon: Target,
    desc: "Misiones, progreso y premios",
    stats: ["Temporada actual", "Días restantes", "Pilotos participando"],
    tables: [
      { title: "Temporadas", cols: c("Temporada", "Inicio", "Fin", "Estado") },
      { title: "Ranking de temporada", cols: c("Pos.", "Piloto", "PT", "Premio") },
    ],
  },
  {
    id: "alianzas",
    label: "Alianzas y guerras",
    icon: Swords,
    desc: "Alianzas, miembros y guerras",
    filters: ["Alianzas", "Guerras activas", "Historial"],
    tables: [{ title: "Alianzas", cols: c("Tag", "Nombre", "Líder", "Miembros", "Nivel") }],
    actions: [{ label: "Ver miembros" }, { label: "Disolver alianza", danger: true }],
  },
  {
    id: "vip",
    label: "VIP",
    icon: Crown,
    desc: "Asignaciones y vencimientos",
    stats: ["VIP activos", "Vencen esta semana"],
    form: {
      title: "Asignación manual",
      fields: [
        { label: "Piloto (correo o ID)" },
        { label: "Duración", type: "select", options: ["7 días", "30 días", "90 días"] },
      ],
      submit: "Asignar VIP",
    },
    tables: [{ title: "Historial VIP", cols: c("Fecha", "Piloto", "Acción", "Vence") }],
    note: "La compra de VIP con OBS permanece deshabilitada.",
  },
  {
    id: "seguridad",
    label: "Seguridad y auditoría",
    icon: Shield,
    desc: "Operaciones, accesos e incidencias",
    filters: ["Operaciones", "Accesos", "Incidencias"],
    tables: [
      { title: "Registro de auditoría", cols: c("Fecha", "Usuario", "Acción", "IP", "Resultado") },
    ],
  },
  {
    id: "config",
    label: "Configuración",
    icon: Settings,
    desc: "Ajustes generales del juego",
    form: {
      title: "Ajustes generales",
      fields: [
        { label: "Modo mantenimiento", type: "toggle" },
        { label: "Registro de nuevos pilotos", type: "toggle" },
        { label: "Chat global", type: "toggle" },
        { label: "Mensaje de mantenimiento", type: "textarea" },
      ],
      submit: "Guardar ajustes",
      danger: true,
    },
  },
];

const PENDING = "Pendiente de conexión con el servidor";

export function AdminPanel({ onClose }: { onClose: () => void }) {
  const [unlocked, setUnlocked] = useState(false);
  const [section, setSection] = useState<SectionId>("resumen");
  const [navOpen, setNavOpen] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/auth/status", { credentials: "same-origin" })
      .then(async (response) => {
        const data = (await response.json()) as { authenticated?: boolean };
        if (active && response.ok) setUnlocked(data.authenticated === true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const unlock = async (password: string): Promise<boolean> => {
    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        setUnlocked(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const closeAdmin = async () => {
    try {
      await fetch("/api/admin/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    } catch {
      // La sesión también vence automáticamente en el servidor.
    }
    onClose();
  };

  const ask = (label: string) => {
    setNotice(null);
    setConfirm(label);
  };
  const doConfirm = () => {
    setConfirm(null);
    setNotice(PENDING);
  };

  return (
    <div className="fixed inset-0 z-[80] flex bg-[#05060f]/95 font-pixel text-white backdrop-blur-sm">
      {!unlocked ? (
        <AdminLogin onUnlock={unlock} onClose={closeAdmin} />
      ) : (
        <div className="flex h-full w-full min-w-0">
          {/* Sidebar */}
          <aside
            className={`${navOpen ? "flex" : "hidden"} absolute inset-y-0 left-0 z-10 w-60 flex-col border-r border-amber-400/20 bg-[#080a18] md:static md:flex`}
          >
            <div className="flex items-center gap-2 border-b border-amber-400/20 px-4 py-3">
              <Shield className="size-4 text-amber-300" />
              <span className="font-arcade text-[11px] tracking-widest text-amber-300">
                ADMINISTRACIÓN
              </span>
              <button
                className="ml-auto md:hidden"
                onClick={() => setNavOpen(false)}
                aria-label="Cerrar menú"
              >
                <X className="size-4" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const active = s.id === section;
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSection(s.id);
                      setNavOpen(false);
                      setNotice(null);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded px-3 py-2 text-left text-sm transition ${active ? "bg-amber-400/15 text-amber-200 shadow-[inset_2px_0_0_#fbbf24]" : "text-white/75 hover:bg-white/5 hover:text-white"}`}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    {s.label}
                  </button>
                );
              })}
            </nav>
            <button
              onClick={closeAdmin}
              className="m-2 rounded border border-rose-400/30 px-3 py-2 text-xs uppercase tracking-wider text-rose-300 hover:bg-rose-400/10"
            >
              Salir del panel
            </button>
          </aside>

          {/* Content */}
          <main className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center gap-3 border-b border-cyan-400/15 px-4 py-3">
              <button
                className="md:hidden"
                onClick={() => setNavOpen(true)}
                aria-label="Abrir menú"
              >
                <Menu className="size-5 text-cyan-300" />
              </button>
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-emerald-300">
                <span className="size-1.5 rounded-full bg-emerald-400" /> Sesión de mando
              </span>
              <button
                onClick={closeAdmin}
                className="ml-auto rounded p-1 text-white/65 hover:text-white"
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <SectionView
                def={SECTIONS.find((s) => s.id === section)!}
                onAction={ask}
                notice={notice}
              />
            </div>
          </main>
        </div>
      )}

      {confirm ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-lg border border-amber-400/30 bg-[#0a0c1c] p-5 shadow-[0_0_40px_#fbbf2420]">
            <div className="mb-3 flex items-center gap-2 text-amber-300">
              <AlertTriangle className="size-4" />
              <span className="font-arcade text-[11px] tracking-widest">CONFIRMAR OPERACIÓN</span>
            </div>
            <p className="mb-5 text-sm text-white/80">
              ¿Seguro que quieres ejecutar <b className="text-white">“{confirm}”</b>?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirm(null)}
                className="rounded border border-white/15 px-3 py-1.5 text-sm text-white/80 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={doConfirm}
                className="rounded bg-amber-400/90 px-3 py-1.5 text-sm font-bold text-black hover:bg-amber-300"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AdminLogin({
  onUnlock,
  onClose,
}: {
  onUnlock: (password: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="m-auto w-full max-w-sm p-4">
      <div className="relative rounded-lg border border-amber-400/30 bg-[#0a0c1c] p-6 shadow-[0_0_60px_#fbbf2418]">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-white/55 hover:text-white"
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </button>
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full border border-amber-400/40 bg-amber-400/10">
          <Lock className="size-6 text-amber-300" />
        </div>
        <h2 className="font-arcade text-center text-xs tracking-[0.3em] text-amber-300">
          ACCESO DE MANDO
        </h2>
        <p className="mt-2 text-center text-sm text-white/65">
          Introduce la contraseña administrativa
        </p>
        <form
          className="mt-5 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!pwd || busy) return;
            setBusy(true);
            setError("");
            const accepted = await onUnlock(pwd);
            if (!accepted)
              setError("No se pudo validar el acceso. Revisa la contraseña e inténtalo de nuevo.");
            setBusy(false);
          }}
        >
          <div className="flex items-center gap-2 rounded border border-white/10 bg-black/40 px-3">
            <KeyRound className="size-4 text-white/55" />
            <input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="••••••••"
              className="h-10 flex-1 bg-transparent text-sm tracking-widest outline-none placeholder:text-white/35"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={!pwd || busy}
            className="w-full rounded bg-amber-400/90 py-2.5 text-sm font-bold uppercase tracking-widest text-black transition hover:bg-amber-300 disabled:opacity-40"
          >
            {busy ? "Verificando..." : "Desbloquear"}
          </button>
        </form>
        {error ? (
          <p role="alert" className="mt-3 text-center text-xs text-rose-300">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SectionView({
  def,
  onAction,
  notice,
}: {
  def: SectionDef;
  onAction: (l: string) => void;
  notice: string | null;
}) {
  const Icon = def.icon;
  const [filter, setFilter] = useState(def.filters?.[0] ?? "");
  return (
    <div key={def.id} className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="grid size-9 place-items-center rounded border border-cyan-400/30 bg-cyan-400/10">
          <Icon className="size-4 text-cyan-300" />
        </div>
        <div>
          <h1 className="font-arcade text-sm tracking-widest text-cyan-200">
            {def.label.toUpperCase()}
          </h1>
          <p className="text-sm text-white/60">{def.desc}</p>
        </div>
      </div>

      {notice ? (
        <div className="flex items-center gap-2 rounded border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
          <Activity className="size-3.5" />
          {notice}
        </div>
      ) : null}
      {def.note ? (
        <div className="rounded border border-fuchsia-400/30 bg-fuchsia-400/10 px-3 py-2 text-sm text-fuchsia-200">
          {def.note}
        </div>
      ) : null}

      {def.id === "economia" ? (
        <EconomySection />
      ) : def.id === "jugadores" ? (
        <PlayersSection />
      ) : def.id === "pagos" ? (
        <PaymentsSection />
      ) : def.id === "mercado" ? (
        <MarketAdminSection />
      ) : def.id === "chat" ? (
        <ChatAdminSection />
      ) : def.id === "anuncios" ? (
        <AnnouncementsAdminSection />
      ) : def.id === "soporte" ? (
        <SupportAdminSection />
      ) : def.id === "misiones" ? (
        <SeasonAdminSection />
      ) : (
        <>
          {def.stats ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {def.stats.map((s) => (
                <div key={s} className="rounded border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-[11px] uppercase tracking-wider text-white/60">{s}</div>
                  <div className="mt-1 font-arcade text-sm text-white/50">--</div>
                </div>
              ))}
            </div>
          ) : null}

          {def.filters ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex flex-1 items-center gap-2 rounded border border-white/10 bg-black/30 px-3">
                <Search className="size-3.5 text-white/55" />
                <input
                  placeholder="Buscar..."
                  className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-white/40"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {def.filters.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`rounded px-2.5 py-1.5 text-xs ${filter === f ? "bg-cyan-400/20 text-cyan-200" : "text-white/65 hover:bg-white/5"}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div
            className={
              def.form || def.id === "premios"
                ? "grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]"
                : ""
            }
          >
            {def.id === "premios" ? <RewardForm /> : null}
            {def.form ? (
              <form
                className="space-y-3 rounded border border-white/10 bg-white/[0.03] p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  onAction(def.form!.submit);
                }}
              >
                <div className="text-xs uppercase tracking-wider text-cyan-200">
                  {def.form.title}
                </div>
                {def.form.fields.map((f) => (
                  <label
                    key={f.label}
                    className={
                      f.type === "toggle"
                        ? "flex items-center justify-between text-sm text-white/80"
                        : "block text-xs text-white/65"
                    }
                  >
                    {f.label}
                    {f.type === "textarea" ? (
                      <textarea
                        rows={3}
                        className="mt-1 w-full rounded border border-white/10 bg-black/40 p-2 text-sm outline-none focus:border-cyan-400/40"
                      />
                    ) : f.type === "select" ? (
                      <select className="mt-1 h-9 w-full rounded border border-white/10 bg-black/40 px-2 text-sm outline-none">
                        {f.options?.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    ) : f.type === "toggle" ? (
                      <input type="checkbox" className="size-4 accent-cyan-400" />
                    ) : (
                      <input className="mt-1 h-9 w-full rounded border border-white/10 bg-black/40 px-2 text-sm outline-none focus:border-cyan-400/40" />
                    )}
                  </label>
                ))}
                <button
                  type="submit"
                  className={`w-full rounded py-2 text-sm font-bold uppercase tracking-wider ${def.form.danger ? "bg-amber-400/90 text-black" : "bg-cyan-400/90 text-black"} hover:opacity-90`}
                >
                  {def.form.submit}
                </button>
              </form>
            ) : null}

            <div className="min-w-0 space-y-5">
              {def.tables?.map((t) => (
                <div key={t.title} className="overflow-hidden rounded border border-white/10">
                  <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-xs uppercase tracking-wider text-white/75">
                    <FileClock className="size-3" />
                    {t.title}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left text-sm">
                      <thead>
                        <tr className="text-white/55">
                          {t.cols.map((col) => (
                            <th key={col.key} className="px-3 py-2 font-normal">
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td
                            colSpan={t.cols.length}
                            className="px-3 py-8 text-center text-white/50"
                          >
                            Sin datos · {PENDING.toLowerCase()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              {def.actions ? (
                <div className="flex flex-wrap gap-2">
                  {def.actions.map((a) => (
                    <button
                      key={a.label}
                      onClick={() => onAction(a.label)}
                      className={`rounded border px-3 py-1.5 text-xs uppercase tracking-wider ${a.danger ? "border-rose-400/40 text-rose-300 hover:bg-rose-400/10" : "border-cyan-400/30 text-cyan-200 hover:bg-cyan-400/10"}`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SupportAdminSection() {
  const [tickets, setTickets] = useState<
    Array<{
      id: string;
      pilot_id: string;
      subject: string;
      category: string;
      status: string;
      created_at: number;
      updated_at: number;
      callsign: string;
      email: string | null;
    }>
  >([]);
  const [messages, setMessages] = useState<
    Array<{
      id: string;
      ticket_id: string;
      sender_role: string;
      message: string;
      created_at: number;
    }>
  >([]);
  const [selected, setSelected] = useState(""),
    [reply, setReply] = useState(""),
    [reason, setReason] = useState(""),
    [filter, setFilter] = useState("TODOS"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = async () => {
    try {
      const r = await fetch("/api/admin/support", { credentials: "same-origin" });
      const d = (await r.json()) as {
        tickets?: typeof tickets;
        messages?: typeof messages;
        error?: string;
      };
      if (!r.ok) throw new Error(d.error || "No se pudieron cargar los tickets.");
      setTickets(d.tickets ?? []);
      setMessages(d.messages ?? []);
      setSelected((v) =>
        v && (d.tickets ?? []).some((t) => t.id === v) ? v : (d.tickets?.[0]?.id ?? ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar soporte.");
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const act = async (payload: Record<string, string>) => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/support", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error || "No se pudo guardar.");
      setReply("");
      setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };
  const visible = tickets.filter((t) => filter === "TODOS" || t.status === filter),
    current = tickets.find((t) => t.id === selected),
    thread = messages.filter((m) => m.ticket_id === selected),
    date = (v: number) => new Date(v).toLocaleString("es-CO"),
    input = "w-full rounded border border-white/15 bg-black/30 px-3 py-2 text-sm text-white";
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {["TODOS", "OPEN", "IN_PROGRESS", "CLOSED"].map((v) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className="rounded border border-white/20 px-3 py-1.5 text-xs"
          >
            {v === "TODOS"
              ? "Todos"
              : v === "OPEN"
                ? "Abiertos"
                : v === "IN_PROGRESS"
                  ? "En proceso"
                  : "Resueltos"}
          </button>
        ))}
        <button
          onClick={() => void load()}
          className="ml-auto rounded border border-white/20 px-3 py-1.5 text-xs"
        >
          Actualizar
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(240px,.8fr)_minmax(0,1.5fr)]">
        <div className="space-y-2">
          {visible.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={`w-full rounded border p-3 text-left ${selected === t.id ? "border-cyan-300/50 bg-cyan-300/5" : "border-white/10"}`}
            >
              <b className="text-sm">{t.subject}</b>
              <p className="mt-1 text-xs text-white/50">
                {t.callsign} · {t.category} · {t.status} · {date(t.updated_at)}
              </p>
            </button>
          ))}
          {!visible.length ? <p className="p-4 text-sm text-white/50">No hay tickets.</p> : null}
        </div>
        {current ? (
          <div className="space-y-3 rounded border border-white/10 p-3">
            <h3 className="text-sm font-bold text-cyan-200">{current.subject}</h3>
            <p className="text-xs text-white/50">
              {current.callsign} · {current.email ?? current.pilot_id} · {date(current.created_at)}
            </p>
            <div className="max-h-80 space-y-2 overflow-y-auto bg-black/20 p-3">
              {thread.map((m) => (
                <article key={m.id} className="rounded bg-white/5 p-2">
                  <p className="text-[10px] text-cyan-200">
                    {m.sender_role === "ADMIN" ? "ADMINISTRACIÓN" : "JUGADOR"} ·{" "}
                    {date(m.created_at)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-white/80">{m.message}</p>
                </article>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (reply.trim())
                  void act({ action: "reply", ticketId: current.id, note: reply.trim() });
              }}
              className="space-y-2"
            >
              <textarea
                className={input}
                rows={3}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Responder al jugador..."
              />
              <button
                disabled={busy || reply.trim().length < 2}
                className="rounded bg-cyan-300 px-3 py-2 text-xs font-bold text-black disabled:opacity-40"
              >
                Enviar respuesta
              </button>
            </form>
            <div className="flex flex-wrap items-end gap-2 border-t border-white/10 pt-3">
              <label className="min-w-0 flex-1 text-xs text-white/60">
                Motivo
                <input
                  className={`${input} mt-1`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Motivo del cambio"
                />
              </label>
              {["IN_PROGRESS", "CLOSED", "OPEN"].map((status) => (
                <button
                  key={status}
                  disabled={busy || reason.trim().length < 3}
                  onClick={() =>
                    void act({
                      action: "set-status",
                      ticketId: current.id,
                      status,
                      note: reason.trim(),
                    })
                  }
                  className="rounded border border-white/20 px-3 py-2 text-xs disabled:opacity-40"
                >
                  {status === "IN_PROGRESS"
                    ? "En proceso"
                    : status === "CLOSED"
                      ? "Resolver"
                      : "Reabrir"}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="p-5 text-sm text-white/50">Selecciona un ticket.</p>
        )}
      </div>
    </section>
  );
}

function AnnouncementsAdminSection() {
  type Announcement = {
    id: string;
    title: string;
    type: "NOTICIA" | "EVENTO" | "MANTENIMIENTO" | "TEMPORADA";
    message: string;
    status: "PUBLISHED" | "DRAFT";
    created_at: number;
    updated_at: number;
  };
  type Log = {
    announcement_id: string;
    action: string;
    title: string;
    admin_email: string;
    created_at: number;
  };
  const emptyForm = {
    title: "",
    type: "NOTICIA" as Announcement["type"],
    message: "",
    status: "PUBLISHED" as Announcement["status"],
  };
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/announcements", { credentials: "same-origin" });
      const data = (await response.json()) as {
        announcements?: Announcement[];
        logs?: Log[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar los anuncios.");
      setAnnouncements(data.announcements ?? []);
      setLogs(data.logs ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los anuncios.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/announcements", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: editingId ? "update" : "create",
          ...(editingId ? { id: editingId } : {}),
          ...form,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo guardar el anuncio.");
      setForm(emptyForm);
      setEditingId(null);
      setNotice(editingId ? "Anuncio actualizado." : "Anuncio creado.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el anuncio.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (announcement: Announcement) => {
    if (!window.confirm(`¿Eliminar el anuncio "${announcement.title}"?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/announcements", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", id: announcement.id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo eliminar el anuncio.");
      if (editingId === announcement.id) {
        setEditingId(null);
        setForm(emptyForm);
      }
      setNotice("Anuncio eliminado.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar el anuncio.");
    } finally {
      setBusy(false);
    }
  };

  const edit = (announcement: Announcement) => {
    setEditingId(announcement.id);
    setForm({
      title: announcement.title,
      type: announcement.type,
      message: announcement.message,
      status: announcement.status,
    });
    setError("");
    setNotice("");
  };
  const date = (value: number) => new Date(value).toLocaleString("es-CO");

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <form
        onSubmit={(event) => void save(event)}
        className="h-fit space-y-3 border border-white/10 bg-white/[0.03] p-4"
      >
        <h2 className="text-xs font-bold uppercase tracking-widest text-cyan-200">
          {editingId ? "Editar anuncio" : "Crear anuncio"}
        </h2>
        <label className="block text-xs text-white/65">
          Título
          <input
            required
            minLength={3}
            maxLength={90}
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            className="mt-1 h-10 w-full border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-cyan-400/50"
          />
        </label>
        <label className="block text-xs text-white/65">
          Tipo
          <select
            value={form.type}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                type: event.target.value as Announcement["type"],
              }))
            }
            className="mt-1 h-10 w-full border border-white/10 bg-[#101321] px-3 text-sm text-white"
          >
            <option value="NOTICIA">Noticia</option>
            <option value="EVENTO">Evento</option>
            <option value="MANTENIMIENTO">Mantenimiento</option>
            <option value="TEMPORADA">Temporada</option>
          </select>
        </label>
        <label className="block text-xs text-white/65">
          Mensaje
          <textarea
            required
            minLength={5}
            maxLength={2000}
            rows={6}
            value={form.message}
            onChange={(event) =>
              setForm((current) => ({ ...current, message: event.target.value }))
            }
            className="mt-1 w-full border border-white/10 bg-black/40 p-3 text-sm text-white outline-none focus:border-cyan-400/50"
          />
        </label>
        <label className="block text-xs text-white/65">
          Estado
          <select
            value={form.status}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                status: event.target.value as Announcement["status"],
              }))
            }
            className="mt-1 h-10 w-full border border-white/10 bg-[#101321] px-3 text-sm text-white"
          >
            <option value="PUBLISHED">Publicado (visible para jugadores)</option>
            <option value="DRAFT">Borrador (solo administración)</option>
          </select>
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 bg-cyan-400 px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-black disabled:opacity-40"
          >
            {busy ? "Guardando..." : editingId ? "Guardar cambios" : "Publicar anuncio"}
          </button>
          {editingId ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
              className="border border-white/20 px-3 py-2.5 text-xs text-white/70"
            >
              Cancelar
            </button>
          ) : null}
        </div>
      </form>

      <div className="space-y-5">
        {error ? (
          <p
            role="alert"
            className="border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200"
          >
            {error}
          </p>
        ) : null}
        {notice ? (
          <p
            role="status"
            className="border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200"
          >
            {notice}
          </p>
        ) : null}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-white/75">
              Anuncios ({announcements.length})
            </h2>
            <button
              type="button"
              disabled={loading || busy}
              onClick={() => void load()}
              className="border border-white/15 px-3 py-2 text-xs text-white/70 disabled:opacity-40"
            >
              Actualizar
            </button>
          </div>
          {loading ? (
            <p className="text-sm text-white/50">Cargando anuncios...</p>
          ) : announcements.length === 0 ? (
            <p className="border border-white/10 p-4 text-sm text-white/45">
              Todavía no hay anuncios.
            </p>
          ) : (
            announcements.map((item) => (
              <article key={item.id} className="border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wider text-cyan-200/70">
                      <span>{item.type}</span>
                      <span>·</span>
                      <span>{item.status === "PUBLISHED" ? "Publicado" : "Borrador"}</span>
                    </div>
                    <h3 className="mt-1 text-sm font-bold text-white">{item.title}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/65">
                      {item.message}
                    </p>
                    <p className="mt-2 text-[10px] text-white/35">
                      Actualizado: {date(item.updated_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => edit(item)}
                      className="border border-cyan-300/30 px-3 py-2 text-xs text-cyan-100 disabled:opacity-40"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(item)}
                      className="border border-rose-300/30 px-3 py-2 text-xs text-rose-200 disabled:opacity-40"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
        <div className="border border-white/10">
          <h2 className="border-b border-white/10 px-3 py-2 text-xs font-bold uppercase tracking-widest text-white/70">
            Historial de anuncios
          </h2>
          {logs.length === 0 ? (
            <p className="p-3 text-xs text-white/40">Sin movimientos.</p>
          ) : (
            logs.map((log, index) => (
              <div
                key={`${log.announcement_id}-${log.created_at}-${index}`}
                className="flex flex-wrap justify-between gap-2 border-b border-white/5 px-3 py-2 text-xs last:border-0"
              >
                <span className="text-white/70">
                  {log.action === "create" ? "Creó" : log.action === "update" ? "Editó" : "Eliminó"}
                  : {log.title}
                </span>
                <span className="text-white/35">{date(log.created_at)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

export function AnnouncementsFeed() {
  type Announcement = {
    id: string;
    title: string;
    type: string;
    message: string;
    created_at: number;
  };
  const [items, setItems] = useState<Announcement[]>([]);
  useEffect(() => {
    let active = true;
    fetch("/api/announcements", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) return;
        const data = (await response.json()) as { announcements?: Announcement[] };
        if (active) setItems(data.announcements ?? []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  if (items.length === 0) return null;
  return (
    <section
      aria-label="Anuncios del juego"
      className="mx-auto mt-5 w-full max-w-[1440px] space-y-2 px-5 sm:px-8 lg:px-12"
    >
      {items.map((item) => (
        <article key={item.id} className="border border-cyan-400/25 bg-[#0b0d1c]/90 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-cyan-200">
            <span>{item.type}</span>
            <span className="text-white/25">·</span>
            <span className="text-white/40">
              {new Date(item.created_at).toLocaleDateString("es-CO")}
            </span>
          </div>
          <h2 className="mt-1 text-xs font-bold uppercase tracking-wider text-white">
            {item.title}
          </h2>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-white/65">{item.message}</p>
        </article>
      ))}
    </section>
  );
}

function ChatAdminSection() {
  type Message = {
    id: number;
    type: string;
    pilotId: string;
    callsign: string;
    text: string;
    language: string;
    timestamp: number;
  };
  type Report = {
    id: string;
    message_id: number;
    language: string;
    reporter_pilot_id: string;
    target_pilot_id: string;
    reason: string;
    status: string;
    created_at: number;
    reporter_name: string;
    target_name: string;
    resolution_note: string | null;
  };
  type Mute = { pilotId: string; expiresAt: number | null; reason: string; createdAt: number };
  type Log = {
    action: string;
    target_pilot_id: string | null;
    message_id: number | null;
    reason: string;
    admin_email: string;
    created_at: number;
  };
  const [messages, setMessages] = useState<Message[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [mutes, setMutes] = useState<Mute[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [chatEnabled, setChatEnabled] = useState(true);
  const [tab, setTab] = useState<"mensajes" | "denuncias" | "silenciados" | "historial">(
    "mensajes",
  );
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/chat", { credentials: "same-origin" });
      const data = (await response.json()) as {
        messages?: Message[];
        reports?: Report[];
        mutes?: Mute[];
        logs?: Log[];
        chatEnabled?: boolean;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "No se pudo cargar el chat.");
      setMessages(data.messages ?? []);
      setReports(data.reports ?? []);
      setMutes(data.mutes ?? []);
      setLogs(data.logs ?? []);
      setChatEnabled(data.chatEnabled !== false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el chat.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const act = async (payload: Record<string, string | number | boolean>) => {
    const reason = typeof payload["reason"] === "string" ? payload["reason"] : "";
    if (reason.trim().length < 5) {
      setError("Escribe un motivo de al menos 5 caracteres.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/chat", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo completar la acción.");
      setNotice("Acción aplicada correctamente.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  };
  const askReason = (label: string) => window.prompt(label, "Revisión administrativa");
  const filteredMessages = messages.filter((item) =>
    `${item.callsign} ${item.text} ${item.pilotId}`.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredReports = reports.filter((item) =>
    `${item.reporter_name} ${item.target_name} ${item.reason}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const tabs = [
    ["mensajes", `Mensajes (${messages.length})`],
    ["denuncias", `Denuncias (${reports.filter((r) => r.status === "OPEN").length})`],
    ["silenciados", `Restringidos (${mutes.length})`],
    ["historial", "Historial"],
  ] as const;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`border px-3 py-2 text-xs ${tab === id ? "border-cyan-300 bg-cyan-400/10 text-cyan-100" : "border-white/10 text-white/60 hover:bg-white/5"}`}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          disabled={loading || busy}
          onClick={() => void load()}
          className="ml-auto border border-white/15 px-3 py-2 text-xs text-white/70 disabled:opacity-40"
        >
          Actualizar
        </button>
        <button
          type="button"
          disabled={loading || busy}
          onClick={() => {
            const reason = askReason(
              chatEnabled
                ? "Motivo para suspender el chat global:"
                : "Motivo para reactivar el chat global:",
            );
            if (reason) void act({ action: "set-chat-enabled", enabled: !chatEnabled, reason });
          }}
          className={`border px-3 py-2 text-xs disabled:opacity-40 ${chatEnabled ? "border-rose-400/30 text-rose-200" : "border-emerald-400/30 text-emerald-200"}`}
        >
          {chatEnabled ? "Suspender chat global" : "Reactivar chat global"}
        </button>
      </div>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar jugador o mensaje..."
        className="h-9 w-full border border-white/10 bg-black/30 px-3 text-sm outline-none focus:border-cyan-400/50"
      />
      {error ? (
        <p className="border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
          {notice}
        </p>
      ) : null}
      {loading ? <p className="py-8 text-center text-sm text-white/50">Cargando...</p> : null}
      {!loading && tab === "mensajes" ? (
        <div className="space-y-2">
          {filteredMessages.map((item) => (
            <article
              key={`${item.language}-${item.id}`}
              className="border border-white/10 bg-white/[0.02] p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/50">
                <span className="font-bold text-cyan-200">{item.callsign}</span>
                <span>
                  {item.language.toUpperCase()} · {new Date(item.timestamp).toLocaleString()}
                </span>
              </div>
              <p className="mt-2 break-words text-sm text-white/85">{item.text}</p>
              <p className="mt-1 text-[10px] text-white/35">
                {item.pilotId} · #{item.id}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const reason = askReason("Motivo para eliminar este mensaje:");
                  if (reason)
                    void act({
                      action: "delete-message",
                      messageId: item.id,
                      pilotId: item.pilotId,
                      reason,
                    });
                }}
                className="mt-2 border border-rose-400/30 px-2 py-1 text-[10px] text-rose-300 disabled:opacity-40"
              >
                Eliminar mensaje
              </button>
            </article>
          ))}
          {filteredMessages.length === 0 ? (
            <p className="py-6 text-center text-sm text-white/40">No hay mensajes.</p>
          ) : null}
        </div>
      ) : null}
      {!loading && tab === "denuncias" ? (
        <div className="space-y-2">
          {filteredReports.map((item) => (
            <article key={item.id} className="border border-white/10 bg-white/[0.02] p-3">
              <div className="flex flex-wrap justify-between gap-2 text-xs">
                <b className="text-amber-200">
                  {item.status === "OPEN" ? "PENDIENTE" : "REVISADA"}
                </b>
                <span className="text-white/45">{new Date(item.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-2 text-sm">
                {item.reporter_name} denunció a <b>{item.target_name}</b>
              </p>
              <p className="mt-1 text-sm text-white/70">{item.reason}</p>
              <p className="mt-1 text-[10px] text-white/35">
                Mensaje #{item.message_id} · {item.language.toUpperCase()}
              </p>
              {item.status === "OPEN" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const reason = askReason("Nota de revisión de la denuncia:");
                    if (reason) void act({ action: "close-report", reportId: item.id, reason });
                  }}
                  className="mt-2 border border-cyan-400/30 px-2 py-1 text-[10px] text-cyan-200 disabled:opacity-40"
                >
                  Marcar revisada
                </button>
              ) : (
                <p className="mt-2 text-xs text-emerald-300">{item.resolution_note}</p>
              )}
            </article>
          ))}
          {filteredReports.length === 0 ? (
            <p className="py-6 text-center text-sm text-white/40">No hay denuncias.</p>
          ) : null}
        </div>
      ) : null}
      {!loading && tab === "silenciados" ? (
        <div className="space-y-2">
          {mutes
            .filter((item) =>
              `${item.pilotId} ${item.reason}`.toLowerCase().includes(search.toLowerCase()),
            )
            .map((item) => (
              <article
                key={item.pilotId}
                className="flex flex-wrap items-center justify-between gap-3 border border-white/10 p-3"
              >
                <div>
                  <p className="text-xs text-cyan-200">{item.pilotId}</p>
                  <p className="mt-1 text-xs text-white/65">{item.reason}</p>
                  <p className="mt-1 text-[10px] text-white/40">
                    {item.expiresAt
                      ? `Hasta ${new Date(item.expiresAt).toLocaleString()}`
                      : "Bloqueo indefinido"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const reason = askReason("Motivo para retirar la restricción:");
                    if (reason) void act({ action: "unmute", pilotId: item.pilotId, reason });
                  }}
                  className="border border-emerald-400/30 px-2 py-1 text-[10px] text-emerald-200"
                >
                  Retirar restricción
                </button>
              </article>
            ))}
          {mutes.length === 0 ? (
            <p className="py-6 text-center text-sm text-white/40">No hay jugadores restringidos.</p>
          ) : null}
        </div>
      ) : null}
      {!loading && tab === "historial" ? (
        <div className="space-y-2">
          {logs.map((item, index) => (
            <article key={`${item.created_at}-${index}`} className="border border-white/10 p-3">
              <p className="text-xs font-bold text-cyan-200">{item.action}</p>
              <p className="mt-1 text-xs text-white/70">{item.reason}</p>
              <p className="mt-1 text-[10px] text-white/40">
                {item.target_pilot_id ?? (item.message_id ? `Mensaje #${item.message_id}` : "")} ·{" "}
                {item.admin_email} · {new Date(item.created_at).toLocaleString()}
              </p>
            </article>
          ))}
        </div>
      ) : null}
      {!loading && tab === "mensajes" && filteredMessages.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
          <span className="mr-2 self-center text-xs text-white/45">Moderación por jugador:</span>
          <input
            id="chat-moderation-pilot"
            placeholder="ID plt_..."
            className="h-8 min-w-0 flex-1 border border-white/10 bg-black/30 px-2 text-xs"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const pilotId =
                (
                  document.getElementById("chat-moderation-pilot") as HTMLInputElement | null
                )?.value.trim() ?? "";
              const reason = askReason("Motivo para silenciar 24 horas:");
              if (pilotId && reason) void act({ action: "mute", pilotId, reason });
            }}
            className="border border-amber-400/30 px-2 text-[10px] text-amber-200"
          >
            Silenciar 24 h
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const pilotId =
                (
                  document.getElementById("chat-moderation-pilot") as HTMLInputElement | null
                )?.value.trim() ?? "";
              const reason = askReason("Motivo para bloquear del chat:");
              if (pilotId && reason) void act({ action: "ban", pilotId, reason });
            }}
            className="border border-rose-400/30 px-2 text-[10px] text-rose-200"
          >
            Bloquear chat
          </button>
        </div>
      ) : null}
    </section>
  );
}
function MarketAdminSection() {
  type Stats = {
    active_ads: number;
    pending_orders: number;
    open_disputes: number;
    completed_orders: number;
  };
  type Ad = {
    id: string;
    seller_pilot_id: string;
    seller_name: string;
    item_name: string;
    item_type: string;
    price_minor: number | null;
    currency_code: string | null;
    country_code: string;
    status: string;
    created_at: number;
  };
  type Order = {
    id: string;
    status: string;
    created_at: number;
    updated_at: number;
    payment_method: string | null;
    buyer_pilot_id: string;
    ad_id: string;
    seller_pilot_id: string;
    item_name: string;
    item_type: string;
    price_minor: number | null;
    currency_code: string | null;
    country_code: string;
    buyer_name: string;
    seller_name: string;
  };
  type Dispute = {
    id: string;
    order_id: string;
    opened_by_pilot_id: string;
    reason: string;
    evidence_url: string | null;
    status: string;
    created_at: number;
    resolved_at: number | null;
    resolved_by: string | null;
    resolution_note: string | null;
    order_status: string;
    buyer_pilot_id: string;
    seller_pilot_id: string;
    item_name: string;
    price_minor: number | null;
    currency_code: string | null;
    country_code: string;
    opened_by_name: string;
    buyer_name: string;
    seller_name: string;
  };
  type Message = {
    id: string;
    dispute_id: string;
    author_pilot_id: string;
    message: string;
    evidence_url: string | null;
    created_at: number;
    author_name: string;
  };
  const [view, setView] = useState<"Disputas" | "Pedidos" | "Publicaciones" | "Historial">(
    "Disputas",
  );
  const [stats, setStats] = useState<Stats>({
    active_ads: 0,
    pending_orders: 0,
    open_disputes: 0,
    completed_orders: 0,
  });
  const [ads, setAds] = useState<Ad[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [logs, setLogs] = useState<
    Array<{
      id: string;
      order_id: string | null;
      ad_id: string | null;
      action: string;
      resolution_note: string;
      admin_email: string;
      created_at: number;
    }>
  >([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/market", { credentials: "same-origin" });
      const data = (await response.json()) as {
        stats?: Stats;
        ads?: Ad[];
        orders?: Order[];
        disputes?: Dispute[];
        messages?: Message[];
        logs?: typeof logs;
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "No se pudo cargar el mercado.");
      setStats(
        data.stats ?? { active_ads: 0, pending_orders: 0, open_disputes: 0, completed_orders: 0 },
      );
      setAds(data.ads ?? []);
      setOrders(data.orders ?? []);
      setDisputes(data.disputes ?? []);
      setMessages(data.messages ?? []);
      setLogs(data.logs ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el mercado.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (data: Record<string, unknown>, key: string) => {
    const reason = reasons[key]?.trim() ?? "";
    if (reason.length < 5) {
      setError("Escribe el motivo de la decisión (mínimo 5 caracteres).");
      return;
    }
    if (!window.confirm("¿Confirmas esta operación administrativa del mercado?")) return;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/market", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, reason }),
      });
      const result = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) throw new Error(result.error || "No se pudo completar la operación.");
      setNotice("Operación administrativa completada.");
      setReasons((current) => ({ ...current, [key]: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo completar la operación.");
    } finally {
      setBusy("");
    }
  };

  const money = (minor: number | null, currency: string | null) =>
    minor === null
      ? "—"
      : new Intl.NumberFormat("es", { style: "currency", currency: currency || "USD" }).format(
          minor / 100,
        );
  const date = (value: number) => new Date(value).toLocaleString();
  const query = search.trim().toLowerCase();
  const filteredAds = ads.filter((x) =>
    [x.id, x.seller_name, x.seller_pilot_id, x.item_name, x.status]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
  const filteredOrders = orders.filter((x) =>
    [x.id, x.buyer_name, x.seller_name, x.buyer_pilot_id, x.seller_pilot_id, x.item_name, x.status]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
  const filteredDisputes = disputes.filter((x) =>
    [
      x.id,
      x.order_id,
      x.buyer_name,
      x.seller_name,
      x.opened_by_name,
      x.item_name,
      x.reason,
      x.status,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );

  return (
    <section className="space-y-5">
      {notice ? (
        <p
          role="status"
          className="rounded border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}
      <p className="rounded border border-white/10 bg-white/[0.03] p-3 text-xs text-white/55">
        La administración decide únicamente la entrega o devolución del artículo dentro del juego.
        Los pagos entre jugadores son directos y el juego no puede comprobar ni revertir
        transferencias externas.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Publicaciones activas", stats.active_ads],
          ["Pedidos pendientes", stats.pending_orders],
          ["Disputas abiertas", stats.open_disputes],
          ["Operaciones completadas", stats.completed_orders],
        ].map(([label, value]) => (
          <div key={label} className="rounded border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[10px] uppercase text-white/50">{label}</p>
            <p className="mt-2 font-arcade text-lg text-cyan-200">
              {Number(value).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por ID, jugador o artículo..."
          className={inputCls}
        />
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-cyan-400/30 px-3 py-2 text-xs text-cyan-200"
        >
          Actualizar
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {(["Disputas", "Pedidos", "Publicaciones", "Historial"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setView(tab)}
            className={
              view === tab
                ? "rounded bg-cyan-400/20 px-3 py-2 text-xs text-cyan-100"
                : "rounded border border-white/10 px-3 py-2 text-xs text-white/60"
            }
          >
            {tab}
          </button>
        ))}
      </div>
      {loading ? <p className="p-4 text-sm text-white/50">Cargando mercado...</p> : null}

      {view === "Disputas" ? (
        <div className="space-y-3">
          {filteredDisputes.length === 0 && !loading ? (
            <p className="rounded border border-white/10 p-4 text-sm text-white/50">
              No hay disputas que mostrar.
            </p>
          ) : null}
          {filteredDisputes.map((dispute) => {
            const thread = messages.filter((message) => message.dispute_id === dispute.id);
            const key = dispute.id;
            return (
              <article
                key={key}
                className="space-y-3 rounded border border-amber-400/20 bg-white/[0.03] p-4"
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {dispute.item_name} · Orden {dispute.order_id}
                    </p>
                    <p className="mt-1 text-xs text-white/50">
                      Comprador: {dispute.buyer_name} · Vendedor: {dispute.seller_name}
                    </p>
                    <p className="text-xs text-white/40">
                      Abierta por {dispute.opened_by_name} · {date(dispute.created_at)}
                    </p>
                  </div>
                  <span
                    className={dispute.status === "OPEN" ? "text-amber-200" : "text-emerald-200"}
                  >
                    {dispute.status === "OPEN"
                      ? "Abierta"
                      : dispute.status === "RESOLVED_BUYER"
                        ? "A favor del comprador"
                        : "A favor del vendedor"}
                  </span>
                </div>
                <div className="rounded bg-black/20 p-3 text-sm text-white/75">
                  <b>Motivo:</b> {dispute.reason}
                </div>
                {dispute.evidence_url ? (
                  <p className="break-all text-xs">
                    <a
                      href={dispute.evidence_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-200 underline"
                    >
                      Abrir prueba adjunta
                    </a>
                  </p>
                ) : null}
                <div className="space-y-2 rounded border border-white/10 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/45">
                    Conversación y pruebas
                  </p>
                  {thread.map((message) => (
                    <div key={message.id} className="border-b border-white/5 pb-2 last:border-0">
                      <p className="text-xs text-cyan-100">
                        {message.author_name} · {date(message.created_at)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-white/75">
                        {message.message}
                      </p>
                      {message.evidence_url ? (
                        <a
                          href={message.evidence_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-cyan-200 underline"
                        >
                          Ver prueba
                        </a>
                      ) : null}
                    </div>
                  ))}
                  {!thread.length ? (
                    <p className="text-xs text-white/40">Sin mensajes adicionales.</p>
                  ) : null}
                </div>
                {dispute.status === "OPEN" ? (
                  <>
                    <label className="block text-xs text-white/55">
                      Motivo de la resolución
                      <input
                        value={reasons[key] ?? ""}
                        onChange={(event) =>
                          setReasons((current) => ({ ...current, [key]: event.target.value }))
                        }
                        maxLength={240}
                        className={inputCls}
                        placeholder="Explica brevemente la decisión..."
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          void act({ action: "resolve-buyer", disputeId: dispute.id }, key)
                        }
                        className="rounded bg-emerald-400/90 px-3 py-2 text-xs font-bold text-black disabled:opacity-40"
                      >
                        {busy === key ? "Procesando..." : "Resolver a favor del comprador"}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          void act({ action: "resolve-seller", disputeId: dispute.id }, key)
                        }
                        className="rounded border border-amber-400/40 px-3 py-2 text-xs text-amber-100 disabled:opacity-40"
                      >
                        Resolver a favor del vendedor
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-white/45">
                    Resolución: {dispute.resolution_note || "Sin nota"} ·{" "}
                    {dispute.resolved_by || ""}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : null}

      {view === "Pedidos" ? (
        <div className="space-y-2">
          {filteredOrders.map((order) => (
            <article key={order.id} className="rounded border border-white/10 p-3 text-xs">
              <div className="flex flex-wrap justify-between gap-2">
                <b className="text-white">
                  {order.item_name} · {order.id}
                </b>
                <span className="text-cyan-200">{order.status}</span>
              </div>
              <p className="mt-2 text-white/60">
                Vendedor: {order.seller_name} ({order.seller_pilot_id})
              </p>
              <p className="text-white/60">
                Comprador: {order.buyer_name} ({order.buyer_pilot_id})
              </p>
              <p className="mt-1 text-white/45">
                {money(order.price_minor, order.currency_code)} ·{" "}
                {order.payment_method || "Método no registrado"} · {date(order.created_at)}
              </p>
            </article>
          ))}
          {!filteredOrders.length && !loading ? (
            <p className="p-4 text-sm text-white/50">No hay pedidos.</p>
          ) : null}
        </div>
      ) : null}

      {view === "Publicaciones" ? (
        <div className="space-y-2">
          {filteredAds.map((ad) => (
            <article
              key={ad.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/10 p-3 text-xs"
            >
              <div>
                <b className="text-white">
                  {ad.item_name} · {ad.id}
                </b>
                <p className="mt-1 text-white/50">
                  {ad.seller_name} ({ad.seller_pilot_id}) ·{" "}
                  {money(ad.price_minor, ad.currency_code)} · {ad.status} · {date(ad.created_at)}
                </p>
              </div>
              {["ACTIVO", "PAUSADO"].includes(ad.status) ? (
                <div className="min-w-48 space-y-2">
                  <input
                    value={reasons[ad.id] ?? ""}
                    onChange={(event) =>
                      setReasons((current) => ({ ...current, [ad.id]: event.target.value }))
                    }
                    placeholder="Motivo para retirar..."
                    className={inputCls}
                  />
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void act({ action: "remove-listing", adId: ad.id }, ad.id)}
                    className="rounded border border-rose-400/40 px-3 py-2 text-xs text-rose-200 disabled:opacity-40"
                  >
                    Retirar publicación
                  </button>
                </div>
              ) : null}
            </article>
          ))}
          {!filteredAds.length && !loading ? (
            <p className="p-4 text-sm text-white/50">No hay publicaciones.</p>
          ) : null}
        </div>
      ) : null}

      {view === "Historial" ? (
        <div className="space-y-2">
          {logs.map((log) => (
            <article key={log.id} className="rounded border border-white/10 p-3 text-xs">
              <p className="text-white">
                {log.action} · {log.order_id || log.ad_id}
              </p>
              <p className="mt-1 text-white/55">{log.resolution_note}</p>
              <p className="mt-1 text-white/35">
                {log.admin_email} · {date(log.created_at)}
              </p>
            </article>
          ))}
          {!logs.length && !loading ? (
            <p className="p-4 text-sm text-white/50">
              Todavía no hay intervenciones administrativas.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function PaymentsSection() {
  type Payment = {
    id: string;
    pilot_id: string;
    obsidian_amount: number;
    crypto_amount: string;
    currency: "USDT" | "USDC";
    network: "POLYGON";
    tx_hash: string;
    wallet_address: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    created_at: number;
    reviewed_at: number | null;
    reviewed_by: string | null;
    rejection_reason: string | null;
    callsign: string;
    email: string | null;
  };
  const [walletAddress, setWalletAddress] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [payments, setPayments] = useState<Payment[]>([]);
  const [rejectReason, setRejectReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadPayments = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/payments", { credentials: "same-origin" });
      const data = (await response.json()) as {
        settings?: { wallet_address?: string; qr_url?: string | null };
        payments?: Payment[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar los pagos.");
      setWalletAddress(data.settings?.wallet_address ?? "");
      setQrUrl(data.settings?.qr_url ?? "");
      setPayments(data.payments ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los pagos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPayments();
  }, []);

  const saveWallet = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/payments", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save-wallet", walletAddress, qrUrl }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo guardar la wallet.");
      setNotice("Wallet y QR guardados correctamente.");
      await loadPayments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la wallet.");
    } finally {
      setSaving(false);
    }
  };

  const reviewPayment = async (payment: Payment, action: "approve" | "reject") => {
    if (action === "reject" && rejectReason.trim().length < 5) {
      setError("Escribe el motivo del rechazo (mínimo 5 caracteres).");
      return;
    }
    const description =
      action === "approve"
        ? `aprobar ${payment.obsidian_amount} OBS para ${payment.callsign}`
        : `rechazar el pago de ${payment.callsign}`;
    if (!window.confirm(`¿Confirmas ${description}?`)) return;
    setBusyId(payment.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/payments", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          paymentId: payment.id,
          reason: action === "reject" ? rejectReason.trim() : undefined,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        balanceBefore?: number;
        balanceAfter?: number;
      };
      if (!response.ok) throw new Error(data.error || "No se pudo procesar el pago.");
      setNotice(
        action === "approve"
          ? `Pago aprobado. Saldo OBS: ${(data.balanceBefore ?? 0).toLocaleString()} → ${(data.balanceAfter ?? 0).toLocaleString()}.`
          : "Pago rechazado. No se acreditaron OBS.",
      );
      setRejectReason("");
      await loadPayments();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo procesar el pago.");
    } finally {
      setBusyId("");
    }
  };

  const dateLabel = (value: number) => new Date(value).toLocaleString();
  const pending = payments.filter((payment) => payment.status === "PENDING");
  const history = payments.filter((payment) => payment.status !== "PENDING");

  return (
    <section className="space-y-5">
      {notice ? (
        <p
          role="status"
          className="rounded border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}

      <form
        onSubmit={(event) => void saveWallet(event)}
        className="grid gap-3 rounded border border-white/10 bg-white/[0.03] p-4 md:grid-cols-2"
      >
        <div className="md:col-span-2">
          <h2 className="text-xs uppercase tracking-wider text-cyan-200">
            Wallet para recibir pagos
          </h2>
          <p className="mt-1 text-xs text-white/50">Red fija: Polygon · Monedas: USDT y USDC</p>
        </div>
        <label className="block text-xs text-white/65 md:col-span-2">
          Dirección pública de wallet
          <input
            value={walletAddress}
            onChange={(event) => setWalletAddress(event.target.value)}
            maxLength={42}
            placeholder="0x..."
            autoComplete="off"
            className={inputCls}
          />
        </label>
        <label className="block text-xs text-white/65 md:col-span-2">
          Enlace de imagen QR (opcional)
          <input
            value={qrUrl}
            onChange={(event) => setQrUrl(event.target.value)}
            maxLength={2048}
            placeholder="https://..."
            className={inputCls}
          />
        </label>
        {qrUrl ? (
          <div className="md:col-span-2">
            <img
              src={qrUrl}
              alt="Vista previa del QR de pagos"
              className="max-h-40 rounded border border-white/10 bg-white p-2"
            />
          </div>
        ) : null}
        <button
          type="submit"
          disabled={saving || loading}
          className="rounded bg-cyan-400/90 px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-black hover:bg-cyan-300 disabled:opacity-40 md:col-span-2"
        >
          {saving ? "Guardando..." : "Guardar wallet y QR"}
        </button>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-wider text-amber-200">Pagos pendientes</h2>
          <button
            type="button"
            onClick={() => void loadPayments()}
            className="text-xs text-cyan-200 hover:text-white"
          >
            Actualizar
          </button>
        </div>
        {loading ? <p className="p-4 text-sm text-white/50">Cargando pagos...</p> : null}
        {!loading && pending.length === 0 ? (
          <p className="rounded border border-white/10 p-4 text-sm text-white/50">
            No hay pagos pendientes.
          </p>
        ) : null}
        {pending.map((payment) => (
          <article
            key={payment.id}
            className="space-y-3 rounded border border-amber-400/20 bg-white/[0.03] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">
                  {payment.callsign} · {payment.pilot_id}
                </p>
                <p className="text-xs text-white/50">
                  {payment.email ?? "Sin correo"} · {dateLabel(payment.created_at)}
                </p>
              </div>
              <span className="rounded bg-amber-400/10 px-2 py-1 text-xs text-amber-200">
                Pendiente
              </span>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <p>
                Recibe:{" "}
                <b className="text-cyan-200">{payment.obsidian_amount.toLocaleString()} OBS</b>
              </p>
              <p>
                Envió:{" "}
                <b>
                  {payment.crypto_amount} {payment.currency}
                </b>
              </p>
              <p>
                Red: <b>Polygon</b>
              </p>
            </div>
            <p className="break-all text-xs text-white/65">
              TX:{" "}
              <a
                href={`https://polygonscan.com/tx/${payment.tx_hash}`}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-200 underline"
              >
                {payment.tx_hash}
              </a>
            </p>
            <p className="break-all text-xs text-white/40">
              Wallet receptora: {payment.wallet_address}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => void reviewPayment(payment, "approve")}
                className="rounded bg-emerald-400/90 px-3 py-2 text-xs font-bold text-black hover:bg-emerald-300 disabled:opacity-40"
              >
                {busyId === payment.id ? "Procesando..." : "Aprobar y acreditar OBS"}
              </button>
              <button
                type="button"
                disabled={Boolean(busyId)}
                onClick={() => void reviewPayment(payment, "reject")}
                className="rounded border border-rose-400/40 px-3 py-2 text-xs text-rose-200 hover:bg-rose-400/10 disabled:opacity-40"
              >
                Rechazar pago
              </button>
            </div>
            <label className="block text-xs text-white/55">
              Motivo obligatorio si rechazas
              <input
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                maxLength={240}
                placeholder="TX incorrecto, monto no recibido..."
                className={inputCls}
              />
            </label>
          </article>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-xs uppercase tracking-wider text-white/65">
          Historial de pagos revisados
        </h2>
        {history.length === 0 && !loading ? (
          <p className="rounded border border-white/10 p-4 text-sm text-white/45">
            Todavía no hay pagos revisados.
          </p>
        ) : null}
        {history.map((payment) => (
          <div
            key={payment.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-white/10 p-3 text-xs"
          >
            <div>
              <p className="text-white">
                {payment.callsign} · {payment.obsidian_amount.toLocaleString()} OBS
              </p>
              <p className="mt-1 text-white/45">
                {payment.crypto_amount} {payment.currency} · {dateLabel(payment.created_at)}
              </p>
              {payment.rejection_reason ? (
                <p className="mt-1 text-rose-200">Motivo: {payment.rejection_reason}</p>
              ) : null}
            </div>
            <span className={payment.status === "APPROVED" ? "text-emerald-200" : "text-rose-200"}>
              {payment.status === "APPROVED" ? "Aprobado" : "Rechazado"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function EconomySection() {
  type Movement = {
    id: string;
    pilot_id: string;
    currency: "CR" | "OBS";
    delta: number;
    balance_before: number;
    balance_after: number;
    reason: string;
    admin_email: string;
    created_at: number;
    callsign: string;
    email: string | null;
  };
  const [totals, setTotals] = useState({ cr: 0, obs: 0, movementsToday: 0 });
  const [movements, setMovements] = useState<Movement[]>([]);
  const [currencyFilter, setCurrencyFilter] = useState("Todos");
  const [direction, setDirection] = useState("Todos");
  const [search, setSearch] = useState("");
  const [player, setPlayer] = useState("");
  const [currency, setCurrency] = useState<"CR" | "OBS">("CR");
  const [operation, setOperation] = useState<"credit" | "debit">("credit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadEconomy = async (
    nextCurrency = currencyFilter,
    nextDirection = direction,
    nextSearch = search,
  ) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        currency: nextCurrency,
        direction: nextDirection,
        search: nextSearch,
      });
      const response = await fetch(`/api/admin/economy?${params.toString()}`, {
        credentials: "same-origin",
      });
      const data = (await response.json()) as {
        totals?: { cr: number; obs: number; movementsToday: number };
        movements?: Movement[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "No se pudo cargar la economía.");
      setTotals(data.totals ?? { cr: 0, obs: 0, movementsToday: 0 });
      setMovements(data.movements ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar la economía.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEconomy("Todos", "Todos", "");
  }, []);

  const submitAdjustment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (
      !player.trim() ||
      !Number.isSafeInteger(numericAmount) ||
      numericAmount < 1 ||
      reason.trim().length < 5
    ) {
      setError("Completa jugador, cantidad entera y motivo.");
      return;
    }
    const label = operation === "credit" ? "acreditar" : "descontar";
    if (
      !window.confirm(
        `¿Confirmas ${label} ${numericAmount.toLocaleString()} ${currency} a ${player.trim()}?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/economy", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          player: player.trim(),
          currency,
          operation,
          amount: numericAmount,
          reason: reason.trim(),
        }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        balanceBefore?: number;
        balanceAfter?: number;
        error?: string;
      };
      if (!response.ok || !data.success)
        throw new Error(data.error || "No se pudo ajustar el saldo.");
      setNotice(
        `Operación realizada. Saldo anterior: ${(data.balanceBefore ?? 0).toLocaleString()}; saldo nuevo: ${(data.balanceAfter ?? 0).toLocaleString()} ${currency}.`,
      );
      setAmount("");
      setReason("");
      await loadEconomy();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo ajustar el saldo.");
    } finally {
      setBusy(false);
    }
  };

  const dateLabel = (value: number) => new Date(value).toLocaleString();

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["CR en circulación", totals.cr.toLocaleString()],
          ["OBS en circulación", totals.obs.toLocaleString()],
          ["Movimientos administrativos hoy", totals.movementsToday.toLocaleString()],
        ].map(([label, value]) => (
          <div key={label} className="rounded border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[11px] uppercase tracking-wider text-white/55">{label}</p>
            <p className="mt-2 font-arcade text-sm text-white">{loading ? "..." : value}</p>
          </div>
        ))}
      </div>

      {notice ? (
        <p
          role="status"
          className="rounded border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}

      <form
        onSubmit={(event) => void submitAdjustment(event)}
        className="grid gap-3 rounded border border-white/10 bg-white/[0.03] p-4 md:grid-cols-2"
      >
        <div className="text-xs uppercase tracking-wider text-cyan-200 md:col-span-2">
          Ajustar saldo de un jugador
        </div>
        <label className="block text-xs text-white/65">
          Jugador (ID, correo o nombre exacto)
          <input
            value={player}
            onChange={(event) => setPlayer(event.target.value)}
            maxLength={100}
            placeholder="plt_... o correo@..."
            className={inputCls}
          />
        </label>
        <label className="block text-xs text-white/65">
          Moneda
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value as "CR" | "OBS")}
            className={inputCls}
          >
            <option value="CR">CR</option>
            <option value="OBS">OBS</option>
          </select>
        </label>
        <label className="block text-xs text-white/65">
          Operación
          <select
            value={operation}
            onChange={(event) => setOperation(event.target.value as "credit" | "debit")}
            className={inputCls}
          >
            <option value="credit">Acreditar</option>
            <option value="debit">Descontar</option>
          </select>
        </label>
        <label className="block text-xs text-white/65">
          Cantidad (número entero)
          <input
            type="number"
            min="1"
            step="1"
            max="1000000000"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block text-xs text-white/65 md:col-span-2">
          Motivo obligatorio
          <textarea
            rows={2}
            maxLength={240}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explica por qué se realiza el ajuste..."
            className="mt-1 w-full rounded border border-white/10 bg-black/40 p-2 text-sm text-white outline-none focus:border-cyan-400/40"
          />
        </label>
        <button
          type="submit"
          disabled={
            busy ||
            !player.trim() ||
            !Number.isSafeInteger(Number(amount)) ||
            Number(amount) < 1 ||
            reason.trim().length < 5
          }
          className="rounded border border-cyan-400/30 px-3 py-2 text-xs font-bold uppercase text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-40 md:col-span-2"
        >
          {busy ? "Procesando..." : operation === "credit" ? "Acreditar saldo" : "Descontar saldo"}
        </button>
      </form>

      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void loadEconomy(currencyFilter, direction, search);
            }}
            className="flex min-w-0 flex-1 items-center gap-2 rounded border border-white/10 bg-black/30 px-3"
          >
            <Search className="size-4 shrink-0 text-white/55" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar jugador en movimientos..."
              className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/40"
            />
            <button type="submit" className="text-xs font-bold uppercase text-cyan-200">
              Buscar
            </button>
          </form>
          <select
            value={currencyFilter}
            onChange={(event) => {
              setCurrencyFilter(event.target.value);
              void loadEconomy(event.target.value, direction, search);
            }}
            className="h-10 rounded border border-white/10 bg-[#0b0d1c] px-3 text-sm text-white"
          >
            {["Todos", "CR", "OBS"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            value={direction}
            onChange={(event) => {
              setDirection(event.target.value);
              void loadEconomy(currencyFilter, event.target.value, search);
            }}
            className="h-10 rounded border border-white/10 bg-[#0b0d1c] px-3 text-sm text-white"
          >
            {["Todos", "Entradas", "Salidas"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden rounded border border-white/10">
          <div className="flex justify-between border-b border-white/10 px-3 py-2 text-xs uppercase tracking-wider text-white/65">
            <span>Historial de ajustes administrativos</span>
            <span>{loading ? "Cargando..." : movements.length}</span>
          </div>
          {movements.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="text-white/50">
                  <tr>
                    <th className="px-3 py-2">Fecha</th>
                    <th className="px-3 py-2">Jugador</th>
                    <th className="px-3 py-2">Moneda</th>
                    <th className="px-3 py-2">Movimiento</th>
                    <th className="px-3 py-2">Saldo anterior</th>
                    <th className="px-3 py-2">Saldo nuevo</th>
                    <th className="px-3 py-2">Motivo</th>
                    <th className="px-3 py-2">Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((item) => (
                    <tr key={item.id} className="border-t border-white/5">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-white/55">
                        {dateLabel(item.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <span>{item.callsign}</span>
                        <span className="block text-xs text-white/40">
                          {item.email || item.pilot_id}
                        </span>
                      </td>
                      <td className="px-3 py-2">{item.currency}</td>
                      <td
                        className={`px-3 py-2 font-bold ${item.delta > 0 ? "text-emerald-300" : "text-rose-300"}`}
                      >
                        {item.delta > 0 ? "+" : ""}
                        {item.delta.toLocaleString()}
                      </td>
                      <td className="px-3 py-2">{item.balance_before.toLocaleString()}</td>
                      <td className="px-3 py-2">{item.balance_after.toLocaleString()}</td>
                      <td className="max-w-[220px] whitespace-normal px-3 py-2 text-xs text-white/65">
                        {item.reason}
                      </td>
                      <td className="px-3 py-2 text-xs text-white/45">{item.admin_email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-6 text-center text-sm text-white/45">
              {loading ? "Cargando movimientos..." : "Todavía no hay ajustes administrativos."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function PlayersSection() {
  type Player = {
    pilotId: string;
    name: string;
    email: string;
    credits: number;
    obsidian: number;
    bossObsidian: number;
    vipUntil: number | null;
    suspended: boolean;
    createdAt: number;
  };
  type PlayerDetail = Player & {
    selectedShipId: string;
    updatedAt: number;
    suspensionReason: string | null;
    referrals: number;
  };
  type InventoryItem = {
    id: string;
    item_id: string;
    item_name: string;
    item_type: string;
    quantity: number;
    is_locked: number;
    grant_source: string;
  };
  type HistoryItem = { amount: number; reason: string; created_at: number };
  type AdminAction = { action: string; reason: string; created_at: number };
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<PlayerDetail | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [adminActions, setAdminActions] = useState<AdminAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const loadPlayers = async (nextFilter = filter, nextSearch = search) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ filter: nextFilter, search: nextSearch });
      const response = await fetch(`/api/admin/players?${params.toString()}`, {
        credentials: "same-origin",
      });
      const data = (await response.json()) as { players?: Player[]; error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar los jugadores.");
      setPlayers(data.players ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudieron cargar los jugadores.");
    } finally {
      setLoading(false);
    }
  };

  const openPlayer = async (pilotId: string) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/players/${encodeURIComponent(pilotId)}`, {
        credentials: "same-origin",
      });
      const data = (await response.json()) as {
        player?: PlayerDetail;
        inventory?: InventoryItem[];
        history?: HistoryItem[];
        adminActions?: AdminAction[];
        error?: string;
      };
      if (!response.ok || !data.player)
        throw new Error(data.error || "No se pudo abrir el perfil.");
      setSelected(data.player);
      setInventory(data.inventory ?? []);
      setHistory(data.history ?? []);
      setAdminActions(data.adminActions ?? []);
      setReason("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo abrir el perfil.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPlayers("Todos", "");
    // La carga inicial se realiza una sola vez al abrir la sección.
  }, []);

  const changeStatus = async () => {
    if (!selected || busy) return;
    if (!selected.suspended && reason.trim().length < 5) {
      setError("Escribe un motivo de al menos 5 caracteres.");
      return;
    }
    const nextSuspended = !selected.suspended;
    if (!window.confirm(nextSuspended ? "¿Suspender esta cuenta?" : "¿Reactivar esta cuenta?"))
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/admin/players/${encodeURIComponent(selected.pilotId)}/status`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ suspended: nextSuspended, reason: reason.trim() }),
        },
      );
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar la cuenta.");
      await openPlayer(selected.pilotId);
      await loadPlayers(filter, search);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar la cuenta.");
    } finally {
      setBusy(false);
    }
  };

  const dateLabel = (value: number | null) => (value ? new Date(value).toLocaleString() : "—");

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form
          className="flex min-w-0 flex-1 items-center gap-2 rounded border border-white/10 bg-black/30 px-3"
          onSubmit={(event) => {
            event.preventDefault();
            setSelected(null);
            void loadPlayers(filter, search);
          }}
        >
          <Search className="size-4 shrink-0 text-white/55" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por piloto, correo o ID..."
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/40"
          />
          <button type="submit" className="text-xs font-bold uppercase text-cyan-200">
            Buscar
          </button>
        </form>
        <select
          value={filter}
          onChange={(event) => {
            const next = event.target.value;
            setFilter(next);
            setSelected(null);
            void loadPlayers(next, search);
          }}
          className="h-10 rounded border border-white/10 bg-[#0b0d1c] px-3 text-sm text-white"
        >
          {["Todos", "Activos", "VIP", "Suspendidos"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}
      {selected ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-xs uppercase tracking-wider text-cyan-200 hover:text-white"
          >
            ← Volver a jugadores
          </button>
          <div className="rounded border border-cyan-400/20 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white">{selected.name}</h2>
                <p className="text-sm text-white/60">{selected.email}</p>
                <p className="mt-1 break-all text-xs text-white/40">{selected.pilotId}</p>
              </div>
              <span
                className={`rounded border px-2 py-1 text-xs ${selected.suspended ? "border-rose-400/40 text-rose-300" : "border-emerald-400/40 text-emerald-300"}`}
              >
                {selected.suspended ? "SUSPENDIDO" : "ACTIVO"}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["CR", selected.credits.toLocaleString()],
                ["OBS", selected.obsidian.toLocaleString()],
                ["OBS de jefes", selected.bossObsidian.toLocaleString()],
                ["Referidos", selected.referrals.toLocaleString()],
              ].map(([label, value]) => (
                <div key={label} className="rounded border border-white/10 p-3">
                  <p className="text-xs text-white/50">{label}</p>
                  <p className="mt-1 font-bold text-white">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid gap-1 text-xs text-white/55 sm:grid-cols-2">
              <p>Registro: {dateLabel(selected.createdAt)}</p>
              <p>VIP hasta: {dateLabel(selected.vipUntil)}</p>
              <p>Nave seleccionada: {selected.selectedShipId}</p>
              <p>Última actualización: {dateLabel(selected.updatedAt)}</p>
            </div>
            {selected.suspended ? (
              <p className="mt-3 text-sm text-rose-200">
                Motivo: {selected.suspensionReason || "No especificado"}
              </p>
            ) : (
              <div className="mt-4">
                <label className="block text-xs text-white/60">
                  Motivo de suspensión
                  <input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={240}
                    placeholder="Escribe el motivo..."
                    className="mt-1 h-10 w-full rounded border border-white/10 bg-black/40 px-3 text-sm text-white outline-none"
                  />
                </label>
              </div>
            )}
            <button
              type="button"
              disabled={busy || (!selected.suspended && reason.trim().length < 5)}
              onClick={() => void changeStatus()}
              className={`mt-3 rounded border px-3 py-2 text-xs font-bold uppercase disabled:opacity-40 ${selected.suspended ? "border-emerald-400/40 text-emerald-300" : "border-rose-400/40 text-rose-300"}`}
            >
              {busy
                ? "Procesando..."
                : selected.suspended
                  ? "Reactivar cuenta"
                  : "Suspender cuenta"}
            </button>
          </div>

          <div className="overflow-hidden rounded border border-white/10">
            <h3 className="border-b border-white/10 px-3 py-2 text-xs uppercase tracking-wider text-cyan-200">
              Inventario
            </h3>
            {inventory.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-white/50">
                    <tr>
                      <th className="px-3 py-2">Artículo</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Cantidad</th>
                      <th className="px-3 py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map((item) => (
                      <tr key={item.id} className="border-t border-white/5">
                        <td className="px-3 py-2">{item.item_name}</td>
                        <td className="px-3 py-2">{item.item_type}</td>
                        <td className="px-3 py-2">{item.quantity}</td>
                        <td className="px-3 py-2">
                          {item.is_locked ? "En mercado" : "Disponible"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-4 text-sm text-white/45">Inventario vacío.</p>
            )}
          </div>

          <div className="overflow-hidden rounded border border-white/10">
            <h3 className="border-b border-white/10 px-3 py-2 text-xs uppercase tracking-wider text-cyan-200">
              Acciones administrativas
            </h3>
            {adminActions.length ? (
              adminActions.map((entry, index) => (
                <div
                  key={index}
                  className="flex flex-wrap justify-between gap-2 border-t border-white/5 px-3 py-2 text-sm"
                >
                  <span>{entry.action}</span>
                  <span className="text-white/60">{entry.reason}</span>
                  <span className="text-xs text-white/45">{dateLabel(entry.created_at)}</span>
                </div>
              ))
            ) : (
              <p className="p-4 text-sm text-white/45">Sin acciones administrativas registradas.</p>
            )}
          </div>

          <div className="overflow-hidden rounded border border-white/10">
            <h3 className="border-b border-white/10 px-3 py-2 text-xs uppercase tracking-wider text-cyan-200">
              Historial de OBS acreditadas por administración
            </h3>
            {history.length ? (
              history.map((entry, index) => (
                <div
                  key={index}
                  className="flex flex-wrap justify-between gap-2 border-t border-white/5 px-3 py-2 text-sm"
                >
                  <span>{entry.reason}</span>
                  <span className="text-cyan-200">+{entry.amount} OBS</span>
                  <span className="text-xs text-white/45">{dateLabel(entry.created_at)}</span>
                </div>
              ))
            ) : (
              <p className="p-4 text-sm text-white/45">Sin movimientos administrativos de OBS.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-white/10">
          <div className="flex justify-between border-b border-white/10 px-3 py-2 text-xs uppercase tracking-wider text-white/65">
            <span>Jugadores registrados</span>
            <span>{loading ? "Cargando..." : players.length}</span>
          </div>
          {players.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="text-white/50">
                  <tr>
                    <th className="px-3 py-2">Piloto</th>
                    <th className="px-3 py-2">Correo</th>
                    <th className="px-3 py-2">CR</th>
                    <th className="px-3 py-2">OBS</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2">Perfil</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => (
                    <tr key={player.pilotId} className="border-t border-white/5">
                      <td className="px-3 py-2">{player.name}</td>
                      <td className="px-3 py-2 text-white/60">{player.email}</td>
                      <td className="px-3 py-2">{player.credits.toLocaleString()}</td>
                      <td className="px-3 py-2">{player.obsidian.toLocaleString()}</td>
                      <td className="px-3 py-2">
                        {player.suspended
                          ? "Suspendido"
                          : player.vipUntil && player.vipUntil > Date.now()
                            ? "VIP"
                            : "Activo"}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => void openPlayer(player.pilotId)}
                          className="text-cyan-200 hover:text-white"
                        >
                          Ver perfil
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="p-6 text-center text-sm text-white/45">
              {loading ? "Cargando jugadores..." : "No se encontraron jugadores."}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

type RewardType = "ship" | "VIP" | "item" | "OBS" | "CR";
const REWARD_ITEMS = INVENTORY_CATALOG.filter(
  (item, i, all) => all.findIndex((entry) => entry.label === item.label) === i,
);
const inputCls =
  "mt-1 h-10 w-full rounded border border-white/10 bg-black/40 px-2 text-sm text-white outline-none focus:border-cyan-400/40";

function RewardForm() {
  type RewardLog = {
    id: string;
    pilot_id: string;
    callsign: string;
    email: string | null;
    reward_type: RewardType;
    reward_name: string;
    quantity: number;
    event_name: string;
    reason: string;
    admin_email: string;
    created_at: number;
  };
  const [recipient, setRecipient] = useState("");
  const [type, setType] = useState<RewardType>("ship");
  const [shipId, setShipId] = useState(SHIPS[0]?.id ?? "");
  const [itemId, setItemId] = useState(REWARD_ITEMS[0]?.itemId ?? "");
  const [quantity, setQuantity] = useState("1");
  const [eventName, setEventName] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [rewards, setRewards] = useState<RewardLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async (query = search) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        "/api/admin/rewards?search=" + encodeURIComponent(query.trim()),
        { credentials: "same-origin" },
      );
      const data = (await response.json()) as { rewards?: RewardLog[]; error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo cargar el historial.");
      setRewards(data.rewards ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el historial.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load("");
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(quantity);
    if (
      !recipient.trim() ||
      !Number.isSafeInteger(amount) ||
      amount < 1 ||
      reason.trim().length < 5
    ) {
      setError("Completa el jugador, la cantidad y el motivo.");
      return;
    }
    const rewardId = type === "ship" ? shipId : type === "item" ? itemId : type.toLowerCase();
    const rewardName =
      type === "ship"
        ? (SHIPS.find((ship) => ship.id === shipId)?.name ?? "nave")
        : type === "item"
          ? (REWARD_ITEMS.find((item) => item.itemId === itemId)?.label ?? "objeto")
          : type;
    const summary = type === "VIP" ? amount + " días de VIP" : amount + " " + rewardName;
    if (!window.confirm("¿Confirmas entregar " + summary + " a " + recipient.trim() + "?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/rewards", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operationId: crypto.randomUUID(),
          recipient: recipient.trim(),
          rewardType: type,
          rewardId,
          quantity: amount,
          eventName: eventName.trim(),
          reason: reason.trim(),
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        reward_name?: string;
        quantity?: number;
      };
      if (!response.ok) throw new Error(data.error || "No se pudo entregar el premio.");
      setNotice(
        "Premio entregado correctamente: " +
          (data.quantity ?? amount) +
          " " +
          (data.reward_name ?? rewardName) +
          ".",
      );
      setRecipient("");
      setQuantity("1");
      setReason("");
      await load("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo entregar el premio.");
    } finally {
      setBusy(false);
    }
  };
  const date = (value: number) => new Date(value).toLocaleString("es-CO");
  return (
    <div className="space-y-5">
      <form
        className="space-y-4 rounded border border-white/10 bg-white/[0.03] p-4"
        onSubmit={submit}
      >
        <div className="text-xs uppercase tracking-wider text-cyan-200">
          Entregar premio o corregir recompensa no recibida
        </div>
        <label className="block text-xs text-white/70">
          Jugador (ID, correo o nombre)
          <input
            required
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            placeholder="plt_xxxx · correo@ejemplo.com · Piloto"
            className={inputCls}
          />
        </label>
        <div>
          <div className="text-xs text-white/70">Tipo de premio</div>
          <div className="mt-1 grid grid-cols-5 gap-1">
            {(
              [
                ["ship", "Nave"],
                ["VIP", "VIP"],
                ["item", "Objeto"],
                ["OBS", "OBS"],
                ["CR", "CR"],
              ] as [RewardType, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setType(value)}
                className={
                  "rounded border py-2 text-xs " +
                  (type === value
                    ? "border-cyan-400/50 bg-cyan-400/20 text-cyan-100"
                    : "border-white/10 text-white/70 hover:bg-white/5")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {type === "ship" ? (
          <label className="block text-xs text-white/70">
            Nave
            <select
              value={shipId}
              onChange={(event) => setShipId(event.target.value)}
              className={inputCls}
            >
              {SHIPS.map((ship) => (
                <option key={ship.id} value={ship.id}>
                  {ship.name} · {ship.role}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {type === "item" ? (
          <label className="block text-xs text-white/70">
            Objeto
            <select
              value={itemId}
              onChange={(event) => setItemId(event.target.value)}
              className={inputCls}
            >
              {REWARD_ITEMS.map((item) => (
                <option key={item.itemId} value={item.itemId}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="block text-xs text-white/70">
          {type === "VIP"
            ? "Duración del VIP (días)"
            : type === "ship"
              ? "Cantidad (las naves se entregan de una en una)"
              : "Cantidad"}
          <input
            type="number"
            min={1}
            max={type === "VIP" ? 3650 : type === "ship" ? 1 : type === "item" ? 1000 : 1000000000}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block text-xs text-white/70">
          Evento o temporada (opcional)
          <input
            maxLength={100}
            value={eventName}
            onChange={(event) => setEventName(event.target.value)}
            placeholder="Ej. Evento de lanzamiento"
            className={inputCls}
          />
        </label>
        <label className="block text-xs text-white/70">
          Motivo de la entrega (obligatorio)
          <textarea
            required
            minLength={5}
            maxLength={240}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ej. Premio del evento o corrección de recompensa no recibida"
            className="mt-1 w-full rounded border border-white/10 bg-black/40 p-2 text-sm text-white outline-none focus:border-cyan-400/40"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !recipient.trim() || reason.trim().length < 5}
          className="w-full rounded bg-amber-400/90 py-2.5 text-sm font-bold uppercase tracking-wider text-black hover:bg-amber-300 disabled:opacity-40"
        >
          {busy ? "Entregando..." : "Entregar premio"}
        </button>
        {error ? (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm text-emerald-300">
            {notice}
          </p>
        ) : null}
      </form>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-xs uppercase tracking-wider text-white/70">
            Historial de premios entregados
          </h3>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void load();
            }}
            placeholder="Buscar jugador o evento"
            className="ml-auto h-9 min-w-0 rounded border border-white/10 bg-black/40 px-2 text-xs text-white"
          />
          <button
            onClick={() => void load()}
            className="rounded border border-white/15 px-3 py-2 text-xs text-white/70"
          >
            Buscar
          </button>
        </div>
        <div className="overflow-x-auto rounded border border-white/10">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-white/[0.03] text-white/55">
              <tr>
                {["Fecha", "Jugador", "Premio", "Evento", "Motivo", "Administración"].map(
                  (label) => (
                    <th key={label} className="px-3 py-2 font-normal">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {rewards.map((reward) => (
                <tr key={reward.id} className="border-t border-white/5 text-white/70">
                  <td className="px-3 py-2">{date(reward.created_at)}</td>
                  <td className="px-3 py-2">
                    {reward.callsign}
                    <br />
                    <span className="text-white/40">{reward.email ?? reward.pilot_id}</span>
                  </td>
                  <td className="px-3 py-2">
                    {reward.quantity} × {reward.reward_name}
                    {reward.reward_type === "VIP" ? " días" : ""}
                  </td>
                  <td className="px-3 py-2">{reward.event_name || "—"}</td>
                  <td className="max-w-[220px] whitespace-normal px-3 py-2">{reward.reason}</td>
                  <td className="px-3 py-2">{reward.admin_email}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !rewards.length ? (
            <p className="p-4 text-center text-xs text-white/40">
              Todavía no hay premios registrados.
            </p>
          ) : null}
          {loading ? (
            <p className="p-4 text-center text-xs text-white/40">Cargando historial...</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
