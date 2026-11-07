// Datos de EJEMPLO solo para la interfaz del mercado P2P.
// No representan operaciones reales: la lógica (órdenes, pagos, comisiones,
// inventario y disputas) se conectará después desde el backend.

export const P2P_FEE_OBSIDIAN = { publish: 1, buy: 1 } as const;

export type P2PItemType = "nave" | "objeto" | "mejora";
export type P2PPayMethod = "NEQUI" | "DAVIPLATA" | "BANCOLOMBIA" | "PAYPAL" | "TRANSFERENCIA";
export type P2POrderStatus = "PENDIENTE_PAGO" | "PAGO_REPORTADO" | "PENDIENTE_LIBERACION" | "COMPLETADA";
export type P2PDisputeStatus = "ABIERTA" | "EN_REVISION" | "RESUELTA_COMPRADOR" | "RESUELTA_VENDEDOR";

export interface P2PAd {
  id: string;
  item: string;
  tipo: P2PItemType;
  efecto: string;
  vendedor: string;
  operaciones: number;
  completado: number; // %
  precio: number;
  moneda: "COP" | "USD";
  metodos: P2PPayMethod[];
  disponibles: number;
}

export const P2P_PAY_METHODS: P2PPayMethod[] = ["NEQUI", "DAVIPLATA", "BANCOLOMBIA", "PAYPAL", "TRANSFERENCIA"];

export const P2P_ADS: P2PAd[] = [
  { id: "ad-1", item: "ESPECTRO NEÓN", tipo: "nave", efecto: "Nave furtiva · +40 velocidad", vendedor: "NOVA-07", operaciones: 312, completado: 99, precio: 45000, moneda: "COP", metodos: ["NEQUI", "BANCOLOMBIA"], disponibles: 1 },
  { id: "ad-2", item: "IMÁN CUÁNTICO", tipo: "objeto", efecto: "Radio de recogida ampliado", vendedor: "ORBITAL_MINT", operaciones: 88, completado: 96, precio: 8000, moneda: "COP", metodos: ["DAVIPLATA"], disponibles: 4 },
  { id: "ad-3", item: "NANOBOTS REGENERATIVOS", tipo: "mejora", efecto: "+0.4 PS/s", vendedor: "KAIROS", operaciones: 154, completado: 98, precio: 4, moneda: "USD", metodos: ["PAYPAL"], disponibles: 2 },
  { id: "ad-4", item: "TITÁN OBSIDIANA", tipo: "nave", efecto: "Blindaje pesado · +25 armadura", vendedor: "VOID_TRADER", operaciones: 41, completado: 92, precio: 60000, moneda: "COP", metodos: ["TRANSFERENCIA", "NEQUI"], disponibles: 1 },
  { id: "ad-5", item: "NÚCLEO EMP", tipo: "objeto", efecto: "Pulso que limpia la pantalla", vendedor: "ASTRA", operaciones: 203, completado: 100, precio: 12000, moneda: "COP", metodos: ["NEQUI"], disponibles: 6 },
];

export interface P2POrder {
  id: string;
  adId: string;
  rol: "COMPRADOR" | "VENDEDOR";
  contraparte: string;
  item: string;
  monto: string;
  metodo: P2PPayMethod;
  datosPago: { titular: string; cuenta: string; referencia: string };
  estado: P2POrderStatus;
  creada: string;
}

export const P2P_ORDERS: P2POrder[] = [
  { id: "ORD-24081", adId: "ad-1", rol: "COMPRADOR", contraparte: "NOVA-07", item: "ESPECTRO NEÓN", monto: "45.000 COP", metodo: "NEQUI", datosPago: { titular: "N. Ramírez", cuenta: "300 *** 4521", referencia: "SS-24081" }, estado: "PENDIENTE_PAGO", creada: "2026-11-06 19:12" },
  { id: "ORD-24077", adId: "ad-2", rol: "COMPRADOR", contraparte: "ORBITAL_MINT", item: "IMÁN CUÁNTICO", monto: "8.000 COP", metodo: "DAVIPLATA", datosPago: { titular: "O. Mint", cuenta: "311 *** 0098", referencia: "SS-24077" }, estado: "PAGO_REPORTADO", creada: "2026-11-06 17:40" },
  { id: "ORD-24070", adId: "ad-9", rol: "VENDEDOR", contraparte: "PILOTO_ZETA", item: "BASTIÓN", monto: "38.000 COP", metodo: "BANCOLOMBIA", datosPago: { titular: "Tú", cuenta: "*** 7731", referencia: "SS-24070" }, estado: "PENDIENTE_LIBERACION", creada: "2026-11-06 15:02" },
  { id: "ORD-24011", adId: "ad-3", rol: "COMPRADOR", contraparte: "KAIROS", item: "NANOBOTS REGENERATIVOS", monto: "4 USD", metodo: "PAYPAL", datosPago: { titular: "Kairos", cuenta: "k***@mail.com", referencia: "SS-24011" }, estado: "COMPLETADA", creada: "2026-11-03 10:21" },
];

