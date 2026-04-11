<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('GET');

global $pdo;

$auth = b2b_require_auth();

$dealerFilter = '';
$params = [];
if ($auth['role'] === 'dealer' && $auth['dealer_id'] !== null && $auth['dealer_id'] !== '') {
    $dealerFilter = ' AND dealer_id = :did';
    $params[':did'] = (int) $auth['dealer_id'];
}

$stmt = $pdo->prepare("SELECT COUNT(*) FROM b2b_orders o WHERE o.status = 'pending' {$dealerFilter}");
$stmt->execute($params);
$pending = (int) $stmt->fetchColumn();

$stmt = $pdo->prepare("SELECT COALESCE(SUM(o.total), 0) FROM b2b_orders o WHERE 1=1 {$dealerFilter}");
$stmt->execute($params);
$revenue = (float) $stmt->fetchColumn();

$stmt = $pdo->prepare("SELECT COALESCE(SUM(o.tray_count), 0) FROM b2b_orders o WHERE 1=1 {$dealerFilter}");
$stmt->execute($params);
$trays = (int) $stmt->fetchColumn();

$stmt = $pdo->prepare(
    "SELECT COUNT(*) FROM b2b_orders o
     WHERE o.status IN ('confirmed','shipped')
       AND NOT EXISTS (
           SELECT 1 FROM b2b_invoices ix
           WHERE ix.order_id = o.id AND ix.status IN ('pending','approved')
       )
       {$dealerFilter}"
);
$stmt->execute($params);
$awaitingInvoice = (int) $stmt->fetchColumn();

$stmt = $pdo->prepare(
    "SELECT COUNT(*) FROM b2b_orders o WHERE o.status IN ('pending','confirmed') {$dealerFilter}"
);
$stmt->execute($params);
$notShippedYet = (int) $stmt->fetchColumn();

$stmt = $pdo->prepare("SELECT COUNT(*) FROM b2b_orders o WHERE 1=1 {$dealerFilter}");
$stmt->execute($params);
$totalOrders = (int) $stmt->fetchColumn();

$monthParams = $params;
$monthParams[':month_start'] = (new \DateTimeImmutable('first day of this month'))->format('Y-m-d');
$monthDealerFilter = $dealerFilter;
$stmt = $pdo->prepare(
    "SELECT COUNT(*) FROM b2b_orders o WHERE DATE(o.created_at) >= :month_start {$monthDealerFilter}"
);
$stmt->execute($monthParams);
$ordersThisMonth = (int) $stmt->fetchColumn();

if ($auth['role'] === 'dealer') {
    $activeDealers = 1;
} else {
    $activeDealers = (int) $pdo->query('SELECT COUNT(*) FROM b2b_dealers WHERE active = 1')->fetchColumn();
}

$recentSql = 'SELECT o.external_id AS id, d.name AS dealerName, o.status, o.total_inc_vat AS totalIncVat, o.created_at AS createdAt,
              (SELECT i2.external_id FROM b2b_invoices i2
                WHERE i2.order_id = o.id AND i2.status IN (\'pending\',\'approved\')
                ORDER BY i2.id DESC LIMIT 1) AS invoiceId
       FROM b2b_orders o
       INNER JOIN b2b_dealers d ON d.id = o.dealer_id
       WHERE 1=1';
$recentParams = [];
if ($auth['role'] === 'dealer' && $auth['dealer_id'] !== null && $auth['dealer_id'] !== '') {
    $recentSql .= ' AND o.dealer_id = :recent_did';
    $recentParams[':recent_did'] = (int) $auth['dealer_id'];
}
$recentSql .= ' ORDER BY o.created_at DESC, o.id DESC LIMIT 10';
$rstmt = $pdo->prepare($recentSql);
$rstmt->execute($recentParams);
$recentRows = $rstmt->fetchAll(PDO::FETCH_ASSOC);
$recentOrders = array_map(static function (array $r): array {
    $inv = $r['invoiceId'] ?? null;

    return [
        'id' => (string) $r['id'],
        'dealerName' => (string) $r['dealerName'],
        'status' => (string) $r['status'],
        'totalIncVat' => (float) ($r['totalIncVat'] ?? 0),
        'createdAt' => (string) $r['createdAt'],
        'invoiceId' => $inv !== null && $inv !== false && $inv !== '' ? (string) $inv : null,
    ];
}, $recentRows);

json_response([
    'ok' => true,
    'metrics' => [
        'todayTrays' => (string) $trays,
        'activeDealers' => (string) $activeDealers,
        'pendingOrders' => (string) $pending,
        'revenueTry' => $revenue,
        'awaitingInvoice' => (string) $awaitingInvoice,
        'notShippedYet' => (string) $notShippedYet,
        'totalOrders' => (string) $totalOrders,
        'ordersThisMonth' => (string) $ordersThisMonth,
    ],
    'recentOrders' => $recentOrders,
]);
