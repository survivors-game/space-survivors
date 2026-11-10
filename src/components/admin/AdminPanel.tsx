import { useEffect, useState } from "react";
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
 * Panel de ADMINISTRACIÓN — solo interfaz visual.
 * No hay lógica real: la autenticación y los datos se conectarán en el servidor.
 * Ninguna acción simula resultados; todas avisan que están pendientes de conexión.
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
            if (!accepted) setError("No se pudo validar el acceso. Revisa la contraseña e inténtalo de nuevo.");
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
        {error ? <p role="alert" className="mt-3 text-center text-xs text-rose-300">{error}</p> : null}
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

      {def.id === "jugadores" ? <PlayersSection /> : <>
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
          def.form || def.id === "premios" ? "grid gap-5 lg:grid-cols-[minmax(0,360px)_1fr]" : ""
        }
      >
        {def.id === "premios" ? <RewardForm onAction={onAction} /> : null}
        {def.form ? (
          <form
            className="space-y-3 rounded border border-white/10 bg-white/[0.03] p-4"
            onSubmit={(e) => {
              e.preventDefault();
              onAction(def.form!.submit);
            }}
          >
            <div className="text-xs uppercase tracking-wider text-cyan-200">{def.form.title}</div>
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
                      <td colSpan={t.cols.length} className="px-3 py-8 text-center text-white/50">
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
      </>}
    </div>
  );
}

