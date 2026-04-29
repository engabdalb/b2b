<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('GET');

global $pdo;

$auth = b2b_require_auth();
$role = (string) ($auth['role'] ?? '');
$dealerId = null;

if ($role === 'dealer' && !empty($auth['dealer_id'])) {
    $dealerId = (int) $auth['dealer_id'];
}

/** @param non-empty-string $s */
$ymd = static function (string $s): ?string {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
        return null;
    }
    $dt = \DateTimeImmutable::createFromFormat('Y-m-d', $s);

    return $dt instanceof \DateTimeImmutable && $dt->format('Y-m-d') === $s ? $s : null;
};

$today = new \DateTimeImmutable('today');
$defaultFrom = $today->modify('-6 days')->format('Y-m-d');
$defaultTo = $today->format('Y-m-d');

$dateFrom = isset($_GET['date_from']) ? $ymd(trim((string) $_GET['date_from'])) : $defaultFrom;
$dateTo = isset($_GET['date_to']) ? $ymd(trim((string) $_GET['date_to'])) : $defaultTo;

if ($dateFrom === null || $dateTo === null) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'date_from/date_to YYYY-MM-DD formatında olmalı.'], 400);
}

if ($dateFrom > $dateTo) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Başlangıç tarihi bitiş tarihinden büyük olamaz.'], 400);
}

$dealerFilterSql = '';
$dealerFilterParams = [];
if ($dealerId !== null && $dealerId > 0) {
    $dealerFilterSql = ' AND d.id = :dealer_id';
    $dealerFilterParams[':dealer_id'] = $dealerId;
}
$rangeParams = array_merge($dealerFilterParams, [
    ':date_from' => $dateFrom,
    ':date_to' => $dateTo,
]);

$trayStmt = $pdo->prepare(
    "SELECT d.id AS dealerId, d.name AS dealerName, COALESCE(SUM(b.quantity_delta), 0) AS trayBalance
     FROM b2b_returnable_packaging_movements b
     INNER JOIN b2b_dealers d ON d.id = b.dealer_id
     INNER JOIN b2b_returnable_packaging_types t ON t.id = b.returnable_packaging_type_id
     WHERE (
       LOWER(t.code) LIKE '%tray%' OR LOWER(t.code) LIKE '%tepsi%' OR
       LOWER(t.name) LIKE '%tray%' OR LOWER(t.name) LIKE '%tepsi%'
     ) AND DATE(b.created_at) >= :date_from
       AND DATE(b.created_at) <= :date_to
       {$dealerFilterSql}
     GROUP BY d.id, d.name
     HAVING COALESCE(SUM(b.quantity_delta), 0) <> 0
     ORDER BY trayBalance DESC, d.name ASC"
);
$trayStmt->execute($rangeParams);
$trayBalances = array_map(static fn (array $r): array => [
    'dealerId' => (string) $r['dealerId'],
    'dealerName' => (string) $r['dealerName'],
    'trayBalance' => (float) $r['trayBalance'],
], $trayStmt->fetchAll(PDO::FETCH_ASSOC));

$debtStmt = $pdo->prepare(
    "SELECT d.id AS dealerId, d.name AS dealerName,
            COALESCE(SUM(m.debit_try - m.credit_try), 0) AS balanceDue
     FROM b2b_dealers d
     LEFT JOIN b2b_account_movements m ON m.dealer_id = d.id
     WHERE (
       m.id IS NULL
       OR (
         DATE(m.movement_at) >= :date_from
         AND DATE(m.movement_at) <= :date_to
       )
     ) {$dealerFilterSql}
     GROUP BY d.id, d.name
     HAVING COALESCE(SUM(m.debit_try - m.credit_try), 0) > 0
     ORDER BY balanceDue DESC, d.name ASC"
);
$debtStmt->execute($rangeParams);
$dealerDebts = array_map(static fn (array $r): array => [
    'dealerId' => (string) $r['dealerId'],
    'dealerName' => (string) $r['dealerName'],
    'balanceDue' => (float) $r['balanceDue'],
], $debtStmt->fetchAll(PDO::FETCH_ASSOC));

$paymentSummaryStmt = $pdo->prepare(
    "SELECT p.method, COUNT(*) AS paymentCount, COALESCE(SUM(p.amount), 0) AS totalAmount
     FROM b2b_payments p
     INNER JOIN b2b_dealers d ON d.id = p.dealer_id
     WHERE DATE(p.paid_at) >= :date_from
       AND DATE(p.paid_at) <= :date_to
       {$dealerFilterSql}
     GROUP BY p.method
     ORDER BY totalAmount DESC, p.method ASC"
);
$paymentSummaryStmt->execute($rangeParams);
$paymentSummary = array_map(static fn (array $r): array => [
    'method' => (string) $r['method'],
    'paymentCount' => (int) $r['paymentCount'],
    'totalAmount' => (float) $r['totalAmount'],
], $paymentSummaryStmt->fetchAll(PDO::FETCH_ASSOC));

$recentPaymentsStmt = $pdo->prepare(
    "SELECT p.id, d.id AS dealerId, d.name AS dealerName, p.amount, p.method, p.reference, p.note, p.paid_at AS paidAt
     FROM b2b_payments p
     INNER JOIN b2b_dealers d ON d.id = p.dealer_id
     WHERE DATE(p.paid_at) >= :date_from
       AND DATE(p.paid_at) <= :date_to
       {$dealerFilterSql}
     ORDER BY p.paid_at DESC, p.id DESC
     LIMIT 100"
);
$recentPaymentsStmt->execute($rangeParams);
$recentPayments = array_map(static fn (array $r): array => [
    'id' => (string) $r['id'],
    'dealerId' => (string) $r['dealerId'],
    'dealerName' => (string) $r['dealerName'],
    'amount' => (float) $r['amount'],
    'method' => (string) $r['method'],
    'reference' => (string) ($r['reference'] ?? ''),
    'note' => $r['note'] !== null && $r['note'] !== '' ? (string) $r['note'] : null,
    'paidAt' => (string) $r['paidAt'],
], $recentPaymentsStmt->fetchAll(PDO::FETCH_ASSOC));

