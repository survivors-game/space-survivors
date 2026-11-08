CREATE UNIQUE INDEX IF NOT EXISTS idx_p2p_orders_one_pending_per_ad
ON p2p_orders(ad_id)
WHERE status = 'PENDIENTE';

CREATE TRIGGER IF NOT EXISTS market_buy_order_guard
BEFORE INSERT ON p2p_orders
WHEN NEW.status = 'PENDIENTE'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM p2p_ads ad
    JOIN pilot_inventory item ON item.id = ad.inventory_id
    JOIN pilots buyer ON buyer.pilot_id = NEW.buyer_pilot_id
    WHERE ad.id = NEW.ad_id AND ad.status = 'ACTIVO'
      AND ad.seller_pilot_id != NEW.buyer_pilot_id
      AND item.pilot_id = ad.seller_pilot_id
      AND item.quantity > 0
      AND item.grant_source IN ('starter', 'boss', 'market')
      AND buyer.obsidian >= 1
  ) THEN RAISE(ABORT, 'market purchase is not eligible') END;
END;

CREATE TRIGGER IF NOT EXISTS market_buy_order_apply
AFTER INSERT ON p2p_orders
WHEN NEW.status = 'PENDIENTE'
BEGIN
  UPDATE pilots SET obsidian = obsidian - 1, updated_at = NEW.created_at
  WHERE pilot_id = NEW.buyer_pilot_id AND obsidian >= 1;
  UPDATE pilot_inventory SET is_locked = 1, updated_at = NEW.created_at
  WHERE id = (SELECT inventory_id FROM p2p_ads WHERE id = NEW.ad_id)
    AND pilot_id = (SELECT seller_pilot_id FROM p2p_ads WHERE id = NEW.ad_id)
    AND quantity > 0;
END;

CREATE TRIGGER IF NOT EXISTS market_order_confirm_guard
BEFORE UPDATE OF status ON p2p_orders
WHEN NEW.status = 'COMPLETADA' AND OLD.status != 'COMPLETADA'
BEGIN
  SELECT CASE WHEN OLD.status != 'PENDIENTE'
    OR NOT EXISTS (
      SELECT 1 FROM p2p_ads ad
      JOIN pilot_inventory item ON item.id = ad.inventory_id
      WHERE ad.id = OLD.ad_id AND ad.status = 'ACTIVO'
        AND item.pilot_id = ad.seller_pilot_id
        AND item.is_locked = 1 AND item.quantity > 0
    )
    THEN RAISE(ABORT, 'market order cannot be completed') END;
END;

CREATE TRIGGER IF NOT EXISTS market_order_confirm_apply
AFTER UPDATE OF status ON p2p_orders
WHEN NEW.status = 'COMPLETADA' AND OLD.status = 'PENDIENTE'
BEGIN
  UPDATE pilot_inventory
  SET quantity = quantity + (
    SELECT seller_item.quantity FROM p2p_ads ad
    JOIN pilot_inventory seller_item ON seller_item.id = ad.inventory_id
    WHERE ad.id = NEW.ad_id
  ), grant_source = 'market', updated_at = NEW.updated_at
  WHERE pilot_id = NEW.buyer_pilot_id
    AND item_id = (SELECT item_id FROM p2p_ads WHERE id = NEW.ad_id)
    AND id != (SELECT inventory_id FROM p2p_ads WHERE id = NEW.ad_id);
  UPDATE pilot_inventory
  SET pilot_id = NEW.buyer_pilot_id, grant_source = 'market',
    is_locked = 0, updated_at = NEW.updated_at
  WHERE id = (SELECT inventory_id FROM p2p_ads WHERE id = NEW.ad_id)
    AND NOT EXISTS (
      SELECT 1 FROM pilot_inventory buyer_item
      JOIN p2p_ads ad ON ad.id = NEW.ad_id
      WHERE buyer_item.pilot_id = NEW.buyer_pilot_id
        AND buyer_item.item_id = ad.item_id
        AND buyer_item.id != ad.inventory_id
    );
  UPDATE pilot_inventory
  SET quantity = 0, is_locked = 0, updated_at = NEW.updated_at
  WHERE id = (SELECT inventory_id FROM p2p_ads WHERE id = NEW.ad_id)
    AND EXISTS (
      SELECT 1 FROM pilot_inventory buyer_item
      JOIN p2p_ads ad ON ad.id = NEW.ad_id
      WHERE buyer_item.pilot_id = NEW.buyer_pilot_id
        AND buyer_item.item_id = ad.item_id
        AND buyer_item.id != ad.inventory_id
    );
  UPDATE p2p_ads SET status = 'VENDIDO', updated_at = NEW.updated_at
  WHERE id = NEW.ad_id AND status = 'ACTIVO';
END;

CREATE TRIGGER IF NOT EXISTS market_order_cancel_guard
BEFORE UPDATE OF status ON p2p_orders
WHEN NEW.status = 'CANCELADA' AND OLD.status != 'CANCELADA'
BEGIN
  SELECT CASE WHEN OLD.status != 'PENDIENTE'
    OR NOT EXISTS (
      SELECT 1 FROM p2p_ads ad
      JOIN pilot_inventory item ON item.id = ad.inventory_id
      WHERE ad.id = OLD.ad_id AND ad.status = 'ACTIVO'
        AND item.pilot_id = ad.seller_pilot_id AND item.is_locked = 1
    )
    THEN RAISE(ABORT, 'market order cannot be cancelled') END;
END;

CREATE TRIGGER IF NOT EXISTS market_order_cancel_apply
AFTER UPDATE OF status ON p2p_orders
WHEN NEW.status = 'CANCELADA' AND OLD.status = 'PENDIENTE'
BEGIN
  UPDATE pilot_inventory SET is_locked = 0, updated_at = NEW.updated_at
  WHERE id = (SELECT inventory_id FROM p2p_ads WHERE id = NEW.ad_id)
    AND pilot_id = (SELECT seller_pilot_id FROM p2p_ads WHERE id = NEW.ad_id);
  UPDATE p2p_ads SET status = 'ACTIVO', updated_at = NEW.updated_at
  WHERE id = NEW.ad_id AND status = 'ACTIVO';
END;
