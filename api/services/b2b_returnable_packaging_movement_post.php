<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_once __DIR__ . '/helper/b2b_returnable_packaging.php';
require_method('POST');

global $pdo;

$auth = b2b_require_auth();

if ($auth['role'] !== 'super_admin') {
    json_response(['ok' => false, 'error' => 'forbidden', 'message' => 'Bu işlem yalnızca yönetici içindir.'], 403);
}

$body = read_json_body();
$kind = isset($body['kind']) ? trim((string) $body['kind']) : '';
$dealerId = (int) ($body['dealer_id'] ?? $body['dealerId'] ?? 0);
$typeId = (int) ($body['returnable_packaging_type_id'] ?? $body['typeId'] ?? 0);
$note = isset($body['note']) ? trim((string) $body['note']) : '';
if ($note === '') {
    $note = null;
} elseif (strlen($note) > 500) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Not en fazla 500 karakter olabilir.'], 400);
}

if ($dealerId < 1 || $typeId < 1) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Bayi ve ambalaj türü zorunlu.'], 400);
}

$dCheck = $pdo->prepare('SELECT id FROM b2b_dealers WHERE id = :id LIMIT 1');
$dCheck->execute([':id' => $dealerId]);
if (!$dCheck->fetchColumn()) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz bayi.'], 400);
}

$tCheck = $pdo->prepare('SELECT id FROM b2b_returnable_packaging_types WHERE id = :id AND active = 1 LIMIT 1');
$tCheck->execute([':id' => $typeId]);
if (!$tCheck->fetchColumn()) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz veya pasif ambalaj türü.'], 400);
}

$delta = 0.0;
$reason = '';

if ($kind === 'deposit_return') {
    $qtyRaw = $body['quantity'] ?? null;
    if ($qtyRaw === null || $qtyRaw === '' || !is_numeric($qtyRaw)) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Gelen miktar (quantity) gerekli.'], 400);
    }
    $qty = round((float) $qtyRaw, 3);
    if ($qty <= 0) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Gelen miktar sıfırdan büyük olmalı.'], 400);
    }
    $delta = -$qty;
    $reason = 'deposit_return';
} elseif ($kind === 'manual_adjustment') {
    $sdRaw = $body['signed_delta'] ?? $body['signedDelta'] ?? null;
    if ($sdRaw === null || $sdRaw === '' || !is_numeric($sdRaw)) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'signed_delta gerekli.'], 400);
    }
    $delta = round((float) $sdRaw, 3);
    if (abs($delta) < 0.0005) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Sıfır olmayan bir değer girin.'], 400);
    }
    $reason = 'manual_adjustment';
} else {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz kind (deposit_return veya manual_adjustment).'], 400);
}

try {
    $pdo->beginTransaction();
    b2b_returnable_packaging_record_manual($pdo, $dealerId, $typeId, $delta, $reason, $note);
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    if ($e instanceof InvalidArgumentException) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => $e->getMessage()], 400);
    }
    throw $e;
}

json_response([
    'ok' => true,
    'message' => 'Hareket kaydedildi.',
]);
