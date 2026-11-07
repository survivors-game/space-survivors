import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Gavel,
  MessageSquare,
  Paperclip,
  Search,
  Send,
  ShieldCheck,
} from "lucide-react";
import {
  DISPUTE_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  P2P_ADS,
  P2P_CHAT,
  P2P_DISPUTES,
  P2P_FEE_OBSIDIAN,
  P2P_MY_ADS,
  P2P_MY_INVENTORY,
  P2P_ORDERS,
  P2P_PAY_METHODS,
  type P2PAd,
  type P2PDispute,
  type P2POrder,
  type P2POrderStatus,
  type P2PPayMethod,
} from "@/game/data/market";

/**
 * Puntos de conexión para el backend (se implementan después en Codespaces).
 * Esta interfaz NO procesa compras, pagos, comisiones ni inventario.
 */
export interface MarketActions {
  onBuy?: (adId: string) => void;
  onPublish?: (data: { item: string; precio: string; moneda: string; metodos: P2PPayMethod[]; datosPago: string }) => void;
  onToggleAd?: (adId: string) => void;
  onReportPaid?: (orderId: string) => void;
  onRelease?: (orderId: string) => void;
  onCancelOrder?: (orderId: string) => void;
  onSendMessage?: (orderId: string, text: string) => void;
  onOpenDispute?: (orderId: string, motivo: string, files: File[]) => void;
  onResolveDispute?: (disputeId: string, favor: "COMPRADOR" | "VENDEDOR") => void;
}

type Tab = "EXPLORAR" | "PUBLICAR" | "MIS ANUNCIOS" | "MIS ÓRDENES" | "DISPUTAS" | "ADMIN";
const TABS: Tab[] = ["EXPLORAR", "PUBLICAR", "MIS ANUNCIOS", "MIS ÓRDENES", "DISPUTAS", "ADMIN"];

const panel = "border border-cyan-500/20 bg-[#0b0d1c]/70";
const field =
  "h-10 min-w-0 border border-white/15 bg-[#0b0d1c] px-3 text-xs text-white outline-none focus:border-cyan-300/70";
const label = "flex flex-col gap-1.5 text-[9px] uppercase tracking-widest text-white/45";

