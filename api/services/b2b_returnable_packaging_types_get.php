<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('GET');

global $pdo;

b2b_require_auth();

$stmt = $pdo->query(
    'SELECT id, code, name, sort_order AS sortOrder, active
     FROM b2b_returnable_packaging_types
     ORDER BY sort_order ASC, id ASC',
);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$items = array_map(static function (array $r): array {
    return [
        'id' => (string) $r['id'],
        'code' => (string) $r['code'],
        'name' => (string) $r['name'],
        'sortOrder' => (int) $r['sortOrder'],
        'active' => (bool) $r['active'],
    ];
}, $rows);

json_response(['ok' => true, 'items' => $items, 'total' => count($items)]);