$topProductsStmt = $pdo->prepare(
    "SELECT p.id AS productId, p.sku, p.name AS productName, u.name AS unitName,
            COALESCE(SUM(oi.quantity), 0) AS totalQuantity,
            COALESCE(SUM(oi.line_total_inc_vat), 0) AS totalRevenue
     FROM b2b_order_items oi
     INNER JOIN b2b_orders o ON o.id = oi.order_id
     INNER JOIN b2b_products p ON p.id = oi.product_id
     INNER JOIN b2b_units u ON u.id = p.unit_id
     INNER JOIN b2b_dealers d ON d.id = o.dealer_id
     WHERE o.status IN ('confirmed', 'shipped')
       AND DATE(o.created_at) >= :date_from
       AND DATE(o.created_at) <= :date_to
       {$dealerFilterSql}
     GROUP BY p.id, p.sku, p.name, u.name
     ORDER BY totalQuantity DESC, totalRevenue DESC
     LIMIT 15"
);
$topProductsStmt->execute($rangeParams);
$topProducts = array_map(static fn (array $r): array => [
    'productId' => (string) $r['productId'],
    'sku' => (string) $r['sku'],
    'productName' => (string) $r['productName'],
    'unitName' => (string) $r['unitName'],
    'totalQuantity' => (float) $r['totalQuantity'],
    'totalRevenue' => (float) $r['totalRevenue'],
], $topProductsStmt->fetchAll(PDO::FETCH_ASSOC));

$topDealersStmt = $pdo->prepare(
    "SELECT d.id AS dealerId, d.name AS dealerName,
            COUNT(o.id) AS approvedInvoiceCount,
            COALESCE(SUM(o.total_inc_vat), 0) AS totalRevenue
     FROM b2b_orders o
     INNER JOIN b2b_dealers d ON d.id = o.dealer_id
     WHERE o.status IN ('confirmed', 'shipped')
       AND DATE(o.created_at) >= :date_from
       AND DATE(o.created_at) <= :date_to
       {$dealerFilterSql}
     GROUP BY d.id, d.name
     ORDER BY totalRevenue DESC, approvedInvoiceCount DESC, d.name ASC
     LIMIT 15"
);
$topDealersStmt->execute($rangeParams);
$topDealers = array_map(static fn (array $r): array => [
    'dealerId' => (string) $r['dealerId'],
    'dealerName' => (string) $r['dealerName'],
    'approvedInvoiceCount' => (int) $r['approvedInvoiceCount'],
    'totalRevenue' => (float) $r['totalRevenue'],
], $topDealersStmt->fetchAll(PDO::FETCH_ASSOC));

$productOrdersStmt = $pdo->prepare(
    "SELECT p.id AS productId, p.sku, p.name AS productName, u.name AS unitName,
            COALESCE(SUM(oi.quantity), 0) AS totalQuantity,
            COUNT(DISTINCT o.id) AS orderCount
     FROM b2b_order_items oi
     INNER JOIN b2b_orders o ON o.id = oi.order_id
     INNER JOIN b2b_products p ON p.id = oi.product_id
     INNER JOIN b2b_units u ON u.id = p.unit_id
     INNER JOIN b2b_dealers d ON d.id = o.dealer_id
     WHERE o.status IN ('pending', 'confirmed', 'shipped')
       AND DATE(o.created_at) >= :date_from
       AND DATE(o.created_at) <= :date_to
       {$dealerFilterSql}
     GROUP BY p.id, p.sku, p.name, u.name
     HAVING COALESCE(SUM(oi.quantity), 0) > 0
     ORDER BY totalQuantity DESC, orderCount DESC, p.name ASC
     LIMIT 500"
);
$productOrdersStmt->execute($rangeParams);
$productOrderTotals = array_map(static fn (array $r): array => [
    'productId' => (string) $r['productId'],
    'sku' => (string) $r['sku'],
    'productName' => (string) $r['productName'],
    'unitName' => (string) $r['unitName'],
    'totalQuantity' => (float) $r['totalQuantity'],
    'orderCount' => (int) $r['orderCount'],
], $productOrdersStmt->fetchAll(PDO::FETCH_ASSOC));

$totalDebt = array_sum(array_map(static fn (array $d): float => (float) $d['balanceDue'], $dealerDebts));
$totalTrayBalance = array_sum(array_map(static fn (array $t): float => (float) $t['trayBalance'], $trayBalances));
$totalPaymentAmount = array_sum(array_map(static fn (array $p): float => (float) $p['totalAmount'], $paymentSummary));

json_response([
    'ok' => true,
    'summary' => [
        'totalDebt' => $totalDebt,
        'totalTrayBalance' => $totalTrayBalance,
        'totalPaymentAmount' => $totalPaymentAmount,
        'dealerDebtCount' => count($dealerDebts),
    ],
    'dateRange' => [
        'dateFrom' => $dateFrom,
        'dateTo' => $dateTo,
    ],
    'trayBalances' => $trayBalances,
    'dealerDebts' => $dealerDebts,
    'paymentSummary' => $paymentSummary,
    'recentPayments' => $recentPayments,
    'topProducts' => $topProducts,
    'topDealers' => $topDealers,
    'productOrderTotals' => $productOrderTotals,
]);
