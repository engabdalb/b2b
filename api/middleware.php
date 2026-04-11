<?php
declare(strict_types=1);

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/lib/jwt/JWT.php';
require_once __DIR__ . '/lib/jwt/Key.php';

use Firebase\JWT\JWT;
use Firebase\JWT\Key;

$path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '';
$parts = array_values(array_filter(explode('/', $path), static fn ($p) => $p !== ''));
$service = $parts === [] ? '' : $parts[array_key_last($parts)];

if ($service === 'b2b_login') {
    return;
}

$headers = get_request_headers_compat();
$authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$jwt = preg_replace('/^Bearer\s+/i', '', trim($authHeader));

if ($jwt === '') {
    json_response(['ok' => false, 'message' => 'Token is missing'], 401);
}

$secret = b2b_jwt_secret();

try {
    $decoded = JWT::decode($jwt, new Key($secret, 'HS256'));
    $data = $decoded->data ?? null;
    if (!is_object($data)) {
        throw new RuntimeException('Invalid token payload');
    }
    $dealerRaw = $data->dealer_id ?? null;
    $GLOBALS['b2b_auth'] = [
        'id' => (int) ($data->id ?? 0),
        'email' => (string) ($data->email ?? ''),
        'display_name' => (string) ($data->display_name ?? ''),
        'role' => (string) ($data->role ?? ''),
        'dealer_id' => $dealerRaw !== null && $dealerRaw !== '' ? (string) $dealerRaw : null,
    ];
} catch (Throwable $e) {
    json_response(['ok' => false, 'message' => 'Token is invalid', 'error' => $e->getMessage()], 401);
}
