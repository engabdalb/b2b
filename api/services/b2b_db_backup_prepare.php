<?php
declare(strict_types=1);

/**
 * Yedek hazırlama (1. aşama): dökümü sunucuda sıkıştırılmış dosyaya (.sql.gz) üretir.
 *
 * Neden iki aşama? Döküm 70+ MB'a ulaştı; üretim + aktarım tek istekte yapılınca
 * yavaş bağlantılarda hosting zaman aşımına takılıp yarıda kesiliyordu. Burada
 * üretim istemci bağlantısından bağımsızdır (sunucu-yerel, hızlı) ve çıktı gzip
 * olduğu için indirme ~14 kat küçüktür. Dosya, indirme tamamlanınca
 * b2b_db_backup_download tarafından SİLİNİR; 1 saatten eski kalıntılar da
 * her çağrıda temizlenir — sunucuda kalıcı dosya tutulmaz.
 */

require_once __DIR__ . '/helper/b2b_db_dump.php';
require_method('POST');

/** @var PDO $pdo */
global $pdo;

$cfg = b2b_load_config();
$dbName = (string) ($cfg['db_name'] ?? '');
if ($dbName === '') {
    json_response(['ok' => false, 'error' => 'config', 'message' => 'Veritabanı adı yapılandırmada bulunamadı.'], 500);
}

@set_time_limit(0);
@ini_set('max_execution_time', '0');

$dir = b2b_backup_dir();
if (!is_dir($dir) && !mkdir($dir, 0750, true) && !is_dir($dir)) {
    json_response(['ok' => false, 'error' => 'fs', 'message' => 'Yedek klasörü oluşturulamadı.'], 500);
}
b2b_backup_cleanup_stale();

$fileName = 'db_' . preg_replace('/[^A-Za-z0-9_-]/', '_', $dbName)
    . '_' . date('Y-m-d_His') . '_' . bin2hex(random_bytes(8)) . '.sql.gz';
$path = $dir . '/' . $fileName;

$gz = gzopen($path, 'wb6');
if ($gz === false) {
    json_response(['ok' => false, 'error' => 'fs', 'message' => 'Yedek dosyası oluşturulamadı.'], 500);
}

$sqlBytes = 0;
$buffer = '';
$flushBuffer = static function () use (&$buffer, $gz, $path): void {
    if ($buffer === '') {
        return;
    }
    if (gzwrite($gz, $buffer) === false) {
        throw new RuntimeException('Yedek dosyasına yazılamadı: ' . $path);
    }
    $buffer = '';
};

try {
    $summary = b2b_db_dump($pdo, $dbName, static function (string $sql) use (&$buffer, &$sqlBytes, $flushBuffer): void {
        $buffer .= $sql;
        $sqlBytes += strlen($sql);
        if (strlen($buffer) >= 262144) {
            $flushBuffer();
        }
    });
    $flushBuffer();
    gzclose($gz);
} catch (Throwable $e) {
    @gzclose($gz);
    @unlink($path);
    error_log('b2b_db_backup_prepare hata: ' . $e->getMessage());
    json_response(['ok' => false, 'error' => 'dump', 'message' => 'Yedek hazırlanamadı: ' . $e->getMessage()], 500);
}

$gzBytes = (int) @filesize($path);
if ($gzBytes <= 0) {
    @unlink($path);
    json_response(['ok' => false, 'error' => 'dump', 'message' => 'Yedek dosyası boş oluştu.'], 500);
}

b2b_audit_set_entity($dbName, 'system');
b2b_audit_append_meta([
    'backup' => [
        'database' => $dbName,
        'file' => $fileName,
        'sql_bytes' => $sqlBytes,
        'gz_bytes' => $gzBytes,
        'tables' => $summary['tables'],
        'views' => $summary['views'],
    ],
]);

json_response([
    'ok' => true,
    'file' => $fileName,
    'gz_bytes' => $gzBytes,
    'sql_bytes' => $sqlBytes,
]);
