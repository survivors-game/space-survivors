export const VIP_DURATION_DAYS = 30;
export const VIP_PRICE_OBSIDIAN = 20;
export const VIP_DROP_BONUS = 19; // VIP multiplica por 20 la probabilidad de drops.
export const VIP_CREDIT_BONUS = 0.2;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface VipPilot {
  vip_until: number | null;
}

export function hasVip(pilot: VipPilot, now = Date.now()): boolean {
  return pilot.vip_until !== null && pilot.vip_until > now;
}

/** "28d 14h", "<1h" o "Expirado". */
export function formatVipTimeRemaining(vipUntil: number | null, now = Date.now()): string {
  if (vipUntil === null || vipUntil <= now) return "Expirado";
  const totalHours = Math.floor((vipUntil - now) / HOUR_MS);
  if (totalHours < 1) return "<1h";
  return `${Math.floor(totalHours / 24)}d ${totalHours % 24}h`;
}

/**
 * Nueva fecha de expiración tras una compra. Si el VIP sigue activo, los días
 * se suman a la fecha actual de expiración; si no, se cuentan desde ahora.
 */
export function nextVipUntil(
  vipUntil: number | null,
  now = Date.now(),
  days = VIP_DURATION_DAYS,
): number {
  const base = vipUntil !== null && vipUntil > now ? vipUntil : now;
  return base + days * DAY_MS;
}

export function canAffordVip(obsidian: number): boolean {
  return obsidian >= VIP_PRICE_OBSIDIAN;
}

/** Multiplicador de probabilidad de consumibles (reparación, imán, PEM); VIP obtiene 20x. */
export function vipDropMultiplier(active: boolean): number {
  return active ? 1 + VIP_DROP_BONUS : 1;
}

/** Multiplicador de créditos por baja enemiga. */
export function vipCreditMultiplier(active: boolean): number {
  return active ? 1 + VIP_CREDIT_BONUS : 1;
}
