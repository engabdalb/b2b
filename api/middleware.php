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

$headers = get_request_headers_compat();
$forwardedFor = $headers['X-Forwarded-For'] ?? $headers['x-forwarded-for'] ?? '';
$realIp = $headers['X-Real-IP'] ?? $headers['x-real-ip'] ?? '';
$clientIp = '';
if (is_string($forwardedFor) && $forwardedFor !== '') {
    $chunks = array_map('trim', explode(',', $forwardedFor));
    $clientIp = (string) ($chunks[0] ?? '');
}
if ($clientIp === '' && is_string($realIp) && $realIp !== '') {
    $clientIp = trim($realIp);
}
if ($clientIp === '') {
    $clientIp = trim((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
}

$ua = (string) ($headers['User-Agent'] ?? $headers['user-agent'] ?? '');
$uaLower = strtolower($ua);
$deviceType = 'desktop';
if ($uaLower === '') {
    $deviceType = 'unknown';
} elseif (str_contains($uaLower, 'bot') || str_contains($uaLower, 'spider') || str_contains($uaLower, 'crawl')) {
    $deviceType = 'bot';
} elseif (str_contains($uaLower, 'tablet') || str_contains($uaLower, 'ipad')) {
    $deviceType = 'tablet';
} elseif (str_contains($uaLower, 'mobi') || str_contains($uaLower, 'android') || str_contains($uaLower, 'iphone')) {
    $deviceType = 'mobile';
}

$requestId = (string) ($headers['X-Request-Id'] ?? $headers['x-request-id'] ?? '');
if ($requestId === '') {
    $requestId = bin2hex(random_bytes(8));
}
header('X-Request-Id: ' . $requestId);

$GLOBALS['b2b_request_ctx'] = [
    'service' => $service,
    'request_id' => $requestId,
    'ip_address' => $clientIp,
    'user_agent' => $ua,
    'device_type' => $deviceType,
    'app_version' => (string) ($headers['X-App-Version'] ?? $headers['x-app-version'] ?? ''),
    'platform' => (string) ($headers['X-Platform'] ?? $headers['x-platform'] ?? ''),
    'method' => (string) ($_SERVER['REQUEST_METHOD'] ?? ''),
];

if ($service === 'b2b_login') {
    return;
}
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
