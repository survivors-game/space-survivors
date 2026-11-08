ALTER TABLE pilots ADD COLUMN vip_until INTEGER;

CREATE TABLE alliances (
  alliance_id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  tag TEXT NOT NULL UNIQUE CHECK (length(tag) BETWEEN 2 AND 5),
  leader_pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
  level INTEGER NOT NULL DEFAULT 1,
  war_wins INTEGER NOT NULL DEFAULT 0,
  war_losses INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE alliance_members (
  alliance_id TEXT NOT NULL REFERENCES alliances(alliance_id) ON DELETE CASCADE,
  pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
  role TEXT NOT NULL DEFAULT 'miembro' CHECK (role IN ('lider', 'teniente', 'miembro')),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (alliance_id, pilot_id),
  UNIQUE (pilot_id)
);

CREATE TABLE alliance_invites (
  invite_id TEXT PRIMARY KEY,
  alliance_id TEXT NOT NULL REFERENCES alliances(alliance_id) ON DELETE CASCADE,
  invited_pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
  invited_by TEXT NOT NULL REFERENCES pilots(pilot_id),
  status TEXT NOT NULL DEFAULT 'PENDIENTE'
    CHECK (status IN ('PENDIENTE', 'ACEPTADA', 'RECHAZADA')),
  created_at INTEGER NOT NULL,
  responded_at INTEGER
);

CREATE UNIQUE INDEX idx_alliance_invites_pending_pilot
  ON alliance_invites(invited_pilot_id) WHERE status = 'PENDIENTE';
CREATE INDEX idx_alliance_members_pilot ON alliance_members(pilot_id);
CREATE INDEX idx_alliance_invites_alliance_status
  ON alliance_invites(alliance_id, status);
