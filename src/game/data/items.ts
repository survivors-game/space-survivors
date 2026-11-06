// Single source of truth for inventory items. The in-world pickup and the
// hotbar slot both render `sprite`, so they always look identical.
// To add a future item: add its PickupKind, an ART entry, and a row here.
import type { PickupKind } from "../types";

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
