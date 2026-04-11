<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('POST');

global $pdo;

b2b_require_auth();

$body = read_json_body();

$idRaw = isset($body['id']) ? trim((string) $body['id']) : '';
$name = trim((string) ($body['name'] ?? ''));
$region = trim((string) ($body['region'] ?? ''));
$il = trim((string) ($body['il'] ?? ''));
$ilce = trim((string) ($body['ilce'] ?? ''));
$konum = trim((string) ($body['konum'] ?? ''));
$telefon = trim((string) ($body['telefon'] ?? ''));
$active = isset($body['active']) ? (bool) $body['active'] : true;

if ($name === '' || $region === '') {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Bayi adı ve bölge zorunludur.'], 400);
}

if ($idRaw === '') {
    $ins = $pdo->prepare(
        'INSERT INTO b2b_dealers (name, region, il, ilce, konum, telefon, active)
         VALUES (:name, :region, :il, :ilce, :konum, :telefon, :active)',
    );
    $ins->execute([
        ':name' => $name,
        ':region' => $region,
        ':il' => $il,
        ':ilce' => $ilce,
        ':konum' => $konum,
        ':telefon' => $telefon,
        ':active' => $active ? 1 : 0,
    ]);
    $newId = (int) $pdo->lastInsertId();
} else {
    $id = (int) $idRaw;
    if ($id < 1) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz bayi.'], 400);
    }
    $chk = $pdo->prepare('SELECT id FROM b2b_dealers WHERE id = :id LIMIT 1');
    $chk->execute([':id' => $id]);
    if (!$chk->fetchColumn()) {
        json_response(['ok' => false, 'error' => 'not_found', 'message' => 'Bayi bulunamadı.'], 404);
    }
    $upd = $pdo->prepare(
        'UPDATE b2b_dealers SET name = :name, region = :region, il = :il, ilce = :ilce, konum = :konum, telefon = :telefon, active = :active WHERE id = :id',
    );
    $upd->execute([
        ':name' => $name,
        ':region' => $region,
        ':il' => $il,
        ':ilce' => $ilce,
        ':konum' => $konum,
        ':telefon' => $telefon,
        ':active' => $active ? 1 : 0,
        ':id' => $id,
    ]);
    $newId = $id;
}

$sel = $pdo->prepare(
    'SELECT id, name, region, il, ilce, konum, telefon, active FROM b2b_dealers WHERE id = :id LIMIT 1',
);
$sel->execute([':id' => $newId]);
$row = $sel->fetch(PDO::FETCH_ASSOC);
if ($row === false) {
    json_response(['ok' => false, 'error' => 'internal', 'message' => 'Kayıt okunamadı.'], 500);
}

json_response([
    'ok' => true,
    'item' => [
        'id' => (string) $row['id'],
        'name' => (string) $row['name'],
        'region' => (string) $row['region'],
        'il' => (string) $row['il'],
        'ilce' => (string) $row['ilce'],
        'konum' => (string) $row['konum'],
        'telefon' => (string) $row['telefon'],
        'active' => (bool) $row['active'],
    ],
]);
