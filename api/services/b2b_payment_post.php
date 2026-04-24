<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('POST');

global $pdo;

$auth = b2b_require_auth();
if ($auth['role'] !== 'super_admin') {
    json_response(['ok' => false, 'error' => 'forbidden', 'message' => 'Tahsilat kaydı yetkiniz yok.'], 403);
}

$body = read_json_body();
$dealerRaw = $body['dealer_id'] ?? $body['dealerId'] ?? null;
$amountRaw = $body['amount'] ?? null;
$methodRaw = $body['method'] ?? 'bank_transfer';
$paidAtRaw = $body['paid_at'] ?? $body['paidAt'] ?? null;
$reference = isset($body['reference']) ? trim((string) $body['reference']) : '';
$note = isset($body['note']) && $body['note'] !== null ? trim((string) $body['note']) : null;

if ($dealerRaw === null || $dealerRaw === '') {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'dealer_id gerekli.'], 400);
}

$dealerId = (int) (is_numeric($dealerRaw) ? $dealerRaw : 0);
if ($dealerId < 1) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz bayi.'], 400);
}

$dchk = $pdo->prepare('SELECT id, name FROM b2b_dealers WHERE id = :id LIMIT 1');
$dchk->execute([':id' => $dealerId]);
$drow = $dchk->fetch(PDO::FETCH_ASSOC);
if (!$drow) {
    json_response(['ok' => false, 'error' => 'not_found', 'message' => 'Bayi bulunamadı.'], 404);
}

if ($amountRaw === null || $amountRaw === '') {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Tutar gerekli.'], 400);
}
$amount = round((float) $amountRaw, 2);
if ($amount <= 0 || !is_finite($amount)) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Tutar pozitif olmalı.'], 400);
}

$allowedMethods = ['bank_transfer', 'credit_card', 'check', 'cash', 'other'];
if (!is_string($methodRaw) || !in_array($methodRaw, $allowedMethods, true)) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz ödeme tipi.'], 400);
}

if ($paidAtRaw !== null && $paidAtRaw !== '' && is_string($paidAtRaw)) {
    $paidAt = $paidAtRaw;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/', $paidAt)) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'paid_at YYYY-MM-DD veya YYYY-MM-DD HH:MM:SS olmalı.'], 400);
    }
} else {
    $paidAt = date('Y-m-d H:i:s');
}

$methodLabels = [
    'bank_transfer' => 'Havale/EFT',
    'credit_card' => 'Kredi kartı',
    'check' => 'Çek',
    'cash' => 'Nakit',
    'other' => 'Diğer',
];
$label = $methodLabels[$methodRaw] ?? $methodRaw;
$desc = 'Tahsilat — ' . $label;
if ($reference !== '') {
    $desc .= ' (' . $reference . ')';
}

try {
    $pdo->beginTransaction();

    $payIns = $pdo->prepare(
        'INSERT INTO b2b_payments (dealer_id, amount, paid_at, method, reference, note)
         VALUES (:did, :amt, :paid, :meth, :ref, :note)',
    );
    $payIns->execute([
        ':did' => $dealerId,
        ':amt' => $amount,
        ':paid' => $paidAt,
        ':meth' => $methodRaw,
        ':ref' => $reference,
        ':note' => $note,
    ]);
    $paymentId = (int) $pdo->lastInsertId();

    $movIns = $pdo->prepare(
        'INSERT INTO b2b_account_movements (dealer_id, movement_at, kind, invoice_id, payment_id, debit_try, credit_try, description)
         VALUES (:did, :mov, \'payment\', NULL, :pid, 0, :cred, :desc)',
    );
    $movIns->execute([
        ':did' => $dealerId,
        ':mov' => $paidAt,
        ':pid' => $paymentId,
        ':cred' => $amount,
        ':desc' => $desc,
    ]);

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if (str_contains($e->getMessage(), 'b2b_payments') || str_contains($e->getMessage(), 'Unknown table')) {
        json_response(['ok' => false, 'error' => 'schema', 'message' => 'Cari tabloları eksik. migrations/b2b_account_movements.sql çalıştırın.'], 500);
    }
    json_response(['ok' => false, 'error' => 'server', 'message' => $e->getMessage()], 500);
}

json_response([
    'ok' => true,
    'paymentId' => (string) $paymentId,
    'message' => 'Tahsilat kaydedildi.',
]);
