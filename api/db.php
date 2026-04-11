<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';

/** @return array<string,string> */
function b2b_load_config(): array
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    $local = __DIR__ . '/config.local.php';
    if (!is_file($local)) {
        json_response([
            'ok' => false,
            'error' => 'config.local.php bulunamadı. config.local.example.php dosyasını kopyalayıp doldurun.',
        ], 500);
    }
    /** @var array<string,string> $cfg */
    $cfg = require $local;
    $cached = $cfg;
    return $cached;
}

function b2b_jwt_secret(): string
{
    return b2b_load_config()['jwt_secret'];
}

function get_pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $cfg = b2b_load_config();
    $host = $cfg['db_host'];
    $dbname = $cfg['db_name'];
    $user = $cfg['db_user'];
    $pass = $cfg['db_pass'];
    $charset = 'utf8mb4';

    $dsn = "mysql:host={$host};dbname={$dbname};charset={$charset}";
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES {$charset} COLLATE utf8mb4_unicode_ci",
    ]);

    return $pdo;
}
