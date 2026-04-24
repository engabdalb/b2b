<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('POST');

global $pdo;

$auth = b2b_require_auth();
if ($auth['role'] !== 'super_admin') {
    json_response(['ok' => false, 'error' => 'forbidden', 'message' => 'Bu işlem için süper yönetici gerekir.'], 403);
}

$body = read_json_body();
$dealerId = (int) ($body['dealer_id'] ?? $body['dealerId'] ?? 0);
if ($dealerId < 1) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'dealer_id gerekli.'], 400);
}

$check = $pdo->prepare('SELECT id FROM b2b_dealers WHERE id = :id LIMIT 1');
$check->execute([':id' => $dealerId]);
if (!$check->fetchColumn()) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Bayi bulunamadı.'], 400);
}

$rowsRaw = $body['rows'] ?? $body['items'] ?? null;
if (!is_array($rowsRaw)) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'rows dizi olmalı.'], 400);
}

$unitStmt = $pdo->prepare('SELECT id FROM b2b_units WHERE id = :id AND active = 1 LIMIT 1');
/** @var array<int, float> */
$byUnit = [];

foreach ($rowsRaw as $row) {
    if (!is_array($row)) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Satır formatı geçersiz.'], 400);
    }
    $uid = (int) ($row['unit_id'] ?? $row['unitId'] ?? 0);
    if ($uid < 1) {
        continue;
    }
    $dpu = $row['discount_per_unit'] ?? $row['discountPerUnit'] ?? null;
    if (!is_numeric($dpu)) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Her satırda geçerli discount_per_unit gerekli.'], 400);
    }
    $dpuF = round((float) $dpu, 2);
    if ($dpuF < 0) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'İndirim negatif olamaz.'], 400);
    }
    if ($dpuF === 0.0) {
        continue;
    }
    $unitStmt->execute([':id' => $uid]);
    if (!$unitStmt->fetchColumn()) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Bilinmeyen veya pasif birim: ' . $uid], 400);
    }
    $byUnit[$uid] = $dpuF;
}

try {
    $pdo->beginTransaction();
    $del = $pdo->prepare('DELETE FROM b2b_dealer_unit_discounts WHERE dealer_id = :did');
    $del->execute([':did' => $dealerId]);
    if ($byUnit !== []) {
        $ins = $pdo->prepare(
            'INSERT INTO b2b_dealer_unit_discounts (dealer_id, unit_id, discount_per_unit) VALUES (:did, :uid, :dpu)',
        );
        foreach ($byUnit as $uid => $dpu) {
            $ins->execute([
                ':did' => $dealerId,
                ':uid' => $uid,
                ':dpu' => $dpu,
            ]);
        }
    }
    $pdo->commit();
} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    throw $e;
}

json_response(['ok' => true, 'saved' => count($byUnit)]);
