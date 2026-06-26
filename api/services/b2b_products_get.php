<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_once __DIR__ . '/helper/b2b_product_visibility.php';
require_method('GET');

global $pdo;

$auth = b2b_require_auth();

$discountDealerId = 0;
if ($auth['role'] === 'dealer') {
    $discountDealerId = (int) ($auth['dealer_id'] ?? 0);
} elseif (in_array($auth['role'], ['super_admin', 'viewer'], true)) {
    $raw = isset($_GET['dealer_id']) ? trim((string) $_GET['dealer_id']) : (isset($_GET['dealerId']) ? trim((string) $_GET['dealerId']) : '');
    if ($raw !== '' && ctype_digit($raw)) {
        $discountDealerId = (int) $raw;
    }
}

$sql = 'SELECT p.id, p.sku, p.name, p.unit_id AS unitId, u.code AS unitCode, u.name AS unit, p.price,
            p.active AS productActive,
            p.returnable_packaging_type_id AS returnablePackagingTypeId,
            p.returnable_packaging_units_per_qty AS returnablePackagingUnitsPerQty,
            rt.code AS returnablePackagingTypeCode, rt.name AS returnablePackagingTypeName,
            COALESCE(du.discount_per_unit, 0) AS dealerDiscountPerUnit
     FROM b2b_products p
     INNER JOIN b2b_units u ON u.id = p.unit_id
     LEFT JOIN b2b_dealer_unit_discounts du ON du.unit_id = p.unit_id AND du.dealer_id = :did
     LEFT JOIN b2b_returnable_packaging_types rt ON rt.id = p.returnable_packaging_type_id';

if ($auth['role'] === 'dealer') {
    // Aktif + bu bayiye görünür ürünler. Whitelist kaydı olmayan ürün herkese görünür.
    $sql .= ' WHERE p.active = 1
        AND (NOT EXISTS (SELECT 1 FROM b2b_product_dealer_visibility v WHERE v.product_id = p.id)
             OR EXISTS (SELECT 1 FROM b2b_product_dealer_visibility v
                        WHERE v.product_id = p.id AND v.dealer_id = :vdid))';
}

$sql .= ' ORDER BY p.name ASC';
$stmt = $pdo->prepare($sql);
$execParams = [':did' => $discountDealerId > 0 ? $discountDealerId : 0];
if ($auth['role'] === 'dealer') {
    $execParams[':vdid'] = (int) ($auth['dealer_id'] ?? 0);
}
$stmt->execute($execParams);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Yöneticiye/izleyiciye her ürünün görünürlük whitelist'ini de döndür (düzenleme formu için).
$visibilityMap = [];
if (in_array($auth['role'], ['super_admin', 'viewer'], true)) {
    $visibilityMap = b2b_product_visibility_map($pdo, array_map(static fn($r) => (int) $r['id'], $rows));
}

$items = array_map(static function (array $r) use ($visibilityMap): array {
    $tid = $r['returnablePackagingTypeId'];
    $vis = $visibilityMap[(int) $r['id']] ?? [];
    $list = (float) $r['price'];
    $dpu = round((float) $r['dealerDiscountPerUnit'], 2);
    $eff = round(max(0, $list - $dpu), 2);
    return [
        'id' => (string) $r['id'],
        'sku' => (string) $r['sku'],
        'name' => (string) $r['name'],
        'active' => isset($r['productActive']) ? ((int) $r['productActive'] === 1) : true,
        'unitId' => (string) $r['unitId'],
        'unitCode' => (string) $r['unitCode'],
        'unit' => (string) $r['unit'],
        'price' => $list,
        'dealerDiscountPerUnit' => $dpu,
        'effectiveUnitPrice' => $eff,
        'returnablePackagingTypeId' => $tid !== null && $tid !== '' ? (string) $tid : null,
        'returnablePackagingUnitsPerQty' => isset($r['returnablePackagingUnitsPerQty'])
            ? (float) $r['returnablePackagingUnitsPerQty']
            : 1.0,
        'returnablePackagingTypeCode' => $r['returnablePackagingTypeCode'] !== null && $r['returnablePackagingTypeCode'] !== ''
            ? (string) $r['returnablePackagingTypeCode']
            : null,
        'returnablePackagingTypeName' => $r['returnablePackagingTypeName'] !== null && $r['returnablePackagingTypeName'] !== ''
            ? (string) $r['returnablePackagingTypeName']
            : null,
        // Boş dizi => herkese görünür. Yalnızca admin/viewer için doldurulur.
        'visibleDealerIds' => array_map('strval', $vis),
    ];
}, $rows);

json_response(['ok' => true, 'items' => $items, 'total' => count($items)]);
