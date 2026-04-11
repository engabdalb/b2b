<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('POST');

global $pdo;

b2b_require_auth();

$body = read_json_body();
$sku = trim((string) ($body['sku'] ?? ''));
$name = trim((string) ($body['name'] ?? ''));
$unitId = (int) ($body['unit_id'] ?? $body['unitId'] ?? 0);
$priceRaw = $body['price'] ?? null;

if ($sku === '' || $name === '' || $unitId < 1) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'SKU, ad ve birim seçimi zorunlu.'], 400);
}

if ($priceRaw === null || $priceRaw === '' || !is_numeric($priceRaw)) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçerli bir fiyat girin.'], 400);
}

$price = round((float) $priceRaw, 2);
if ($price < 0) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Fiyat negatif olamaz.'], 400);
}

$uStmt = $pdo->prepare('SELECT id, code, name FROM b2b_units WHERE id = :id AND active = 1 LIMIT 1');
$uStmt->execute([':id' => $unitId]);
$uRow = $uStmt->fetch(PDO::FETCH_ASSOC);
if (!$uRow) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz veya pasif birim.'], 400);
}

$stmt = $pdo->prepare(
    'INSERT INTO b2b_products (sku, name, unit_id, price) VALUES (:sku, :name, :uid, :price)',
);

try {
    $stmt->execute([
        ':sku' => $sku,
        ':name' => $name,
        ':uid' => $unitId,
        ':price' => $price,
    ]);
} catch (PDOException $e) {
    if ($e->getCode() === '23000' || str_contains($e->getMessage(), 'Duplicate')) {
        json_response(['ok' => false, 'error' => 'duplicate_sku', 'message' => 'Bu SKU zaten kayıtlı.'], 409);
    }
    throw $e;
}

$id = (int) $pdo->lastInsertId();

json_response([
    'ok' => true,
    'item' => [
        'id' => (string) $id,
        'sku' => $sku,
        'name' => $name,
        'unitId' => (string) $unitId,
        'unitCode' => (string) $uRow['code'],
        'unit' => (string) $uRow['name'],
        'price' => $price,
    ],
]);
