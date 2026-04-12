# B2B PHP API (Peakik yapısına benzer)

**Konum:** `C:\xampp\htdocs\b2b\api` (Angular workspace dışında, XAMPP kökü)

## Kurulum

1. `config.local.example.php` dosyasını `config.local.php` olarak kopyalayın ve MySQL şifresini girin.
2. `schema.sql` dosyasını hedef veritabanında (ör. `abdull55_sadettin_menu`) çalıştırın.  
   Mevcut bir veritabanında `b2b_dealers` tablosu zaten varsa ve yeni sütunlar yoksa: `migrations/b2b_dealers_add_il_ilce_konum_telefon.sql` dosyasını bir kez çalıştırın; ardından `schema.sql` içindeki `INSERT INTO b2b_dealers ... ON DUPLICATE KEY UPDATE` bloğunu veya eşdeğer bir `UPDATE` ile adres/telefon alanlarını doldurun.
3. Angular `src/environments/environment.ts` içinde `apiUrl`: `http://127.0.0.1/b2b/api`

## Uç noktalar (Peakik gibi)

İstek URL’si: `{apiUrl}/routes/api.php/{servisAdi}`  
Örnek: `http://127.0.0.1/b2b/api/routes/api.php/b2b_login`

| Servis | Açıklama |
|--------|----------|
| `b2b_login` | POST JSON `{ "email", "password" }` — JWT döner |
| `b2b_dashboard_get` | GET — özet metrikler |
| `b2b_orders_get` | GET — sipariş listesi (`description` dahil) + her sipariş için `lines[]` (ürün, adet, birim fiyat, satır tutarı, `vatRate`, `discountAmount`); arama `q` açıklama alanında da aranır |
| `b2b_order_create` | POST JSON süper admin / bayi — `{ "dealer_id": "1" }` (sadece süper admin zorunlu), isteğe bağlı `description` (≤2000 karakter), `lines`: `[{ "product_id", "quantity", "discount_amount"?, "vat_rate"? }]` |
| `b2b_order_invoice_create` | POST JSON yalnız süper admin — `{ "order_id": "S-…" }` — sipariş kalemlerini `b2b_invoices` / `b2b_invoice_items` anlık kopyalar; fatura durumu `pending` |
| `b2b_invoices_get` | GET — fatura listesi + `lines[]`; bayi yalnız kendi faturalarını görür |
| `b2b_invoice_set_status` | POST JSON süper admin — `{ "invoice_id": "F-…", "status": "approved" \| "cancelled" }` — onay yalnız `pending` iken; iptal `pending` veya `approved` iken (satır silinmez, `cancelled` olur; sipariş yeniden faturalandırılabilir) |
| `b2b_dealers_get` | GET — bayiler |
| `b2b_products_get` | GET — ürünler |
| `b2b_products_add` | POST JSON `{ sku, name, unit_id, price }` — süper admin |
| `b2b_products_update` | POST JSON `{ id, sku, name, unit_id, price }` — süper admin |
| `b2b_units_get` | GET — birim listesi (süper admin: tümü; diğer roller: aktif) |
| `b2b_units_add` | POST JSON `{ code, name, sort_order? }` — sadece süper admin |
| `b2b_users_get` | GET — kullanıcılar |

`b2b_login` dışındaki çağrılarda `Authorization: Bearer <token>` gerekir.

## Örnek kullanıcılar (schema.sql ile)

- `admin@baklavacisadettin.com.tr` / `Admin123!` — süper admin (tüm bayiler, tüm siparişler)  
- `tezgah@baklavacisadettin.com.tr` — bayi örneği, `dealer_id = 1` (TEZGAH); şifre `api/sube_kullanici_sifreleri.txt`  
- `viewer@baklavacisadettin.com.tr` / `View123!` — izleyici  
- Diğer şubeler: `slug@baklavacisadettin.com.tr` — liste ve şifreler `api/sube_kullanici_sifreleri.txt`  

## Çoklu bayi (3 … 100+)

Tek veritabanında her bayi `b2b_dealers` satırıdır; giriş ise `b2b_users` içinde `role = 'dealer'` ve ilgili `dealer_id` ile tanımlanır. API, `dealer` rolünde `b2b_orders_get`, `b2b_order_create`, `b2b_dealers_get`, `b2b_users_get`, `b2b_products_get` yanıtlarını otomatik olarak o bayiye filtreler (JWT içindeki `dealer_id`). Ürün kataloğu şu an ortaktır (bayiye özel fiyat yok).

Yeni bayi eklemek: `b2b_dealers`’a satır + `b2b_users`’a aynı `dealer_id` ile yeni e-posta/şifre. Onlarca veya yüz bayi için ek kod gerekmez; `dealer_id` ve kullanıcı sayısı için `INT` yeterlidir.

## Notlar

- **Mevcut veritabanı:** Daha önce `b2b_order_items` tablosu yoksa, `schema.sql` içindeki `CREATE TABLE b2b_order_items` ve sipariş kalemi `INSERT` / toplam `UPDATE` bölümlerini yedek aldıktan sonra sırayla çalıştırın.
- **Faturalar:** `b2b_invoices` / `b2b_invoice_items` için `migrations/create_invoices.sql` dosyasını çalıştırın (veya güncel `schema.sql`).
- Siparişleri bayiye göre sorgulamak için (büyük veri): `ALTER TABLE b2b_orders ADD KEY idx_b2b_orders_dealer (dealer_id);` — yeni kurulumlarda `schema.sql` bu indeksi zaten ekler.
- Üretimde `jwt_secret` ve veritabanı bilgilerini ortam değişkeni veya güvenli config ile yönetin.
- `config.local.php` .gitignore içindedir; repoya şifre göndermeyin.
