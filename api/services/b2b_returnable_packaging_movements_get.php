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

$limit = 200;
if (isset($_GET['limit']) && is_numeric($_GET['limit'])) {
    $limit = max(1, min(500, (int) $_GET['limit']));
}

$sql = 'SELECT m.id, m.dealer_id AS dealerId, d.name AS dealerName,
               m.returnable_packaging_type_id AS typeId, t.code AS typeCode, t.name AS typeName,
               m.quantity_delta AS quantityDelta, m.reason,
               m.reference_order_id AS referenceOrderId, o.external_id AS referenceOrderExternalId,
               m.note, m.created_at AS createdAt
        FROM b2b_returnable_packaging_movements m
        INNER JOIN b2b_dealers d ON d.id = m.dealer_id
        INNER JOIN b2b_returnable_packaging_types t ON t.id = m.returnable_packaging_type_id
        LEFT JOIN b2b_orders o ON o.id = m.reference_order_id
        WHERE 1=1';
$params = [];
if ($dealerFilter !== null) {
    $sql .= ' AND m.dealer_id = :did';
    $params[':did'] = $dealerFilter;
}
$sql .= ' ORDER BY m.id DESC LIMIT ' . (int) $limit;

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$items = array_map(static function (array $r): array {
    $oid = $r['referenceOrderId'];
    return [
        'id' => (string) $r['id'],
        'dealerId' => (string) $r['dealerId'],
        'dealerName' => (string) $r['dealerName'],
        'typeId' => (string) $r['typeId'],
        'typeCode' => (string) $r['typeCode'],
        'typeName' => (string) $r['typeName'],
        'quantityDelta' => (float) $r['quantityDelta'],
        'reason' => (string) $r['reason'],
        'referenceOrderId' => $oid !== null && $oid !== '' ? (string) $oid : null,
        'referenceOrderExternalId' => $r['referenceOrderExternalId'] !== null && $r['referenceOrderExternalId'] !== ''
            ? (string) $r['referenceOrderExternalId']
            : null,
        'note' => $r['note'] !== null && $r['note'] !== '' ? (string) $r['note'] : null,
        'createdAt' => (string) $r['createdAt'],
    ];
}, $rows);

json_response(['ok' => true, 'items' => $items, 'total' => count($items)]);
