<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_once __DIR__ . '/helper/b2b_product_visibility.php';
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

// Görünürlük: body'de gönderildiyse whitelist'i bununla değiştir (replace).
// Boş dizi => herkese görünür. Anahtar yoksa görünürlük dokunulmaz.
$visibilityProvided = array_key_exists('visibleDealerIds', $body) || array_key_exists('visible_dealer_ids', $body);
$visibleDealerIds = [];
if ($visibilityProvided) {
    $visRaw = $body['visibleDealerIds'] ?? $body['visible_dealer_ids'] ?? [];
    if (is_array($visRaw)) {
        $visibleDealerIds = array_values(array_unique(array_filter(
            array_map(static fn($v) => (int) $v, $visRaw),
            static fn($v) => $v > 0,
        )));
    }
}

$active = null;
if (array_key_exists('active', $body)) {
    $av = $body['active'];
    if (is_bool($av)) {
        $active = $av;
    } elseif ($av === 0 || $av === '0' || $av === false || $av === 'false') {
        $active = false;
    } elseif ($av === 1 || $av === '1' || $av === true || $av === 'true') {
        $active = true;
    }
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

$sqlUpd = 'UPDATE b2b_products SET sku = :sku, name = :name, unit_id = :uid, price = :price,
     returnable_packaging_type_id = :rtid, returnable_packaging_units_per_qty = :rper';
$paramsUpd = [
    ':sku' => $sku,
    ':name' => $name,
    ':uid' => $unitId,
    ':price' => $price,
    ':rtid' => $returnableTypeId,
    ':rper' => $unitsPer,
    ':id' => $id,
];
if ($active !== null) {
    $sqlUpd .= ', active = :active';
    $paramsUpd[':active'] = $active ? 1 : 0;
}
$sqlUpd .= ' WHERE id = :id';
$stmt = $pdo->prepare($sqlUpd);

try {
    $stmt->execute($paramsUpd);
} catch (PDOException $e) {
    if ($e->getCode() === '23000' || str_contains($e->getMessage(), 'Duplicate')) {
        json_response(['ok' => false, 'error' => 'duplicate_sku', 'message' => 'Bu SKU başka bir üründe kullanılıyor.'], 409);
    }
    throw $e;
}

if ($visibilityProvided) {
    b2b_product_visibility_sync($pdo, $id, $visibleDealerIds);
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

$aStmt = $pdo->prepare('SELECT active FROM b2b_products WHERE id = :id LIMIT 1');
$aStmt->execute([':id' => $id]);
$activeOut = ((int) $aStmt->fetchColumn()) === 1;

// Güncel görünürlük listesini (gerçekten kaydedileni) döndür.
$visMap = b2b_product_visibility_map($pdo, [$id]);
$visibleOut = array_map('strval', $visMap[$id] ?? []);

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
        'active' => $activeOut,
        'visibleDealerIds' => $visibleOut,
    ],
]);
