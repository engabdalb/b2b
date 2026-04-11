<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('GET');

global $pdo;

b2b_require_auth();

$stmt = $pdo->query(
    'SELECT p.id, p.sku, p.name, p.unit_id AS unitId, u.code AS unitCode, u.name AS unit, p.price
     FROM b2b_products p
     INNER JOIN b2b_units u ON u.id = p.unit_id
     ORDER BY p.name ASC',
);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$items = array_map(static function (array $r): array {
    return [
        'id' => (string) $r['id'],
        'sku' => (string) $r['sku'],
        'name' => (string) $r['name'],
        'unitId' => (string) $r['unitId'],
        'unitCode' => (string) $r['unitCode'],
        'unit' => (string) $r['unit'],
        'price' => (float) $r['price'],
    ];
}, $rows);

json_response(['ok' => true, 'items' => $items, 'total' => count($items)]);
