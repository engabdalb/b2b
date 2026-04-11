<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('POST');

global $pdo;

$auth = b2b_require_auth();

if ($auth['role'] !== 'super_admin') {
    json_response(['ok' => false, 'error' => 'forbidden', 'message' => 'Fatura durumu değiştirme yetkiniz yok.'], 403);
}

$body = read_json_body();
$invoiceRef = $body['invoice_id'] ?? $body['invoiceId'] ?? $body['id'] ?? null;
if ($invoiceRef === null || $invoiceRef === '' || !is_string($invoiceRef)) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Fatura numarası gerekli.'], 400);
}

$statusRaw = $body['status'] ?? null;
if ($statusRaw === null || $statusRaw === '' || !is_string($statusRaw)) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Durum gerekli.'], 400);
}

$allowedTargets = ['approved', 'cancelled'];
if (!in_array($statusRaw, $allowedTargets, true)) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz durum (approved veya cancelled).'], 400);
}

$sel = $pdo->prepare(
    'SELECT inv.id AS internalId, inv.external_id AS id, inv.status, inv.dealer_id, inv.order_id,
            o.external_id AS orderId, inv.total, inv.vat_total AS vatTotal, inv.total_inc_vat AS totalIncVat,
            inv.invoice_date AS invoiceDate, inv.created_at AS createdAt
     FROM b2b_invoices inv
     INNER JOIN b2b_orders o ON o.id = inv.order_id
     WHERE inv.external_id = :eid
     LIMIT 1',
);
$sel->execute([':eid' => $invoiceRef]);
$row = $sel->fetch(PDO::FETCH_ASSOC);
if (!$row) {
    json_response(['ok' => false, 'error' => 'not_found', 'message' => 'Fatura bulunamadı.'], 404);
}

$current = (string) $row['status'];

if ($statusRaw === 'approved') {
    if ($current !== 'pending') {
        json_response(['ok' => false, 'error' => 'invalid_state', 'message' => 'Yalnızca beklemedeki faturalar onaylanabilir.'], 409);
    }
    $upd = $pdo->prepare("UPDATE b2b_invoices SET status = 'approved' WHERE id = :id AND status = 'pending'");
} else {
    // İptal: kayıt silinmez; yalnızca status = cancelled. Böylece sipariş yeniden faturalandırılabilir.
    if ($current !== 'pending' && $current !== 'approved') {
        json_response(['ok' => false, 'error' => 'invalid_state', 'message' => 'Bu fatura zaten iptal veya güncellenemez.'], 409);
    }
    $upd = $pdo->prepare("UPDATE b2b_invoices SET status = 'cancelled' WHERE id = :id AND status IN ('pending','approved')");
}

$upd->execute([':id' => (int) $row['internalId']]);
if ($upd->rowCount() === 0) {
    json_response(['ok' => false, 'error' => 'conflict', 'message' => 'Durum güncellenemedi.'], 409);
}

$dealerNameStmt = $pdo->prepare('SELECT name FROM b2b_dealers WHERE id = :id LIMIT 1');
$dealerNameStmt->execute([':id' => (int) $row['dealer_id']]);
$dealerName = (string) $dealerNameStmt->fetchColumn();

$invoiceId = (int) $row['internalId'];
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

json_response([
    'ok' => true,
    'item' => [
        'id' => (string) $row['id'],
        'orderId' => (string) $row['orderId'],
        'dealerName' => $dealerName,
        'status' => $statusRaw,
        'total' => (float) $row['total'],
        'vatTotal' => (float) ($row['vatTotal'] ?? 0),
        'totalIncVat' => (float) ($row['totalIncVat'] ?? 0),
        'invoiceDate' => (string) $row['invoiceDate'],
        'createdAt' => (string) $row['createdAt'],
        'lines' => $linesOut,
    ],
]);
