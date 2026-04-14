-- Siparişe bağlı olmayan hareketler (gelen depozito, manuel düzeltme).
-- Önce add_returnable_packaging.sql çalışmış olmalı.

ALTER TABLE b2b_returnable_packaging_movements
  DROP FOREIGN KEY fk_brpm_order;

ALTER TABLE b2b_returnable_packaging_movements
  MODIFY COLUMN reference_order_id INT NULL DEFAULT NULL,
  MODIFY COLUMN reason ENUM(
    'order_sync',
    'order_cancelled',
    'manual_adjustment',
    'deposit_return'
  ) NOT NULL DEFAULT 'order_sync';

ALTER TABLE b2b_returnable_packaging_movements
  ADD COLUMN note VARCHAR(500) NULL DEFAULT NULL COMMENT 'Manuel hareket açıklaması' AFTER reference_order_id;

ALTER TABLE b2b_returnable_packaging_movements
  ADD CONSTRAINT fk_brpm_order FOREIGN KEY (reference_order_id) REFERENCES b2b_orders (id) ON DELETE CASCADE;
