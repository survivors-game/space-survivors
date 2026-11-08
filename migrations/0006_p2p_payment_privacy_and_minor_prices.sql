ALTER TABLE p2p_ads ADD COLUMN price_minor INTEGER;
ALTER TABLE p2p_ads ADD COLUMN currency_code TEXT;
ALTER TABLE p2p_ads ADD COLUMN country_code TEXT NOT NULL DEFAULT 'CO';
ALTER TABLE p2p_ads ADD COLUMN payment_data_json TEXT;
ALTER TABLE p2p_orders ADD COLUMN payment_method TEXT;

UPDATE p2p_ads
SET price_minor = CAST(ROUND(price * 100) AS INTEGER),
  currency_code = currency,
  country_code = CASE WHEN currency = 'USD' THEN 'OTHER' ELSE 'CO' END
WHERE price_minor IS NULL OR currency_code IS NULL;

ALTER TABLE p2p_ads RENAME COLUMN price TO price_legacy;
ALTER TABLE p2p_ads ADD COLUMN price INTEGER;

UPDATE p2p_ads SET price = price_minor;

UPDATE p2p_ads
SET payment_data_json = (
  SELECT json_group_object(CAST(method.value AS TEXT), p2p_ads.payment_details)
  FROM json_each(
    CASE
      WHEN json_valid(p2p_ads.payment_methods) THEN p2p_ads.payment_methods
      ELSE '[]'
    END
  ) AS method
)
WHERE payment_data_json IS NULL;

CREATE INDEX IF NOT EXISTS idx_p2p_ads_country_status_price
ON p2p_ads(country_code, status, price_minor);
