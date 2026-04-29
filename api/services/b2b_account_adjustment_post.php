<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('POST');

global $pdo;

$auth = b2b_require_auth();
if ($auth['role'] !== 'super_admin') {
    json_response(['ok' => false, 'error' => 'forbidden', 'message' => 'Borçlandırma kaydı yetkiniz yok.'], 403);
}

$body = read_json_body();
$dealerRaw = $body['dealer_id'] ?? $body['dealerId'] ?? null;
$amountRaw = $body['amount'] ?? null;
$movementAtRaw = $body['movement_at'] ?? $body['movementAt'] ?? null;
$descRaw = $body['description'] ?? $body['note'] ?? null;

if ($dealerRaw === null || $dealerRaw === '') {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'dealer_id gerekli.'], 400);
}

$dealerId = (int) (is_numeric($dealerRaw) ? $dealerRaw : 0);
if ($dealerId < 1) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz bayi.'], 400);
}

$dchk = $pdo->prepare('SELECT id FROM b2b_dealers WHERE id = :id LIMIT 1');
$dchk->execute([':id' => $dealerId]);
if (!$dchk->fetchColumn()) {
    json_response(['ok' => false, 'error' => 'not_found', 'message' => 'Bayi bulunamadı.'], 404);
}

if ($amountRaw === null || $amountRaw === '') {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Tutar gerekli.'], 400);
}
$amount = round((float) $amountRaw, 2);
if ($amount <= 0 || !is_finite($amount)) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Tutar pozitif olmalı.'], 400);
}

$description = is_string($descRaw) ? trim($descRaw) : '';
if ($description === '') {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Açıklama (not) zorunludur.'], 400);
}
$descLen = function_exists('mb_strlen') ? mb_strlen($description, 'UTF-8') : strlen($description);
if ($descLen > 512) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Açıklama en fazla 512 karakter olabilir.'], 400);
}

if ($movementAtRaw !== null && $movementAtRaw !== '' && is_string($movementAtRaw)) {
    $movementAt = $movementAtRaw;
    if (!preg_match('/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/', $movementAt)) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'movement_at YYYY-MM-DD veya YYYY-MM-DD HH:MM:SS olmalı.'], 400);
    }
} else {
    $movementAt = date('Y-m-d H:i:s');
}

try {
    $ins = $pdo->prepare(
        'INSERT INTO b2b_account_movements (dealer_id, movement_at, kind, invoice_id, payment_id, debit_try, credit_try, description)
         VALUES (:did, :mov, \'adjustment\', NULL, NULL, :deb, 0, :desc)',
    );
    $ins->execute([
        ':did' => $dealerId,
        ':mov' => $movementAt,
        ':deb' => $amount,
        ':desc' => $description,
    ]);
    $movementId = (int) $pdo->lastInsertId();
} catch (Throwable $e) {
    if (str_contains($e->getMessage(), 'b2b_account_movements') || str_contains($e->getMessage(), 'Unknown table')) {
        json_response(['ok' => false, 'error' => 'schema', 'message' => 'Cari tabloları eksik. migrations/b2b_account_movements.sql çalıştırın.'], 500);
    }
    json_response(['ok' => false, 'error' => 'server', 'message' => $e->getMessage()], 500);
}

json_response([
    'ok' => true,
    'movementId' => (string) $movementId,
    'message' => 'Borçlandırma kaydedildi.',
]);
