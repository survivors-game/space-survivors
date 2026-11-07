ALTER TABLE pilots
ADD COLUMN boss_obsidian INTEGER NOT NULL DEFAULT 0 CHECK (boss_obsidian >= 0);
