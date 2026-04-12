<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('POST');

global $pdo;

$auth = b2b_require_auth();

if (!in_array($auth['role'], ['super_admin', 'dealer'], true)) {
    json_response(['ok' => false, 'error' => 'forbidden', 'message' => 'Sipariş oluşturma yetkiniz yok.'], 403);
}

$body = read_json_body();
$linesRaw = $body['lines'] ?? null;

if (!is_array($linesRaw) || $linesRaw === []) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'En az bir sipariş satırı gerekli.'], 400);
}

$dealerId = 0;
if ($auth['role'] === 'super_admin') {
    $dealerId = (int) ($body['dealer_id'] ?? 0);
    if ($dealerId < 1) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Bayi seçimi zorunlu.'], 400);
    }
} else {
    $dealerId = (int) ($auth['dealer_id'] ?? 0);
    if ($dealerId < 1) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Hesabınız bayiye bağlı değil.'], 400);
    }
}

$checkDealer = $pdo->prepare('SELECT id FROM b2b_dealers WHERE id = :id LIMIT 1');
$checkDealer->execute([':id' => $dealerId]);
if (!$checkDealer->fetchColumn()) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz bayi.'], 400);
}

$orderDescription = null;
if (isset($body['description'])) {
    $orderDescription = trim((string) $body['description']);
    if (strlen($orderDescription) > 2000) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Açıklama en fazla 2000 karakter olabilir.'], 400);
    }
    if ($orderDescription === '') {
        $orderDescription = null;
    }
}

$normalized = [];
foreach ($linesRaw as $idx => $row) {
    if (!is_array($row)) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Satır formatı geçersiz.'], 400);
    }
    $pid = (int) ($row['product_id'] ?? $row['productId'] ?? 0);
    $qtyRaw = $row['quantity'] ?? null;
    if ($pid < 1 || $qtyRaw === null || $qtyRaw === '' || !is_numeric($qtyRaw)) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Her satırda geçerli ürün ve adet gerekli.'], 400);
    }
    $qty = round((float) $qtyRaw, 3);
    if ($qty <= 0) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Adet sıfırdan büyük olmalı.'], 400);
    }
    $discount = isset($row['discount_amount']) && is_numeric($row['discount_amount'])
        ? round((float) $row['discount_amount'], 2)
        : (isset($row['discountAmount']) && is_numeric($row['discountAmount'])
            ? round((float) $row['discountAmount'], 2)
            : 0.0);
    if ($discount < 0) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'İndirim negatif olamaz.'], 400);
    }
    $vatRate = null;
    if (array_key_exists('vat_rate', $row) && $row['vat_rate'] !== null && $row['vat_rate'] !== '') {
        if (!is_numeric($row['vat_rate'])) {
            json_response(['ok' => false, 'error' => 'validation', 'message' => 'KDV oranı sayı olmalı.'], 400);
        }
        $vatRate = round((float) $row['vat_rate'], 2);
    } elseif (array_key_exists('vatRate', $row) && $row['vatRate'] !== null && $row['vatRate'] !== '') {
        if (!is_numeric($row['vatRate'])) {
            json_response(['ok' => false, 'error' => 'validation', 'message' => 'KDV oranı sayı olmalı.'], 400);
        }
        $vatRate = round((float) $row['vatRate'], 2);
    }
    if ($vatRate !== null && ($vatRate < 0 || $vatRate > 100)) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'KDV oranı 0 ile 100 arasında olmalı.'], 400);
    }

    $normalized[] = [
        'product_id' => $pid,
        'quantity' => $qty,
        'discount_amount' => $discount,
        'vat_rate' => $vatRate,
        'sort_order' => count($normalized) + 1,
    ];
}

$productStmt = $pdo->prepare('SELECT id, sku, name, price FROM b2b_products WHERE id = :id LIMIT 1');

