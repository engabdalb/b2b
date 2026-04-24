-- Bayi + satış birimi (b2b_units): birim başına indirim (TRY). Ürünün unit_id’si hangi birimse o satırda uygulanır.
CREATE TABLE IF NOT EXISTS b2b_dealer_unit_discounts (
  dealer_id INT NOT NULL,
  unit_id INT NOT NULL,
  discount_per_unit DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (dealer_id, unit_id),
  CONSTRAINT fk_dud_dealer FOREIGN KEY (dealer_id) REFERENCES b2b_dealers (id) ON DELETE CASCADE,
  CONSTRAINT fk_dud_unit FOREIGN KEY (unit_id) REFERENCES b2b_units (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
