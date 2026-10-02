<?php
declare(strict_types=1);

/**
 * Veritabanı yedeği — SQL dökümünü doğrudan indirmeye akıtır (eski/yedek yol).
 *
 * Normal akış artık iki aşamalıdır (b2b_db_backup_prepare + b2b_db_backup_download);
 * bu uç uyumluluk için korunur. Bilerek transport-gzip KULLANILMAZ: Content-Encoding
 * akışı bazı tarayıcı eklentileriyle (ör. Etikimza) çakışıp net::ERR_FAILED
 * üretebiliyor. Üretim mantığı helper/b2b_db_dump.php içindedir.
 */

require_once __DIR__ . '/helper/b2b_db_dump.php';
require_method('GET');

/** @var PDO $pdo */
global $pdo;

$cfg = b2b_load_config();
$dbName = (string) ($cfg['db_name'] ?? '');
if ($dbName === '') {
    json_response(['ok' => false, 'error' => 'Veritabanı adı yapılandırmada bulunamadı.'], 500);
}

b2b_audit_set_entity($dbName, 'system');
// Çıktı akmaya başlamadan önce denetim kaydını yaz (sonrasında JSON dönemeyiz).
b2b_audit_finalize(200, ['ok' => true]);

$fileName = 'db_' . preg_replace('/[^A-Za-z0-9_-]/', '_', $dbName) . '_' . date('Y-m-d_His') . '.sql';

while (ob_get_level() > 0) {
    ob_end_clean();
}
@ini_set('zlib.output_compression', '0');
@set_time_limit(0);
@ini_set('max_execution_time', '0');

header('Content-Type: application/sql; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $fileName . '"');
header('Content-Transfer-Encoding: binary');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
header('Access-Control-Expose-Headers: Content-Disposition');

$buffer = '';
$emit = static function (string $sql) use (&$buffer): void {
    $buffer .= $sql;
    if (strlen($buffer) >= 262144) {
        echo $buffer;
        $buffer = '';
        flush();
    }
};

try {
    b2b_db_dump($pdo, $dbName, $emit);
} catch (Throwable $e) {
    error_log('b2b_db_backup_get döküm hatası: ' . $e->getMessage());
    // Başlıklar gönderildiği için JSON dönemeyiz; dosya sonuna açık bir hata notu bırakılır.
    $buffer .= "\n-- HATA: Döküm tamamlanmadı: " . str_replace(["\r", "\n"], ' ', $e->getMessage()) . "\n";
}

if ($buffer !== '') {
    echo $buffer;
}
flush();

exit;
