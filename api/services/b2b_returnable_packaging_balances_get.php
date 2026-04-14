<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('GET');

global $pdo;

$auth = b2b_require_auth();

$dealerFilter = null;
if ($auth['role'] === 'dealer' && $auth['dealer_id'] !== null && $auth['dealer_id'] !== '') {
    $dealerFilter = (int) $auth['dealer_id'];
} elseif (isset($_GET['dealer_id']) && $_GET['dealer_id'] !== '' && is_numeric($_GET['dealer_id'])) {
    if (!in_array($auth['role'], ['super_admin', 'viewer'], true)) {
        json_response(['ok' => false, 'error' => 'forbidden', 'message' => 'Bayi filtresi kullanılamaz.'], 403);
    }
    $dealerFilter = (int) $_GET['dealer_id'];
}

$sql = 'SELECT b.dealer_id AS dealerId, d.name AS dealerName,
               b.returnable_packaging_type_id AS typeId, t.code AS typeCode, t.name AS typeName,
               b.quantity
        FROM b2b_dealer_returnable_packaging_balances b
        INNER JOIN b2b_dealers d ON d.id = b.dealer_id
        INNER JOIN b2b_returnable_packaging_types t ON t.id = b.returnable_packaging_type_id
        WHERE 1=1';
$params = [];
if ($dealerFilter !== null) {
    $sql .= ' AND b.dealer_id = :did';
    $params[':did'] = $dealerFilter;
}
$sql .= ' ORDER BY d.name ASC, t.sort_order ASC, t.id ASC';

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$items = array_map(static function (array $r): array {
    return [
        'dealerId' => (string) $r['dealerId'],
        'dealerName' => (string) $r['dealerName'],
        'typeId' => (string) $r['typeId'],
        'typeCode' => (string) $r['typeCode'],
        'typeName' => (string) $r['typeName'],
        'quantity' => (float) $r['quantity'],
    ];
}, $rows);

json_response(['ok' => true, 'items' => $items, 'total' => count($items)]);
