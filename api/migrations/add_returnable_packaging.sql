-- İade edilebilir ambalaj (returnable packaging) türleri, bayi bakiyesi ve siparişe bağlı hareketler.
-- Sipariş iptalinde hedef miktar 0 olur; sync fonksiyonu mevcut net etkiyi sıfırlar.
--
-- Tekrar çalıştırma: CREATE TABLE IF NOT EXISTS güvenli; ALTER TABLE sütun zaten varsa hata verir — o satırları atlayın.

CREATE TABLE IF NOT EXISTS b2b_returnable_packaging_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS b2b_dealer_returnable_packaging_balances (
  dealer_id INT NOT NULL,
  returnable_packaging_type_id INT NOT NULL,
  quantity DECIMAL(12,3) NOT NULL DEFAULT 0.000,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (dealer_id, returnable_packaging_type_id),
  CONSTRAINT fk_brpb_dealer FOREIGN KEY (dealer_id) REFERENCES b2b_dealers (id) ON DELETE CASCADE,
  CONSTRAINT fk_brpb_type FOREIGN KEY (returnable_packaging_type_id) REFERENCES b2b_returnable_packaging_types (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- quantity_delta: bayinin iade etmesi gereken ambalaj yükümlülüğüne eklenir (+) veya düşer (−).
-- reference_order_id: bu siparişten kaynaklanan net etkinin izlenmesi için.
CREATE TABLE IF NOT EXISTS b2b_returnable_packaging_movements (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  dealer_id INT NOT NULL,
  returnable_packaging_type_id INT NOT NULL,
  quantity_delta DECIMAL(12,3) NOT NULL,
  reason ENUM('order_sync','order_cancelled','manual_adjustment','deposit_return') NOT NULL DEFAULT 'order_sync',
  reference_order_id INT NULL DEFAULT NULL,
  note VARCHAR(500) NULL DEFAULT NULL COMMENT 'Manuel hareket açıklaması',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_brpm_dealer FOREIGN KEY (dealer_id) REFERENCES b2b_dealers (id) ON DELETE CASCADE,
  CONSTRAINT fk_brpm_type FOREIGN KEY (returnable_packaging_type_id) REFERENCES b2b_returnable_packaging_types (id) ON DELETE RESTRICT,
  CONSTRAINT fk_brpm_order FOREIGN KEY (reference_order_id) REFERENCES b2b_orders (id) ON DELETE CASCADE,
  KEY idx_brpm_order (reference_order_id),
  KEY idx_brpm_dealer_type (dealer_id, returnable_packaging_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE b2b_products
  ADD COLUMN returnable_packaging_type_id INT NULL DEFAULT NULL AFTER price,
  ADD COLUMN returnable_packaging_units_per_qty DECIMAL(12,3) NOT NULL DEFAULT 1.000 AFTER returnable_packaging_type_id;

ALTER TABLE b2b_products
  ADD CONSTRAINT fk_b2b_product_returnable_type
  FOREIGN KEY (returnable_packaging_type_id) REFERENCES b2b_returnable_packaging_types (id) ON DELETE SET NULL;

-- Varsayılan ambalaj türü (UI'da "Tepsi" olarak gösterilebilir)
INSERT INTO b2b_returnable_packaging_types (code, name, sort_order, active)
VALUES ('tray', 'Tepsi', 10, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order), active = VALUES(active);

-- Tepsi birimindeki ürünleri depozitolu (tray) ile eşle (b2b_units.id = 1 = tepsi).
UPDATE b2b_products p
INNER JOIN b2b_returnable_packaging_types t ON t.code = 'tray'
SET p.returnable_packaging_type_id = t.id,
    p.returnable_packaging_units_per_qty = 1.000
WHERE p.unit_id = 1;
