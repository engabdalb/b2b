<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('GET');

global $pdo;

$auth = b2b_require_auth();
$role = (string) ($auth['role'] ?? '');

$dealerIdRaw = $_GET['dealer_id'] ?? $_GET['dealerId'] ?? null;

if ($role === 'dealer') {
    $dealerIdRaw = $auth['dealer_id'] ?? null;
    if ($dealerIdRaw === null || $dealerIdRaw === '') {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Bayi bilgisi eksik.'], 400);
    }
} else {
    if ($dealerIdRaw === null || $dealerIdRaw === '' || !is_string($dealerIdRaw)) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'dealer_id gerekli.'], 400);
    }
}

$dealerId = (int) $dealerIdRaw;
if ($dealerId < 1) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz bayi.'], 400);
}

$dchk = $pdo->prepare('SELECT id FROM b2b_dealers WHERE id = :id LIMIT 1');
$dchk->execute([':id' => $dealerId]);
if (!$dchk->fetch()) {
    json_response(['ok' => false, 'error' => 'not_found', 'message' => 'Bayi bulunamadı.'], 404);
}

try {
    $stmt = $pdo->prepare(
        'SELECT m.id, m.dealer_id AS dealerId, m.movement_at AS movementAt, m.kind,
                m.invoice_id AS invoiceIdInternal, m.payment_id AS paymentIdInternal,
                m.debit_try AS debitTry, m.credit_try AS creditTry, m.description,
                inv.external_id AS invoiceExternalId,
                pay.method AS paymentMethod, pay.reference AS paymentReference, pay.note AS paymentNote
         FROM b2b_account_movements m
         LEFT JOIN b2b_invoices inv ON inv.id = m.invoice_id
         LEFT JOIN b2b_payments pay ON pay.id = m.payment_id
         WHERE m.dealer_id = :did
         ORDER BY m.movement_at ASC, m.id ASC',
    );
    $stmt->execute([':did' => $dealerId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    if (str_contains($e->getMessage(), 'b2b_account_movements') || str_contains($e->getMessage(), 'Unknown table')) {
        json_response(['ok' => false, 'error' => 'schema', 'message' => 'Cari tabloları eksik. migrations/b2b_account_movements.sql çalıştırın.'], 500);
    }
    throw $e;
}

$balance = 0.0;
$items = [];
foreach ($rows as $r) {
    $debit = (float) $r['debitTry'];
    $credit = (float) $r['creditTry'];
    $balance = round($balance + $debit - $credit, 2);

    $invExt = $r['invoiceExternalId'] ?? null;
    $pidInt = $r['paymentIdInternal'] ?? null;
    $paymentIdOut = $pidInt !== null && $pidInt !== '' && (int) $pidInt > 0 ? (string) (int) $pidInt : null;
    $payNote = $r['paymentNote'] ?? null;
    $items[] = [
        'id' => (string) $r['id'],
        'dealerId' => (string) $r['dealerId'],
        'movementAt' => (string) $r['movementAt'],
        'kind' => (string) $r['kind'],
        'description' => (string) $r['description'],
        'debit' => $debit,
        'credit' => $credit,
        'balance' => $balance,
        'invoiceId' => $invExt !== null && $invExt !== '' ? (string) $invExt : null,
        'paymentId' => $paymentIdOut,
        'paymentNote' => $payNote !== null && $payNote !== '' ? (string) $payNote : null,
        'paymentMethod' => isset($r['paymentMethod']) && $r['paymentMethod'] !== null && $r['paymentMethod'] !== ''
            ? (string) $r['paymentMethod']
            : null,
        'paymentReference' => isset($r['paymentReference']) && $r['paymentReference'] !== null && $r['paymentReference'] !== ''
            ? (string) $r['paymentReference']
            : null,
    ];
}

json_response([
    'ok' => true,
    'items' => $items,
    'total' => count($items),
    'closingBalance' => $balance,
]);