function Btn({
  children,
  onClick,
  disabled,
  tone = "cyan",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "cyan" | "green" | "red" | "ghost" | "gold";
  className?: string;
}) {
  const tones = {
    cyan: "border-cyan-300/60 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20",
    green: "border-emerald-400/60 bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/25",
    red: "border-[#ff4d7d]/60 bg-[#ff4d7d]/10 text-[#ff9ab9] hover:bg-[#ff4d7d]/20",
    gold: "border-amber-400/60 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20",
    ghost: "border-white/15 bg-transparent text-white/60 hover:text-white",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`font-arcade inline-flex min-h-10 items-center justify-center gap-2 border px-3 text-[8px] uppercase tracking-widest transition disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-white/25 ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

function FeeNote({ kind }: { kind: "publish" | "buy" }) {
  return (
    <p className="flex items-center gap-2 text-[9px] uppercase tracking-widest text-violet-200/80">
      <span className="inline-block size-2 rotate-45 bg-violet-400 shadow-[0_0_8px_#a855f7]" />
      COMISIÓN: {P2P_FEE_OBSIDIAN[kind]} OBSIDIANA {kind === "publish" ? "POR PUBLICAR" : "POR COMPRAR"}
    </p>
  );
}

function SafetyNote() {
  return (
    <div className="flex gap-2 border border-amber-400/30 bg-amber-400/5 p-3 text-[10px] leading-relaxed text-amber-100/85">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber-300" />
      <span>
        El pago se realiza <b>directamente entre jugadores</b>. SPACE SURVIVORS no recibe ni custodia dinero real.
      </span>
    </div>
  );
}

const STATUS_STYLE: Record<P2POrderStatus, string> = {
  PENDIENTE_PAGO: "border-amber-400/50 text-amber-200",
  PAGO_REPORTADO: "border-cyan-300/50 text-cyan-200",
  PENDIENTE_LIBERACION: "border-violet-400/50 text-violet-200",
  COMPLETADA: "border-emerald-400/50 text-emerald-200",
};

function StatusPill({ status }: { status: P2POrderStatus }) {
  return (
    <span className={`border px-2 py-1 text-[8px] uppercase tracking-widest ${STATUS_STYLE[status]}`}>
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}

function PendingNotice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="status" className="border border-cyan-300/30 bg-cyan-300/5 p-2 text-[10px] uppercase tracking-wider text-cyan-100/80">
      {text}
    </p>
  );
}

const PENDING = "Acción lista · pendiente de conexión con el servidor del mercado.";

/* ---------------------------- EXPLORAR ---------------------------- */

function Explore({ actions, onOpenAd }: { actions?: MarketActions | undefined; onOpenAd: (ad: P2PAd) => void }) {
  const [query, setQuery] = useState("");
  const [tipo, setTipo] = useState<"todos" | P2PAd["tipo"]>("todos");
  const [metodo, setMetodo] = useState<"todos" | P2PPayMethod>("todos");
  const [orden, setOrden] = useState<"asc" | "desc">("asc");
  const ads = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return P2P_ADS.filter(
      (a) =>
        (a.item.toLocaleLowerCase().includes(q) || a.vendedor.toLocaleLowerCase().includes(q)) &&
        (tipo === "todos" || a.tipo === tipo) &&
        (metodo === "todos" || a.metodos.includes(metodo)),
    ).sort((a, b) => (orden === "asc" ? a.precio - b.precio : b.precio - a.precio));
  }, [query, tipo, metodo, orden]);
  void actions;

  return (
    <section className="space-y-4">
      <div className={`${panel} grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4`}>
        <label className={label}>
          BUSCAR
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-3 size-4 text-white/35" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Artículo o vendedor" className={`${field} w-full pl-8`} />
          </div>
        </label>
        <label className={label}>
          TIPO
          <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className={field}>
            <option value="todos">Todos</option>
            <option value="nave">Naves</option>
            <option value="objeto">Objetos</option>
            <option value="mejora">Mejoras</option>
          </select>
        </label>
        <label className={label}>
          MÉTODO DE PAGO
          <select value={metodo} onChange={(e) => setMetodo(e.target.value as typeof metodo)} className={field}>
            <option value="todos">Todos</option>
            {P2P_PAY_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          PRECIO
          <select value={orden} onChange={(e) => setOrden(e.target.value as typeof orden)} className={field}>
            <option value="asc">Menor a mayor</option>
            <option value="desc">Mayor a menor</option>
          </select>
        </label>
      </div>

      <div className={`${panel} hidden grid-cols-[1.4fr_1.6fr_1fr_1.2fr_auto] gap-3 px-4 py-2 text-[8px] uppercase tracking-widest text-white/40 lg:grid`}>
        <span>VENDEDOR</span><span>ARTÍCULO</span><span>PRECIO</span><span>MÉTODOS</span><span className="w-28 text-right">ACCIÓN</span>
      </div>

      <div className="space-y-2">
        {ads.length === 0 ? (
          <p className="p-6 text-center text-[10px] uppercase tracking-widest text-white/40">Sin anuncios para estos filtros.</p>
        ) : null}
        {ads.map((ad) => (
          <article key={ad.id} className="grid gap-3 border border-white/10 bg-[#0b0d1c]/75 p-4 transition hover:border-cyan-300/30 lg:grid-cols-[1.4fr_1.6fr_1fr_1.2fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-bold text-white">{ad.vendedor}</p>
              <p className="text-[9px] uppercase tracking-wider text-white/40">
                {ad.operaciones} órdenes · <span className="text-emerald-300">{ad.completado}%</span> completado
              </p>
            </div>
            <div>
              <p className="text-xs text-cyan-100">{ad.item}</p>
              <p className="text-[9px] text-white/45">{ad.efecto} · Disp. {ad.disponibles}</p>
            </div>
            <p className="font-arcade text-[11px] tabular-nums text-[#ffd700]">
              {ad.precio.toLocaleString("es-CO")} <span className="text-[8px] text-white/50">{ad.moneda}</span>
            </p>
            <div className="flex flex-wrap gap-1">
              {ad.metodos.map((m) => (
                <span key={m} className="border-l-2 border-amber-400 bg-white/5 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-white/70">{m}</span>
              ))}
            </div>
            <Btn tone="green" className="lg:w-28" onClick={() => onOpenAd(ad)}>COMPRAR</Btn>
          </article>
        ))}
      </div>
    </section>
  );
}

function BuyConfirm({ ad, actions, onBack }: { ad: P2PAd; actions?: MarketActions | undefined; onBack: () => void }) {
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <section className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-[9px] uppercase tracking-widest text-white/50 hover:text-white">
        <ArrowLeft className="size-4" /> Volver a anuncios
      </button>
      <div className={`${panel} grid gap-5 p-5 md:grid-cols-2`}>
        <div className="space-y-2">
          <h3 className="font-arcade text-[10px] uppercase tracking-widest text-cyan-100">COMPRAR {ad.item}</h3>
          <Row k="Vendedor" v={`${ad.vendedor} · ${ad.completado}%`} />
          <Row k="Efecto" v={ad.efecto} />
          <Row k="Precio" v={`${ad.precio.toLocaleString("es-CO")} ${ad.moneda}`} gold />
          <Row k="Métodos" v={ad.metodos.join(" · ")} />
          <Row k="Límite de pago" v="15 minutos" />
        </div>
        <div className="space-y-3">
          <SafetyNote />
          <FeeNote kind="buy" />
          <p className="text-[10px] leading-relaxed text-white/55">
            Al crear la orden verás los datos de pago del vendedor y se abrirá el chat privado.
          </p>
          <PendingNotice text={notice} />
          <Btn tone="green" className="w-full" onClick={() => (actions?.onBuy ? actions.onBuy(ad.id) : setNotice(PENDING))}>
            CREAR ORDEN DE COMPRA
          </Btn>
        </div>
      </div>
    </section>
  );
}

function Row({ k, v, gold }: { k: string; v: string; gold?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/5 py-1.5 text-[10px]">
      <span className="uppercase tracking-wider text-white/40">{k}</span>
      <span className={gold ? "font-arcade text-[10px] text-[#ffd700]" : "text-right text-white/85"}>{v}</span>
    </div>
  );
}

/* ---------------------------- PUBLICAR ---------------------------- */

function Publish({ actions }: { actions?: MarketActions | undefined }) {
  const [item, setItem] = useState(P2P_MY_INVENTORY[0] ?? "");
  const [precio, setPrecio] = useState("");
  const [moneda, setMoneda] = useState("COP");
  const [metodos, setMetodos] = useState<P2PPayMethod[]>([]);
  const [datosPago, setDatosPago] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const invalid = !(Number(precio) > 0) || metodos.length === 0 || datosPago.trim() === "";

  return (
    <section className={`${panel} grid gap-5 p-5 lg:grid-cols-[1.3fr_1fr]`}>
      <div className="grid gap-4">
        <h3 className="font-arcade text-[10px] uppercase tracking-widest text-cyan-100">PUBLICAR ARTÍCULO</h3>
        <label className={label}>
          ARTÍCULO DE TU INVENTARIO
          <select value={item} onChange={(e) => setItem(e.target.value)} className={field}>
            {P2P_MY_INVENTORY.map((i) => (<option key={i}>{i}</option>))}
          </select>
        </label>
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <label className={label}>
            PRECIO
            <input type="number" min="0" value={precio} onChange={(e) => setPrecio(e.target.value)} className={`${field} text-[#ffd700]`} />
          </label>
          <label className={label}>
            MONEDA
            <select value={moneda} onChange={(e) => setMoneda(e.target.value)} className={field}>
              <option>COP</option><option>USD</option>
            </select>
          </label>
        </div>
        <fieldset className={label}>
          <legend className="mb-1.5">MÉTODOS DE PAGO ACEPTADOS</legend>
          <div className="flex flex-wrap gap-2">
            {P2P_PAY_METHODS.map((m) => {
              const on = metodos.includes(m);
              return (
                <label key={m} className={`flex cursor-pointer items-center gap-2 border px-2.5 py-2 text-[9px] ${on ? "border-amber-400/60 bg-amber-400/10 text-amber-100" : "border-white/15 text-white/55"}`}>
                  <input type="checkbox" checked={on} onChange={() => setMetodos((p) => (on ? p.filter((x) => x !== m) : [...p, m]))} className="accent-amber-400" />
                  {m}
                </label>
              );
            })}
          </div>
        </fieldset>
        <label className={label}>
          DATOS DE PAGO (VISIBLES SOLO PARA EL COMPRADOR)
          <textarea value={datosPago} onChange={(e) => setDatosPago(e.target.value)} rows={3} placeholder="Titular, número de cuenta o teléfono…" className={`${field} h-auto py-2`} />
        </label>
      </div>
      <aside className="space-y-3 border-l-0 border-white/10 lg:border-l lg:pl-5">
        <h4 className="text-[9px] uppercase tracking-widest text-white/45">RESUMEN</h4>
        <Row k="Artículo" v={item} />
        <Row k="Precio" v={precio ? `${Number(precio).toLocaleString("es-CO")} ${moneda}` : "—"} gold />
        <Row k="Métodos" v={metodos.join(" · ") || "—"} />
        <FeeNote kind="publish" />
        <SafetyNote />
        {invalid ? <p className="text-[9px] uppercase tracking-wider text-[#ff9ab9]">Completa precio, métodos y datos de pago.</p> : null}
        <PendingNotice text={notice} />
        <Btn tone="gold" className="w-full" disabled={invalid} onClick={() => (actions?.onPublish ? actions.onPublish({ item, precio, moneda, metodos, datosPago }) : setNotice(PENDING))}>
          PUBLICAR ANUNCIO
        </Btn>
      </aside>
    </section>
  );
}

/* --------------------------- MIS ANUNCIOS --------------------------- */

function MyAds({ actions }: { actions?: MarketActions | undefined }) {
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <section className="space-y-2">
      <PendingNotice text={notice} />
      {P2P_MY_ADS.map((ad) => (
        <article key={ad.id} className="grid gap-3 border border-white/10 bg-[#0b0d1c]/75 p-4 sm:grid-cols-[1.5fr_1fr_1.3fr_auto_auto] sm:items-center">
          <span className="text-xs text-cyan-100">{ad.item}</span>
          <span className="font-arcade text-[10px] text-[#ffd700]">{ad.precio}</span>
          <span className="text-[9px] uppercase tracking-wider text-white/50">{ad.metodos.join(" · ")} · {ad.vistas} vistas</span>
          <span className={`border px-2 py-1 text-center text-[8px] uppercase tracking-widest ${ad.estado === "ACTIVO" ? "border-emerald-400/50 text-emerald-200" : "border-white/20 text-white/50"}`}>{ad.estado}</span>
          <Btn tone="ghost" onClick={() => (actions?.onToggleAd ? actions.onToggleAd(ad.id) : setNotice(PENDING))}>
            {ad.estado === "ACTIVO" ? "PAUSAR" : "REACTIVAR"}
          </Btn>
        </article>
      ))}
    </section>
  );
}

