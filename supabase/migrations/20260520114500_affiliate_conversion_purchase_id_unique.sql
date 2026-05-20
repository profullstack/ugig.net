-- Prevent duplicate affiliate commissions for the same marketplace purchase.
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_conversions_purchase_id_unique
  ON affiliate_conversions (purchase_id)
  WHERE purchase_id IS NOT NULL;
