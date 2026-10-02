<?php
declare(strict_types=1);

/**
 * Uygulama ayarları (b2b_app_settings) ve sipariş saat penceresi yardımcıları.
 *
 * Tasarım notları:
 * - Tablo yoksa okuma NULL döner (varsayılan davranış: kısıt yok). Tablo ancak
 *   ilk kayıtta oluşturulur; mevcut canlı şemaya dokunulmaz.
 * - Saat penceresi HER ZAMAN Europe/Istanbul ile değerlendirilir; sunucu saat
 *   dilimine güvenilmez.
 * - Ayar okunamazsa sipariş akışı bozulmasın diye çağıran taraf "açık" varsayar
 *   (fail-open).
 */

const B2B_SETTING_ORDER_WINDOW = 'order_window';

function b2b_app_settings_table_exists(PDO $pdo): bool
{
    static $exists = null;
    if ($exists !== null) {
        return $exists;
    }
    $stmt = $pdo->prepare('SHOW TABLES LIKE :name');
    $stmt->execute([':name' => 'b2b_app_settings']);
    $exists = $stmt->fetchColumn() !== false;
    return $exists;
}

function b2b_app_settings_ensure_table(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS b2b_app_settings (
            setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
            setting_value TEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    );
}

/** @return array<string,mixed>|null */
function b2b_app_setting_get(PDO $pdo, string $key): ?array
{
    if (!b2b_app_settings_table_exists($pdo)) {
        return null;
    }
    $stmt = $pdo->prepare('SELECT setting_value FROM b2b_app_settings WHERE setting_key = :k LIMIT 1');
    $stmt->execute([':k' => $key]);
    $raw = $stmt->fetchColumn();
    if ($raw === false || !is_string($raw)) {
        return null;
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : null;
}

/** @param array<string,mixed> $value */
function b2b_app_setting_set(PDO $pdo, string $key, array $value): void
{
    b2b_app_settings_ensure_table($pdo);
    $stmt = $pdo->prepare(
        'INSERT INTO b2b_app_settings (setting_key, setting_value) VALUES (:k, :v)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
    );
    $stmt->execute([':k' => $key, ':v' => json_encode($value, JSON_UNESCAPED_UNICODE)]);
}

/**
 * Varsayılan sipariş penceresi: kısıt PASİF, tüm günler tüm gün açık.
 * Günler ISO numarası ile anahtarlanır: 1=Pazartesi … 7=Pazar.
 *
 * @return array{enabled:bool, days:array<string,array{open:bool,start:string,end:string}>}
 */
function b2b_order_window_defaults(): array
{
    $days = [];
    for ($d = 1; $d <= 7; $d++) {
        $days[(string) $d] = ['open' => true, 'start' => '', 'end' => ''];
    }
    return ['enabled' => false, 'days' => $days];
}

/** HH:MM biçimi (veya boş: sınırsız). */
function b2b_order_window_valid_time(string $t): bool
{
    return $t === '' || preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $t) === 1;
}

/**
 * İstemciden gelen ham ayarı doğrulayıp normalleştirir; geçersizse null.
 *
 * @param mixed $raw
 * @return array{enabled:bool, days:array<string,array{open:bool,start:string,end:string}>}|null
 */
function b2b_order_window_normalize(mixed $raw): ?array
{
    if (!is_array($raw)) {
        return null;
    }
    $out = b2b_order_window_defaults();
    $out['enabled'] = (bool) ($raw['enabled'] ?? false);
    $daysRaw = $raw['days'] ?? null;
    if (!is_array($daysRaw)) {
        return null;
    }
    for ($d = 1; $d <= 7; $d++) {
        $key = (string) $d;
        $day = $daysRaw[$key] ?? $daysRaw[$d] ?? null;
        if (!is_array($day)) {
            return null;
        }
        $start = trim((string) ($day['start'] ?? ''));
        $end = trim((string) ($day['end'] ?? ''));
        if (!b2b_order_window_valid_time($start) || !b2b_order_window_valid_time($end)) {
            return null;
        }
        $out['days'][$key] = [
            'open' => (bool) ($day['open'] ?? false),
            'start' => $start,
            'end' => $end,
        ];
    }
    return $out;
}

/**
 * Şu an sipariş verilebilir mi? Europe/Istanbul saatine göre değerlendirir.
 *
 * Kurallar:
 * - Ayar yok / kısıt pasif → açık.
 * - Günün "open" değeri false → kapalı.
 * - start/end boşsa o yön sınırsız; start > end ise aralık gece yarısını aşar
 *   (ör. 20:00–02:00 → o gün 20:00'den sonrası VE 02:00'den öncesi açık).
 *
 * @param array<string,mixed>|null $cfg
 * @return array{open:bool, enabled:bool, dayIso:int, time:string, dayOpen:bool, start:string, end:string}
 */
function b2b_order_window_status(?array $cfg): array
{
    $now = new DateTimeImmutable('now', new DateTimeZone('Europe/Istanbul'));
    $dayIso = (int) $now->format('N');
    $time = $now->format('H:i');

    $base = [
        'open' => true,
        'enabled' => false,
        'dayIso' => $dayIso,
        'time' => $time,
        'dayOpen' => true,
        'start' => '',
        'end' => '',
    ];

    if ($cfg === null || !(bool) ($cfg['enabled'] ?? false)) {
        return $base;
    }
    $base['enabled'] = true;

    $day = $cfg['days'][(string) $dayIso] ?? null;
    if (!is_array($day)) {
        return $base; // Gün tanımı eksikse güvenli taraf: açık.
    }

    $dayOpen = (bool) ($day['open'] ?? false);
    $start = trim((string) ($day['start'] ?? ''));
    $end = trim((string) ($day['end'] ?? ''));
    if (!b2b_order_window_valid_time($start)) {
        $start = '';
    }
    if (!b2b_order_window_valid_time($end)) {
        $end = '';
    }
    $base['dayOpen'] = $dayOpen;
    $base['start'] = $start;
    $base['end'] = $end;

    if (!$dayOpen) {
        $base['open'] = false;
        return $base;
    }
    if ($start === '' && $end === '') {
        return $base; // tüm gün açık
    }
    if ($start !== '' && $end !== '' && $start > $end) {
        // Gece yarısını aşan aralık
        $base['open'] = ($time >= $start) || ($time <= $end);
        return $base;
    }
    if ($start !== '' && $time < $start) {
        $base['open'] = false;
        return $base;
    }
    if ($end !== '' && $time > $end) {
        $base['open'] = false;
        return $base;
    }
    return $base;
}

/** Kapalı pencere için kullanıcıya gösterilecek Türkçe mesaj. */
function b2b_order_window_closed_message(array $status): string
{
    if (!$status['dayOpen']) {
        return 'Bugün sipariş alımı kapalıdır.';
    }
    $start = $status['start'] !== '' ? $status['start'] : '00:00';
    $end = $status['end'] !== '' ? $status['end'] : '23:59';
    return 'Şu an sipariş verilemez. Bugün sipariş saatleri: ' . $start . ' - ' . $end . '.';
}
