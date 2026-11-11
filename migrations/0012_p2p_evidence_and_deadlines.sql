-- Evidence and enforceable time windows for P2P orders.
ALTER TABLE p2p_orders ADD COLUMN payment_reference TEXT;
ALTER TABLE p2p_orders ADD COLUMN payment_proof_url TEXT;
ALTER TABLE p2p_orders ADD COLUMN payment_deadline_at INTEGER;
ALTER TABLE p2p_orders ADD COLUMN release_deadline_at INTEGER;

UPDATE p2p_orders
SET payment_deadline_at = created_at + 1800000
WHERE status = 'PENDIENTE' AND payment_deadline_at IS NULL;

UPDATE p2p_orders
SET release_deadline_at = COALESCE(buyer_paid_at, updated_at) + 1800000
WHERE status = 'PAGO_REPORTADO' AND release_deadline_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_p2p_orders_payment_deadline
ON p2p_orders(status, payment_deadline_at);
CREATE INDEX IF NOT EXISTS idx_p2p_orders_release_deadline
ON p2p_orders(status, release_deadline_at);
