-- Ürün kataloğu: pasif ürünler yeni siparişte seçilemez; mevcut sipariş kalemleri korunur.
-- Canlıya almadan önce yedek alın; tek sefer çalıştırın.

ALTER TABLE b2b_products
  ADD COLUMN active TINYINT(1) NOT NULL DEFAULT 1
  AFTER returnable_packaging_units_per_qty;
