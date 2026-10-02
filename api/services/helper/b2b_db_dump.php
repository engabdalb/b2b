<?php
declare(strict_types=1);

/**
 * Veritabanı SQL dökümü üretimi (ortak mantık).
 *
 * Hem doğrudan akıtan uç (b2b_db_backup_get) hem de sunucuda dosyaya üreten uç
 * (b2b_db_backup_prepare) bu fonksiyonu kullanır; çıktı hedefi $emit ile soyutlanır.
 *
 * Garantiler:
 * - Yalnızca salt-okunur sorgular (SHOW / SELECT / information_schema).
 * - Tutarlı anlık görüntü (REPEATABLE READ + CONSISTENT SNAPSHOT).
 * - TIMESTAMP değerleri UTC okunur ve dosyaya "SET time_zone='+00:00'" yazılır
 *   (geri yüklemede saat kayması olmaz).
 * - Veri, açık sonuç kümesi tutulmadan 1000'er satırlık parçalarla okunur
 *   (net_write_timeout'a takılmaz).
 * - Hata durumunda Throwable fırlatılır; çağıran uç uygun cevabı üretir.
 */

const B2B_DUMP_CHUNK_ROWS = 1000;

/** Tanımlayıcıyı (tablo/kolon adı) güvenli biçimde tırnaklar. */
function b2b_dump_ident(string $name): string
{
    return '`' . str_replace('`', '``', $name) . '`';
}

/** Satır değerini SQL literaline çevirir; geçersiz UTF-8 ise hex literal üretir. */
function b2b_dump_value(PDO $pdo, mixed $value): string
{
    if ($value === null) {
        return 'NULL';
    }
    if (is_bool($value)) {
        return $value ? '1' : '0';
    }
    if (is_int($value)) {
        return (string) $value;
    }
    if (is_float($value)) {
        return is_finite($value) ? var_export($value, true) : 'NULL';
    }
    $str = (string) $value;
    if ($str !== '' && preg_match('//u', $str) !== 1) {
        // İkili (BLOB) veri: tırnaklamak yerine hex literal
        return '0x' . bin2hex($str);
    }
    return $pdo->quote($str);
}

/** DEFINER=`user`@`host` bölümünü kaldırır (geri yüklemede kullanıcı olmayabilir). */
function b2b_dump_strip_definer(string $sql): string
{
    return (string) preg_replace('/\sDEFINER\s*=\s*`(?:[^`]|``)*`@`(?:[^`]|``)*`/i', '', $sql);
}

/**
 * Tüm veritabanını SQL dökümü olarak $emit'e yazar.
 *
 * @param callable(string):void $emit Parça parça SQL metni alır.
 * @return array{tables:int, views:int} Özet (denetim kaydı için).
 * @throws Throwable Şema okunamazsa veya döküm sırasında hata olursa.
 */
