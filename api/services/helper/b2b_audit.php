<?php
declare(strict_types=1);

/** @var array<string,bool> */
static $b2bAuditTablesChecked = [];

function b2b_audit_init(string $service, array $route): void
{
    $GLOBALS['b2b_audit'] = [
        'service' => $service,
        'enabled' => (bool) ($route['audit_enabled'] ?? false),
        'action' => (string) ($route['audit_action'] ?? $service),
        'entity_type' => (string) ($route['audit_entity'] ?? 'system'),
        'entity_id' => null,
        'before' => null,
        'after' => null,
        'meta' => [],
        'written' => false,
    ];
}

function b2b_audit_set_entity(string|int|null $entityId, ?string $entityType = null): void
{
    $audit = $GLOBALS['b2b_audit'] ?? null;
    if (!is_array($audit)) {
        return;
    }
    $audit['entity_id'] = $entityId === null ? null : (string) $entityId;
    if ($entityType !== null && $entityType !== '') {
        $audit['entity_type'] = $entityType;
    }
    $GLOBALS['b2b_audit'] = $audit;
}

function b2b_audit_set_before_after(mixed $before, mixed $after): void
{
    $audit = $GLOBALS['b2b_audit'] ?? null;
    if (!is_array($audit)) {
        return;
    }
    $audit['before'] = $before;
    $audit['after'] = $after;
    $GLOBALS['b2b_audit'] = $audit;
}

function b2b_audit_append_meta(array $meta): void
{
    $audit = $GLOBALS['b2b_audit'] ?? null;
    if (!is_array($audit)) {
        return;
    }
    $current = $audit['meta'] ?? [];
    if (!is_array($current)) {
        $current = [];
    }
    $audit['meta'] = array_merge($current, $meta);
    $GLOBALS['b2b_audit'] = $audit;
}

function b2b_audit_finalize(int $status, array $responsePayload): void
{
    $audit = $GLOBALS['b2b_audit'] ?? null;
    if (!is_array($audit) || !($audit['enabled'] ?? false) || ($audit['written'] ?? false) === true) {
        return;
    }

    global $pdo;
    if (!isset($pdo) || !($pdo instanceof PDO)) {
        return;
    }
    if (!b2b_audit_table_exists($pdo, 'b2b_audit_logs')) {
        return;
    }

    $auth = $GLOBALS['b2b_auth'] ?? [];
    $req = $GLOBALS['b2b_request_ctx'] ?? [];
    $requestBody = read_json_body();
    if (!is_array($requestBody)) {
        $requestBody = [];
    }

    $payloadMeta = [
        'request' => [
            'method' => (string) ($req['method'] ?? ($_SERVER['REQUEST_METHOD'] ?? '')),
            'query' => $_GET ?? [],
            'body' => b2b_audit_sanitize($requestBody),
        ],
        'response' => [
            'ok' => (bool) ($responsePayload['ok'] ?? false),
            'status' => $status,
            'error' => (string) ($responsePayload['error'] ?? ''),
            'message' => (string) ($responsePayload['message'] ?? ''),
        ],
    ];

    $meta = $audit['meta'] ?? [];
    if (!is_array($meta)) {
        $meta = [];
    }
    $meta = array_merge($meta, $payloadMeta);

    $entityId = $audit['entity_id'] ?? null;
    if (($entityId === null || $entityId === '') && isset($responsePayload['item']['id'])) {
        $entityId = (string) $responsePayload['item']['id'];
    }
    if ($entityId === null || $entityId === '') {
        $entityId = '-';
    }

    $stmt = $pdo->prepare(
        'INSERT INTO b2b_audit_logs (
            actor_user_id, actor_role, actor_dealer_id, action, entity_type, entity_id,
            before_json, after_json, meta_json,
            request_id, ip_address, user_agent, device_type, app_version, platform
        ) VALUES (
            :actor_user_id, :actor_role, :actor_dealer_id, :action, :entity_type, :entity_id,
            :before_json, :after_json, :meta_json,
            :request_id, :ip_address, :user_agent, :device_type, :app_version, :platform
        )',
    );

    $before = b2b_audit_json_or_null($audit['before'] ?? null);
    $after = b2b_audit_json_or_null($audit['after'] ?? null);
    $metaJson = b2b_audit_json_or_null(b2b_audit_sanitize($meta));
    if ($metaJson === null) {
        $metaJson = '{}';
    }

    $stmt->execute([
        ':actor_user_id' => isset($auth['id']) ? (int) $auth['id'] : null,
        ':actor_role' => (string) ($auth['role'] ?? 'guest'),
        ':actor_dealer_id' => isset($auth['dealer_id']) && $auth['dealer_id'] !== null && $auth['dealer_id'] !== ''
            ? (int) $auth['dealer_id']
            : null,
        ':action' => (string) ($audit['action'] ?? ($audit['service'] ?? 'unknown')),
        ':entity_type' => (string) ($audit['entity_type'] ?? 'system'),
        ':entity_id' => (string) $entityId,
        ':before_json' => $before,
        ':after_json' => $after,
        ':meta_json' => $metaJson,
        ':request_id' => (string) ($req['request_id'] ?? ''),
        ':ip_address' => (string) ($req['ip_address'] ?? ''),
        ':user_agent' => (string) ($req['user_agent'] ?? ''),
        ':device_type' => (string) ($req['device_type'] ?? 'unknown'),
        ':app_version' => (string) ($req['app_version'] ?? ''),
        ':platform' => (string) ($req['platform'] ?? ''),
    ]);

    $audit['written'] = true;
    $GLOBALS['b2b_audit'] = $audit;
}

function b2b_audit_table_exists(PDO $pdo, string $table): bool
{
    global $b2bAuditTablesChecked;
    if (isset($b2bAuditTablesChecked[$table])) {
        return $b2bAuditTablesChecked[$table];
    }
    $stmt = $pdo->prepare('SHOW TABLES LIKE :name');
    $stmt->execute([':name' => $table]);
    $exists = $stmt->fetchColumn() !== false;
    $b2bAuditTablesChecked[$table] = $exists;
    return $exists;
}

function b2b_audit_json_or_null(mixed $value): ?string
{
    if ($value === null) {
        return null;
    }
    $json = json_encode(b2b_audit_sanitize($value), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return $json === false ? null : $json;
}

function b2b_audit_sanitize(mixed $value): mixed
{
    if (is_array($value)) {
        $out = [];
        foreach ($value as $k => $v) {
            $key = is_string($k) ? strtolower($k) : '';
            if (in_array($key, ['password', 'password_hash', 'token', 'authorization'], true)) {
                $out[$k] = '***';
                continue;
            }
            $out[$k] = b2b_audit_sanitize($v);
        }
        return $out;
    }
    if (is_object($value)) {
        return b2b_audit_sanitize((array) $value);
    }
    if (is_string($value) && strlen($value) > 4000) {
        return substr($value, 0, 4000) . '...';
    }
    return $value;
}
