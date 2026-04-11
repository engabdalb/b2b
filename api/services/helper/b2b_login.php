<?php
declare(strict_types=1);

require_once __DIR__ . '/../../lib/jwt/JWT.php';

use Firebase\JWT\JWT;

require_method('POST');

global $pdo;

$body = read_json_body();
$email = trim((string) ($body['email'] ?? ''));
$password = (string) ($body['password'] ?? '');

if ($email === '' || $password === '') {
    json_response(['ok' => false, 'error' => 'E-posta ve şifre gerekli.'], 400);
}

$stmt = $pdo->prepare(
    'SELECT id, email, display_name, role, dealer_id, password_hash, active FROM b2b_users WHERE email = :e LIMIT 1',
);
$stmt->execute([':e' => $email]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if (!$row || !(bool) $row['active']) {
    json_response(['ok' => false, 'error' => 'Kullanıcı bulunamadı veya pasif.'], 401);
}

if (!password_verify($password, (string) $row['password_hash'])) {
    json_response(['ok' => false, 'error' => 'Şifre hatalı.'], 401);
}

$secret = b2b_jwt_secret();
$now = time();
$exp = $now + 3600 * 24 * 7;

$tokenPayload = [
    'iss' => 'b2b',
    'iat' => $now,
    'exp' => $exp,
    'data' => [
        'id' => (int) $row['id'],
        'email' => $row['email'],
        'display_name' => $row['display_name'],
        'role' => $row['role'],
        'dealer_id' => $row['dealer_id'] !== null ? (string) $row['dealer_id'] : null,
    ],
];

$accessToken = JWT::encode($tokenPayload, $secret, 'HS256');

json_response([
    'ok' => true,
    'access_token' => $accessToken,
    'user' => [
        'id' => (string) $row['id'],
        'email' => $row['email'],
        'displayName' => $row['display_name'],
        'role' => $row['role'],
        'dealerId' => $row['dealer_id'] !== null ? (string) $row['dealer_id'] : null,
        'avatarInitials' => b2b_initials((string) $row['display_name']),
    ],
]);
