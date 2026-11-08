ALTER TABLE pilot_inventory
ADD COLUMN grant_source TEXT NOT NULL DEFAULT 'legacy'
CHECK (grant_source IN ('starter', 'boss', 'market', 'legacy'));

UPDATE pilot_inventory
SET grant_source = 'starter'
WHERE item_id = 'falcon' AND item_type = 'nave';

UPDATE p2p_ads
SET status = 'CANCELADO'
WHERE status IN ('ACTIVO', 'PAUSADO')
  AND EXISTS (
    SELECT 1 FROM pilot_inventory
    WHERE pilot_inventory.id = p2p_ads.inventory_id
      AND pilot_inventory.grant_source = 'legacy'
  );

UPDATE pilot_inventory
SET is_locked = 0
WHERE grant_source = 'legacy' AND is_locked = 1;

CREATE TABLE IF NOT EXISTS boss_attempts (
  token_hash TEXT PRIMARY KEY,
  pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
  boss_id TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  claimed_at INTEGER,
  claim_id TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_boss_attempts_active
ON boss_attempts(pilot_id, boss_id)
WHERE claimed_at IS NULL;
