-- Uygulama ayarları (ör. sipariş saat penceresi).
-- Not: Bu tabloyu elle çalıştırmak şart değil; b2b_settings_save ilk kayıtta
-- CREATE TABLE IF NOT EXISTS ile otomatik oluşturur. Dosya dokümantasyon
-- ve yeni kurulumlar içindir.

CREATE TABLE IF NOT EXISTS b2b_app_settings (
  setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
