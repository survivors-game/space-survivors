import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatP2PPrice, P2P_COUNTRIES, type P2PHistoryOrder } from "@/game/data/market";

interface MarketHistoryProps {
  orders: P2PHistoryOrder[];
  isLoading: boolean;
  onReportPayment: (orderId: string, reference: string, proofUrl: string) => Promise<void>;
  onReleaseOrder: (orderId: string) => Promise<void>;
  onCancel: (orderId: string) => Promise<void>;
  onOpenDispute: (orderId: string, reason: string, evidenceUrl: string) => Promise<void>;
}

type DisputeMessage = {
  id: string;
  author_pilot_id: string;
  author_name: string;
  message: string;
  evidence_url: string | null;
  created_at: number;
};

export function MarketHistory({
  orders,
  isLoading,
  onReportPayment,
  onReleaseOrder,
  onCancel,
  onOpenDispute,
}: MarketHistoryProps) {
  const [busyOrder, setBusyOrder] = useState("");
  const [error, setError] = useState("");
  const [paymentEvidence, setPaymentEvidence] = useState<Record<string, { reference: string; proofUrl: string }>>({});
  const [disputeForms, setDisputeForms] = useState<
    Record<string, { reason: string; evidence: string }>
  >({});
  const [messageDrafts, setMessageDrafts] = useState<
    Record<string, { message: string; evidence: string }>
  >({});
  const [threads, setThreads] = useState<Record<string, DisputeMessage[]>>({});
  const [sending, setSending] = useState("");

  const act = async (orderId: string, action: (id: string) => Promise<void>) => {
    setBusyOrder(orderId);
    setError("");
    try {
      await action(orderId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo actualizar la orden.");
    } finally {
      setBusyOrder("");
    }
  };

  const loadThread = useCallback(async (orderId: string) => {
    try {
      const response = await fetch(
        `/api/market/dispute/messages?order_id=${encodeURIComponent(orderId)}`,
        { credentials: "same-origin" },
      );
      const data = (await response.json()) as { messages?: DisputeMessage[]; error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo cargar la conversación.");
      setThreads((current) => ({ ...current, [orderId]: data.messages ?? [] }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar la conversación.");
    }
  }, []);

  useEffect(() => {
    for (const order of orders) {
      if (order.status === "DISPUTA") void loadThread(order.order_id);
    }
  }, [orders, loadThread]);

  const openDispute = async (orderId: string) => {
    const draft = disputeForms[orderId] ?? { reason: "", evidence: "" };
    if (draft.reason.trim().length < 10) {
      setError("Explica el problema con al menos 10 caracteres.");
      return;
    }
    setSending(orderId);
    setError("");
    try {
      await onOpenDispute(orderId, draft.reason.trim(), draft.evidence.trim());
      setDisputeForms((current) => ({ ...current, [orderId]: { reason: "", evidence: "" } }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo abrir la disputa.");
    } finally {
      setSending("");
    }
  };

  const sendMessage = async (orderId: string) => {
    const draft = messageDrafts[orderId] ?? { message: "", evidence: "" };
    if (draft.message.trim().length < 2) {
      setError("Escribe un mensaje antes de enviarlo.");
      return;
    }
    setSending(orderId);
    setError("");
    try {
      const response = await fetch("/api/market/dispute/message", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          message: draft.message.trim(),
          evidence_url: draft.evidence.trim(),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo enviar el mensaje.");
      setMessageDrafts((current) => ({ ...current, [orderId]: { message: "", evidence: "" } }));
      await loadThread(orderId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo enviar el mensaje.");
    } finally {
      setSending("");
    }
  };

  if (isLoading && !orders.length) {
    return (
      <p className="border border-cyan-500/20 p-8 text-center text-[10px] uppercase tracking-widest text-white/45">
        CARGANDO HISTORIAL...
      </p>
    );
  }
  if (!orders.length) {
    return (
      <p className="border border-dashed border-cyan-400/20 p-8 text-center text-[10px] uppercase tracking-widest text-white/45">
        TODAVÍA NO HAY TRANSACCIONES REGISTRADAS.
      </p>
    );
  }

  return (
    <section className="space-y-3">
      {error ? (
        <p
          role="alert"
          className="border border-[#ff0055]/25 p-3 text-[9px] uppercase text-[#ff9ab9]"
        >
          {error}
        </p>
      ) : null}
      {orders.map((order) => {
        const disputeOpen = order.status === "DISPUTA";
        const active = order.status === "PENDIENTE" || order.status === "PAGO_REPORTADO";
        const form = disputeForms[order.order_id] ?? { reason: "", evidence: "" };
        const messageDraft = messageDrafts[order.order_id] ?? { message: "", evidence: "" };
        const paymentDraft = paymentEvidence[order.order_id] ?? { reference: "", proofUrl: "" };
        return (
          <article
            key={order.order_id}
            className="space-y-3 border border-cyan-500/20 bg-[#0b0d1c]/70 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-arcade text-[8px] uppercase text-white">{order.item_name}</h3>
                <p className="mt-2 text-[8px] uppercase tracking-widest text-white/45">
                  {order.role} · {order.counterpart} · {P2P_COUNTRIES[order.country].label} ·{" "}
                  {new Date(order.created_at).toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="font-arcade text-[8px] text-[#ffd700]">
                  {formatP2PPrice(order.price_minor, order.price_currency)}
                </p>
                <p className="mt-2 text-[8px] uppercase tracking-widest text-cyan-100">
                  {order.status}
                </p>
              </div>
            </div>
            {order.role === "COMPRADOR" &&
            (order.status === "PENDIENTE" || order.status === "PAGO_REPORTADO") ? (
              <div className="space-y-2 border-t border-white/10 pt-3">
                <p className="text-[8px] uppercase text-white/45">{order.payment_method?.label}</p>
                <p className="break-words text-xs text-white">{order.payment_details}</p>
              </div>
            ) : null}
            {order.role === "COMPRADOR" && order.status === "PENDIENTE" ? (
              <div className="space-y-2 border-t border-white/10 pt-3">
                <p className="text-[8px] uppercase text-amber-100">PAGO ANTES DE: {order.payment_deadline_at ? new Date(order.payment_deadline_at).toLocaleString() : "30 MINUTOS DESDE LA COMPRA"}</p>
                <input value={paymentDraft.reference} onChange={(event) => setPaymentEvidence((current) => ({ ...current, [order.order_id]: { ...paymentDraft, reference: event.target.value } }))} maxLength={120} placeholder="Referencia / número de transacción" className="w-full border border-white/10 bg-black/40 p-2 text-xs text-white" />
                <input value={paymentDraft.proofUrl} onChange={(event) => setPaymentEvidence((current) => ({ ...current, [order.order_id]: { ...paymentDraft, proofUrl: event.target.value } }))} maxLength={2048} placeholder="Enlace HTTPS del comprobante (opcional)" className="w-full border border-white/10 bg-black/40 p-2 text-xs text-white" />
                <Button type="button" disabled={isLoading || busyOrder === order.order_id || (paymentDraft.reference.trim().length < 3 && !paymentDraft.proofUrl.trim())} onClick={() => void act(order.order_id, async (id) => { await onReportPayment(id, paymentDraft.reference.trim(), paymentDraft.proofUrl.trim()); })} className="rounded-none bg-cyan-300 text-[8px] font-bold uppercase text-[#070814] hover:bg-cyan-200">
                  YA REALICÉ EL PAGO
                </Button>
              </div>
            ) : null}
            {order.role === "VENDEDOR" && order.status === "PAGO_REPORTADO" ? (
              <div className="space-y-2 border-t border-white/10 pt-3">
                <p className="text-[8px] uppercase text-amber-100">LIBERAR ANTES DE: {order.release_deadline_at ? new Date(order.release_deadline_at).toLocaleString() : "30 MINUTOS DESDE EL REPORTE"}</p>
                {order.payment_reference ? <p className="break-all text-xs text-white">REFERENCIA: {order.payment_reference}</p> : null}
                {order.payment_proof_url ? <a href={order.payment_proof_url} target="_blank" rel="noreferrer" className="text-[9px] text-cyan-200 underline">VER COMPROBANTE</a> : null}
              </div>
            ) : null}
            {order.role === "VENDEDOR" && order.status === "PAGO_REPORTADO" ? (
              <div className="space-y-2 border-t border-white/10 pt-3">
                <p className="text-[9px] text-amber-100">
                  Comprueba que el dinero llegó realmente a tu cuenta. Solo entonces libera el
                  artículo.
                </p>
                <Button
                  type="button"
                  disabled={isLoading || busyOrder === order.order_id}
                  onClick={() => void act(order.order_id, onReleaseOrder)}
                  className="rounded-none bg-emerald-300 text-[8px] font-bold uppercase text-[#070814] hover:bg-emerald-200"
                >
                  LIBERAR ARTÍCULO
                </Button>
              </div>
            ) : null}
            {order.status === "PENDIENTE" ? (
              <Button
                type="button"
                variant="outline"
                disabled={isLoading || busyOrder === order.order_id}
                onClick={() => void act(order.order_id, onCancel)}
                className="rounded-none border-[#ff0055]/35 text-[8px] uppercase text-[#ff9ab9]"
              >
                CANCELAR ORDEN
              </Button>
            ) : null}
            {active ? (
              <div className="space-y-2 border-t border-white/10 pt-3">
                <p className="text-[8px] uppercase tracking-widest text-white/45">
                  ¿Hay algún problema con esta operación?
                </p>
                <textarea
                  value={form.reason}
                  onChange={(event) =>
                    setDisputeForms((current) => ({
                      ...current,
                      [order.order_id]: { ...form, reason: event.target.value },
                    }))
                  }
                  maxLength={500}
                  rows={2}
                  placeholder="Explica el problema..."
                  className="w-full rounded border border-white/10 bg-black/40 p-2 text-xs text-white outline-none focus:border-cyan-400/40"
                />
                <input
                  value={form.evidence}
                  onChange={(event) =>
                    setDisputeForms((current) => ({
                      ...current,
                      [order.order_id]: { ...form, evidence: event.target.value },
                    }))
                  }
                  maxLength={2048}
                  placeholder="Enlace HTTPS a una prueba (opcional)"
                  className="w-full rounded border border-white/10 bg-black/40 p-2 text-xs text-white outline-none focus:border-cyan-400/40"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={sending === order.order_id}
                  onClick={() => void openDispute(order.order_id)}
                  className="rounded-none border-amber-400/40 text-[8px] uppercase text-amber-100"
                >
                  {sending === order.order_id ? "ENVIANDO..." : "ABRIR DISPUTA"}
                </Button>
              </div>
            ) : null}
            {disputeOpen ? (
              <div className="space-y-3 border-t border-amber-400/20 pt-3">
                <p className="text-[8px] uppercase tracking-widest text-amber-100">
                  Disputa abierta · conversación y pruebas
                </p>
                {(threads[order.order_id] ?? []).map((message) => (
                  <div key={message.id} className="border-b border-white/5 pb-2 last:border-0">
                    <p className="text-[8px] text-cyan-100">
                      {message.author_name} · {new Date(message.created_at).toLocaleString()}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-white/75">
                      {message.message}
                    </p>
                    {message.evidence_url ? (
                      <a
                        href={message.evidence_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[8px] text-cyan-200 underline"
                      >
                        ABRIR PRUEBA
                      </a>
                    ) : null}
                  </div>
                ))}
                <textarea
                  value={messageDraft.message}
                  onChange={(event) =>
                    setMessageDrafts((current) => ({
                      ...current,
                      [order.order_id]: { ...messageDraft, message: event.target.value },
                    }))
                  }
                  maxLength={1000}
                  rows={2}
                  placeholder="Escribe un mensaje para la disputa..."
                  className="w-full rounded border border-white/10 bg-black/40 p-2 text-xs text-white outline-none focus:border-cyan-400/40"
                />
                <input
                  value={messageDraft.evidence}
                  onChange={(event) =>
                    setMessageDrafts((current) => ({
                      ...current,
                      [order.order_id]: { ...messageDraft, evidence: event.target.value },
                    }))
                  }
                  maxLength={2048}
                  placeholder="Enlace HTTPS a una prueba (opcional)"
                  className="w-full rounded border border-white/10 bg-black/40 p-2 text-xs text-white outline-none focus:border-cyan-400/40"
                />
                <Button
                  type="button"
                  disabled={sending === order.order_id}
                  onClick={() => void sendMessage(order.order_id)}
                  className="rounded-none bg-cyan-300 text-[8px] font-bold uppercase text-[#070814]"
                >
                  ENVIAR MENSAJE
                </Button>
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
