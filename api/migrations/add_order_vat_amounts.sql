-- Mevcut kurulumlar: KDV tutarı ve vergili toplamları saklamak için sütun ekler.
-- MySQL / MariaDB — phpMyAdmin veya mysql cli ile çalıştırın.

ALTER TABLE b2b_order_items
  ADD COLUMN vat_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER vat_rate,
  ADD COLUMN line_total_inc_vat DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER vat_amount;

ALTER TABLE b2b_orders
  ADD COLUMN vat_total DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER total,
  ADD COLUMN total_inc_vat DECIMAL(12,2) NOT NULL DEFAULT 0.00 AFTER vat_total;

-- Mevcut satırlar: oran varsa KDV hesapla; yoksa vergili = matrah
UPDATE b2b_order_items
SET
  vat_amount = ROUND(
    CASE
      WHEN vat_rate IS NOT NULL AND vat_rate > 0 THEN line_total * (vat_rate / 100)
      ELSE 0
    END,
    2
  ),
  line_total_inc_vat = ROUND(
    line_total + CASE
      WHEN vat_rate IS NOT NULL AND vat_rate > 0 THEN line_total * (vat_rate / 100)
      ELSE 0
    END,
    2
  );

UPDATE b2b_orders o
SET
  vat_total = COALESCE(
    (SELECT SUM(i.vat_amount) FROM b2b_order_items i WHERE i.order_id = o.id),
    0
  ),
  total_inc_vat = COALESCE(
    (SELECT SUM(i.line_total_inc_vat) FROM b2b_order_items i WHERE i.order_id = o.id),
    0
  );
