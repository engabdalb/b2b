<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('POST');

global $pdo;

$auth = b2b_require_auth();
if ($auth['role'] !== 'super_admin') {
    json_response(['ok' => false, 'error' => 'forbidden', 'message' => 'Tahsilat güncelleme yetkiniz yok.'], 403);
}

$body = read_json_body();
$paymentRaw = $body['payment_id'] ?? $body['paymentId'] ?? null;
$dealerRaw = $body['dealer_id'] ?? $body['dealerId'] ?? null;
$amountRaw = $body['amount'] ?? null;
$methodRaw = $body['method'] ?? 'bank_transfer';
$paidAtRaw = $body['paid_at'] ?? $body['paidAt'] ?? null;
$reference = isset($body['reference']) ? trim((string) $body['reference']) : '';
$note = isset($body['note']) && $body['note'] !== null ? trim((string) $body['note']) : null;
if ($note === '') {
    $note = null;
}

if ($paymentRaw === null || $paymentRaw === '') {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'payment_id gerekli.'], 400);
}

$paymentId = is_numeric($paymentRaw) ? (int) $paymentRaw : 0;
if ($paymentId < 1) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz ödeme kaydı.'], 400);
}

if ($dealerRaw === null || $dealerRaw === '') {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'dealer_id gerekli.'], 400);
}

$dealerId = (int) (is_numeric($dealerRaw) ? $dealerRaw : 0);
if ($dealerId < 1) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz bayi.'], 400);
}

$sel = $pdo->prepare('SELECT id, dealer_id FROM b2b_payments WHERE id = :id LIMIT 1');
$sel->execute([':id' => $paymentId]);
$prow = $sel->fetch(PDO::FETCH_ASSOC);
if (!$prow) {
    json_response(['ok' => false, 'error' => 'not_found', 'message' => 'Ödeme kaydı bulunamadı.'], 404);
}

if ((int) $prow['dealer_id'] !== $dealerId) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Ödeme bu bayiye ait değil.'], 400);
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
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'paid_at gerekli.'], 400);
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

    $updPay = $pdo->prepare(
        'UPDATE b2b_payments SET amount = :amt, paid_at = :paid, method = :meth, reference = :ref, note = :note
         WHERE id = :id AND dealer_id = :did',
    );
    $updPay->execute([
        ':amt' => $amount,
        ':paid' => $paidAt,
        ':meth' => $methodRaw,
        ':ref' => $reference,
        ':note' => $note,
        ':id' => $paymentId,
        ':did' => $dealerId,
    ]);
    if ($updPay->rowCount() === 0) {
        $pdo->rollBack();
        json_response(['ok' => false, 'error' => 'conflict', 'message' => 'Ödeme güncellenemedi.'], 409);
    }

    $updMov = $pdo->prepare(
        "UPDATE b2b_account_movements
         SET movement_at = :mov, credit_try = :cred, description = :desc
         WHERE payment_id = :pid AND kind = 'payment'",
    );
    $updMov->execute([
        ':mov' => $paidAt,
        ':cred' => $amount,
        ':desc' => $desc,
        ':pid' => $paymentId,
    ]);
    if ($updMov->rowCount() === 0) {
        $pdo->rollBack();
        json_response(['ok' => false, 'error' => 'schema', 'message' => 'Cari tahsilat satırı bulunamadı.'], 500);
    }

    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    json_response(['ok' => false, 'error' => 'server', 'message' => $e->getMessage()], 500);
}

json_response(['ok' => true, 'message' => 'Tahsilat güncellendi.']);
