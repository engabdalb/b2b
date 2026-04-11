<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('POST');

global $pdo;

$auth = b2b_require_auth();

if ($auth['role'] !== 'super_admin') {
    json_response(['ok' => false, 'error' => 'forbidden', 'message' => 'Birim eklemek için süper admin olmalısınız.'], 403);
}

$body = read_json_body();
$code = strtolower(trim((string) ($body['code'] ?? '')));
$name = trim((string) ($body['name'] ?? ''));
$sortRaw = $body['sort_order'] ?? $body['sortOrder'] ?? 0;

if ($code === '' || $name === '') {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Kod ve ad zorunlu.'], 400);
}

if (!preg_match('/^[a-z0-9][a-z0-9_-]{0,30}$/', $code)) {
    json_response([
        'ok' => false,
        'error' => 'validation',
        'message' => 'Kod: küçük harf, rakam, tire ve alt çizgi; 1–31 karakter.',
    ], 400);
}

$sortOrder = is_numeric($sortRaw) ? (int) $sortRaw : 0;

$stmt = $pdo->prepare(
    'INSERT INTO b2b_units (code, name, sort_order, active) VALUES (:code, :name, :so, 1)',
);

try {
    $stmt->execute([
        ':code' => $code,
        ':name' => $name,
        ':so' => $sortOrder,
    ]);
} catch (PDOException $e) {
    if ($e->getCode() === '23000' || str_contains($e->getMessage(), 'Duplicate')) {
        json_response(['ok' => false, 'error' => 'duplicate_code', 'message' => 'Bu birim kodu zaten kayıtlı.'], 409);
    }
    throw $e;
}

$id = (int) $pdo->lastInsertId();

json_response([
    'ok' => true,
    'item' => [
        'id' => (string) $id,
        'code' => $code,
        'name' => $name,
        'sortOrder' => $sortOrder,
        'active' => true,
    ],
]);