function PlayersSection() {
  type Player = {
    pilotId: string; name: string; email: string; credits: number; obsidian: number;
    bossObsidian: number; vipUntil: number | null; suspended: boolean; createdAt: number;
  };
  type PlayerDetail = Player & {
    selectedShipId: string; updatedAt: number; suspensionReason: string | null; referrals: number;
  };
  type InventoryItem = {
    id: string; item_id: string; item_name: string; item_type: string;
    quantity: number; is_locked: number; grant_source: string;
  };
  type HistoryItem = { amount: number; reason: string; created_at: number };
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState<PlayerDetail | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
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
      const data = await response.json() as { players?: Player[]; error?: string };
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
      const data = await response.json() as {
        player?: PlayerDetail; inventory?: InventoryItem[]; history?: HistoryItem[]; error?: string;
      };
      if (!response.ok || !data.player) throw new Error(data.error || "No se pudo abrir el perfil.");
      setSelected(data.player);
      setInventory(data.inventory ?? []);
      setHistory(data.history ?? []);
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
    if (!window.confirm(nextSuspended ? "¿Suspender esta cuenta?" : "¿Reactivar esta cuenta?")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/players/${encodeURIComponent(selected.pilotId)}/status`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ suspended: nextSuspended, reason: reason.trim() }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar la cuenta.");
      await openPlayer(selected.pilotId);
      await loadPlayers(filter, search);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar la cuenta.");
    } finally {
      setBusy(false);
    }
  };

  const dateLabel = (value: number | null) =>
    value ? new Date(value).toLocaleString() : "—";

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <form
          className="flex min-w-0 flex-1 items-center gap-2 rounded border border-white/10 bg-black/30 px-3"
          onSubmit={(event) => { event.preventDefault(); setSelected(null); void loadPlayers(filter, search); }}
        >
          <Search className="size-4 shrink-0 text-white/55" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por piloto, correo o ID..."
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/40"
          />
          <button type="submit" className="text-xs font-bold uppercase text-cyan-200">Buscar</button>
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
          {["Todos", "Activos", "VIP", "Suspendidos"].map((value) => <option key={value}>{value}</option>)}
        </select>
      </div>

      {error ? <p role="alert" className="rounded border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p> : null}
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
              <span className={`rounded border px-2 py-1 text-xs ${selected.suspended ? "border-rose-400/40 text-rose-300" : "border-emerald-400/40 text-emerald-300"}`}>
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
              <p className="mt-3 text-sm text-rose-200">Motivo: {selected.suspensionReason || "No especificado"}</p>
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
              {busy ? "Procesando..." : selected.suspended ? "Reactivar cuenta" : "Suspender cuenta"}
            </button>
          </div>

          <div className="overflow-hidden rounded border border-white/10">
            <h3 className="border-b border-white/10 px-3 py-2 text-xs uppercase tracking-wider text-cyan-200">Inventario</h3>
            {inventory.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-white/50"><tr><th className="px-3 py-2">Artículo</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Cantidad</th><th className="px-3 py-2">Estado</th></tr></thead>
                  <tbody>{inventory.map((item) => (
                    <tr key={item.id} className="border-t border-white/5">
                      <td className="px-3 py-2">{item.item_name}</td>
                      <td className="px-3 py-2">{item.item_type}</td>
                      <td className="px-3 py-2">{item.quantity}</td>
                      <td className="px-3 py-2">{item.is_locked ? "En mercado" : "Disponible"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="p-4 text-sm text-white/45">Inventario vacío.</p>}
          </div>

          <div className="overflow-hidden rounded border border-white/10">
            <h3 className="border-b border-white/10 px-3 py-2 text-xs uppercase tracking-wider text-cyan-200">Historial de OBS acreditadas por administración</h3>
            {history.length ? history.map((entry, index) => (
              <div key={index} className="flex flex-wrap justify-between gap-2 border-t border-white/5 px-3 py-2 text-sm">
                <span>{entry.reason}</span>
                <span className="text-cyan-200">+{entry.amount} OBS</span>
                <span className="text-xs text-white/45">{dateLabel(entry.created_at)}</span>
              </div>
            )) : <p className="p-4 text-sm text-white/45">Sin movimientos administrativos de OBS.</p>}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-white/10">
          <div className="flex justify-between border-b border-white/10 px-3 py-2 text-xs uppercase tracking-wider text-white/65">
            <span>Jugadores registrados</span><span>{loading ? "Cargando..." : players.length}</span>
          </div>
          {players.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="text-white/50"><tr><th className="px-3 py-2">Piloto</th><th className="px-3 py-2">Correo</th><th className="px-3 py-2">CR</th><th className="px-3 py-2">OBS</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Perfil</th></tr></thead>
                <tbody>{players.map((player) => (
                  <tr key={player.pilotId} className="border-t border-white/5">
                    <td className="px-3 py-2">{player.name}</td>
                    <td className="px-3 py-2 text-white/60">{player.email}</td>
                    <td className="px-3 py-2">{player.credits.toLocaleString()}</td>
                    <td className="px-3 py-2">{player.obsidian.toLocaleString()}</td>
                    <td className="px-3 py-2">{player.suspended ? "Suspendido" : player.vipUntil && player.vipUntil > Date.now() ? "VIP" : "Activo"}</td>
                    <td className="px-3 py-2"><button type="button" onClick={() => void openPlayer(player.pilotId)} className="text-cyan-200 hover:text-white">Ver perfil</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="p-6 text-center text-sm text-white/45">{loading ? "Cargando jugadores..." : "No se encontraron jugadores."}</p>}
        </div>
      )}
    </section>
  );
}

type RewardType = "nave" | "vip" | "objeto" | "obs" | "cr";
const REWARD_TYPES: { id: RewardType; label: string }[] = [
  { id: "nave", label: "Nave" },
  { id: "vip", label: "VIP" },
  { id: "objeto", label: "Objeto" },
  { id: "obs", label: "OBS" },
  { id: "cr", label: "CR" },
];
// Catálogo sin alias duplicados (p. ej. "magnet" e "iman").
const REWARD_ITEMS = INVENTORY_CATALOG.filter(
  (item, i, all) => all.findIndex((o) => o.label === item.label) === i,
);

const inputCls =
  "mt-1 h-10 w-full rounded border border-white/10 bg-black/40 px-2 text-sm text-white outline-none focus:border-cyan-400/40";

function RewardForm({ onAction }: { onAction: (l: string) => void }) {
  const [recipient, setRecipient] = useState("");
  const [type, setType] = useState<RewardType>("nave");
  const [shipId, setShipId] = useState(SHIPS[0]?.id ?? "");
  const [vipDays, setVipDays] = useState("30");
  const [itemId, setItemId] = useState(REWARD_ITEMS[0]?.itemId ?? "");
  const [qty, setQty] = useState("1");
  const [amount, setAmount] = useState("");

  const summary = (() => {
    if (type === "nave") return `nave ${SHIPS.find((s) => s.id === shipId)?.name ?? ""}`;
    if (type === "vip") return `${vipDays} días de VIP`;
    if (type === "objeto")
      return `${qty} × ${REWARD_ITEMS.find((i) => i.itemId === itemId)?.label ?? ""}`;
    return `${amount || 0} ${type.toUpperCase()}`;
  })();

  const valid =
    recipient.trim().length > 0 &&
    (type === "vip" ? Number(vipDays) > 0 : true) &&
    (type === "objeto" ? Number(qty) > 0 : true) &&
    (type === "obs" || type === "cr" ? Number(amount) > 0 : true);

  return (
    <form
      className="space-y-4 rounded border border-white/10 bg-white/[0.03] p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onAction(`Entregar ${summary} a ${recipient.trim()}`);
      }}
    >
      <div className="text-xs uppercase tracking-wider text-cyan-200">Entregar premio</div>

      <label className="block text-xs text-white/70">
        Jugador (ID, correo o nombre de usuario)
        <input
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="plt_xxxx · correo@ejemplo.com · Piloto"
          className={`${inputCls} placeholder:text-white/40`}
        />
      </label>

      <div>
        <div className="text-xs text-white/70">Tipo de premio</div>
        <div className="mt-1 grid grid-cols-5 gap-1">
          {REWARD_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setType(t.id)}
              className={`rounded border py-2 text-xs ${type === t.id ? "border-cyan-400/50 bg-cyan-400/20 text-cyan-100" : "border-white/10 text-white/70 hover:bg-white/5"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {type === "nave" ? (
        <label className="block text-xs text-white/70">
          Nave
          <select value={shipId} onChange={(e) => setShipId(e.target.value)} className={inputCls}>
            {SHIPS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.role}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {type === "vip" ? (
        <label className="block text-xs text-white/70">
          Días de VIP a regalar
          <input
            type="number"
            min={1}
            value={vipDays}
            onChange={(e) => setVipDays(e.target.value)}
            className={inputCls}
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {[1, 7, 15, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setVipDays(String(d))}
                className={`rounded px-2.5 py-1 text-xs ${vipDays === String(d) ? "bg-amber-400/20 text-amber-200" : "text-white/70 hover:bg-white/5"}`}
              >
                {d} días
              </button>
            ))}
          </div>
        </label>
      ) : null}

      {type === "objeto" ? (
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <label className="block text-xs text-white/70">
            Objeto
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={inputCls}>
              {REWARD_ITEMS.map((i) => (
                <option key={i.itemId} value={i.itemId}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-white/70">
            Cantidad
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={inputCls}
            />
          </label>
        </div>
      ) : null}

      {type === "obs" || type === "cr" ? (
        <label className="block text-xs text-white/70">
          Cantidad de {type.toUpperCase()}
          <input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className={`${inputCls} placeholder:text-white/40`}
          />
        </label>
      ) : null}

      <div className="rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/75">
        Resumen: <span className="text-white">{summary}</span>
        {recipient.trim() ? (
          <>
            {" "}
            → <span className="text-cyan-200">{recipient.trim()}</span>
          </>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={!valid}
        className="w-full rounded bg-amber-400/90 py-2.5 text-sm font-bold uppercase tracking-wider text-black hover:bg-amber-300 disabled:opacity-40"
      >
        Entregar premio
      </button>
    </form>
  );
}
