<?php
declare(strict_types=1);

/**
 * Yedek indirme (2. aşama): b2b_db_backup_prepare'ın ürettiği .sql.gz dosyasını
 * Content-Length ile akıtır ve aktarım bitince SİLER (sunucuda dosya kalmaz).
 *
 * Bilerek transport-gzip (Content-Encoding) KULLANILMAZ: dosya zaten .sql.gz
 * içeriktir, tarayıcı eklentilerinin akışı bozma riski yoktur ve tarayıcı
 * Content-Length sayesinde eksik inen dosyayı hata olarak algılar.
 */

require_once __DIR__ . '/helper/b2b_db_dump.php';
require_method('GET');

$fileParam = isset($_GET['file']) ? trim((string) $_GET['file']) : '';
if ($fileParam === '' || preg_match('/^db_[A-Za-z0-9_-]+\.sql\.gz$/', $fileParam) !== 1) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz yedek dosyası adı.'], 400);
}

$dir = b2b_backup_dir();
$path = $dir . '/' . $fileParam;
$real = realpath($path);
$realDir = realpath($dir);
if ($real === false || $realDir === false || !str_starts_with($real, $realDir)) {
    json_response(['ok' => false, 'error' => 'not_found', 'message' => 'Yedek dosyası bulunamadı veya süresi doldu. Lütfen tekrar deneyin.'], 404);
}

$size = (int) filesize($real);
if ($size <= 0) {
    @unlink($real);
    json_response(['ok' => false, 'error' => 'not_found', 'message' => 'Yedek dosyası boş. Lütfen tekrar deneyin.'], 404);
}

b2b_audit_set_entity($fileParam, 'system');
b2b_audit_append_meta(['backup' => ['file' => $fileParam, 'gz_bytes' => $size]]);
// Çıktı akmaya başlamadan önce denetim kaydını yaz (sonrasında JSON dönemeyiz).
b2b_audit_finalize(200, ['ok' => true]);

while (ob_get_level() > 0) {
    ob_end_clean();
}
@ini_set('zlib.output_compression', '0');
@set_time_limit(0);
@ini_set('max_execution_time', '0');

header('Content-Type: application/gzip');
header('Content-Length: ' . $size);
header('Content-Disposition: attachment; filename="' . $fileParam . '"');
header('Content-Transfer-Encoding: binary');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
header('Access-Control-Expose-Headers: Content-Disposition, Content-Length');

$fh = fopen($real, 'rb');
if ($fh === false) {
    exit;
}
while (!feof($fh)) {
    $chunk = fread($fh, 65536);
    if ($chunk === false) {
        break;
    }
    echo $chunk;
    flush();
    if (connection_aborted()) {
        break;
    }
}
fclose($fh);

// Sunucuda dosya tutulmaz: aktarım bitti ya da koptu, her iki durumda da sil
// (kopmuşsa istemci yeniden "hazırla + indir" akışını başlatır).
@unlink($real);

exit;
