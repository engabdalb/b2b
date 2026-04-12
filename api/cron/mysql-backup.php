<?php
declare(strict_types=1);

/**
 * MySQL günlük yedek — zamanlama PHP içinde DEĞİL, sunucu Cron ile yapılır.
 *
 * cPanel → Cron Jobs örnek (her gün 03:00):
 *   0 3 * * * /usr/bin/php /home/KULLANICI/public_html/api/cron/mysql-backup.php >> /home/KULLANICI/backup-cron.log 2>&1
 *
 * İsteğe bağlı: mysqldump yolu (hostingde farklı olabilir)
 *   MYSQLDUMP_BINARY=/usr/bin/mysqldump
 *
 * Tarayıcıdan tetiklemek önerilmez; gerekirse aşağıdaki CRON_SECRET değerini değiştirip:
 *   https://site.com/api/cron/mysql-backup.php?key=SIZIN_GIZLI_ANAHTAR
 */

// Tarayıcıdan çağrı için: boş bırakırsanız sadece CLI (cron) çalışır.
const CRON_SECRET = '';

// Yedek dosyalarının yazılacağı klasör (web’den erişimi api/backups/.htaccess ile kapatın)
const BACKUP_DIR = __DIR__ . '/../backups';

// Windows’ta XAMPP için tipik yol; Linux’ta genelde PATH’te "mysqldump" yeterli
function resolve_mysqldump_binary(): string
{
    $env = getenv('MYSQLDUMP_BINARY');
    if ($env !== false && $env !== '') {
        return $env;
    }
    if (PHP_OS_FAMILY === 'Windows') {
        $xampp = 'C:\\xampp\\mysql\\bin\\mysqldump.exe';
        if (is_file($xampp)) {
            return $xampp;
        }
    }
    return 'mysqldump';
}

function log_line(string $msg): void
{
    $line = '[' . date('Y-m-d H:i:s') . '] ' . $msg . PHP_EOL;
    if (PHP_SAPI === 'cli') {
        fwrite(STDERR, $line);
    } else {
        echo htmlspecialchars($line, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}

/** @return array{db_host:string,db_name:string,db_user:string,db_pass:string} */
function backup_load_db_config(): array
{
    $local = dirname(__DIR__) . '/config.local.php';
    if (!is_file($local)) {
        throw new RuntimeException('config.local.php bulunamadı: ' . $local);
    }
    /** @var array<string,string> $cfg */
    $cfg = require $local;
    foreach (['db_host', 'db_name', 'db_user', 'db_pass'] as $k) {
        if (!isset($cfg[$k]) || $cfg[$k] === '') {
            throw new RuntimeException('config.local.php içinde eksik alan: ' . $k);
        }
    }
    return [
        'db_host' => $cfg['db_host'],
        'db_name' => $cfg['db_name'],
        'db_user' => $cfg['db_user'],
        'db_pass' => $cfg['db_pass'],
    ];
}

function assert_web_access_allowed(): void
{
    if (PHP_SAPI === 'cli') {
        return;
    }
    if (CRON_SECRET === '') {
        http_response_code(403);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Web üzerinden çağrı kapalı. CRON_SECRET tanımlayın veya CLI kullanın.';
        exit;
    }
    $key = isset($_GET['key']) && is_string($_GET['key']) ? $_GET['key'] : '';
    if (!hash_equals(CRON_SECRET, $key)) {
        http_response_code(403);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Forbidden';
        exit;
    }
}

assert_web_access_allowed();

if (PHP_SAPI !== 'cli') {
    header('Content-Type: text/plain; charset=utf-8');
}

try {
    $cfg = backup_load_db_config();
    if (!is_dir(BACKUP_DIR) && !mkdir(BACKUP_DIR, 0750, true) && !is_dir(BACKUP_DIR)) {
        throw new RuntimeException('Yedek klasörü oluşturulamadı: ' . BACKUP_DIR);
    }

    $stamp = date('Y-m-d_His');
    $outFile = BACKUP_DIR . '/db_' . preg_replace('/[^a-zA-Z0-9_-]/', '_', $cfg['db_name']) . '_' . $stamp . '.sql';

    $cnf = tempnam(sys_get_temp_dir(), 'mdb_');
    if ($cnf === false) {
        throw new RuntimeException('Geçici dosya oluşturulamadı.');
    }
    $cnfContent = "[client]\n"
        . 'host=' . $cfg['db_host'] . "\n"
        . 'user=' . $cfg['db_user'] . "\n"
        . 'password=' . $cfg['db_pass'] . "\n";
    file_put_contents($cnf, $cnfContent);
    chmod($cnf, 0600);

    $bin = resolve_mysqldump_binary();
    // --single-transaction: InnoDB tutarlı anlık görüntü; --quick: bellek dostu
    $cmd = [
        $bin,
        '--defaults-extra-file=' . $cnf,
        '--single-transaction',
        '--quick',
        '--routines',
        '--triggers',
        '--events',
        '--default-character-set=utf8mb4',
        $cfg['db_name'],
    ];

    $proc = proc_open(
        $cmd,
        [
            0 => ['pipe', 'r'],
            1 => ['file', $outFile, 'wb'],
            2 => ['pipe', 'w'],
        ],
        $pipes
    );
    if (!is_resource($proc)) {
        @unlink($cnf);
        throw new RuntimeException('mysqldump başlatılamadı.');
    }
    fclose($pipes[0]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    $code = proc_close($proc);
    @unlink($cnf);

    if ($code !== 0) {
        @unlink($outFile);
        throw new RuntimeException('mysqldump hata kodu ' . $code . ': ' . trim($stderr));
    }

    if (!is_file($outFile) || filesize($outFile) === 0) {
        @unlink($outFile);
        throw new RuntimeException('Yedek dosyası oluşmadı veya boş.');
    }

    log_line('OK: ' . $outFile . ' (' . filesize($outFile) . ' bayt)');
    if (PHP_SAPI !== 'cli') {
        echo 'OK ' . basename($outFile);
    }
} catch (Throwable $e) {
    log_line('HATA: ' . $e->getMessage());
    if (PHP_SAPI !== 'cli') {
        http_response_code(500);
        echo 'HATA: ' . $e->getMessage();
    }
    exit(1);
}