export interface P2PMessage { id: string; autor: "YO" | "CONTRAPARTE" | "SISTEMA"; texto: string; hora: string }

export const P2P_CHAT: Record<string, P2PMessage[]> = {
  "ORD-24081": [
    { id: "m1", autor: "SISTEMA", texto: "Orden creada. Realiza el pago directamente al vendedor.", hora: "19:12" },
    { id: "m2", autor: "CONTRAPARTE", texto: "Hola piloto, envía el pago a mi Nequi y usa la referencia.", hora: "19:13" },
  ],
  "ORD-24077": [
    { id: "m1", autor: "SISTEMA", texto: "El comprador reportó el pago.", hora: "17:52" },
    { id: "m2", autor: "YO", texto: "Ya transferí, adjunto comprobante.", hora: "17:53" },
  ],
  "ORD-24070": [
    { id: "m1", autor: "CONTRAPARTE", texto: "Pago enviado a tu Bancolombia.", hora: "15:20" },
    { id: "m2", autor: "SISTEMA", texto: "Verifica tu cuenta antes de liberar el artículo.", hora: "15:21" },
  ],
  "ORD-24011": [{ id: "m1", autor: "SISTEMA", texto: "Orden completada.", hora: "10:40" }],
};

export interface P2PMyAd { id: string; item: string; precio: string; metodos: P2PPayMethod[]; estado: "ACTIVO" | "PAUSADO" | "AGOTADO"; vistas: number }

export const P2P_MY_ADS: P2PMyAd[] = [
  { id: "my-1", item: "BASTIÓN", precio: "38.000 COP", metodos: ["BANCOLOMBIA"], estado: "ACTIVO", vistas: 57 },
  { id: "my-2", item: "IMÁN ESTELAR", precio: "9.000 COP", metodos: ["NEQUI", "DAVIPLATA"], estado: "PAUSADO", vistas: 12 },
];

export const P2P_MY_INVENTORY = ["BASTIÓN", "IMÁN ESTELAR", "NÚCLEO EMP", "REPARACIÓN"];

export interface P2PDispute {
  id: string;
  orderId: string;
  abiertaPor: string;
  contra: string;
  motivo: string;
  estado: P2PDisputeStatus;
  fecha: string;
  pruebas: number;
  historial: { fecha: string; texto: string }[];
}

export const P2P_DISPUTES: P2PDispute[] = [
  { id: "DSP-118", orderId: "ORD-23990", abiertaPor: "TÚ", contra: "VOID_TRADER", motivo: "Pagué y el vendedor no liberó el artículo.", estado: "EN_REVISION", fecha: "2026-11-05", pruebas: 2, historial: [ { fecha: "11-05 09:10", texto: "Disputa abierta por el comprador." }, { fecha: "11-05 14:30", texto: "Administración solicitó comprobante adicional." } ] },
  { id: "DSP-097", orderId: "ORD-23812", abiertaPor: "LUNA_X", contra: "TÚ", motivo: "El comprobante no coincide con el monto.", estado: "RESUELTA_VENDEDOR", fecha: "2026-10-29", pruebas: 3, historial: [ { fecha: "10-29 11:00", texto: "Disputa abierta." }, { fecha: "10-30 08:45", texto: "Resuelta a favor del vendedor." } ] },
];

export const ORDER_STATUS_LABEL: Record<P2POrderStatus, string> = {
  PENDIENTE_PAGO: "PENDIENTE DE PAGO",
  PAGO_REPORTADO: "PAGO REPORTADO",
  PENDIENTE_LIBERACION: "PENDIENTE DE LIBERACIÓN",
  COMPLETADA: "COMPLETADA",
};

export const DISPUTE_STATUS_LABEL: Record<P2PDisputeStatus, string> = {
  ABIERTA: "ABIERTA",
  EN_REVISION: "EN REVISIÓN",
  RESUELTA_COMPRADOR: "RESUELTA · COMPRADOR",
  RESUELTA_VENDEDOR: "RESUELTA · VENDEDOR",
};
