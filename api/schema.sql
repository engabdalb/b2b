-- B2B tabloları — hedef MySQL veritabanında çalıştırın (ör. abdull55_sadettin_menu)
CREATE TABLE IF NOT EXISTS b2b_dealers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  region VARCHAR(128) NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS b2b_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  role ENUM('super_admin','dealer','viewer') NOT NULL,
  dealer_id INT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_b2b_user_dealer FOREIGN KEY (dealer_id) REFERENCES b2b_dealers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS b2b_units (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS b2b_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  unit_id INT NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_b2b_product_unit FOREIGN KEY (unit_id) REFERENCES b2b_units (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS b2b_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  external_id VARCHAR(32) NOT NULL UNIQUE,
  dealer_id INT NOT NULL,
  status ENUM('pending','confirmed','shipped') NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  vat_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_inc_vat DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  tray_count INT NOT NULL DEFAULT 0,
  created_at DATE NOT NULL,
  CONSTRAINT fk_b2b_order_dealer FOREIGN KEY (dealer_id) REFERENCES b2b_dealers (id) ON DELETE CASCADE,
  KEY idx_b2b_orders_dealer (dealer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sipariş kalemleri: sipariş anı fiyatı (unit_price) + satır tutarı (line_total) saklanır.
-- vat_rate: NULL = henüz / fiyat yapısına göre; ileride % KDV için.
-- discount_amount: satır indirimi TRY; line_total = ROUND(qty * unit_price - discount, 2) ile uyumlu tutulmalı.
-- İleride stok rezervasyonu ayrı tablo/servisle bağlanabilir (product_id + order_id).
CREATE TABLE IF NOT EXISTS b2b_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  vat_rate DECIMAL(5,2) NULL,
  vat_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  line_total_inc_vat DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_boi_order FOREIGN KEY (order_id) REFERENCES b2b_orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_boi_product FOREIGN KEY (product_id) REFERENCES b2b_products (id) ON DELETE RESTRICT,
  KEY idx_boi_order (order_id),
  KEY idx_boi_product (product_id),
  UNIQUE KEY uk_boi_order_sort (order_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Faturalar: siparişten anlık kopya (kalemler düzenlenmez); durum: beklemede / onaylı / iptal.
-- Aynı sipariş için yalnızca bir adet aktif (pending veya approved) fatura; iptal sonrası yeniden faturalandırılabilir.
CREATE TABLE IF NOT EXISTS b2b_invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  external_id VARCHAR(32) NOT NULL UNIQUE,
  order_id INT NOT NULL,
  dealer_id INT NOT NULL,
  status ENUM('pending','approved','cancelled') NOT NULL DEFAULT 'pending',
  total DECIMAL(12,2) NOT NULL,
  vat_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_inc_vat DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  tray_count INT NOT NULL DEFAULT 0,
  invoice_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_b2b_inv_order FOREIGN KEY (order_id) REFERENCES b2b_orders (id) ON DELETE RESTRICT,
  CONSTRAINT fk_b2b_inv_dealer FOREIGN KEY (dealer_id) REFERENCES b2b_dealers (id) ON DELETE RESTRICT,
  KEY idx_b2b_invoices_order (order_id),
  KEY idx_b2b_invoices_dealer (dealer_id),
  KEY idx_b2b_invoices_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS b2b_invoice_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  vat_rate DECIMAL(5,2) NULL,
  vat_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  line_total_inc_vat DECIMAL(12,2) NOT NULL,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bii_invoice FOREIGN KEY (invoice_id) REFERENCES b2b_invoices (id) ON DELETE CASCADE,
  CONSTRAINT fk_bii_product FOREIGN KEY (product_id) REFERENCES b2b_products (id) ON DELETE RESTRICT,
  KEY idx_bii_invoice (invoice_id),
  UNIQUE KEY uk_bii_invoice_sort (invoice_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO b2b_dealers (id, name, region, active) VALUES
  (1, 'Merkez — Tezgâh', 'Merkez', 1),
  (2, 'Bayi — Ankara', 'İç Anadolu', 1),
  (3, 'Bayi — İzmir', 'Ege', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), region = VALUES(region), active = VALUES(active);

-- Şifreler: admin Admin123! | her bayi hesabı Bayi123! | viewer View123!
-- Üç bayi = üç ayrı kullanıcı (dealer_id → b2b_dealers); 100 bayiye çıkmak için aynı kalıpla satır eklenir.
INSERT INTO b2b_users (email, password_hash, display_name, role, dealer_id, active) VALUES
  ('admin@tenant.local', '$2y$10$MllWm1PIby213Mn7.lsi2OnH9yytLNkdW9/RUfXYm.p7zeLehntXC', 'Merkez Yönetici', 'super_admin', NULL, 1),
  ('bayi.merkez@tenant.local', '$2y$10$fxNlXIefCoq8AIMlYK.OHOJYLjv55JqwH9uoG8umw0eAXX62v0xni', 'Merkez Tezgâh', 'dealer', 1, 1),
  ('bayi.ankara@tenant.local', '$2y$10$fxNlXIefCoq8AIMlYK.OHOJYLjv55JqwH9uoG8umw0eAXX62v0xni', 'Ankara Bayi', 'dealer', 2, 1),
  ('bayi.izmir@tenant.local', '$2y$10$fxNlXIefCoq8AIMlYK.OHOJYLjv55JqwH9uoG8umw0eAXX62v0xni', 'İzmir Bayi', 'dealer', 3, 1),
  ('viewer@tenant.local', '$2y$10$F4/aymqL763wYljUIzGVMuShs4GZw4SUhtOuJvq1ewgHscW./.xNi', 'İzleyici Kullanıcı', 'viewer', NULL, 1)
ON DUPLICATE KEY UPDATE
  password_hash = VALUES(password_hash),
  display_name = VALUES(display_name),
  role = VALUES(role),
  dealer_id = VALUES(dealer_id),
  active = VALUES(active);

-- Birimler (ürün fiyatı bu birime göre). Kod: küçük harf, API/entegrasyon için.
INSERT INTO b2b_units (id, code, name, sort_order, active) VALUES
  (1, 'tepsi', 'Tepsi', 10, 1),
  (2, 'kg', 'Kilogram', 20, 1),
  (3, 'adet', 'Adet', 30, 1),
  (4, 'kasa', 'Kasa', 40, 1),
  (5, 'lt', 'Litre', 50, 1),
  (6, 'paket', 'Paket', 60, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order), active = VALUES(active);

-- Ürün kataloğu: sku = kısa kod; unit_id → b2b_units. Örnek fiyatlar TRY.
INSERT INTO b2b_products (sku, name, unit_id, price) VALUES
  ('cbk', 'Cevizli baklava', 1, 1175.00),
  ('fbk', 'Fıstıklı baklava', 1, 1340.00),
  ('tyb', 'Taşlı / yağlı baklava', 1, 1210.00),
  ('kru', 'Kuru baklava', 1, 965.00),
  ('sgb', 'Soğuk baklava (B)', 1, 1475.00),
  ('sgm', 'Soğuk baklava (M)', 1, 1430.00),
  ('srm', 'Sarma (burma dilim)', 1, 1285.00),
  ('mdy', 'Midye baklava', 1, 1390.00),
  ('ozt', 'Özel tepsi', 1, 1620.00),
  ('hsk', 'Hışır / tel kadayıf', 1, 1095.00),
  ('sby', 'Şöbiyet', 1, 1260.00),
  ('ceb', 'Cevizli ev baklavası', 1, 1040.00),
  ('fbr', 'Fıstıklı burma', 1, 1315.00),
  ('cbr', 'Cevizli burma', 1, 1190.00),
  ('sep', 'Şekerpare / pare', 1, 875.00),
  ('fkd', 'Fıstıklı kadayıf', 1, 1188.00),
  ('ckd', 'Cevizli kadayıf', 1, 1075.00),
  ('skd', 'Sütlü kadayıf', 1, 1245.00),
  ('nko', 'N.K.T. yağlı (özel kod)', 1, 1510.00),
  ('prn', 'Prenses', 1, 1140.00),
  ('hvc', 'Havuç dilimi', 1, 1015.00),
  ('fzd', 'Fıstıkzade', 1, 1890.00),
  ('akz', 'Ankara özel', 1, 1565.00)
ON DUPLICATE KEY UPDATE name = VALUES(name), unit_id = VALUES(unit_id), price = VALUES(price);

INSERT INTO b2b_orders (external_id, dealer_id, status, total, vat_total, total_inc_vat, tray_count, created_at) VALUES
  ('S-1042', 1, 'pending', 0, 0, 0, 0, '2026-04-02'),
  ('S-1041', 2, 'confirmed', 0, 0, 0, 0, '2026-04-01'),
  ('S-1040', 3, 'shipped', 0, 0, 0, 0, '2026-03-31')
ON DUPLICATE KEY UPDATE dealer_id = VALUES(dealer_id), status = VALUES(status), created_at = VALUES(created_at);

-- Örnek sipariş kalemleri (fiyatlar ürün tablosuyla uyumlu; toplam/tray_count aşağıdaki UPDATE ile senkron).
-- NOT EXISTS: aynı şema tekrar çalıştırıldığında satır çoğaltmaz (order_id + sort_order).
INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 2, p.price, ROUND(2 * p.price, 2), NULL, 0.00, ROUND(2 * p.price, 2), 0.00, 1 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'fzd'
WHERE o.external_id = 'S-1042' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 1);
INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 3, p.price, ROUND(3 * p.price, 2), NULL, 0.00, ROUND(3 * p.price, 2), 0.00, 2 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'fbk'
WHERE o.external_id = 'S-1042' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 2);
INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 3, p.price, ROUND(3 * p.price, 2), NULL, 0.00, ROUND(3 * p.price, 2), 0.00, 3 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'cbk'
WHERE o.external_id = 'S-1042' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 3);
INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 1, p.price, ROUND(1 * p.price, 2), NULL, 0.00, ROUND(1 * p.price, 2), 0.00, 4 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'ckd'
WHERE o.external_id = 'S-1042' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 4);

INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 2, p.price, ROUND(2 * p.price, 2), NULL, 0.00, ROUND(2 * p.price, 2), 0.00, 1 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'sgb'
WHERE o.external_id = 'S-1041' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 1);
INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 3, p.price, ROUND(3 * p.price, 2), NULL, 0.00, ROUND(3 * p.price, 2), 0.00, 2 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'fbk'
WHERE o.external_id = 'S-1041' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 2);
INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 2, p.price, ROUND(2 * p.price, 2), NULL, 0.00, ROUND(2 * p.price, 2), 0.00, 3 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'kru'
WHERE o.external_id = 'S-1041' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 3);

INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 4, p.price, ROUND(4 * p.price, 2), NULL, 0.00, ROUND(4 * p.price, 2), 0.00, 1 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'fzd'
WHERE o.external_id = 'S-1040' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 1);
INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 5, p.price, ROUND(5 * p.price, 2), NULL, 0.00, ROUND(5 * p.price, 2), 0.00, 2 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'fbk'
WHERE o.external_id = 'S-1040' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 2);
INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 1, p.price, ROUND(1 * p.price, 2), NULL, 0.00, ROUND(1 * p.price, 2), 0.00, 3 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'kru'
WHERE o.external_id = 'S-1040' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 3);

UPDATE b2b_orders o
INNER JOIN (
  SELECT order_id,
    SUM(line_total) AS st,
    SUM(quantity) AS sq,
    SUM(vat_amount) AS sv,
    SUM(line_total_inc_vat) AS siv
  FROM b2b_order_items
  GROUP BY order_id
) t ON t.order_id = o.id
SET o.total = t.st,
    o.vat_total = t.sv,
    o.total_inc_vat = t.siv,
    o.tray_count = CAST(ROUND(t.sq) AS UNSIGNED);
