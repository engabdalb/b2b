<?php
declare(strict_types=1);

/**
 * @return array<int, float> unit_id => discount_per_unit (TRY)
 */
function b2b_dealer_unit_discount_map(PDO $pdo, int $dealerId): array
{
    if ($dealerId < 1) {
        return [];
    }
    $st = $pdo->prepare(
        'SELECT unit_id, discount_per_unit FROM b2b_dealer_unit_discounts WHERE dealer_id = :d',
    );
    $st->execute([':d' => $dealerId]);
    $m = [];
    while ($r = $st->fetch(PDO::FETCH_ASSOC)) {
        $m[(int) $r['unit_id']] = round((float) $r['discount_per_unit'], 2);
    }

    return $m;
}
