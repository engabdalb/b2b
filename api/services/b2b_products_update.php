<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('POST');

global $pdo;

$auth = b2b_require_auth();

$body = read_json_body();
$id = (int) ($body['id'] ?? 0);
$sku = trim((string) ($body['sku'] ?? ''));
$name = trim((string) ($body['name'] ?? ''));
$unitId = (int) ($body['unit_id'] ?? $body['unitId'] ?? 0);
$priceRaw = $body['price'] ?? null;

if ($id < 1) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz ürün kimliği.'], 400);
}

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

$typeRaw = $body['returnable_packaging_type_id'] ?? $body['returnablePackagingTypeId'] ?? null;
$returnableTypeId = null;
if ($typeRaw !== null && $typeRaw !== '' && is_numeric($typeRaw)) {
    $tid = (int) $typeRaw;
    if ($tid > 0) {
        $returnableTypeId = $tid;
    }
}

$unitsPerRaw = $body['returnable_packaging_units_per_qty'] ?? $body['returnablePackagingUnitsPerQty'] ?? 1;
$unitsPer = round((float) $unitsPerRaw, 3);
if ($unitsPer <= 0 || $unitsPer > 999999.999) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Ambalaj çarpanı 0 ile 999999 arasında olmalı.'], 400);
}

if ($returnableTypeId !== null) {
    $tCheck = $pdo->prepare('SELECT id FROM b2b_returnable_packaging_types WHERE id = :id AND active = 1 LIMIT 1');
    $tCheck->execute([':id' => $returnableTypeId]);
    if (!$tCheck->fetchColumn()) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz iade edilebilir ambalaj türü.'], 400);
    }
}

$check = $pdo->prepare('SELECT id FROM b2b_products WHERE id = :id LIMIT 1');
$check->execute([':id' => $id]);
if (!$check->fetch()) {
    json_response(['ok' => false, 'error' => 'not_found', 'message' => 'Ürün bulunamadı.'], 404);
}

$unitSql = $auth['role'] === 'super_admin'
    ? 'SELECT id, code, name FROM b2b_units WHERE id = :id LIMIT 1'
    : 'SELECT id, code, name FROM b2b_units WHERE id = :id AND active = 1 LIMIT 1';
$uStmt = $pdo->prepare($unitSql);
$uStmt->execute([':id' => $unitId]);
$uRow = $uStmt->fetch(PDO::FETCH_ASSOC);
if (!$uRow) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz birim (veya pasif).'], 400);
}

$stmt = $pdo->prepare(
    'UPDATE b2b_products SET sku = :sku, name = :name, unit_id = :uid, price = :price,
     returnable_packaging_type_id = :rtid, returnable_packaging_units_per_qty = :rper
     WHERE id = :id',
);

try {
    $stmt->execute([
        ':sku' => $sku,
        ':name' => $name,
        ':uid' => $unitId,
        ':price' => $price,
        ':rtid' => $returnableTypeId,
        ':rper' => $unitsPer,
        ':id' => $id,
    ]);
} catch (PDOException $e) {
    if ($e->getCode() === '23000' || str_contains($e->getMessage(), 'Duplicate')) {
        json_response(['ok' => false, 'error' => 'duplicate_sku', 'message' => 'Bu SKU başka bir üründe kullanılıyor.'], 409);
    }
    throw $e;
}

$rtCode = null;
$rtName = null;
if ($returnableTypeId !== null) {
    $rtStmt = $pdo->prepare('SELECT code, name FROM b2b_returnable_packaging_types WHERE id = :id LIMIT 1');
    $rtStmt->execute([':id' => $returnableTypeId]);
    if ($rtr = $rtStmt->fetch(PDO::FETCH_ASSOC)) {
        $rtCode = (string) $rtr['code'];
        $rtName = (string) $rtr['name'];
    }
}

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
        'returnablePackagingTypeId' => $returnableTypeId !== null ? (string) $returnableTypeId : null,
        'returnablePackagingUnitsPerQty' => $unitsPer,
        'returnablePackagingTypeCode' => $rtCode,
        'returnablePackagingTypeName' => $rtName,
    ],
]);
