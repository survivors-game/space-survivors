-- Corrige p2p_ads tras la migración 0006.
--
-- La migración 0006 renombró price a price_legacy. SQLite conservó la
-- restricción NOT NULL de la columna heredada, por lo que las nuevas
-- publicaciones fallan al insertar anuncios sin proporcionar price_legacy.
--
-- Primero garantiza que el precio vigente esté poblado y luego elimina
-- la columna heredada que ya no forma parte del modelo actual.

UPDATE p2p_ads
SET price = COALESCE(price, price_minor, CAST(ROUND(price_legacy * 100) AS INTEGER))
WHERE price IS NULL;

ALTER TABLE p2p_ads DROP COLUMN price_legacy;
