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

$stmt = $pdo->prepare("SELECT COUNT(*) FROM b2b_orders WHERE status = 'pending' {$dealerFilter}");
$stmt->execute($params);
$pending = (int) $stmt->fetchColumn();

$stmt = $pdo->prepare("SELECT COALESCE(SUM(total), 0) FROM b2b_orders WHERE 1=1 {$dealerFilter}");
$stmt->execute($params);
$revenue = (float) $stmt->fetchColumn();

$stmt = $pdo->prepare("SELECT COALESCE(SUM(tray_count), 0) FROM b2b_orders WHERE 1=1 {$dealerFilter}");
$stmt->execute($params);
$trays = (int) $stmt->fetchColumn();

if ($auth['role'] === 'dealer') {
    $activeDealers = 1;
} else {
    $activeDealers = (int) $pdo->query('SELECT COUNT(*) FROM b2b_dealers WHERE active = 1')->fetchColumn();
}

json_response([
    'ok' => true,
    'metrics' => [
        'todayTrays' => (string) $trays,
        'activeDealers' => (string) $activeDealers,
        'pendingOrders' => (string) $pending,
        'revenueTry' => $revenue,
    ],
]);