function b2b_db_dump(PDO $pdo, string $dbName, callable $emit): array
{
    // ---- 1) Şema bilgisi (çıktı başlamadan; hata buradaysa temiz biçimde raporlanabilir) ----
    $tables = [];
    $viewNames = [];
    $createTable = [];
    $insertColumns = [];
    $createView = [];
    $createTrigger = [];
    $createRoutine = [];
    $primaryKey = [];

    foreach ($pdo->query('SHOW FULL TABLES')->fetchAll(PDO::FETCH_NUM) as $row) {
        $name = (string) $row[0];
        if (strtoupper((string) ($row[1] ?? '')) === 'VIEW') {
            $viewNames[] = $name;
        } else {
            $tables[] = $name;
        }
    }

    // Sanal/üretilmiş kolonlara INSERT yapılamaz; kolon listesinden çıkarılır.
    $colStmt = $pdo->prepare(
        'SELECT TABLE_NAME, COLUMN_NAME
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = :db
            AND (EXTRA IS NULL OR EXTRA NOT LIKE :generated)
          ORDER BY TABLE_NAME, ORDINAL_POSITION',
    );
    $colStmt->execute([':db' => $dbName, ':generated' => '%GENERATED%']);
    foreach ($colStmt->fetchAll(PDO::FETCH_NUM) as $row) {
        $insertColumns[(string) $row[0]][] = (string) $row[1];
    }

    // Tek kolonlu birincil anahtar varsa veri parça parça (keyset) okunur.
    $pkStmt = $pdo->prepare(
        'SELECT TABLE_NAME, COLUMN_NAME
           FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = :db AND INDEX_NAME = :pk
          ORDER BY TABLE_NAME, SEQ_IN_INDEX',
    );
    $pkStmt->execute([':db' => $dbName, ':pk' => 'PRIMARY']);
    foreach ($pkStmt->fetchAll(PDO::FETCH_NUM) as $row) {
        $primaryKey[(string) $row[0]][] = (string) $row[1];
    }

    foreach ($tables as $table) {
        $row = $pdo->query('SHOW CREATE TABLE ' . b2b_dump_ident($table))->fetch(PDO::FETCH_NUM);
        $createTable[$table] = isset($row[1]) ? (string) $row[1] : '';
    }

    foreach ($viewNames as $view) {
        $row = $pdo->query('SHOW CREATE VIEW ' . b2b_dump_ident($view))->fetch(PDO::FETCH_NUM);
        $createView[$view] = isset($row[1]) ? b2b_dump_strip_definer((string) $row[1]) : '';
    }

    // Tetikleyici ve rutinler bazı hostinglerde yetki ister; eksikse yedeği durdurma.
    try {
        foreach ($pdo->query('SHOW TRIGGERS')->fetchAll(PDO::FETCH_ASSOC) as $trigger) {
            $name = (string) ($trigger['Trigger'] ?? '');
            if ($name === '') {
                continue;
            }
            $row = $pdo->query('SHOW CREATE TRIGGER ' . b2b_dump_ident($name))->fetch(PDO::FETCH_ASSOC);
            $sql = (string) ($row['SQL Original Statement'] ?? '');
            if ($sql !== '') {
                $createTrigger[$name] = b2b_dump_strip_definer($sql);
            }
        }
    } catch (Throwable $e) {
        error_log('b2b_db_dump tetikleyici atlandı: ' . $e->getMessage());
    }

    try {
        $routineStmt = $pdo->prepare(
            'SELECT ROUTINE_NAME, ROUTINE_TYPE
               FROM information_schema.ROUTINES
              WHERE ROUTINE_SCHEMA = :db
              ORDER BY ROUTINE_NAME',
        );
        $routineStmt->execute([':db' => $dbName]);
        foreach ($routineStmt->fetchAll(PDO::FETCH_NUM) as $row) {
            $name = (string) $row[0];
            $type = strtoupper((string) $row[1]) === 'FUNCTION' ? 'FUNCTION' : 'PROCEDURE';
            $created = $pdo->query('SHOW CREATE ' . $type . ' ' . b2b_dump_ident($name))->fetch(PDO::FETCH_ASSOC);
            $sql = (string) ($created['Create Procedure'] ?? $created['Create Function'] ?? '');
            if ($sql !== '') {
                $createRoutine[] = ['type' => $type, 'name' => $name, 'sql' => b2b_dump_strip_definer($sql)];
            }
        }
    } catch (Throwable $e) {
        error_log('b2b_db_dump rutin atlandı: ' . $e->getMessage());
    }

    // ---- 2) Döküm ----
    $pdo->exec("SET time_zone = '+00:00'");
    try {
        $pdo->exec('SET SESSION net_write_timeout = 600, SESSION net_read_timeout = 600');
    } catch (Throwable $e) {
        error_log('b2b_db_dump net timeout ayarlanamadı: ' . $e->getMessage());
    }

    $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $pdo->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT');

    try {
        $emit("-- B2B veritabanı yedeği\n");
        $emit('-- Veritabanı: ' . $dbName . "\n");
        $emit('-- Oluşturma: ' . date('Y-m-d H:i:s') . "\n\n");
        $emit("SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n");
        $emit("SET time_zone = '+00:00';\n");
        $emit("SET NAMES utf8mb4;\n");
        $emit("SET FOREIGN_KEY_CHECKS = 0;\n");
        $emit("SET UNIQUE_CHECKS = 0;\n");

        foreach ($tables as $table) {
            $quoted = b2b_dump_ident($table);
            $emit("\n-- ----------------------------------------------------------\n");
            $emit('-- Tablo yapısı: ' . $table . "\n");
            $emit("-- ----------------------------------------------------------\n");
            $emit('DROP TABLE IF EXISTS ' . $quoted . ";\n");
            $emit($createTable[$table] . ";\n");

            $columns = $insertColumns[$table] ?? [];
            if ($columns === []) {
                continue;
            }

            $columnSql = implode(', ', array_map('b2b_dump_ident', $columns));
            $prefix = 'INSERT INTO ' . $quoted . ' (' . $columnSql . ") VALUES\n";
            $emit('-- Tablo verisi: ' . $table . "\n");

            $pkCols = $primaryKey[$table] ?? [];
            $keysetCol = count($pkCols) === 1 && in_array($pkCols[0], $columns, true) ? $pkCols[0] : null;
            $keysetIndex = $keysetCol !== null ? (int) array_search($keysetCol, $columns, true) : -1;

            $chunk = '';
            $rowCount = 0;
            $lastKey = null;
            $offset = 0;

            while (true) {
                if ($keysetCol !== null) {
                    $sql = 'SELECT ' . $columnSql . ' FROM ' . $quoted;
                    if ($lastKey !== null) {
                        $sql .= ' WHERE ' . b2b_dump_ident($keysetCol) . ' > :lastKey';
                    }
                    $sql .= ' ORDER BY ' . b2b_dump_ident($keysetCol) . ' ASC LIMIT ' . B2B_DUMP_CHUNK_ROWS;
                    $stmt = $pdo->prepare($sql);
                    if ($lastKey !== null) {
                        $stmt->bindValue(':lastKey', $lastKey);
                    }
                    $stmt->execute();
                } else {
                    // Tek kolonlu birincil anahtar yok: anlık görüntü içinde OFFSET ile ilerlenir.
                    $stmt = $pdo->query(
                        'SELECT ' . $columnSql . ' FROM ' . $quoted
                        . ' LIMIT ' . B2B_DUMP_CHUNK_ROWS . ' OFFSET ' . $offset,
                    );
                }

                $batch = $stmt->fetchAll(PDO::FETCH_NUM);
                $stmt->closeCursor();
                unset($stmt);

                if ($batch === []) {
                    break;
                }

                foreach ($batch as $row) {
                    $values = [];
                    foreach ($row as $value) {
                        $values[] = b2b_dump_value($pdo, $value);
                    }
                    $line = '(' . implode(',', $values) . ')';
                    $chunk .= $chunk === '' ? $prefix . $line : ",\n" . $line;
                    $rowCount++;
                    if (strlen($chunk) >= 500000) {
                        $emit($chunk . ";\n");
                        $chunk = '';
                    }
                }

                if ($keysetCol !== null) {
                    $lastKey = $batch[count($batch) - 1][$keysetIndex];
                } else {
                    $offset += count($batch);
                }
                $done = count($batch) < B2B_DUMP_CHUNK_ROWS;
                unset($batch);
                if ($done) {
                    break;
                }
            }

            if ($chunk !== '') {
                $emit($chunk . ";\n");
            }
            $emit('-- ' . $table . ': ' . $rowCount . " satır\n");
        }

        foreach ($viewNames as $view) {
            if (($createView[$view] ?? '') === '') {
                continue;
            }
            $emit("\n-- Görünüm: " . $view . "\n");
            $emit('DROP VIEW IF EXISTS ' . b2b_dump_ident($view) . ";\n");
            $emit($createView[$view] . ";\n");
        }

        foreach ($createTrigger as $name => $sql) {
            $emit("\n-- Tetikleyici: " . $name . "\n");
            $emit('DROP TRIGGER IF EXISTS ' . b2b_dump_ident($name) . ";\n");
            $emit("DELIMITER ;;\n" . $sql . ";;\nDELIMITER ;\n");
        }

        foreach ($createRoutine as $routine) {
            $emit("\n-- " . $routine['type'] . ': ' . $routine['name'] . "\n");
            $emit('DROP ' . $routine['type'] . ' IF EXISTS ' . b2b_dump_ident($routine['name']) . ";\n");
            $emit("DELIMITER ;;\n" . $routine['sql'] . ";;\nDELIMITER ;\n");
        }

        $emit("\nSET FOREIGN_KEY_CHECKS = 1;\n");
        $emit("SET UNIQUE_CHECKS = 1;\n");

        // Tamamlandı işareti son satır olmalı; COMMIT ondan önce yapılır.
        $pdo->exec('COMMIT');
        $emit('-- Döküm tamamlandı: ' . date('Y-m-d H:i:s') . "\n");
    } catch (Throwable $e) {
        try {
            $pdo->exec('ROLLBACK');
        } catch (Throwable) {
            // yoksay
        }
        throw $e;
    }

    return ['tables' => count($tables), 'views' => count($viewNames)];
}

/** Yedek dosyalarının tutulduğu klasör (web erişimi .htaccess ile kapalı). */
function b2b_backup_dir(): string
{
    return dirname(__DIR__, 2) . '/backups';
}

/** 1 saatten eski geçici yedek dosyalarını temizler (kalıntı bırakma). */
function b2b_backup_cleanup_stale(): void
{
    $dir = b2b_backup_dir();
    $files = glob($dir . '/db_*.sql.gz');
    if (!is_array($files)) {
        return;
    }
    foreach ($files as $file) {
        $age = time() - (int) @filemtime($file);
        if ($age > 3600) {
            @unlink($file);
        }
    }
}
