<?php
declare(strict_types=1);

/**
 * Uygulama ayarlarını döndürür (şimdilik: sipariş saat penceresi).
 * Bayiler de okur (sipariş ekranında bilgi/uyarı göstermek için);
 * kaydetme yalnızca b2b_settings_save üzerinden super_admin'e açıktır.
 */

require_once __DIR__ . '/helper/b2b_auth.php';
require_once __DIR__ . '/helper/b2b_app_settings.php';
require_method('GET');

global $pdo;

b2b_require_auth();

try {
    $cfg = b2b_app_setting_get($pdo, B2B_SETTING_ORDER_WINDOW);
} catch (Throwable $e) {
    error_log('b2b_settings_get okuma hatası: ' . $e->getMessage());
    $cfg = null;
}

json_response([
    'ok' => true,
    'order_window' => $cfg ?? b2b_order_window_defaults(),
    'order_window_status' => b2b_order_window_status($cfg),
]);