try {
    $pdo->beginTransaction();

    $externalId = 'S-' . gmdate('ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(5)), 0, 10));
    if (strlen($externalId) > 32) {
        $externalId = substr($externalId, 0, 32);
    }

    $insOrder = $pdo->prepare(
        'INSERT INTO b2b_orders (external_id, dealer_id, status, total, tray_count, created_at, description)
         VALUES (:eid, :did, \'pending\', 0, 0, CURDATE(), :desc)',
    );
    $insOrder->execute([':eid' => $externalId, ':did' => $dealerId, ':desc' => $orderDescription]);
    $orderId = (int) $pdo->lastInsertId();

    $insItem = $pdo->prepare(
        'INSERT INTO b2b_order_items (order_id, product_id, quantity, unit_price, line_total, vat_rate, vat_amount, line_total_inc_vat, discount_amount, sort_order)
         VALUES (:oid, :pid, :qty, :up, :lt, :vr, :va, :lti, :disc, :so)',
    );

    $sumTotal = 0.0;
    $sumVat = 0.0;
    $sumIncVat = 0.0;
    $sumQty = 0.0;

    foreach ($normalized as $line) {
        $productStmt->execute([':id' => $line['product_id']]);
        $p = $productStmt->fetch(PDO::FETCH_ASSOC);
        if (!$p) {
            $pdo->rollBack();
            json_response(['ok' => false, 'error' => 'validation', 'message' => 'Bilinmeyen ürün: ' . $line['product_id']], 400);
        }
        $unitPrice = round((float) $p['price'], 2);
        $lineTotal = round($line['quantity'] * $unitPrice - $line['discount_amount'], 2);
        if ($lineTotal < 0) {
            $pdo->rollBack();
            json_response(['ok' => false, 'error' => 'validation', 'message' => 'Satır tutarı negatif olamaz (indirim çok yüksek).'], 400);
        }

        $vatRate = $line['vat_rate'];
        $vatAmount = 0.0;
        if ($vatRate !== null && $vatRate > 0) {
            $vatAmount = round($lineTotal * ($vatRate / 100.0), 2);
        }
        $lineTotalIncVat = round($lineTotal + $vatAmount, 2);

        $insItem->execute([
            ':oid' => $orderId,
            ':pid' => (int) $p['id'],
            ':qty' => $line['quantity'],
            ':up' => $unitPrice,
            ':lt' => $lineTotal,
            ':vr' => $line['vat_rate'],
            ':va' => $vatAmount,
            ':lti' => $lineTotalIncVat,
            ':disc' => $line['discount_amount'],
            ':so' => $line['sort_order'],
        ]);

        $sumTotal += $lineTotal;
        $sumVat += $vatAmount;
        $sumIncVat += $lineTotalIncVat;
        $sumQty += $line['quantity'];
    }

    $upd = $pdo->prepare(
        'UPDATE b2b_orders SET total = :t, vat_total = :vt, total_inc_vat = :tic, tray_count = :tc WHERE id = :id',
    );
    $upd->execute([
        ':t' => round($sumTotal, 2),
        ':vt' => round($sumVat, 2),
        ':tic' => round($sumIncVat, 2),
        ':tc' => (int) round($sumQty),
        ':id' => $orderId,
    ]);

    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if ($e->getCode() === '23000' || str_contains($e->getMessage(), 'Duplicate')) {
        json_response(['ok' => false, 'error' => 'duplicate', 'message' => 'Sipariş numarası çakıştı; tekrar deneyin.'], 409);
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
     FROM b2b_order_items i
     INNER JOIN b2b_products p ON p.id = i.product_id
     INNER JOIN b2b_units u ON u.id = p.unit_id
     WHERE i.order_id = :oid
     ORDER BY i.sort_order ASC, i.id ASC",
);
$lineFetch->execute([':oid' => $orderId]);
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

$totalStmt = $pdo->prepare(
    'SELECT total, vat_total AS vatTotal, total_inc_vat AS totalIncVat, created_at AS createdAt, status, description FROM b2b_orders WHERE id = :id LIMIT 1',
);
$totalStmt->execute([':id' => $orderId]);
$meta = $totalStmt->fetch(PDO::FETCH_ASSOC);

json_response([
    'ok' => true,
    'item' => [
        'id' => $externalId,
        'dealerName' => $dealerName,
        'status' => (string) ($meta['status'] ?? 'pending'),
        'total' => (float) ($meta['total'] ?? 0),
        'vatTotal' => (float) ($meta['vatTotal'] ?? 0),
        'totalIncVat' => (float) ($meta['totalIncVat'] ?? 0),
        'createdAt' => (string) ($meta['createdAt'] ?? ''),
        'description' => $meta['description'] !== null && $meta['description'] !== '' ? (string) $meta['description'] : null,
        'lines' => $linesOut,
    ],
]);
