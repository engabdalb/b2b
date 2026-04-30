<?php
declare(strict_types=1);

require_once __DIR__ . '/helper/b2b_auth.php';
require_method('GET');

global $pdo;

b2b_require_auth();

$limit = isset($_GET['limit']) && is_numeric($_GET['limit']) ? (int) $_GET['limit'] : 200;
$limit = max(1, min(500, $limit));

$action = isset($_GET['action']) ? trim((string) $_GET['action']) : '';
$entityType = isset($_GET['entity_type']) ? trim((string) $_GET['entity_type']) : '';
$entityId = isset($_GET['entity_id']) ? trim((string) $_GET['entity_id']) : '';
$requestId = isset($_GET['request_id']) ? trim((string) $_GET['request_id']) : '';
$status = isset($_GET['status']) ? trim((string) $_GET['status']) : '';
$dateFrom = isset($_GET['date_from']) ? trim((string) $_GET['date_from']) : '';
$dateTo = isset($_GET['date_to']) ? trim((string) $_GET['date_to']) : '';

$sql = 'SELECT id, actor_user_id AS actorUserId, actor_role AS actorRole, actor_dealer_id AS actorDealerId,
               action, entity_type AS entityType, entity_id AS entityId,
               before_json AS beforeJson, after_json AS afterJson, meta_json AS metaJson,
               request_id AS requestId, ip_address AS ipAddress, user_agent AS userAgent,
               device_type AS deviceType, app_version AS appVersion, platform, created_at AS createdAt
        FROM b2b_audit_logs
        WHERE 1=1';
$params = [];

if ($action !== '') {
    $sql .= ' AND action = :action';
    $params[':action'] = $action;
}
if ($entityType !== '') {
    $sql .= ' AND entity_type = :entity_type';
    $params[':entity_type'] = $entityType;
}
if ($entityId !== '') {
    $sql .= ' AND entity_id = :entity_id';
    $params[':entity_id'] = $entityId;
}
if ($requestId !== '') {
    $sql .= ' AND request_id = :request_id';
    $params[':request_id'] = $requestId;
}
if ($dateFrom !== '') {
    $sql .= ' AND created_at >= :date_from';
    $params[':date_from'] = $dateFrom . ' 00:00:00';
}
if ($dateTo !== '') {
    $sql .= ' AND created_at <= :date_to';
    $params[':date_to'] = $dateTo . ' 23:59:59';
}
if ($status === 'ok') {
    $sql .= " AND JSON_UNQUOTE(JSON_EXTRACT(meta_json, '$.response.ok')) = 'true'";
}
if ($status === 'error') {
    $sql .= " AND JSON_UNQUOTE(JSON_EXTRACT(meta_json, '$.response.ok')) = 'false'";
}

$sql .= ' ORDER BY id DESC LIMIT ' . $limit;

$stmt = $pdo->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

$items = array_map(static function (array $r): array {
    $meta = [];
    if (isset($r['metaJson']) && $r['metaJson'] !== null && $r['metaJson'] !== '') {
        $decoded = json_decode((string) $r['metaJson'], true);
        if (is_array($decoded)) {
            $meta = $decoded;
        }
    }

    $before = null;
    if (isset($r['beforeJson']) && $r['beforeJson'] !== null && $r['beforeJson'] !== '') {
        $decoded = json_decode((string) $r['beforeJson'], true);
        if (is_array($decoded)) {
            $before = $decoded;
        }
    }

    $after = null;
    if (isset($r['afterJson']) && $r['afterJson'] !== null && $r['afterJson'] !== '') {
        $decoded = json_decode((string) $r['afterJson'], true);
        if (is_array($decoded)) {
            $after = $decoded;
        }
    }

    return [
        'id' => (string) $r['id'],
        'actorUserId' => isset($r['actorUserId']) && $r['actorUserId'] !== null ? (string) $r['actorUserId'] : null,
        'actorRole' => (string) ($r['actorRole'] ?? ''),
        'actorDealerId' => isset($r['actorDealerId']) && $r['actorDealerId'] !== null ? (string) $r['actorDealerId'] : null,
        'action' => (string) ($r['action'] ?? ''),
        'entityType' => (string) ($r['entityType'] ?? ''),
        'entityId' => (string) ($r['entityId'] ?? ''),
        'before' => $before,
        'after' => $after,
        'meta' => $meta,
        'requestId' => (string) ($r['requestId'] ?? ''),
        'ipAddress' => (string) ($r['ipAddress'] ?? ''),
        'userAgent' => (string) ($r['userAgent'] ?? ''),
        'deviceType' => (string) ($r['deviceType'] ?? ''),
        'appVersion' => (string) ($r['appVersion'] ?? ''),
        'platform' => (string) ($r['platform'] ?? ''),
        'createdAt' => (string) ($r['createdAt'] ?? ''),
    ];
}, $rows);

json_response(['ok' => true, 'items' => $items, 'total' => count($items)]);
