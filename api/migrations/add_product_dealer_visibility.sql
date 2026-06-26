-- Ürün görünürlüğü: bir ürün varsayılan olarak tüm bayilere görünür.
-- Bu tabloda bir ürün için kayıt VARSA, ürün YALNIZCA listelenen bayilere görünür (whitelist).
-- Kayıt YOKSA ürün herkese görünür. Mevcut ürünlerin tamamı kayıtsız olduğu için davranış değişmez.
-- Sadece ürün kataloğu listesini ve sipariş ekleme iznini etkiler; borç/tutar/fatura kayıtları ETKİLENMEZ.
-- Canlıya almadan önce yedek alın; tek sefer çalıştırın.

CREATE TABLE IF NOT EXISTS b2b_product_dealer_visibility (
  product_id INT NOT NULL,
  dealer_id  INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id, dealer_id),
  KEY idx_pdv_dealer (dealer_id),
  CONSTRAINT fk_pdv_product FOREIGN KEY (product_id) REFERENCES b2b_products (id) ON DELETE CASCADE,
  CONSTRAINT fk_pdv_dealer  FOREIGN KEY (dealer_id)  REFERENCES b2b_dealers (id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
