-- Mevcut B2B veritabanına fatura tabloları (schema.sql ile senkron)
-- Yedek aldıktan sonra çalıştırın.

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
