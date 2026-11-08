// Central catalog for combat items. New items are added here once and can
// then be rendered by the hotbar, hangar inventory and future integrations.
import type { PickupKind } from "../types";

export interface ItemDef {
  kind: PickupKind;
  inventoryId: string;
  label: string;
  sprite: string;
  color: string;
  description: string;
}

export const ITEMS: ItemDef[] = [
  {
    kind: "repair",
    inventoryId: "repair",
    label: "REPARACIÓN",
    sprite: "pk_repair",
    color: "#7dff4f",
    description: "Recupera integridad durante el combate.",
  },
  {
    kind: "magnet",
    inventoryId: "iman",
    label: "IMÁN",
    sprite: "pk_magnet",
    color: "#ff3df2",
    description: "Atrae energía y recupera objetos especiales.",
  },
  {
    kind: "emp",
    inventoryId: "emp",
    label: "EMP",
    sprite: "pk_emp",
    color: "#3d7bff",
    description: "Descarga electromagnética contra enemigos.",
  },
];

export const PICKUP_INVENTORY_IDS = Object.fromEntries(
  ITEMS.map((item) => [item.kind, item.inventoryId]),
) as Record<PickupKind, string>;

export interface InventoryCatalogEntry {
  itemId: string;
  label: string;
  sprite: string;
  description: string;
  usable: boolean;
}

export const INVENTORY_CATALOG: InventoryCatalogEntry[] = [
  ...ITEMS.map((item) => ({
    itemId: item.inventoryId,
    label: item.label,
    sprite: item.sprite,
    description: item.description,
    usable: true,
  })),
  // Alias retained for older inventory rows created before the canonical "iman" ID.
  {
    itemId: "magnet",
    label: "IMÁN",
    sprite: "pk_magnet",
    description: "Atrae energía y recupera objetos especiales.",
    usable: true,
  },
];

export const INVENTORY_CATALOG_BY_ID = Object.fromEntries(
  INVENTORY_CATALOG.map((item) => [item.itemId, item]),
) as Record<string, InventoryCatalogEntry>;

export const HOTBAR_SLOTS = 10;

export const ITEM_BY_KIND = Object.fromEntries(ITEMS.map((item) => [item.kind, item])) as Record<
  PickupKind,
  ItemDef
>;
