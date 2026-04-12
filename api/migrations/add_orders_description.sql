-- Sipariş başına serbest metin açıklama alanı (yeni kurulumlar için schema.sql içinde de tanımlıdır).
-- Mevcut veritabanları için bir kez çalıştırın:
--   mysql -u ... -p veritabani_adi < api/migrations/add_orders_description.sql

ALTER TABLE b2b_orders
  ADD COLUMN description VARCHAR(2000) NULL DEFAULT NULL COMMENT 'Sipariş açıklaması (serbest metin)' AFTER tray_count;
