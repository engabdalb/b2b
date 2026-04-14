<?php
declare(strict_types=1);

/**
 * Sipariş kalemlerinden hedef iade edilebilir ambalaj miktarları (tür başına).
 * İptal edilmiş siparişlerde hedef boş — mevcut hareketler sync ile sıfırlanır.
 *
 * @return array<int,float> returnable_packaging_type_id => quantity
 */
function b2b_returnable_packaging_target_totals(PDO $pdo, int $orderId, string $orderStatus): array
{
    if ($orderStatus === 'cancelled') {
        return [];
    }

    $stmt = $pdo->prepare(
        'SELECT p.returnable_packaging_type_id AS tid,
                SUM(i.quantity * p.returnable_packaging_units_per_qty) AS q
         FROM b2b_order_items i
         INNER JOIN b2b_products p ON p.id = i.product_id
         WHERE i.order_id = :oid
           AND p.returnable_packaging_type_id IS NOT NULL
         GROUP BY p.returnable_packaging_type_id',
    );
    $stmt->execute([':oid' => $orderId]);
    $out = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $tid = (int) $row['tid'];
        $out[$tid] = round((float) $row['q'], 3);
    }
    return $out;
}

/**
 * Bu siparişe bağlı hareketlerin tür bazında toplamı (net etki).
 *
 * @return array<int,float>
 */
function b2b_returnable_packaging_current_totals(PDO $pdo, int $orderId): array
{
    $stmt = $pdo->prepare(
        'SELECT returnable_packaging_type_id AS tid, SUM(quantity_delta) AS q
         FROM b2b_returnable_packaging_movements
         WHERE reference_order_id = :oid
         GROUP BY returnable_packaging_type_id',
    );
    $stmt->execute([':oid' => $orderId]);
    $out = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $tid = (int) $row['tid'];
        $out[$tid] = round((float) $row['q'], 3);
    }
    return $out;
}

/**
 * Hedefe göre fark hareketleri yazar ve bayi bakiyesini günceller.
 * Sipariş iptalinde hedef 0 olur; net delta negatif olur ve yükümlülük düşer.
 */
function b2b_returnable_packaging_sync_order(PDO $pdo, int $orderId, int $dealerId, string $orderStatus): void
{
    $target = b2b_returnable_packaging_target_totals($pdo, $orderId, $orderStatus);
    $current = b2b_returnable_packaging_current_totals($pdo, $orderId);

    $keys = array_unique(array_merge(array_keys($target), array_keys($current)));
    sort($keys);

    $insMov = $pdo->prepare(
        'INSERT INTO b2b_returnable_packaging_movements
            (dealer_id, returnable_packaging_type_id, quantity_delta, reason, reference_order_id)
         VALUES (:did, :tid, :delta, :reason, :oid)',
    );

    $insBal = $pdo->prepare(
        'INSERT INTO b2b_dealer_returnable_packaging_balances (dealer_id, returnable_packaging_type_id, quantity)
         VALUES (:did, :tid, :delta)
         ON DUPLICATE KEY UPDATE quantity = quantity + :delta2',
    );

    $reason = $orderStatus === 'cancelled' ? 'order_cancelled' : 'order_sync';

    foreach ($keys as $tid) {
        $tVal = $target[$tid] ?? 0.0;
        $cVal = $current[$tid] ?? 0.0;
        $diff = round($tVal - $cVal, 3);
        if (abs($diff) < 0.0005) {
            continue;
        }

        $insMov->execute([
            ':did' => $dealerId,
            ':tid' => $tid,
            ':delta' => $diff,
            ':reason' => $reason,
            ':oid' => $orderId,
        ]);

        $insBal->execute([
            ':did' => $dealerId,
            ':tid' => $tid,
            ':delta' => $diff,
            ':delta2' => $diff,
        ]);
    }
}

/**
 * Sipariş dışı hareket: gelen depozito (yükümlülük azalır) veya manuel düzeltme.
 * quantity_delta: yükümlülükteki işaretli değişim (+ borç artar, − borç azalır).
 */
function b2b_returnable_packaging_record_manual(
    PDO $pdo,
    int $dealerId,
    int $typeId,
    float $quantityDelta,
    string $reason,
    ?string $note,
): void {
    if (!in_array($reason, ['manual_adjustment', 'deposit_return'], true)) {
        throw new InvalidArgumentException('Invalid manual movement reason');
    }

    $insMov = $pdo->prepare(
        'INSERT INTO b2b_returnable_packaging_movements
            (dealer_id, returnable_packaging_type_id, quantity_delta, reason, reference_order_id, note)
         VALUES (:did, :tid, :delta, :reason, NULL, :note)',
    );

    $insBal = $pdo->prepare(
        'INSERT INTO b2b_dealer_returnable_packaging_balances (dealer_id, returnable_packaging_type_id, quantity)
         VALUES (:did, :tid, :delta)
         ON DUPLICATE KEY UPDATE quantity = quantity + :delta2',
    );

    $insMov->execute([
        ':did' => $dealerId,
        ':tid' => $typeId,
        ':delta' => round($quantityDelta, 3),
        ':reason' => $reason,
        ':note' => $note !== null && $note !== '' ? $note : null,
    ]);

    $d = round($quantityDelta, 3);
    $insBal->execute([
        ':did' => $dealerId,
        ':tid' => $typeId,
        ':delta' => $d,
        ':delta2' => $d,
    ]);
}
