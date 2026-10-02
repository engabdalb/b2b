<?php
declare(strict_types=1);

/**
 * Uygulama ayarlarını kaydeder (yalnızca super_admin — rol kontrolü routes'ta).
 * Gövde: { "order_window": { enabled, days: { "1".."7": {open,start,end} } } }
 * b2b_app_settings tablosu yoksa ilk kayıtta oluşturulur.
 */

require_once __DIR__ . '/helper/b2b_auth.php';
require_once __DIR__ . '/helper/b2b_app_settings.php';
require_method('POST');

global $pdo;

b2b_require_auth();

$body = read_json_body();
$normalized = b2b_order_window_normalize($body['order_window'] ?? null);
if ($normalized === null) {
    json_response([
        'ok' => false,
        'error' => 'validation',
        'message' => 'Sipariş saat ayarları geçersiz. Saatler SS:DD biçiminde olmalı.',
    ], 400);
}

try {
    b2b_app_setting_set($pdo, B2B_SETTING_ORDER_WINDOW, $normalized);
} catch (Throwable $e) {
    error_log('b2b_settings_save kayıt hatası: ' . $e->getMessage());
    json_response(['ok' => false, 'error' => 'db', 'message' => 'Ayarlar kaydedilemedi.'], 500);
}

b2b_audit_set_entity(B2B_SETTING_ORDER_WINDOW, 'settings');
b2b_audit_set_before_after(null, $normalized);

json_response([
    'ok' => true,
    'order_window' => $normalized,
    'order_window_status' => b2b_order_window_status($normalized),
]);