/* --------------------------- ÓRDENES --------------------------- */

const STEPS: P2POrderStatus[] = ["PENDIENTE_PAGO", "PAGO_REPORTADO", "PENDIENTE_LIBERACION", "COMPLETADA"];

function Stepper({ status }: { status: P2POrderStatus }) {
  const idx = STEPS.indexOf(status);
  return (
    <ol className="grid grid-cols-4 gap-1">
      {STEPS.map((s, i) => (
        <li key={s} className="space-y-1.5">
          <div className={`h-1 ${i <= idx ? "bg-cyan-300 shadow-[0_0_8px_#00f0ff]" : "bg-white/10"}`} />
          <p className={`text-[7px] uppercase leading-tight tracking-wider sm:text-[8px] ${i === idx ? "text-cyan-100" : i < idx ? "text-white/55" : "text-white/25"}`}>{ORDER_STATUS_LABEL[s]}</p>
        </li>
      ))}
    </ol>
  );
}

function OrdersList({ onOpen }: { onOpen: (o: P2POrder) => void }) {
  return (
    <section className="space-y-2">
      {P2P_ORDERS.map((o) => (
        <button key={o.id} type="button" onClick={() => onOpen(o)} className="grid w-full gap-2 border border-white/10 bg-[#0b0d1c]/75 p-4 text-left transition hover:border-cyan-300/40 sm:grid-cols-[0.9fr_0.8fr_1.4fr_1fr_auto] sm:items-center">
          <span className="font-arcade text-[9px] text-white/70">{o.id}</span>
          <span className={`text-[9px] uppercase tracking-widest ${o.rol === "COMPRADOR" ? "text-emerald-300" : "text-[#ff9ab9]"}`}>{o.rol === "COMPRADOR" ? "COMPRA" : "VENTA"}</span>
          <span className="text-xs text-cyan-100">{o.item} <span className="text-white/40">· {o.contraparte}</span></span>
          <span className="font-arcade text-[10px] text-[#ffd700]">{o.monto}</span>
          <StatusPill status={o.estado} />
        </button>
      ))}
    </section>
  );
}

