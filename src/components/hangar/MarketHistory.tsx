import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { P2PHistoryOrder, P2PPayMethod } from "@/game/data/market";

interface MarketHistoryProps {
  orders: P2PHistoryOrder[];
  isLoading: boolean;
  onConfirm: (orderId: string) => Promise<void>;
  onCancel: (orderId: string) => Promise<void>;
}

const METHOD_LABELS: Record<P2PPayMethod, string> = {
  NEQUI: "NEQUI",
  DAVIPLATA: "DAVIPLATA",
  TRANSFERENCIA: "TRANSFERENCIA BANCARIA",
  PAYPAL: "PAYPAL",
};

export function MarketHistory({ orders, isLoading, onConfirm, onCancel }: MarketHistoryProps) {
  const [busyOrder, setBusyOrder] = useState("");
  const [error, setError] = useState("");

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
      {orders.map((order) => (
        <article
          key={order.order_id}
          className="space-y-3 border border-cyan-500/20 bg-[#0b0d1c]/70 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-arcade text-[8px] uppercase text-white">{order.item_name}</h3>
              <p className="mt-2 text-[8px] uppercase tracking-widest text-white/45">
                {order.role} · {order.counterpart} · {new Date(order.created_at).toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="font-arcade text-[8px] text-[#ffd700]">
                {order.price.toLocaleString()} {order.price_currency}
              </p>
              <p className="mt-2 text-[8px] uppercase tracking-widest text-cyan-100">
                {order.status}
              </p>
            </div>
          </div>
          {order.role === "COMPRADOR" && order.status === "PENDIENTE" ? (
            <div className="space-y-2 border-t border-white/10 pt-3">
              <p className="text-[8px] uppercase text-white/45">
                {order.payment_methods?.map((method) => METHOD_LABELS[method]).join(" · ")}
              </p>
              <p className="break-words text-xs text-white">{order.payment_details}</p>
            </div>
          ) : null}
          {order.status === "PENDIENTE" ? (
            <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
              {order.role === "COMPRADOR" ? (
                <Button
                  type="button"
                  disabled={isLoading || busyOrder === order.order_id}
                  onClick={() => void act(order.order_id, onConfirm)}
                  className="rounded-none bg-cyan-300 text-[8px] font-bold uppercase text-[#070814] hover:bg-cyan-200"
                >
                  CONFIRMAR COMPRA
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={isLoading || busyOrder === order.order_id}
                onClick={() => void act(order.order_id, onCancel)}
                className="rounded-none border-[#ff0055]/35 text-[8px] uppercase text-[#ff9ab9]"
              >
                CANCELAR ORDEN · SIN REEMBOLSO
              </Button>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}
