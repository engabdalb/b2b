-- B2B tabloları — hedef MySQL veritabanında çalıştırın (ör. abdull55_sadettin_menu)
CREATE TABLE IF NOT EXISTS b2b_dealers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  region VARCHAR(128) NOT NULL,
  il VARCHAR(128) NOT NULL DEFAULT '',
  ilce VARCHAR(128) NOT NULL DEFAULT '',
  konum VARCHAR(512) NOT NULL DEFAULT '',
  telefon VARCHAR(32) NOT NULL DEFAULT '',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS b2b_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  role ENUM('super_admin','dealer','viewer') NOT NULL,
  dealer_id INT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_b2b_user_dealer FOREIGN KEY (dealer_id) REFERENCES b2b_dealers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS b2b_units (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS b2b_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  unit_id INT NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_b2b_product_unit FOREIGN KEY (unit_id) REFERENCES b2b_units (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS b2b_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  external_id VARCHAR(32) NOT NULL UNIQUE,
  dealer_id INT NOT NULL,
  status ENUM('pending','confirmed','shipped','cancelled') NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  vat_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_inc_vat DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  tray_count INT NOT NULL DEFAULT 0,
  created_at DATE NOT NULL,
  CONSTRAINT fk_b2b_order_dealer FOREIGN KEY (dealer_id) REFERENCES b2b_dealers (id) ON DELETE CASCADE,
  KEY idx_b2b_orders_dealer (dealer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sipariş kalemleri: sipariş anı fiyatı (unit_price) + satır tutarı (line_total) saklanır.
-- vat_rate: NULL = henüz / fiyat yapısına göre; ileride % KDV için.
-- discount_amount: satır indirimi TRY; line_total = ROUND(qty * unit_price - discount, 2) ile uyumlu tutulmalı.
-- İleride stok rezervasyonu ayrı tablo/servisle bağlanabilir (product_id + order_id).
CREATE TABLE IF NOT EXISTS b2b_order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
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
  CONSTRAINT fk_boi_order FOREIGN KEY (order_id) REFERENCES b2b_orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_boi_product FOREIGN KEY (product_id) REFERENCES b2b_products (id) ON DELETE RESTRICT,
  KEY idx_boi_order (order_id),
  KEY idx_boi_product (product_id),
  UNIQUE KEY uk_boi_order_sort (order_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Faturalar: siparişten anlık kopya (kalemler düzenlenmez); durum: beklemede / onaylı / iptal.
-- Aynı sipariş için yalnızca bir adet aktif (pending veya approved) fatura; iptal sonrası yeniden faturalandırılabilir.
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

INSERT INTO b2b_dealers (id, name, region, il, ilce, konum, telefon, active) VALUES
  (1, 'TEZGAH', 'Merkez', '', '', '', '', 1),
  (2, 'MEHMET EMİN AKPULAT', 'Şube', '', '', '', '5426125541', 1),
  (3, 'NURULLAH SİNCAROĞLU', 'Şube', '', '', '', '5427987963', 1),
  (4, 'ÇETİN OĞUZ', 'Şube', '', '', '', '5425647393', 1),
  (5, 'ALİ BAHADUR', 'Şube', '', '', '', '5419305881', 1),
  (6, 'NİMET USTA', 'Şube', '', '', '', '5436684689', 1),
  (7, 'SELMAN IRMAK (KIRŞEHİR)', 'Kırşehir', 'Kırşehir', '', '', '5466228387', 1),
  (8, 'ŞÜKRÜ AKINCI', 'Şube', '', '', '', '5415309707', 1),
  (9, 'ALİ GÜL ADANA', 'Adana', 'Adana', '', '', '5300241447', 1),
  (10, 'İBRAHİM TEKİN (İZMİR)', 'İzmir', 'İzmir', '', '', '5447290708', 1),
  (11, 'AYŞE SERT (VİRANŞEHİR)', 'Viranşehir', 'Şanlıurfa', 'Viranşehir', '', '5442841050', 1),
  (12, 'YENİ ŞÜBE', 'Şube', '', '', '', '', 1),
  (13, 'MASUM ŞAHİN (CEYLANPINAR)', 'Ceylanpınar', 'Şanlıurfa', 'Ceylanpınar', '', '5423084007', 1),
  (14, 'DERVİŞ GÜNEŞ (CİZRE)', 'Cizre', 'Şırnak', 'Cizre', '', '5448410349', 1),
  (15, 'HEZVİN ASLAN (3 YOL ŞÜBE)', 'Şube', '', '', '3 Yol Şube', '5454824797', 1),
  (16, 'MAHMUT TUNÇ (BAHÇELİEVLER)', 'Bahçelievler', 'İstanbul', 'Bahçelievler', '', '5464669996', 1),
  (17, 'KEREM BOZKURT (SAMSUN)', 'Samsun', 'Samsun', '', '', '5522525547', 1),
  (18, 'SEHER KIRSAÇ (TARSUS)', 'Tarsus', 'Mersin', 'Tarsus', '', '5434247550', 1),
  (19, 'SZR ŞÜBE', 'Şube', '', '', '', '', 1),
  (20, 'REŞAT KILINÇ', 'Şube', '', '', '', '5412654747', 1),
  (21, 'İSTASYON ŞÜBE', 'Şube', '', '', '', '5334176581', 1),
  (22, 'ABDAN 1', 'Şube', '', '', '', '5444719147', 1),
  (23, 'ABDAN 2', 'Şube', '', '', '', '5444719147', 1),
  (24, 'ADNAN NOKTA', 'Şube', '', '', '', '5534508884', 1),
  (25, 'ERDEMLER', 'Şube', '', '', '', '5304323369', 1),
  (26, 'FAİZ', 'Şube', '', '', '', '5301262119', 1),
  (27, 'TACETTİN', 'Şube', '', '', '', '5445497438', 1),
  (28, 'YUNUS EMRE', 'Şube', '', '', '', '5436552074', 1),
  (29, 'ADA PASTANESİ', 'Şube', '', '', '', '5438245947', 1),
  (30, 'AVŞİN EKMEK FIRINI', 'Şube', '', '', '', '', 1),
  (31, 'TALİ DÜNYASI', 'Şube', '', '', '', '5364055925', 1),
  (32, 'ŞAHİN TOKİ', 'Şube', '', '', '', '5426100584', 1),
  (33, 'CELAL GÖKÇE', 'Şube', '', '', '', '5423723860', 1),
  (34, 'İMALAT', 'İmalat', '', '', '', '', 1),
  (35, 'ENGİN USTA', 'Şube', '', '', '', '5419098035', 1),
  (36, 'NESRİN', 'Şube', '', '', '', '5422208789', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  region = VALUES(region),
  il = VALUES(il),
  ilce = VALUES(ilce),
  konum = VALUES(konum),
  telefon = VALUES(telefon),
  active = VALUES(active);

-- Şifreler: admin Admin123! | viewer View123! | şube hesapları: api/sube_kullanici_sifreleri.txt (slug + 4 hane, bcrypt).
INSERT INTO b2b_users (email, password_hash, display_name, role, dealer_id, active) VALUES
  ('admin@baklavacisadettin.com.tr', '$2y$10$MllWm1PIby213Mn7.lsi2OnH9yytLNkdW9/RUfXYm.p7zeLehntXC', 'Merkez Yönetici', 'super_admin', NULL, 1),
  ('tezgah@baklavacisadettin.com.tr', '$2y$10$FM8cd.LiId55ucULO4M0/OAQ68.soxmi5CLczJh0th5CwalJ0uJz6', 'TEZGAH', 'dealer', 1, 1),
  ('mehmeteminakpulat@baklavacisadettin.com.tr', '$2y$10$BCAX5HG4BRLrgvcgJkIkJOkYxE7fZeRrA2hCUN/6asagHm09JDnA2', 'MEHMET EMİN AKPULAT', 'dealer', 2, 1),
  ('nurullahsincaroglu@baklavacisadettin.com.tr', '$2y$10$vYV616zx1istxJUKvG5NZe9e1tT/MUhgvo.O27kPCJfjssZ4Iyhhy', 'NURULLAH SİNCAROĞLU', 'dealer', 3, 1),
  ('cetinoguz@baklavacisadettin.com.tr', '$2y$10$vto5IwxxKT8cE7VDdm2MFO4jGyxRUCNh97NcReHsqH1dnCQrgMZZG', 'ÇETİN OĞUZ', 'dealer', 4, 1),
  ('alibahadur@baklavacisadettin.com.tr', '$2y$10$Spwce3wBUi8ga/OiQju.Ee/Df3tp5.R6XqdKWte2kHivfMV4YbrTO', 'ALİ BAHADUR', 'dealer', 5, 1),
  ('nimetusta@baklavacisadettin.com.tr', '$2y$10$h6Km741GB5NNaV308jJzb.lQVks0KRpka7l0z5.TpSAR1Q86aN7Le', 'NİMET USTA', 'dealer', 6, 1),
  ('selmanirmak@baklavacisadettin.com.tr', '$2y$10$yq4WlbuHDpHdPwWtjoE/dunnUddhQfumKMiGvhvvr7PYE5ktv.oSu', 'SELMAN IRMAK (KIRŞEHİR)', 'dealer', 7, 1),
  ('sukruakinci@baklavacisadettin.com.tr', '$2y$10$IBghKdxR4POjULt.1XBmg.1Xn6c8iJuGZ0ZqM/ni7UQaU9jph6Dsq', 'ŞÜKRÜ AKINCI', 'dealer', 8, 1),
  ('aliguladana@baklavacisadettin.com.tr', '$2y$10$P7VDnWmAGYTkeFFJVpXWjO0RzboMbChacha0Qr0Si6Hz.Q.rV8nV6', 'ALİ GÜL ADANA', 'dealer', 9, 1),
  ('ibrahimtekin@baklavacisadettin.com.tr', '$2y$10$qsU8UAEzkYHufjeq0dv9oe5wBONFXIV3Oj.5QqJQrQjVTkTp.GSke', 'İBRAHİM TEKİN (İZMİR)', 'dealer', 10, 1),
  ('aysesert@baklavacisadettin.com.tr', '$2y$10$CjhzzpJ80X.rkOkpb7994ejM9YvWsrmQqY3grbn7lIL4Lhlbq6xKW', 'AYŞE SERT (VİRANŞEHİR)', 'dealer', 11, 1),
  ('yenisube@baklavacisadettin.com.tr', '$2y$10$b2VJUMf.sqyf3u1euya08.HoXzVe.pM3lQc7voCBoa4mSTzh2W84m', 'YENİ ŞÜBE', 'dealer', 12, 1),
  ('masumsahin@baklavacisadettin.com.tr', '$2y$10$WTUSgwAcghrDeeO39Bnsv.XVC97dhC3MP23HCWYIESafQFNsMqNt2', 'MASUM ŞAHİN (CEYLANPINAR)', 'dealer', 13, 1),
  ('dervisgunes@baklavacisadettin.com.tr', '$2y$10$hxgtkpIRWBEpLk0UqobnvOMUgFRqXg7Zf2KKQ4elG6F6x6NSQDDES', 'DERVİŞ GÜNEŞ (CİZRE)', 'dealer', 14, 1),
  ('hezvinaslan@baklavacisadettin.com.tr', '$2y$10$w01fYzWCUEGGVCNo37qm.OETmIBlm32aiMPBpm1K3wudaSnagQ8ce', 'HEZVİN ASLAN (3 YOL ŞÜBE)', 'dealer', 15, 1),
  ('mahmuttunc@baklavacisadettin.com.tr', '$2y$10$0uISdE6yGq2zVWwB5av/PeYP7FiaWgJQyqvaOvIpzQaxzVidpMwii', 'MAHMUT TUNÇ (BAHÇELİEVLER)', 'dealer', 16, 1),
  ('kerembozkurt@baklavacisadettin.com.tr', '$2y$10$rXP12l3b926BXFCMO6vO5uAeBLzjieS6wlmwmaGLsYfg4k5JFTh.S', 'KEREM BOZKURT (SAMSUN)', 'dealer', 17, 1),
  ('seherkirsac@baklavacisadettin.com.tr', '$2y$10$cRvDZNgtv2c3F1AvVuBBa.kGhASggSUUY/jr782WLAm7wZruvU1JS', 'SEHER KIRSAÇ (TARSUS)', 'dealer', 18, 1),
  ('szrsube@baklavacisadettin.com.tr', '$2y$10$i0Eq0ThxK6pHgoy2lLIIgOMSi7Av2ZKZctRHVl0AJlGKpFkOGUJEa', 'SZR ŞÜBE', 'dealer', 19, 1),
  ('resatkilinc@baklavacisadettin.com.tr', '$2y$10$8TCGAduP1iybmVaICxZNzulHqZb/d3ngm5xZmrpKDDYJMXoMkzZ7.', 'REŞAT KILINÇ', 'dealer', 20, 1),
  ('istasyonsube@baklavacisadettin.com.tr', '$2y$10$.YaNPg6ZRypxEPcG9e5wp.RmtRL1/92idx95g3qFjQZ3LOp9wL2v2', 'İSTASYON ŞÜBE', 'dealer', 21, 1),
  ('abdan1@baklavacisadettin.com.tr', '$2y$10$v94jc28uiTX4iULLAP7fbu3MSHxJAQWkgHkGaAS.pLKhgz44RvGwy', 'ABDAN 1', 'dealer', 22, 1),
  ('abdan2@baklavacisadettin.com.tr', '$2y$10$Zik4cKd0Frv60lBNudgOPuUKuhvfsfwFAR3Ectqsv9UNxijHZYz7.', 'ABDAN 2', 'dealer', 23, 1),
  ('adnannokta@baklavacisadettin.com.tr', '$2y$10$s4bx3h6U3giO5QIbduG7Ru5LJL9hjddTTRVuOB9pC0yZ8jOvjaSeu', 'ADNAN NOKTA', 'dealer', 24, 1),
  ('erdemler@baklavacisadettin.com.tr', '$2y$10$EPUnIRetI9waal98tjID.ek7lgytAQ52uSahEY7gsT0ILJQb.h9mS', 'ERDEMLER', 'dealer', 25, 1),
  ('faiz@baklavacisadettin.com.tr', '$2y$10$frVXZbeCQ1aqMpKhQIO0Suv4py1M/5c4/UPiWGnxw2M2fp/c4LcxK', 'FAİZ', 'dealer', 26, 1),
  ('tacettin@baklavacisadettin.com.tr', '$2y$10$BODMJEp0sMfFMd265qXklOjMBBl0Hv0xCHSfeGZjIQ2PS.rBtdQWS', 'TACETTİN', 'dealer', 27, 1),
  ('yunusemre@baklavacisadettin.com.tr', '$2y$10$AIizk1oHnGrbNK38ny0zNeJIGlhficY.aAesjohafTRNgzvp7EaVm', 'YUNUS EMRE', 'dealer', 28, 1),
  ('adapastanesi@baklavacisadettin.com.tr', '$2y$10$4O84hDxXt74ZNV661Qyx0OFjON.g5MkTf2FsE/8NyYS2N6IVu6dMO', 'ADA PASTANESİ', 'dealer', 29, 1),
  ('avsinekmekfirini@baklavacisadettin.com.tr', '$2y$10$yX.DwwzxYhwpP2hhHpEFkOySl46lYurvV.vIt2XBQ/n27FqdySeW.', 'AVŞİN EKMEK FIRINI', 'dealer', 30, 1),
  ('talidunyasi@baklavacisadettin.com.tr', '$2y$10$8sDBSHwIkN99AILyuN5Xs.ihNZsSsecHrsHiDtehnj6udvIWE8S8m', 'TALİ DÜNYASI', 'dealer', 31, 1),
  ('sahintoki@baklavacisadettin.com.tr', '$2y$10$JVqNle7IEfMYhDVCPl2Gw.ac/lyRzVkGYNVYRwOj0MVBiwVyZCH46', 'ŞAHİN TOKİ', 'dealer', 32, 1),
  ('celalgokce@baklavacisadettin.com.tr', '$2y$10$FM3yO9yxOlieQMEXJXqnJ.MsLW4fGimZLOchqLjGcrVwgiukfT0Je', 'CELAL GÖKÇE', 'dealer', 33, 1),
  ('imalat@baklavacisadettin.com.tr', '$2y$10$e2jrnTLP78JELWTT.0S/.ujMaFw2.Htlf7XSHAJJ3RyAVXqAW1iV2', 'İMALAT', 'dealer', 34, 1),
  ('enginusta@baklavacisadettin.com.tr', '$2y$10$BSv1Pwc3Z3jeF2kYDy86KOAWUCMhv5XmOUCBIGoBBFoMnGxN1HDWy', 'ENGİN USTA', 'dealer', 35, 1),
  ('nesrin@baklavacisadettin.com.tr', '$2y$10$4Givay2X9tnoqiU1EQwyqeCPHmE0hF.r.WUExF0cqYMikSBPfL69m', 'NESRİN', 'dealer', 36, 1),
  ('viewer@baklavacisadettin.com.tr', '$2y$10$F4/aymqL763wYljUIzGVMuShs4GZw4SUhtOuJvq1ewgHscW./.xNi', 'İzleyici Kullanıcı', 'viewer', NULL, 1)
ON DUPLICATE KEY UPDATE
  password_hash = VALUES(password_hash),
  display_name = VALUES(display_name),
  role = VALUES(role),
  dealer_id = VALUES(dealer_id),
  active = VALUES(active);

-- Birimler (ürün fiyatı bu birime göre). Kod: küçük harf, API/entegrasyon için.
INSERT INTO b2b_units (id, code, name, sort_order, active) VALUES
  (1, 'tepsi', 'Tepsi', 10, 1),
  (2, 'kg', 'Kilogram', 20, 1),
  (3, 'adet', 'Adet', 30, 1),
  (4, 'kasa', 'Kasa', 40, 1),
  (5, 'lt', 'Litre', 50, 1),
  (6, 'paket', 'Paket', 60, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order), active = VALUES(active);

-- Ürün kataloğu: sku = kısa kod; unit_id → b2b_units. Örnek fiyatlar TRY.
INSERT INTO b2b_products (sku, name, unit_id, price) VALUES
  ('cbk', 'Cevizli baklava', 1, 1175.00),
  ('fbk', 'Fıstıklı baklava', 1, 1340.00),
  ('ttf', 'Tereyağlı fıstıklı', 1, 1210.00),
  ('tuu', 'Tepsi üstü', 1, 1100.00),
  ('kru', 'Kuru baklava', 1, 965.00),
  ('sgb', 'Soğuk baklava', 1, 1475.00),
  ('sgk', 'Soğuk kadayıf', 1, 1300.00),
  ('srm', 'Sarma', 1, 1285.00),
  ('mdy', 'Midye', 1, 1390.00),
  ('ozl', 'Özel', 1, 1620.00),
  ('lkm', 'Lokma', 1, 950.00),
  ('hsr', 'Hışır', 1, 1095.00),
  ('sby', 'Şöbiyet', 1, 1260.00),
  ('ceb', 'Cevizli ev baklavası', 1, 1040.00),
  ('fbr', 'Fıstıklı burma', 1, 1315.00),
  ('cbr', 'Cevizli burma', 1, 1190.00),
  ('sep', 'Şekerpare', 1, 875.00),
  ('fkd', 'Fıstıklı kadayıf', 1, 1188.00),
  ('ckd', 'Cevizli kadayıf', 1, 1075.00),
  ('hkd', 'Hasır kadayıf', 1, 1150.00),
  ('kkd', 'Kaymaklı kadayıf', 1, 1245.00),
  ('nkt', 'N.Kesim tereyağlı', 1, 1510.00),
  ('prn', 'Prenses', 1, 1140.00),
  ('hvc', 'Havuç', 1, 1015.00),
  ('akz', 'Ankara özel', 1, 1565.00),
  ('kvr', 'Kıvrım', 1, 1890.00),
  ('kko', 'Kaymaklı özel', 1, 1580.00),
  ('tep', 'Tepsi', 1, 1200.00)
ON DUPLICATE KEY UPDATE name = VALUES(name), unit_id = VALUES(unit_id), price = VALUES(price);

-- Aynı ürünler — kilogram (b2b_units.id = 2). Fiyatlar kg başına örnek; gerektiğinde güncelleyin.
INSERT INTO b2b_products (sku, name, unit_id, price) VALUES
  ('cbk_kg', 'Cevizli baklava', 2, 1175.00),
  ('fbk_kg', 'Fıstıklı baklava', 2, 1340.00),
  ('ttf_kg', 'Tereyağlı fıstıklı', 2, 1210.00),
  ('tuu_kg', 'Tepsi üstü', 2, 1100.00),
  ('kru_kg', 'Kuru baklava', 2, 965.00),
  ('sgb_kg', 'Soğuk baklava', 2, 1475.00),
  ('sgk_kg', 'Soğuk kadayıf', 2, 1300.00),
  ('srm_kg', 'Sarma', 2, 1285.00),
  ('mdy_kg', 'Midye', 2, 1390.00),
  ('ozl_kg', 'Özel', 2, 1620.00),
  ('lkm_kg', 'Lokma', 2, 950.00),
  ('hsr_kg', 'Hışır', 2, 1095.00),
  ('sby_kg', 'Şöbiyet', 2, 1260.00),
  ('ceb_kg', 'Cevizli ev baklavası', 2, 1040.00),
  ('fbr_kg', 'Fıstıklı burma', 2, 1315.00),
  ('cbr_kg', 'Cevizli burma', 2, 1190.00),
  ('sep_kg', 'Şekerpare', 2, 875.00),
  ('fkd_kg', 'Fıstıklı kadayıf', 2, 1188.00),
  ('ckd_kg', 'Cevizli kadayıf', 2, 1075.00),
  ('hkd_kg', 'Hasır kadayıf', 2, 1150.00),
  ('kkd_kg', 'Kaymaklı kadayıf', 2, 1245.00),
  ('nkt_kg', 'N.Kesim tereyağlı', 2, 1510.00),
  ('prn_kg', 'Prenses', 2, 1140.00),
  ('hvc_kg', 'Havuç', 2, 1015.00),
  ('akz_kg', 'Ankara özel', 2, 1565.00),
  ('kvr_kg', 'Kıvrım', 2, 1890.00),
  ('kko_kg', 'Kaymaklı özel', 2, 1580.00)
ON DUPLICATE KEY UPDATE name = VALUES(name), unit_id = VALUES(unit_id), price = VALUES(price);

INSERT INTO b2b_orders (external_id, dealer_id, status, total, vat_total, total_inc_vat, tray_count, created_at) VALUES
  ('S-1042', 1, 'pending', 0, 0, 0, 0, '2026-04-02'),
  ('S-1041', 2, 'confirmed', 0, 0, 0, 0, '2026-04-01'),
  ('S-1040', 3, 'shipped', 0, 0, 0, 0, '2026-03-31')
ON DUPLICATE KEY UPDATE dealer_id = VALUES(dealer_id), status = VALUES(status), created_at = VALUES(created_at);

-- Örnek sipariş kalemleri (fiyatlar ürün tablosuyla uyumlu; toplam/tray_count aşağıdaki UPDATE ile senkron).
-- NOT EXISTS: aynı şema tekrar çalıştırıldığında satır çoğaltmaz (order_id + sort_order).
INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 2, p.price, ROUND(2 * p.price, 2), NULL, 0.00, ROUND(2 * p.price, 2), 0.00, 1 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'kvr'
WHERE o.external_id = 'S-1042' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 1);
INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 3, p.price, ROUND(3 * p.price, 2), NULL, 0.00, ROUND(3 * p.price, 2), 0.00, 2 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'fbk'
WHERE o.external_id = 'S-1042' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 2);
INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 3, p.price, ROUND(3 * p.price, 2), NULL, 0.00, ROUND(3 * p.price, 2), 0.00, 3 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'cbk'
WHERE o.external_id = 'S-1042' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 3);
INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 1, p.price, ROUND(1 * p.price, 2), NULL, 0.00, ROUND(1 * p.price, 2), 0.00, 4 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'ckd'
WHERE o.external_id = 'S-1042' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 4);

INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 2, p.price, ROUND(2 * p.price, 2), NULL, 0.00, ROUND(2 * p.price, 2), 0.00, 1 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'sgb'
WHERE o.external_id = 'S-1041' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 1);
INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 3, p.price, ROUND(3 * p.price, 2), NULL, 0.00, ROUND(3 * p.price, 2), 0.00, 2 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'fbk'
WHERE o.external_id = 'S-1041' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 2);
INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 2, p.price, ROUND(2 * p.price, 2), NULL, 0.00, ROUND(2 * p.price, 2), 0.00, 3 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'kru'
WHERE o.external_id = 'S-1041' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 3);

INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 4, p.price, ROUND(4 * p.price, 2), NULL, 0.00, ROUND(4 * p.price, 2), 0.00, 1 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'kvr'
WHERE o.external_id = 'S-1040' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 1);
INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 5, p.price, ROUND(5 * p.price, 2), NULL, 0.00, ROUND(5 * p.price, 2), 0.00, 2 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'fbk'
WHERE o.external_id = 'S-1040' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 2);
INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
SELECT o.id, p.id, 1, p.price, ROUND(1 * p.price, 2), NULL, 0.00, ROUND(1 * p.price, 2), 0.00, 3 FROM b2b_orders o INNER JOIN b2b_products p ON p.sku = 'kru'
WHERE o.external_id = 'S-1040' AND NOT EXISTS (SELECT 1 FROM b2b_order_items i WHERE i.order_id = o.id AND i.sort_order = 3);

UPDATE b2b_orders o
INNER JOIN (
  SELECT order_id,
    SUM(line_total) AS st,
    SUM(quantity) AS sq,
    SUM(vat_amount) AS sv,
    SUM(line_total_inc_vat) AS siv
  FROM b2b_order_items
  GROUP BY order_id
) t ON t.order_id = o.id
SET o.total = t.st,
    o.vat_total = t.sv,
    o.total_inc_vat = t.siv,
    o.tray_count = CAST(ROUND(t.sq) AS UNSIGNED);
