<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('GET');

global $pdo;

$auth = b2b_require_auth();

$sql = 'SELECT id, code, name, sort_order AS sortOrder, active FROM b2b_units WHERE 1=1';
$params = [];

if ($auth['role'] !== 'super_admin') {
    $sql .= ' AND active = 1';
}

$sql .= ' ORDER BY sort_order ASC, name ASC';

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
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
