<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('GET');

global $pdo;

$auth = b2b_require_auth();

/** @param non-empty-string $s */
$ymd = static function (string $s): ?string {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
        return null;
    }
    $dt = \DateTimeImmutable::createFromFormat('Y-m-d', $s);

    return $dt instanceof \DateTimeImmutable && $dt->format('Y-m-d') === $s ? $s : null;
};

$sql = 'SELECT inv.id AS internalId, inv.external_id AS id, o.external_id AS orderId, d.name AS dealerName, inv.status,
               inv.total, inv.vat_total AS vatTotal, inv.total_inc_vat AS totalIncVat, inv.invoice_date AS invoiceDate,
               inv.created_at AS createdAt
        FROM b2b_invoices inv
        INNER JOIN b2b_orders o ON o.id = inv.order_id
        INNER JOIN b2b_dealers d ON d.id = inv.dealer_id
        WHERE 1=1';
$params = [];

if ($auth['role'] === 'dealer' && $auth['dealer_id'] !== null && $auth['dealer_id'] !== '') {
    $sql .= ' AND inv.dealer_id = :did';
    $params[':did'] = (int) $auth['dealer_id'];
} elseif (in_array($auth['role'], ['super_admin', 'viewer'], true)) {
    $rawDealer = isset($_GET['dealer_id']) ? trim((string) $_GET['dealer_id']) : '';
    if ($rawDealer !== '' && ctype_digit($rawDealer)) {
        $sql .= ' AND inv.dealer_id = :filter_did';
        $params[':filter_did'] = (int) $rawDealer;
    }
}

$df = isset($_GET['date_from']) ? $ymd(trim((string) $_GET['date_from'])) : null;
$dt = isset($_GET['date_to']) ? $ymd(trim((string) $_GET['date_to'])) : null;
if ($df !== null) {
    $sql .= ' AND DATE(inv.invoice_date) >= :date_from';
    $params[':date_from'] = $df;
}
if ($dt !== null) {
    $sql .= ' AND DATE(inv.invoice_date) <= :date_to';
    $params[':date_to'] = $dt;
}

$st = isset($_GET['status']) ? trim((string) $_GET['status']) : '';
$allowedInv = ['pending', 'approved', 'cancelled'];
if ($st !== '' && in_array($st, $allowedInv, true)) {
    $sql .= ' AND inv.status = :ist';
    $params[':ist'] = $st;
}

$q = isset($_GET['q']) ? trim((string) $_GET['q']) : '';
if ($q !== '') {
    $sql .= ' AND (inv.external_id LIKE :q1 OR o.external_id LIKE :q2 OR d.name LIKE :q3)';
    $params[':q1'] = '%' . $q . '%';
    $params[':q2'] = '%' . $q . '%';
    $params[':q3'] = '%' . $q . '%';
}

$sql .= ' ORDER BY inv.invoice_date DESC, inv.id DESC';

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$invoiceIds = array_map(static fn (array $r): int => (int) $r['internalId'], $rows);
$linesByInv = [];

if ($invoiceIds !== []) {
    $placeholders = implode(',', array_fill(0, count($invoiceIds), '?'));
    $lineSql = "SELECT i.invoice_id AS invoiceId, i.id, i.product_id AS productId, p.sku, p.name, u.code AS unitCode, u.name AS unit,
                       i.quantity, i.unit_price AS unitPrice, i.line_total AS lineTotal,
                       i.vat_rate AS vatRate, i.vat_amount AS vatAmount, i.line_total_inc_vat AS lineTotalIncVat,
                       i.discount_amount AS discountAmount, i.sort_order AS sortOrder
                FROM b2b_invoice_items i
                INNER JOIN b2b_products p ON p.id = i.product_id
                INNER JOIN b2b_units u ON u.id = p.unit_id
                WHERE i.invoice_id IN ($placeholders)
                ORDER BY i.invoice_id ASC, i.sort_order ASC, i.id ASC";
    $lstmt = $pdo->prepare($lineSql);
    $lstmt->execute($invoiceIds);
    while ($lr = $lstmt->fetch(PDO::FETCH_ASSOC)) {
        $iid = (int) $lr['invoiceId'];
        if (!isset($linesByInv[$iid])) {
            $linesByInv[$iid] = [];
        }
        $linesByInv[$iid][] = [
            'id' => (string) $lr['id'],
            'productId' => (string) $lr['productId'],
            'sku' => (string) $lr['sku'],
            'name' => (string) $lr['name'],
            'unitCode' => (string) $lr['unitCode'],
            'unit' => (string) $lr['unit'],
            'quantity' => (float) $lr['quantity'],
            'unitPrice' => (float) $lr['unitPrice'],
            'lineTotal' => (float) $lr['lineTotal'],
            'vatRate' => $lr['vatRate'] === null ? null : (float) $lr['vatRate'],
            'vatAmount' => (float) $lr['vatAmount'],
            'lineTotalIncVat' => (float) $lr['lineTotalIncVat'],
            'discountAmount' => (float) $lr['discountAmount'],
        ];
    }
}

$items = array_map(static function (array $r) use ($linesByInv): array {
    $internalId = (int) $r['internalId'];
    return [
        'id' => (string) $r['id'],
        'orderId' => (string) $r['orderId'],
        'dealerName' => (string) $r['dealerName'],
        'status' => (string) $r['status'],
        'total' => (float) $r['total'],
        'vatTotal' => (float) ($r['vatTotal'] ?? 0),
        'totalIncVat' => (float) ($r['totalIncVat'] ?? 0),
        'invoiceDate' => (string) $r['invoiceDate'],
        'createdAt' => (string) $r['createdAt'],
        'lines' => $linesByInv[$internalId] ?? [],
    ];
}, $rows);

json_response(['ok' => true, 'items' => $items, 'total' => count($items)]);
