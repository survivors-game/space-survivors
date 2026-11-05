export type MarketItemType = "nave" | "iman" | "regeneracion";

export interface MarketItem {
  id: string;
  nombre: string;
  tipo: MarketItemType;
  efecto: string;
  vendedor: string;
  precioSol: number;
}

export const MARKET_MIN_PRICE_SOL = 0.1;

export const MARKET_ITEMS: MarketItem[] = [
  {
    id: "nave-espectro",
    nombre: "ESPECTRO",
    tipo: "nave",
    efecto: "Nave furtiva · +40 de velocidad",
    vendedor: "NOVA-07",
    precioSol: 0.75,
  },
  {
    id: "iman-cuantico",
    nombre: "IMÁN CUÁNTICO",
    tipo: "iman",
    efecto: "Aumenta el radio de recolección",
    vendedor: "ORBITAL_MINT",
    precioSol: 0.25,
  },
  {
    id: "nanobots-regenerativos",
    nombre: "NANOBOTS REGENERATIVOS",
    tipo: "regeneracion",
    efecto: "Repara 0.4 PS por segundo",
    vendedor: "KAIROS",
    precioSol: 0.4,
  },
];

export const MOCK_MY_MARKET_INVENTORY: MarketItem[] = [
  {
    id: "nave-bastion",
    nombre: "BASTIÓN",
    tipo: "nave",
    efecto: "Cañonera pesada · escudo integrado",
    vendedor: "TU INVENTARIO",
    precioSol: 0.9,
  },
  {
    id: "iman-estelar",
    nombre: "IMÁN ESTELAR",
    tipo: "iman",
    efecto: "Aumenta el radio de recolección",
    vendedor: "TU INVENTARIO",
    precioSol: 0.3,
  },
];

export type MarketListingStatus = "ACTIVO" | "VENDIDO" | "RETIRADO";

export interface MockMarketListing {
  id: string;
  item: MarketItem;
  estado: MarketListingStatus;
  publishedAt: string;
}

export const MOCK_MARKET_LISTINGS: MockMarketListing[] = [
  {
    id: "listing-spectre",
    item: MARKET_ITEMS[0]!,
    estado: "ACTIVO",
    publishedAt: "2026-11-05",
  },
  {
    id: "listing-magnet",
    item: MARKET_ITEMS[1]!,
    estado: "VENDIDO",
    publishedAt: "2026-11-03",
  },
  {
    id: "listing-nanobots",
    item: MARKET_ITEMS[2]!,
    estado: "RETIRADO",
    publishedAt: "2026-10-30",
  },
];

export const MARKET_RECENT_IDS = MARKET_ITEMS.map((item) => item.id);

export interface MockMarketTransaction {
  id: string;
  fecha: string;
  tipo: "COMPRA" | "VENTA";
  objeto: string;
  contraparte: string;
  montoSol: number;
}

export const MOCK_MARKET_HISTORY: MockMarketTransaction[] = [
  {
    id: "transaction-001",
    fecha: "2026-11-04",
    tipo: "COMPRA",
    objeto: "IMÁN CUÁNTICO",
    contraparte: "ORBITAL_MINT",
    montoSol: 0.25,
  },
  {
    id: "transaction-002",
    fecha: "2026-11-02",
    tipo: "VENTA",
    objeto: "NANOBOTS REGENERATIVOS",
    contraparte: "KAIROS",
    montoSol: 0.4,
  },
  {
    id: "transaction-003",
    fecha: "2026-10-28",
    tipo: "COMPRA",
    objeto: "ESPECTRO",
    contraparte: "NOVA-07",
    montoSol: 0.75,
  },
];
