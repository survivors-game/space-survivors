export type P2PItemType = "nave" | "objeto";
export type P2PCountry = "CO" | "VE" | "PE" | "BR" | "CU" | "OTHER";
export type P2PCurrency = "COP" | "VES" | "PEN" | "BRL" | "USD";
export type P2PAdStatus = "ACTIVO" | "PAUSADO" | "CANCELADO" | "VENDIDO";
export type P2PUsdtNetwork = "TRC20" | "ERC20" | "BEP20" | "ARBITRUM";
export type P2PPayMethod =
  | "PSE"
  | "NEQUI"
  | "DAVIPLATA"
  | "BANCOLOMBIA_TRANSFER"
  | "PAGO_MOVIL"
  | "BANK_TRANSFER"
  | "YAPE"
  | "PIX"
  | "BINANCE_PAY"
  | "USDT"
  | "TRANSFERENCIA";

export interface P2PPaymentMethodChoice {
  method: P2PPayMethod;
  network?: P2PUsdtNetwork;
  details: string;
}

export interface P2PPublicPaymentMethod {
  method: P2PPayMethod | "PAYPAL" | "TRANSFERENCIA";
  network?: P2PUsdtNetwork;
  label: string;
}

export const P2P_COUNTRIES: Record<
  P2PCountry,
  { label: string; currency: P2PCurrency; methods: { id: P2PPayMethod; label: string }[] }
> = {
  CO: {
    label: "Colombia",
    currency: "COP",
    methods: [
      { id: "PSE", label: "PSE" },
      { id: "NEQUI", label: "Nequi" },
      { id: "DAVIPLATA", label: "Daviplata" },
      { id: "BANCOLOMBIA_TRANSFER", label: "Bancolombia transferencia" },
    ],
  },
  VE: {
    label: "Venezuela",
    currency: "VES",
    methods: [
      { id: "PAGO_MOVIL", label: "Pago Móvil" },
      { id: "BANK_TRANSFER", label: "Transferencia bancaria" },
    ],
  },
  PE: {
    label: "Perú",
    currency: "PEN",
    methods: [
      { id: "YAPE", label: "Yape" },
      { id: "BANK_TRANSFER", label: "Transferencia bancaria" },
    ],
  },
  BR: { label: "Brasil", currency: "BRL", methods: [{ id: "PIX", label: "PIX" }] },
  CU: {
    label: "Cuba",
    currency: "USD",
    methods: [{ id: "BANK_TRANSFER", label: "Transferencia bancaria" }],
  },
  OTHER: {
    label: "Otros",
    currency: "USD",
    methods: [
      { id: "BINANCE_PAY", label: "USDT Binance Pay" },
      { id: "USDT", label: "USDT" },
    ],
  },
};

export const P2P_PRICE_LIMITS: Record<P2PCurrency, { min: number; max: number }> = {
  COP: { min: 100, max: 500_000_000 },
  VES: { min: 100, max: 5_000_000_000 },
  PEN: { min: 50, max: 1_500_000 },
  BRL: { min: 50, max: 2_000_000 },
  USD: { min: 1, max: 1_000_000 },
};

export const P2P_USDT_NETWORKS: readonly P2PUsdtNetwork[] = ["TRC20", "ERC20", "BEP20", "ARBITRUM"];

export function paymentMethodKey(method: P2PPayMethod, network?: P2PUsdtNetwork): string {
  return method === "USDT" ? `USDT:${network ?? ""}` : method;
}

export function paymentMethodLabel(
  method: P2PPayMethod | "PAYPAL",
  network?: P2PUsdtNetwork,
): string {
  if (method === "USDT") return `USDT ${network ?? ""}`.trim();
  if (method === "PAYPAL") return "PayPal (anuncio anterior)";
  for (const country of Object.values(P2P_COUNTRIES)) {
    const option = country.methods.find((candidate) => candidate.id === method);
    if (option) return option.label;
  }
  return method;
}

export function formatP2PPrice(priceMinor: number, currency: P2PCurrency): string {
  return new Intl.NumberFormat("es", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(priceMinor / 100);
}

export function parseP2PPriceToMinor(value: string): number | null {
  const normalized = value.trim();
  const grouped = normalized.match(/^(\d{1,3})([,.])\d{3}(?:\2\d{3})*$/);
  if (grouped) {
    const minor = Number(normalized.replace(/[,.]/g, "")) * 100;
    return Number.isSafeInteger(minor) ? minor : null;
  }
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.replace(",", ".").split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

export interface P2PInventoryItem {
  id: string;
  itemId: string;
  itemName: string;
  itemType: P2PItemType;
  quantity: number;
  isLocked: boolean;
}

export interface P2PAd {
  id: string;
  sellerPilotId: string;
  inventoryId: string;
  itemId: string;
  itemName: string;
  itemType: P2PItemType;
  country: P2PCountry;
  priceMinor: number;
  currency: P2PCurrency;
  paymentMethods: P2PPublicPaymentMethod[];
  paymentDetails: string;
  paymentData: Record<string, string>;
  status: P2PAdStatus;
  feePaid: number;
  createdAt: number;
  updatedAt: number;
}

export type P2PMyAd = P2PAd;

export interface P2PPublishInput {
  inventoryId: string;
  country: P2PCountry;
  priceMinor: number;
  paymentMethods: P2PPaymentMethodChoice[];
}

export const P2P_FEE_OBSIDIAN = { publish: 1, purchase: 1 } as const;

export interface P2PPilotState {
  pilotId: string;
  callsign: string;
  obsidian: number;
  inventory: P2PInventoryItem[];
}

export interface P2PPublicListing {
  listing_id: string;
  item_id: string;
  item_name: string;
  item_type: P2PItemType;
  country: P2PCountry;
  price_minor: number;
  price_currency: P2PCurrency;
  payment_methods: P2PPublicPaymentMethod[];
  seller_callsign: string;
  created_at: number;
}

export interface P2PPurchaseOrder {
  order_id: string;
  payment_method: P2PPublicPaymentMethod;
  payment_details: string;
  price_minor: number;
  price_currency: P2PCurrency;
  commission_obsidian: number;
  payment_deadline_at: number;
}

export interface P2PHistoryOrder {
  order_id: string;
  item_id: string;
  item_name: string;
  item_type: P2PItemType;
  country: P2PCountry;
  price_minor: number;
  price_currency: P2PCurrency;
  status: "PENDIENTE" | "PAGO_REPORTADO" | "DISPUTA" | "COMPLETADA" | "CANCELADA";
  created_at: number;
  updated_at: number;
  role: "COMPRADOR" | "VENDEDOR";
  counterpart: string;
  payment_method: P2PPublicPaymentMethod | null;
  payment_details: string | null;
  payment_reference: string | null;
  payment_proof_url: string | null;
  payment_deadline_at: number | null;
  release_deadline_at: number | null;
}
