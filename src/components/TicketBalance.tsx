import { useEffect, useState } from "react";
import { Banknote } from "lucide-react";

/** Saldo de tickets USD acreditados por invitaciones VIP confirmadas. */
export function TicketBalance() {
  const [balanceCents, setBalanceCents] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/rewards/tickets", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as { balance_cents?: number };
        if (active && Number.isSafeInteger(data.balance_cents)) {
          setBalanceCents(data.balance_cents ?? 0);
        }
      } catch {
        // El saldo se volverá a consultar al abrir el perfil.
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <span className="ml-2 inline-flex items-center gap-1 text-emerald-300 drop-shadow-[0_0_8px_#22c55e55]">
      <Banknote className="size-3" />
      {balanceCents === null ? "--" : (balanceCents / 100).toFixed(2)} USD
    </span>
  );
}
