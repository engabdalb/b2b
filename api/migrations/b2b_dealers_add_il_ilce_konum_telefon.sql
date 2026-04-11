-- Mevcut veritabanına bayi adres/telefon alanları (schema.sql ile yeni kurulumda zaten vardır).
ALTER TABLE b2b_dealers
  ADD COLUMN il VARCHAR(128) NOT NULL DEFAULT '' AFTER region,
  ADD COLUMN ilce VARCHAR(128) NOT NULL DEFAULT '' AFTER il,
  ADD COLUMN konum VARCHAR(512) NOT NULL DEFAULT '' AFTER ilce,
  ADD COLUMN telefon VARCHAR(32) NOT NULL DEFAULT '' AFTER konum;
