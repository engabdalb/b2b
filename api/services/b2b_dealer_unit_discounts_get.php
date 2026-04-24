<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('GET');

global $pdo;

$auth = b2b_require_auth();
$dealerId = 0;
if (isset($_GET['dealer_id']) && is_string($_GET['dealer_id']) && ctype_digit($_GET['dealer_id'])) {
    $dealerId = (int) $_GET['dealer_id'];
} elseif (isset($_GET['dealerId']) && is_string($_GET['dealerId']) && ctype_digit($_GET['dealerId'])) {
    $dealerId = (int) $_GET['dealerId'];
}

if ($dealerId < 1) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'dealer_id gerekli.'], 400);
}

if ($auth['role'] === 'dealer') {
    $own = (int) ($auth['dealer_id'] ?? 0);
    if ($own !== $dealerId) {
        json_response(['ok' => false, 'error' => 'forbidden', 'message' => 'Bu listenin görüntüleme yetkiniz yok.'], 403);
    }
} elseif (!in_array($auth['role'], ['super_admin', 'viewer'], true)) {
    json_response(['ok' => false, 'error' => 'forbidden', 'message' => 'Yetkiniz yok.'], 403);
}

$check = $pdo->prepare('SELECT id FROM b2b_dealers WHERE id = :id LIMIT 1');
$check->execute([':id' => $dealerId]);
if (!$check->fetchColumn()) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Bayi bulunamadı.'], 400);
}

$sql = 'SELECT u.id AS unitId, u.code AS unitCode, u.name AS unitName, u.sort_order AS sortOrder,
               COALESCE(d.discount_per_unit, 0) AS discountPerUnit
        FROM b2b_units u
        LEFT JOIN b2b_dealer_unit_discounts d ON d.unit_id = u.id AND d.dealer_id = :did
        WHERE u.active = 1
        ORDER BY u.sort_order ASC, u.name ASC';
$st = $pdo->prepare($sql);
$st->execute([':did' => $dealerId]);
$rows = $st->fetchAll(PDO::FETCH_ASSOC);

$items = array_map(static function (array $r): array {
    return [
        'unitId' => (string) $r['unitId'],
        'unitCode' => (string) $r['unitCode'],
        'unitName' => (string) $r['unitName'],
        'sortOrder' => (int) $r['sortOrder'],
        'discountPerUnit' => (float) $r['discountPerUnit'],
    ];
}, $rows);

json_response(['ok' => true, 'items' => $items, 'total' => count($items)]);
