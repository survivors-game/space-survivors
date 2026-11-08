export type P2PItemType = "nave" | "objeto";
export type P2PCurrency = "COP" | "USD";
export type P2PAdStatus = "ACTIVO" | "PAUSADO" | "CANCELADO" | "VENDIDO";
export type P2PPayMethod = "NEQUI" | "DAVIPLATA" | "TRANSFERENCIA" | "PAYPAL";

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
  price: number;
  currency: P2PCurrency;
  paymentMethods: P2PPayMethod[];
  paymentDetails: string;
  status: P2PAdStatus;
  feePaid: number;
  createdAt: number;
  updatedAt: number;
}

export type P2PMyAd = P2PAd;

export interface P2PPublishInput {
  inventoryId: string;
  price: number;
  currency: P2PCurrency;
  methods: P2PPayMethod[];
  paymentDetails: string;
}

export const P2P_FEE_OBSIDIAN = { publish: 1, purchase: 1 } as const;

export const P2P_PAY_METHODS: readonly P2PPayMethod[] = [
  "NEQUI",
  "DAVIPLATA",
  "TRANSFERENCIA",
  "PAYPAL",
];

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
  price: number;
  price_currency: P2PCurrency;
  seller_callsign: string;
  created_at: number;
}

export interface P2PPurchaseOrder {
  order_id: string;
  payment_methods: P2PPayMethod[];
  payment_details: string;
  price: number;
  price_currency: P2PCurrency;
  commission_obsidian: number;
}

export interface P2PHistoryOrder {
  order_id: string;
  item_id: string;
  item_name: string;
  item_type: P2PItemType;
  price: number;
  price_currency: P2PCurrency;
  status: "PENDIENTE" | "COMPLETADA" | "CANCELADA";
  created_at: number;
  updated_at: number;
  role: "COMPRADOR" | "VENDEDOR";
  counterpart: string;
  payment_methods: P2PPayMethod[] | null;
  payment_details: string | null;
}
