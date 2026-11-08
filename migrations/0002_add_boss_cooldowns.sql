CREATE TABLE IF NOT EXISTS boss_cooldowns (
  pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
  boss_id TEXT NOT NULL,
  last_defeated_at INTEGER NOT NULL,
  last_reward_id TEXT NOT NULL,
  PRIMARY KEY (pilot_id, boss_id)
);
