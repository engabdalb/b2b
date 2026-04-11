<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Max-Age: 86400');
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD'])) {
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    }
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'])) {
        header('Access-Control-Allow-Headers: ' . $_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']);
    }
    exit(0);
}

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/db.php';

ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/my-errors.log');

try {
    $pdo = get_pdo();
} catch (Throwable $e) {
    json_response(['ok' => false, 'error' => 'Veritabanı bağlantı hatası: ' . $e->getMessage()], 500);
}
