<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('GET');

global $pdo;

b2b_require_auth();

$stmt = $pdo->query(
    'SELECT p.id, p.sku, p.name, p.unit_id AS unitId, u.code AS unitCode, u.name AS unit, p.price,
            p.returnable_packaging_type_id AS returnablePackagingTypeId,
            p.returnable_packaging_units_per_qty AS returnablePackagingUnitsPerQty,
            rt.code AS returnablePackagingTypeCode, rt.name AS returnablePackagingTypeName
     FROM b2b_products p
     INNER JOIN b2b_units u ON u.id = p.unit_id
     LEFT JOIN b2b_returnable_packaging_types rt ON rt.id = p.returnable_packaging_type_id
     ORDER BY p.name ASC',
);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$items = array_map(static function (array $r): array {
    $tid = $r['returnablePackagingTypeId'];
    return [
        'id' => (string) $r['id'],
        'sku' => (string) $r['sku'],
        'name' => (string) $r['name'],
        'unitId' => (string) $r['unitId'],
        'unitCode' => (string) $r['unitCode'],
        'unit' => (string) $r['unit'],
        'price' => (float) $r['price'],
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
    ];
}, $rows);

json_response(['ok' => true, 'items' => $items, 'total' => count($items)]);
