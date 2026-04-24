-- Cari hareketler + tahsilatlar (önce bu migration'ı çalıştırın)
CREATE TABLE IF NOT EXISTS b2b_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  dealer_id INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid_at DATETIME NOT NULL,
  method ENUM('bank_transfer','credit_card','check','cash','other') NOT NULL DEFAULT 'bank_transfer',
  reference VARCHAR(128) NOT NULL DEFAULT '',
  note VARCHAR(500) NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bp_dealer FOREIGN KEY (dealer_id) REFERENCES b2b_dealers (id) ON DELETE RESTRICT,
  KEY idx_bp_dealer_paid (dealer_id, paid_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS b2b_account_movements (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  dealer_id INT NOT NULL,
  movement_at DATETIME NOT NULL,
  kind ENUM('invoice','payment','invoice_cancel','adjustment') NOT NULL,
  invoice_id INT NULL DEFAULT NULL,
  payment_id INT NULL DEFAULT NULL,
  debit_try DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Borç artışı (fatura)',
  credit_try DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Borç azalışı (tahsilat, fatura iptali)',
  description VARCHAR(512) NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_bam_dealer FOREIGN KEY (dealer_id) REFERENCES b2b_dealers (id) ON DELETE RESTRICT,
  CONSTRAINT fk_bam_invoice FOREIGN KEY (invoice_id) REFERENCES b2b_invoices (id) ON DELETE RESTRICT,
  CONSTRAINT fk_bam_payment FOREIGN KEY (payment_id) REFERENCES b2b_payments (id) ON DELETE RESTRICT,
  KEY idx_bam_dealer_time (dealer_id, movement_at, id),
  KEY idx_bam_invoice (invoice_id),
  KEY idx_bam_payment (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Mevcut onaylı faturalar için tek seferlik cari satırı (zaten hareket varsa atlar)
INSERT INTO b2b_account_movements (dealer_id, movement_at, kind, invoice_id, payment_id, debit_try, credit_try, description)
SELECT i.dealer_id,
       i.invoice_date,
       'invoice',
       i.id,
       NULL,
       i.total_inc_vat,
       0.00,
       CONCAT('Fatura ', i.external_id)
FROM b2b_invoices i
WHERE i.status = 'approved'
  AND NOT EXISTS (
    SELECT 1 FROM b2b_account_movements m
    WHERE m.invoice_id = i.id AND m.kind = 'invoice'
  );
