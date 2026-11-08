CREATE TABLE alliance_wars (
  war_id TEXT PRIMARY KEY,
  attacker_alliance_id TEXT NOT NULL REFERENCES alliances(alliance_id),
  defender_alliance_id TEXT NOT NULL REFERENCES alliances(alliance_id),
  status TEXT NOT NULL DEFAULT 'DECLARED'
    CHECK (status IN ('DECLARED','PREPARING','ACTIVE','COMPLETED','REJECTED','EXPIRED','CANCELLED')),
  winner_alliance_id TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  attacker_hordes_survived INTEGER NOT NULL DEFAULT 0,
  defender_hordes_survived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE alliance_war_participants (
  war_id TEXT NOT NULL REFERENCES alliance_wars(war_id) ON DELETE CASCADE,
  pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
  alliance_id TEXT NOT NULL REFERENCES alliances(alliance_id),
  ship_id TEXT NOT NULL,
  passive_upgrades_json TEXT,
  is_alive INTEGER NOT NULL DEFAULT 1,
  hordes_survived INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (war_id, pilot_id)
);

CREATE INDEX idx_alliance_wars_attacker_status
  ON alliance_wars(attacker_alliance_id, status, created_at);
CREATE INDEX idx_alliance_wars_defender_status
  ON alliance_wars(defender_alliance_id, status, created_at);
CREATE INDEX idx_alliance_wars_history
  ON alliance_wars(status, ended_at DESC);
CREATE INDEX idx_alliance_war_participants_alliance
  ON alliance_war_participants(war_id, alliance_id, is_alive);
CREATE INDEX idx_alliance_war_participants_pilot
  ON alliance_war_participants(pilot_id, war_id);

-- Snapshot of all alliance members at combat start; rewards are paid to this roster.
CREATE TABLE alliance_war_members (
  war_id TEXT NOT NULL REFERENCES alliance_wars(war_id) ON DELETE CASCADE,
  pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
  alliance_id TEXT NOT NULL REFERENCES alliances(alliance_id),
  PRIMARY KEY (war_id, pilot_id)
);
CREATE INDEX idx_alliance_war_members_alliance
  ON alliance_war_members(war_id, alliance_id);

-- Atomic lock: an alliance cannot be involved in two pending or active wars.
CREATE TABLE alliance_war_locks (
  alliance_id TEXT PRIMARY KEY REFERENCES alliances(alliance_id) ON DELETE CASCADE,
  war_id TEXT NOT NULL REFERENCES alliance_wars(war_id) ON DELETE CASCADE
);
CREATE INDEX idx_alliance_war_locks_war ON alliance_war_locks(war_id);
