export type BossCombatEventType = "boss_hit" | "minion_kill" | "player_hit" | "player_death";

export interface BossCombatEvent {
  type: BossCombatEventType;
  at: number;
  damage: number;
  count: number;
}

export interface BossCombatEvidence {
  started_at: number;
  ended_at: number;
  damage_dealt: number;
  damage_received: number;
  hits: number;
  events: BossCombatEvent[];
}

export function serializeBossCombatEvidence(evidence: BossCombatEvidence): string {
  return JSON.stringify({
    started_at: evidence.started_at,
    ended_at: evidence.ended_at,
    damage_dealt: evidence.damage_dealt,
    damage_received: evidence.damage_received,
    hits: evidence.hits,
    events: evidence.events.map((event) => ({
      type: event.type,
      at: event.at,
      damage: event.damage,
      count: event.count,
    })),
  });
}

export async function createBossCombatProof(
  seed: string,
  evidence: BossCombatEvidence,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${seed}:${serializeBossCombatEvidence(evidence)}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