function OrderDetail({ order, actions, onBack, onDispute }: { order: P2POrder; actions?: MarketActions | undefined; onBack: () => void; onDispute: () => void }) {
  const [verified, setVerified] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const run = (fn?: (id: string) => void) => (fn ? fn(order.id) : setNotice(PENDING));
  const isBuyer = order.rol === "COMPRADOR";

  return (
    <section className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-[9px] uppercase tracking-widest text-white/50 hover:text-white">
        <ArrowLeft className="size-4" /> Mis órdenes
      </button>
      <div className={`${panel} space-y-4 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-arcade text-[10px] uppercase tracking-widest text-cyan-100">ORDEN {order.id}</h3>
          <StatusPill status={order.estado} />
        </div>
        <Stepper status={order.estado} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className={`${panel} space-y-3 p-4 sm:p-5`}>
          <h4 className="text-[9px] uppercase tracking-widest text-white/45">DETALLES DE LA ORDEN</h4>
          <Row k="Artículo" v={order.item} />
          <Row k="Monto" v={order.monto} gold />
          <Row k={isBuyer ? "Vendedor" : "Comprador"} v={order.contraparte} />
          <Row k="Creada" v={order.creada} />
          <h4 className="pt-2 text-[9px] uppercase tracking-widest text-white/45">DATOS DE PAGO DEL VENDEDOR</h4>
          <Row k="Método" v={order.metodo} />
          <Row k="Titular" v={order.datosPago.titular} />
          <Row k="Cuenta" v={order.datosPago.cuenta} />
          <Row k="Referencia" v={order.datosPago.referencia} />
          <SafetyNote />
          <PendingNotice text={notice} />

          {order.estado === "COMPLETADA" ? (
            <p className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-emerald-300">
              <CheckCircle2 className="size-4" /> Artículo entregado. Orden cerrada.
            </p>
          ) : isBuyer ? (
            <div className="flex flex-wrap gap-2">
              <Btn tone="green" disabled={order.estado !== "PENDIENTE_PAGO"} onClick={() => run(actions?.onReportPaid)}>
                YA REALICÉ EL PAGO
              </Btn>
              <Btn tone="ghost" disabled={order.estado !== "PENDIENTE_PAGO"} onClick={() => run(actions?.onCancelOrder)}>CANCELAR</Btn>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="flex cursor-pointer gap-3 border border-violet-400/40 bg-violet-400/5 p-3 text-[10px] leading-relaxed text-violet-100">
                <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-violet-400" />
                Confirmo que he verificado directamente en mi cuenta que recibí el dinero completo.
              </label>
              <Btn tone="cyan" className="w-full" disabled={!verified} onClick={() => run(actions?.onRelease)}>
                LIBERAR ARTÍCULO
              </Btn>
            </div>
          )}
          {order.estado !== "COMPLETADA" ? (
            <Btn tone="red" className="w-full" onClick={onDispute}>
              <AlertTriangle className="size-3.5" /> ABRIR DISPUTA
            </Btn>
          ) : null}
        </div>
        <OrderChat order={order} actions={actions} />
      </div>
    </section>
  );
}

function OrderChat({ order, actions }: { order: P2POrder; actions?: MarketActions | undefined }) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const msgs = P2P_CHAT[order.id] ?? [];
  const send = () => {
    const t = draft.trim();
    if (!t) return;
    if (actions?.onSendMessage) {
      actions.onSendMessage(order.id, t);
      setDraft("");
    } else setNotice(PENDING);
  };
  return (
    <div className={`${panel} flex min-h-[420px] flex-col`}>
      <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <MessageSquare className="size-4 text-cyan-300" />
        <span className="text-[10px] uppercase tracking-widest text-white/80">CHAT PRIVADO · {order.contraparte}</span>
        <span className="ml-auto size-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.map((m) =>
          m.autor === "SISTEMA" ? (
            <p key={m.id} className="mx-auto max-w-[90%] text-center text-[9px] uppercase tracking-wider text-amber-200/70">{m.texto}</p>
          ) : (
            <div key={m.id} className={`flex ${m.autor === "YO" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] border px-3 py-2 text-[11px] ${m.autor === "YO" ? "border-cyan-300/40 bg-cyan-300/10 text-cyan-50" : "border-white/10 bg-white/5 text-white/85"}`}>
                {m.texto}
                <span className="mt-1 block text-right text-[8px] text-white/35">{m.hora}</span>
              </div>
            </div>
          ),
        )}
      </div>
      <PendingNotice text={notice} />
      <div className="flex gap-2 border-t border-white/10 p-3">
        <button type="button" aria-label="Adjuntar archivo" onClick={() => setNotice(PENDING)} className="grid size-10 shrink-0 place-items-center border border-white/15 text-white/50 hover:text-white">
          <Paperclip className="size-4" />
        </button>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Escribe un mensaje…" className={`${field} flex-1`} />
        <Btn tone="cyan" onClick={send} disabled={!draft.trim()}><Send className="size-3.5" /></Btn>
      </div>
    </div>
  );
}

/* --------------------------- DISPUTAS --------------------------- */

function OpenDispute({ order, actions, onBack }: { order: P2POrder; actions?: MarketActions | undefined; onBack: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <section className="space-y-4">
      <button type="button" onClick={onBack} className="flex items-center gap-2 text-[9px] uppercase tracking-widest text-white/50 hover:text-white">
        <ArrowLeft className="size-4" /> Volver a la orden
      </button>
      <div className="max-w-2xl space-y-4 border border-[#ff4d7d]/30 bg-[#0b0d1c]/80 p-5">
        <h3 className="font-arcade flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#ff9ab9]">
          <AlertTriangle className="size-4" /> ABRIR DISPUTA · {order.id}
        </h3>
        <label className={label}>
          EXPLICA EL PROBLEMA
          <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={5} placeholder="Describe qué ocurrió con la orden…" className={`${field} h-auto py-2`} />
        </label>
        <label className={label}>
          ADJUNTAR PRUEBAS (CAPTURAS, COMPROBANTES)
          <input type="file" multiple accept="image/*,.pdf" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} className="text-[10px] text-white/70 file:mr-3 file:border file:border-white/20 file:bg-white/5 file:px-3 file:py-2 file:text-[9px] file:uppercase file:text-white/80" />
        </label>
        {files.length ? (
          <ul className="space-y-1 text-[10px] text-white/60">
            {files.map((f) => (<li key={f.name} className="flex items-center gap-2"><Paperclip className="size-3" />{f.name}</li>))}
          </ul>
        ) : null}
        <PendingNotice text={notice} />
        <Btn tone="red" className="w-full" disabled={motivo.trim().length < 10} onClick={() => (actions?.onOpenDispute ? actions.onOpenDispute(order.id, motivo, files) : setNotice(PENDING))}>
          ENVIAR DISPUTA
        </Btn>
      </div>
    </section>
  );
}

const DSTATUS: Record<P2PDispute["estado"], string> = {
  ABIERTA: "border-amber-400/50 text-amber-200",
  EN_REVISION: "border-cyan-300/50 text-cyan-200",
  RESUELTA_COMPRADOR: "border-emerald-400/50 text-emerald-200",
  RESUELTA_VENDEDOR: "border-emerald-400/50 text-emerald-200",
};

function DisputeCard({ d, admin, actions }: { d: P2PDispute; admin?: boolean; actions?: MarketActions | undefined }) {
  const [notice, setNotice] = useState<string | null>(null);
  const resolved = d.estado.startsWith("RESUELTA");
  const resolve = (favor: "COMPRADOR" | "VENDEDOR") => (actions?.onResolveDispute ? actions.onResolveDispute(d.id, favor) : setNotice(PENDING));
  return (
    <article className="space-y-3 border border-white/10 bg-[#0b0d1c]/75 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-arcade text-[9px] text-white/80">{d.id}</span>
        <span className="text-[9px] uppercase tracking-wider text-white/40">Orden {d.orderId} · {d.fecha}</span>
        <span className={`ml-auto border px-2 py-1 text-[8px] uppercase tracking-widest ${DSTATUS[d.estado]}`}>{DISPUTE_STATUS_LABEL[d.estado]}</span>
      </div>
      <p className="text-[11px] text-white/85">{d.motivo}</p>
      <p className="text-[9px] uppercase tracking-wider text-white/45">
        Abierta por {d.abiertaPor} · contra {d.contra} · {d.pruebas} pruebas adjuntas
      </p>
      <ol className="space-y-1 border-l border-cyan-300/30 pl-3">
        {d.historial.map((h) => (
          <li key={h.fecha + h.texto} className="text-[10px] text-white/60"><span className="text-cyan-200/70">{h.fecha}</span> · {h.texto}</li>
        ))}
      </ol>
      {admin && !resolved ? (
        <div className="space-y-2 border-t border-white/10 pt-3">
          <PendingNotice text={notice} />
          <div className="flex flex-wrap gap-2">
            <Btn tone="green" onClick={() => resolve("COMPRADOR")}>A FAVOR DEL COMPRADOR</Btn>
            <Btn tone="gold" onClick={() => resolve("VENDEDOR")}>A FAVOR DEL VENDEDOR</Btn>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function AdminPanel({ actions }: { actions?: MarketActions | undefined }) {
  const open = P2P_DISPUTES.filter((d) => !d.estado.startsWith("RESUELTA")).length;
  return (
    <section className="space-y-4">
      <div className={`${panel} flex flex-wrap items-center gap-4 p-4`}>
        <Gavel className="size-5 text-violet-300" />
        <h3 className="font-arcade text-[10px] uppercase tracking-widest text-violet-100">REVISIÓN ADMINISTRATIVA</h3>
        <span className="ml-auto text-[9px] uppercase tracking-widest text-white/50">{open} pendientes · {P2P_DISPUTES.length} totales</span>
      </div>
      {P2P_DISPUTES.map((d) => (<DisputeCard key={d.id} d={d} admin actions={actions} />))}
    </section>
  );
}

/* --------------------------- RAÍZ --------------------------- */

export function MarketSection({ actions }: { actions?: MarketActions | undefined } = {}) {
  const [tab, setTab] = useState<Tab>("EXPLORAR");
  const [ad, setAd] = useState<P2PAd | null>(null);
  const [order, setOrder] = useState<P2POrder | null>(null);
  const [disputing, setDisputing] = useState(false);

  const go = (t: Tab) => {
    setTab(t);
    setAd(null);
    setOrder(null);
    setDisputing(false);
  };

  return (
    <div className="mt-6 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-arcade text-xs uppercase tracking-[0.2em] text-cyan-100">MERCADO P2P</h2>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-white/45">Intercambio directo entre pilotos</p>
        </div>
        <span className="border border-violet-400/40 bg-violet-400/5 px-3 py-1.5 text-[9px] uppercase tracking-widest text-violet-200">
          Comisión · {P2P_FEE_OBSIDIAN.publish} obsidiana publicar · {P2P_FEE_OBSIDIAN.buy} comprar
        </span>
      </header>
      <nav aria-label="Secciones del mercado" role="tablist" className={`${panel} flex gap-1 overflow-x-auto p-1.5`}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => go(t)}
            className={`min-h-10 shrink-0 border px-3 text-[9px] font-black uppercase tracking-[0.1em] transition sm:text-[10px] ${tab === t ? "border-cyan-300/70 bg-cyan-300/10 text-cyan-100 shadow-[0_0_18px_#00f0ff18]" : "border-transparent text-white/45 hover:text-cyan-100/80"}`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === "EXPLORAR" ? (ad ? <BuyConfirm ad={ad} actions={actions} onBack={() => setAd(null)} /> : <Explore actions={actions} onOpenAd={setAd} />) : null}
      {tab === "PUBLICAR" ? <Publish actions={actions} /> : null}
      {tab === "MIS ANUNCIOS" ? <MyAds actions={actions} /> : null}
      {tab === "MIS ÓRDENES"
        ? order
          ? disputing
            ? <OpenDispute order={order} actions={actions} onBack={() => setDisputing(false)} />
            : <OrderDetail order={order} actions={actions} onBack={() => setOrder(null)} onDispute={() => setDisputing(true)} />
          : <OrdersList onOpen={setOrder} />
        : null}
      {tab === "DISPUTAS" ? (
        <section className="space-y-3">
          {P2P_DISPUTES.map((d) => (<DisputeCard key={d.id} d={d} actions={actions} />))}
        </section>
      ) : null}
      {tab === "ADMIN" ? <AdminPanel actions={actions} /> : null}
    </div>
  );
}
