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
