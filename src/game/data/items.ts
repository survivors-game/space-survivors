// Single source of truth for inventory items. The in-world pickup and the
// hotbar slot both render `sprite`, so they always look identical.
// To add a future item: add its PickupKind, an ART entry, and a row here.
import type { PickupKind } from "../types";

export const PICKUP_INVENTORY_IDS = { repair: "repair", magnet: "iman", emp: "emp" } as const;

export interface InventoryCatalogEntry { itemId: string; label: string; sprite: string; description: string; usable: boolean; }

export const INVENTORY_CATALOG: InventoryCatalogEntry[] = [
  { itemId: "repair", label: "REPARACIÓN", sprite: "pk_repair", description: "Recupera integridad durante el combate.", usable: true },
  { itemId: "iman", label: "IMÁN", sprite: "pk_magnet", description: "Atrae energía y recupera objetos especiales.", usable: true },
  { itemId: "magnet", label: "IMÁN", sprite: "pk_magnet", description: "Atrae energía y recupera objetos especiales.", usable: true },
  { itemId: "emp", label: "EMP", sprite: "pk_emp", description: "Descarga electromagnética contra enemigos.", usable: true },
];

export const INVENTORY_CATALOG_BY_ID = Object.fromEntries(INVENTORY_CATALOG.map((item) => [item.itemId, item]));

export interface ItemDef {
  kind: PickupKind;
  label: string;
  sprite: string;
  color: string;
}

export const ITEMS: ItemDef[] = [
  { kind: "repair", label: "REPARACIÓN", sprite: "pk_repair", color: "#7dff4f" },
  { kind: "magnet", label: "MAGNETISMO", sprite: "pk_magnet", color: "#ff3df2" },
  { kind: "emp", label: "EMP", sprite: "pk_emp", color: "#3d7bff" },
];

export const HOTBAR_SLOTS = 10;

export const ITEM_BY_KIND = Object.fromEntries(ITEMS.map((i) => [i.kind, i])) as Record<
  PickupKind,
  ItemDef
>;
