-- Fatura tarihi saat dahil (sipariş kalemi zamanıyla hizalanır).
ALTER TABLE b2b_invoices
  MODIFY COLUMN invoice_date DATETIME NOT NULL;
