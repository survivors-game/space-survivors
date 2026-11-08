CREATE TABLE boss_help_sessions (
  session_id TEXT PRIMARY KEY,
  host_pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
  helper_pilot_id TEXT REFERENCES pilots(pilot_id),
  boss_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'WAITING'
    CHECK (status IN ('WAITING', 'ACTIVE', 'COMPLETED', 'EXPIRED', 'LEFT')),
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  ended_at INTEGER
);

CREATE INDEX idx_boss_help_host_status
  ON boss_help_sessions(host_pilot_id, status);
CREATE INDEX idx_boss_help_helper_status
  ON boss_help_sessions(helper_pilot_id, status);
CREATE INDEX idx_boss_help_created_status
  ON boss_help_sessions(status, created_at);
CREATE UNIQUE INDEX idx_boss_help_one_active_per_host
  ON boss_help_sessions(host_pilot_id) WHERE status IN ('WAITING', 'ACTIVE');
