<?php
declare(strict_types=1);

/**
 * Bir ürünün görünür olduğu bayi kimlikleri.
 * Boş dizi => kayıt yok => ürün herkese görünür (whitelist devre dışı).
 *
 * @return array<int, int[]> product_id => dealer_id[]
 */
function b2b_product_visibility_map(PDO $pdo, ?array $productIds = null): array
{
    $sql = 'SELECT product_id, dealer_id FROM b2b_product_dealer_visibility';
    $params = [];
    if ($productIds !== null) {
        $ids = array_values(array_unique(array_filter(array_map('intval', $productIds), static fn($v) => $v > 0)));
        if (count($ids) === 0) {
            return [];
        }
        $place = implode(',', array_fill(0, count($ids), '?'));
        $sql .= ' WHERE product_id IN (' . $place . ')';
        $params = $ids;
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $map = [];
    while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $pid = (int) $r['product_id'];
        $map[$pid][] = (int) $r['dealer_id'];
    }

    return $map;
}

/**
 * Bir bayinin ürünü görüp göremeyeceği. Whitelist kaydı yoksa herkese açıktır.
 */
function b2b_product_visible_to_dealer(PDO $pdo, int $productId, int $dealerId): bool
{
    if ($productId < 1) {
        return false;
    }
    // Bu ürün için herhangi bir whitelist satırı var mı?
    $any = $pdo->prepare('SELECT 1 FROM b2b_product_dealer_visibility WHERE product_id = :pid LIMIT 1');
    $any->execute([':pid' => $productId]);
    if (!$any->fetchColumn()) {
        return true; // kayıt yok => herkese görünür
    }
    if ($dealerId < 1) {
        return false;
    }
    $has = $pdo->prepare(
        'SELECT 1 FROM b2b_product_dealer_visibility WHERE product_id = :pid AND dealer_id = :did LIMIT 1',
    );
    $has->execute([':pid' => $productId, ':did' => $dealerId]);

    return (bool) $has->fetchColumn();
}

/**
 * Bir ürünün görünürlük whitelist'ini verilen bayi listesiyle değiştirir (replace semantics).
 * Boş/null dizi => tüm satırlar silinir => ürün herkese görünür olur.
 * Geçersiz/var olmayan bayi kimlikleri sessizce atlanır.
 * Çağıran bir transaction açmış olabilir; bu fonksiyon transaction açmaz.
 */
function b2b_product_visibility_sync(PDO $pdo, int $productId, array $dealerIds): void
{
    if ($productId < 1) {
        return;
    }

    $del = $pdo->prepare('DELETE FROM b2b_product_dealer_visibility WHERE product_id = :pid');
    $del->execute([':pid' => $productId]);

    $clean = array_values(array_unique(array_filter(array_map('intval', $dealerIds), static fn($v) => $v > 0)));
    if (count($clean) === 0) {
        return;
    }

    // Yalnızca gerçekten var olan bayileri ekle.
    $place = implode(',', array_fill(0, count($clean), '?'));
    $chk = $pdo->prepare('SELECT id FROM b2b_dealers WHERE id IN (' . $place . ')');
    $chk->execute($clean);
    $valid = array_map('intval', $chk->fetchAll(PDO::FETCH_COLUMN));
    if (count($valid) === 0) {
        return;
    }

    $ins = $pdo->prepare(
        'INSERT INTO b2b_product_dealer_visibility (product_id, dealer_id) VALUES (:pid, :did)',
    );
    foreach ($valid as $did) {
        $ins->execute([':pid' => $productId, ':did' => $did]);
    }
}
