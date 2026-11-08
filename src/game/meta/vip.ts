export interface VipPilot {
  vip_until: number | null;
}

export function hasVip(pilot: VipPilot, now = Date.now()): boolean {
  return pilot.vip_until !== null && pilot.vip_until > now;
}
