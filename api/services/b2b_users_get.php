<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('GET');

global $pdo;

$auth = b2b_require_auth();

$sql = 'SELECT id, display_name AS name, email, role, dealer_id, active FROM b2b_users WHERE 1=1';
$params = [];

if ($auth['role'] === 'dealer' && $auth['dealer_id'] !== null && $auth['dealer_id'] !== '') {
    $sql .= ' AND dealer_id = :did';
    $params[':did'] = (int) $auth['dealer_id'];
}

if ($auth['role'] === 'viewer') {
    $sql .= ' AND id = :self';
    $params[':self'] = $auth['id'];
}

$sql .= ' ORDER BY display_name ASC';

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$roleKey = static function (string $role): string {
    return 'role.' . $role;
};

$items = array_map(static function (array $r) use ($roleKey): array {
    return [
        'id' => (string) $r['id'],
        'name' => (string) $r['name'],
        'email' => (string) $r['email'],
        'roleKey' => $roleKey((string) $r['role']),
        'active' => (bool) $r['active'],
    ];
}, $rows);

json_response(['ok' => true, 'items' => $items, 'total' => count($items)]);
