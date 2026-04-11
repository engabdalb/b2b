<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('POST');

global $pdo;

b2b_require_auth();

$body = read_json_body();

$idRaw = isset($body['id']) ? trim((string) $body['id']) : '';
$email = trim((string) ($body['email'] ?? ''));
$displayName = trim((string) ($body['display_name'] ?? $body['name'] ?? ''));
$password = (string) ($body['password'] ?? '');
$role = trim((string) ($body['role'] ?? ''));
$active = isset($body['active']) ? (bool) $body['active'] : true;

$dealerIdRaw = $body['dealer_id'] ?? $body['dealerId'] ?? null;
$dealerId = null;
if ($dealerIdRaw !== null && $dealerIdRaw !== '') {
    $dealerId = (int) $dealerIdRaw;
}

if ($email === '' || $displayName === '' || $role === '') {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'E-posta, ad ve rol zorunludur.'], 400);
}

if (!in_array($role, ['super_admin', 'dealer', 'viewer'], true)) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz rol.'], 400);
}

if ($role === 'dealer') {
    if ($dealerId === null || $dealerId < 1) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Bayi rolü için geçerli bir bayi seçilmelidir.'], 400);
    }
    $dStmt = $pdo->prepare('SELECT id FROM b2b_dealers WHERE id = :id LIMIT 1');
    $dStmt->execute([':id' => $dealerId]);
    if (!$dStmt->fetchColumn()) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Seçilen bayi bulunamadı.'], 400);
    }
} else {
    $dealerId = null;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçerli bir e-posta girin.'], 400);
}

$roleKey = static function (string $r): string {
    return 'role.' . $r;
};

if ($idRaw === '') {
    if ($password === '' || strlen($password) < 6) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Yeni kullanıcı için en az 6 karakter şifre girin.'], 400);
    }
    $hash = password_hash($password, PASSWORD_DEFAULT);
    $ins = $pdo->prepare(
        'INSERT INTO b2b_users (email, password_hash, display_name, role, dealer_id, active)
         VALUES (:email, :ph, :dn, :role, :did, :active)',
    );
    try {
        $ins->execute([
            ':email' => $email,
            ':ph' => $hash,
            ':dn' => $displayName,
            ':role' => $role,
            ':did' => $dealerId,
            ':active' => $active ? 1 : 0,
        ]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000' || str_contains($e->getMessage(), 'Duplicate')) {
            json_response(['ok' => false, 'error' => 'duplicate_email', 'message' => 'Bu e-posta zaten kayıtlı.'], 409);
        }
        throw $e;
    }
    $newId = (int) $pdo->lastInsertId();
} else {
    $id = (int) $idRaw;
    if ($id < 1) {
        json_response(['ok' => false, 'error' => 'validation', 'message' => 'Geçersiz kullanıcı.'], 400);
    }
    $cur = $pdo->prepare('SELECT id, email FROM b2b_users WHERE id = :id LIMIT 1');
    $cur->execute([':id' => $id]);
    $curRow = $cur->fetch(PDO::FETCH_ASSOC);
    if (!$curRow) {
        json_response(['ok' => false, 'error' => 'not_found', 'message' => 'Kullanıcı bulunamadı.'], 404);
    }

    if (strcasecmp((string) $curRow['email'], $email) !== 0) {
        $dup = $pdo->prepare('SELECT id FROM b2b_users WHERE email = :e AND id <> :id LIMIT 1');
        $dup->execute([':e' => $email, ':id' => $id]);
        if ($dup->fetchColumn()) {
            json_response(['ok' => false, 'error' => 'duplicate_email', 'message' => 'Bu e-posta başka bir kullanıcıda kullanılıyor.'], 409);
        }
    }

    if ($password !== '') {
        if (strlen($password) < 6) {
            json_response(['ok' => false, 'error' => 'validation', 'message' => 'Şifre en az 6 karakter olmalıdır.'], 400);
        }
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $upd = $pdo->prepare(
            'UPDATE b2b_users SET email = :email, password_hash = :ph, display_name = :dn, role = :role, dealer_id = :did, active = :active WHERE id = :id',
        );
        $upd->execute([
            ':email' => $email,
            ':ph' => $hash,
            ':dn' => $displayName,
            ':role' => $role,
            ':did' => $dealerId,
            ':active' => $active ? 1 : 0,
            ':id' => $id,
        ]);
    } else {
        $upd = $pdo->prepare(
            'UPDATE b2b_users SET email = :email, display_name = :dn, role = :role, dealer_id = :did, active = :active WHERE id = :id',
        );
        $upd->execute([
            ':email' => $email,
            ':dn' => $displayName,
            ':role' => $role,
            ':did' => $dealerId,
            ':active' => $active ? 1 : 0,
            ':id' => $id,
        ]);
    }
    $newId = $id;
}

$sel = $pdo->prepare(
    'SELECT id, display_name AS name, email, role, dealer_id, active FROM b2b_users WHERE id = :id LIMIT 1',
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
        'email' => (string) $row['email'],
        'role' => (string) $row['role'],
        'roleKey' => $roleKey((string) $row['role']),
        'active' => (bool) $row['active'],
        'dealerId' => $row['dealer_id'] !== null ? (string) $row['dealer_id'] : null,
    ],
]);
