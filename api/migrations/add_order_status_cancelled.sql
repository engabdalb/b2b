-- Sipariş durumuna "cancelled" ekler (mevcut kurulumlar için).
ALTER TABLE b2b_orders
  MODIFY COLUMN status ENUM('pending','confirmed','shipped','cancelled') NOT NULL;
