<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('POST');

global $pdo;

$auth = b2b_require_auth();

if ($auth['role'] !== 'super_admin') {
    json_response(['ok' => false, 'error' => 'forbidden', 'message' => 'Faturalandırma yetkiniz yok.'], 403);
}

$body = read_json_body();
$orderRef = $body['order_id'] ?? $body['orderId'] ?? $body['id'] ?? null;
if ($orderRef === null || $orderRef === '' || !is_string($orderRef)) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Sipariş numarası gerekli.'], 400);
}

$ordStmt = $pdo->prepare(
    'SELECT o.id, o.dealer_id, o.status, o.total, o.vat_total AS vatTotal, o.total_inc_vat AS totalIncVat, o.tray_count AS trayCount
     FROM b2b_orders o
     WHERE o.external_id = :eid
     LIMIT 1',
);
$ordStmt->execute([':eid' => $orderRef]);
$orderRow = $ordStmt->fetch(PDO::FETCH_ASSOC);
if (!$orderRow) {
    json_response(['ok' => false, 'error' => 'not_found', 'message' => 'Sipariş bulunamadı.'], 404);
}
if (($orderRow['status'] ?? '') === 'cancelled') {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'İptal edilmiş sipariş faturalandırılamaz.'], 400);
}

$orderId = (int) $orderRow['id'];
$dealerId = (int) $orderRow['dealer_id'];

$dupStmt = $pdo->prepare(
    "SELECT external_id FROM b2b_invoices WHERE order_id = :oid AND status IN ('pending','approved') LIMIT 1",
);
$dupStmt->execute([':oid' => $orderId]);
$dup = $dupStmt->fetchColumn();
if ($dup !== false && $dup !== null) {
    json_response([
        'ok' => false,
        'error' => 'duplicate',
        'message' => 'Bu sipariş için zaten aktif bir fatura var: ' . (string) $dup,
    ], 409);
}

$itemsStmt = $pdo->prepare(
    'SELECT product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order
     FROM b2b_order_items
     WHERE order_id = :oid
     ORDER BY sort_order ASC, id ASC',
);
$itemsStmt->execute([':oid' => $orderId]);
$orderItems = $itemsStmt->fetchAll(PDO::FETCH_ASSOC);
if ($orderItems === []) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Siparişte kalem yok; fatura oluşturulamaz.'], 400);
}

try {
    $pdo->beginTransaction();

    $externalId = 'F-' . gmdate('ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(5)), 0, 10));
    if (strlen($externalId) > 32) {
        $externalId = substr($externalId, 0, 32);
    }

    $insInv = $pdo->prepare(
        'INSERT INTO b2b_invoices (external_id, order_id, dealer_id, status, total, vat_total, total_inc_vat, tray_count, invoice_date)
         VALUES (:eid, :oid, :did, \'pending\', :t, :vt, :tic, :tc, CURDATE())',
    );
    $insInv->execute([
        ':eid' => $externalId,
        ':oid' => $orderId,
        ':did' => $dealerId,
        ':t' => round((float) $orderRow['total'], 2),
        ':vt' => round((float) ($orderRow['vatTotal'] ?? 0), 2),
        ':tic' => round((float) ($orderRow['totalIncVat'] ?? 0), 2),
        ':tc' => (int) ($orderRow['trayCount'] ?? 0),
    ]);
    $invoiceId = (int) $pdo->lastInsertId();

    $insLine = $pdo->prepare(
        'INSERT INTO b2b_invoice_items (invoice_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
         VALUES (:iid, :pid, :qty, :up, :lt, :vr, :va, :lti, :disc, :so)',
    );

    foreach ($orderItems as $row) {
        $insLine->execute([
            ':iid' => $invoiceId,
            ':pid' => (int) $row['product_id'],
            ':qty' => (float) $row['quantity'],
            ':up' => round((float) $row['unit_price'], 2),
            ':lt' => round((float) $row['line_total'], 2),
            ':vr' => $row['vat_rate'],
            ':va' => round((float) ($row['vat_amount'] ?? 0), 2),
            ':lti' => round((float) $row['line_total_inc_vat'], 2),
            ':disc' => round((float) ($row['discount_amount'] ?? 0), 2),
            ':so' => (int) $row['sort_order'],
        ]);
    }

    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if ($e->getCode() === '23000' || str_contains($e->getMessage(), 'Duplicate')) {
        json_response(['ok' => false, 'error' => 'duplicate', 'message' => 'Fatura numarası çakıştı; tekrar deneyin.'], 409);
    }
    if (str_contains($e->getMessage(), 'b2b_invoices') || str_contains($e->getMessage(), 'Unknown table')) {
        json_response(['ok' => false, 'error' => 'schema', 'message' => 'Fatura tabloları eksik. migrations/create_invoices.sql çalıştırın.'], 500);
    }
    throw $e;
}

$dealerNameStmt = $pdo->prepare('SELECT name FROM b2b_dealers WHERE id = :id LIMIT 1');
$dealerNameStmt->execute([':id' => $dealerId]);
$dealerName = (string) $dealerNameStmt->fetchColumn();

$lineFetch = $pdo->prepare(
    "SELECT i.id, i.product_id AS productId, p.sku, p.name, u.code AS unitCode, u.name AS unit, i.quantity, i.unit_price AS unitPrice,
            i.line_total AS lineTotal, i.vat_rate AS vatRate, i.vat_amount AS vatAmount, i.line_total_inc_vat AS lineTotalIncVat,
            i.discount_amount AS discountAmount
     FROM b2b_invoice_items i
     INNER JOIN b2b_products p ON p.id = i.product_id
     INNER JOIN b2b_units u ON u.id = p.unit_id
     WHERE i.invoice_id = :iid
     ORDER BY i.sort_order ASC, i.id ASC",
);
$lineFetch->execute([':iid' => $invoiceId]);
$linesOut = [];
while ($lr = $lineFetch->fetch(PDO::FETCH_ASSOC)) {
    $linesOut[] = [
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

$metaStmt = $pdo->prepare(
    'SELECT inv.total, inv.vat_total AS vatTotal, inv.total_inc_vat AS totalIncVat, inv.invoice_date AS invoiceDate,
            inv.created_at AS createdAt, inv.status, inv.external_id AS id, o.external_id AS orderId
     FROM b2b_invoices inv
     INNER JOIN b2b_orders o ON o.id = inv.order_id
     WHERE inv.id = :id
     LIMIT 1',
);
$metaStmt->execute([':id' => $invoiceId]);
$meta = $metaStmt->fetch(PDO::FETCH_ASSOC);

json_response([
    'ok' => true,
    'item' => [
        'id' => (string) ($meta['id'] ?? $externalId),
        'orderId' => (string) ($meta['orderId'] ?? $orderRef),
        'dealerName' => $dealerName,
        'status' => (string) ($meta['status'] ?? 'pending'),
        'total' => (float) ($meta['total'] ?? 0),
        'vatTotal' => (float) ($meta['vatTotal'] ?? 0),
        'totalIncVat' => (float) ($meta['totalIncVat'] ?? 0),
        'invoiceDate' => (string) ($meta['invoiceDate'] ?? ''),
        'createdAt' => (string) ($meta['createdAt'] ?? ''),
        'lines' => $linesOut,
    ],
]);
