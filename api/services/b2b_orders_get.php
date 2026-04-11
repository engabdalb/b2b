<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('GET');

global $pdo;

$auth = b2b_require_auth();

$sql = 'SELECT o.id AS internalId, o.external_id AS id, d.name AS dealerName, o.status, o.total,
               o.vat_total AS vatTotal, o.total_inc_vat AS totalIncVat, o.created_at AS createdAt,
               (SELECT i2.external_id FROM b2b_invoices i2
                 WHERE i2.order_id = o.id AND i2.status IN (\'pending\',\'approved\')
                 ORDER BY i2.id DESC LIMIT 1) AS invoiceId,
               (SELECT i3.status FROM b2b_invoices i3
                 WHERE i3.order_id = o.id AND i3.status IN (\'pending\',\'approved\')
                 ORDER BY i3.id DESC LIMIT 1) AS invoiceStatus
        FROM b2b_orders o
        INNER JOIN b2b_dealers d ON d.id = o.dealer_id
        WHERE 1=1';
$params = [];

if ($auth['role'] === 'dealer' && $auth['dealer_id'] !== null && $auth['dealer_id'] !== '') {
    $sql .= ' AND o.dealer_id = :did';
    $params[':did'] = (int) $auth['dealer_id'];
}

$sql .= ' ORDER BY o.created_at DESC, o.id DESC';

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$orderIds = array_map(static fn (array $r): int => (int) $r['internalId'], $rows);
$linesByOrder = [];

if ($orderIds !== []) {
    $placeholders = implode(',', array_fill(0, count($orderIds), '?'));
    $lineSql = "SELECT i.order_id AS orderId, i.id, i.product_id AS productId, p.sku, p.name, u.code AS unitCode, u.name AS unit,
                       i.quantity, i.unit_price AS unitPrice, i.line_total AS lineTotal,
                       i.vat_rate AS vatRate, i.vat_amount AS vatAmount, i.line_total_inc_vat AS lineTotalIncVat,
                       i.discount_amount AS discountAmount, i.sort_order AS sortOrder
                FROM b2b_order_items i
                INNER JOIN b2b_products p ON p.id = i.product_id
                INNER JOIN b2b_units u ON u.id = p.unit_id
                WHERE i.order_id IN ($placeholders)
                ORDER BY i.order_id ASC, i.sort_order ASC, i.id ASC";
    $lstmt = $pdo->prepare($lineSql);
    $lstmt->execute($orderIds);
    while ($lr = $lstmt->fetch(PDO::FETCH_ASSOC)) {
        $oid = (int) $lr['orderId'];
        if (!isset($linesByOrder[$oid])) {
            $linesByOrder[$oid] = [];
        }
        $linesByOrder[$oid][] = [
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

$items = array_map(static function (array $r) use ($linesByOrder): array {
    $internalId = (int) $r['internalId'];
    $invId = $r['invoiceId'] ?? null;
    $invSt = $r['invoiceStatus'] ?? null;
    return [
        'id' => (string) $r['id'],
        'dealerName' => (string) $r['dealerName'],
        'status' => (string) $r['status'],
        'total' => (float) $r['total'],
        'vatTotal' => (float) ($r['vatTotal'] ?? 0),
        'totalIncVat' => (float) ($r['totalIncVat'] ?? 0),
        'createdAt' => (string) $r['createdAt'],
        'invoiceId' => $invId !== null && $invId !== false && $invId !== '' ? (string) $invId : null,
        'invoiceStatus' => $invSt !== null && $invSt !== false && $invSt !== '' ? (string) $invSt : null,
        'lines' => $linesByOrder[$internalId] ?? [],
    ];
}, $rows);

json_response(['ok' => true, 'items' => $items, 'total' => count($items)]);
