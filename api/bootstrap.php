<?php
declare(strict_types=1);

/**
 * Ortak JSON cevapları ve istek yardımcıları (sadettin-website/api/bootstrap.php ile uyumlu)
 */
function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function require_method(string $method): void
{
    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== strtoupper($method)) {
        json_response(['ok' => false, 'error' => 'Geçersiz istek yöntemi.'], 405);
    }
}

/** @return array<string,mixed> */
function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

/** @return array<string,string> */
function b2b_initials(string $displayName): string
{
    $t = trim(preg_replace('/\s+/u', ' ', $displayName));
    if ($t === '') {
        return '?';
    }
    if (function_exists('mb_substr')) {
        $parts = preg_split('/\s+/u', $t) ?: [];
        $a = $parts[0] ?? '';
        $b = $parts[1] ?? '';
        $one = $b !== '' ? mb_substr($a, 0, 1, 'UTF-8') . mb_substr($b, 0, 1, 'UTF-8') : mb_substr($a, 0, 2, 'UTF-8');
        return mb_strtoupper($one, 'UTF-8');
    }
    return strtoupper(substr($t, 0, 2));
}

function get_request_headers_compat(): array
{
    if (function_exists('apache_request_headers')) {
        $h = apache_request_headers();
        return is_array($h) ? $h : [];
    }
    $headers = [];
    foreach ($_SERVER as $key => $value) {
        if (str_starts_with($key, 'HTTP_')) {
            $name = str_replace('_', '-', substr($key, 5));
            $headers[$name] = is_string($value) ? $value : '';
        }
    }
    return $headers;
}
