ALTER TABLE pilots ADD COLUMN referral_code TEXT;
ALTER TABLE pilots ADD COLUMN referred_by TEXT REFERENCES pilots(pilot_id);

CREATE TABLE referrals (
  referral_id TEXT PRIMARY KEY,
  referrer_pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
  referred_pilot_id TEXT NOT NULL REFERENCES pilots(pilot_id),
  redeemed_at INTEGER NOT NULL,
  UNIQUE(referred_pilot_id)
);

WITH RECURSIVE
  pilot_numbers AS MATERIALIZED (
    SELECT pilot_id, ROW_NUMBER() OVER (ORDER BY pilot_id) AS position
    FROM pilots
    WHERE referral_code IS NULL
  ),
  seed(value) AS MATERIALIZED (
    SELECT ABS(random() % 2176782336)
  ),
  codes(position, pilot_id, value) AS (
    SELECT pilot_numbers.position, pilot_numbers.pilot_id, seed.value
    FROM pilot_numbers CROSS JOIN seed
    WHERE pilot_numbers.position = 1
    UNION ALL
    SELECT pilot_numbers.position, pilot_numbers.pilot_id, (codes.value + 1) % 2176782336
    FROM codes
    JOIN pilot_numbers ON pilot_numbers.position = codes.position + 1
  )
UPDATE pilots
SET referral_code =
  'SG-' ||
  substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', CAST(codes.value / 60466176 AS INTEGER) + 1, 1) ||
  substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', CAST((codes.value / 1679616) % 36 AS INTEGER) + 1, 1) ||
  substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', CAST((codes.value / 46656) % 36 AS INTEGER) + 1, 1) ||
  substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', CAST((codes.value / 1296) % 36 AS INTEGER) + 1, 1) ||
  substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', CAST((codes.value / 36) % 36 AS INTEGER) + 1, 1) ||
  substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', CAST(codes.value % 36 AS INTEGER) + 1, 1)
FROM codes
WHERE pilots.pilot_id = codes.pilot_id;

CREATE UNIQUE INDEX idx_pilots_referral_code ON pilots(referral_code);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_pilot_id, redeemed_at);
