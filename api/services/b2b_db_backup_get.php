<?php
declare(strict_types=1);

/**
 * Veritabanı yedeği — SQL dökümünü doğrudan indirmeye akıtır.
 *
 * Notlar:
 * - Sunucuda HİÇBİR dosya oluşturulmaz/saklanmaz; çıktı doğrudan tarayıcıya akar.
 * - Yalnızca salt-okunur sorgular kullanılır (SHOW / SELECT / information_schema).
 * - Tutarlı anlık görüntü için salt-okunur bir REPEATABLE READ işlemi açılır.
 * - mysqldump ikilisine ihtiyaç duymaz (paylaşımlı hostinglerde proc_open kapalı olabilir).
 */

require_method('GET');

/** Veri okuma parça boyutu (satır). Bellek ile ağ gecikmesi arasındaki denge. */
const B2B_BACKUP_CHUNK_ROWS = 1000;

/** @var PDO $pdo */
global $pdo;

/** Tanımlayıcıyı (tablo/kolon adı) güvenli biçimde tırnaklar. */
function b2b_backup_ident(string $name): string
{
    return '`' . str_replace('`', '``', $name) . '`';
}

/** Satır değerini SQL literaline çevirir; geçersiz UTF-8 ise hex literal üretir. */
function b2b_backup_value(PDO $pdo, mixed $value): string
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
function b2b_backup_strip_definer(string $sql): string
{
    return (string) preg_replace('/\sDEFINER\s*=\s*`(?:[^`]|``)*`@`(?:[^`]|``)*`/i', '', $sql);
}

/**
 * Çıktıyı yazar. Gzip açıksa akış halinde sıkıştırır.
 * $final yalnızca bir kez true gelmelidir (gzip akışını kapatır).
 */
function b2b_backup_write(string $chunk, bool $final): void
{
    $state = &$GLOBALS['b2b_backup_gzip'];
    if (is_array($state) && $state['ctx'] !== null) {
        if ($state['done'] === true) {
            return; // Gzip akışı kapandı; sonrasına çıktı eklenemez.
        }
        $out = deflate_add($state['ctx'], $chunk, $final ? ZLIB_FINISH : ZLIB_SYNC_FLUSH);
        if ($final) {
            $state['done'] = true;
        }
        if ($out !== false && $out !== '') {
            echo $out;
        }
    } elseif ($chunk !== '') {
        echo $chunk;
    }
    flush();
}

/** Çıktıyı tamponlar ve belli boyutu aşınca akıtır. */
function b2b_backup_emit(string $sql, bool $flushNow = false): void
{
    static $buffer = '';
    $buffer .= $sql;
    if ($flushNow || strlen($buffer) >= 262144) {
        b2b_backup_write($buffer, $flushNow);
        $buffer = '';
    }
}

$cfg = b2b_load_config();
$dbName = (string) ($cfg['db_name'] ?? '');
if ($dbName === '') {
    json_response(['ok' => false, 'error' => 'Veritabanı adı yapılandırmada bulunamadı.'], 500);
}

/*
 * Şema bilgisi çıktı başlamadan önce toplanır; böylece bir hata olursa
 * yarım kalmış bir .sql dosyası yerine düzgün bir JSON hatası döndürebiliriz.
 */
$tables = [];
$viewNames = [];
$createTable = [];
$insertColumns = [];
$createView = [];
$createTrigger = [];
$createRoutine = [];
$primaryKey = [];

try {
    $rows = $pdo->query('SHOW FULL TABLES')->fetchAll(PDO::FETCH_NUM);
    foreach ($rows as $row) {
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
        $row = $pdo->query('SHOW CREATE TABLE ' . b2b_backup_ident($table))->fetch(PDO::FETCH_NUM);
        $createTable[$table] = isset($row[1]) ? (string) $row[1] : '';
    }

    foreach ($viewNames as $view) {
        $row = $pdo->query('SHOW CREATE VIEW ' . b2b_backup_ident($view))->fetch(PDO::FETCH_NUM);
        $createView[$view] = isset($row[1]) ? b2b_backup_strip_definer((string) $row[1]) : '';
    }
} catch (Throwable $e) {
    error_log('b2b_db_backup_get şema hatası: ' . $e->getMessage());
    json_response(['ok' => false, 'error' => 'Yedek şeması okunamadı: ' . $e->getMessage()], 500);
}

// Tetikleyici ve rutinler bazı hostinglerde yetki gerektirir; başarısız olursa yedeği durdurmayız.
try {
    foreach ($pdo->query('SHOW TRIGGERS')->fetchAll(PDO::FETCH_ASSOC) as $trigger) {
        $name = (string) ($trigger['Trigger'] ?? '');
        if ($name === '') {
            continue;
        }
        $row = $pdo->query('SHOW CREATE TRIGGER ' . b2b_backup_ident($name))->fetch(PDO::FETCH_ASSOC);
        $sql = (string) ($row['SQL Original Statement'] ?? '');
        if ($sql !== '') {
            $createTrigger[$name] = b2b_backup_strip_definer($sql);
        }
    }
} catch (Throwable $e) {
    error_log('b2b_db_backup_get tetikleyici atlandı: ' . $e->getMessage());
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
        $created = $pdo->query('SHOW CREATE ' . $type . ' ' . b2b_backup_ident($name))->fetch(PDO::FETCH_ASSOC);
        $sql = (string) ($created['Create Procedure'] ?? $created['Create Function'] ?? '');
        if ($sql !== '') {
            $createRoutine[] = ['type' => $type, 'name' => $name, 'sql' => b2b_backup_strip_definer($sql)];
        }
    }
} catch (Throwable $e) {
    error_log('b2b_db_backup_get rutin atlandı: ' . $e->getMessage());
}

b2b_audit_set_entity($dbName, 'system');
b2b_audit_append_meta([
    'backup' => [
        'database' => $dbName,
        'tables' => count($tables),
        'views' => count($viewNames),
    ],
]);
// Çıktı akmaya başlamadan önce denetim kaydını yaz (sonrasında JSON dönemeyiz).
b2b_audit_finalize(200, ['ok' => true]);

$fileName = 'db_' . preg_replace('/[^A-Za-z0-9_-]/', '_', $dbName) . '_' . date('Y-m-d_His') . '.sql';

while (ob_get_level() > 0) {
    ob_end_clean();
}
@ini_set('zlib.output_compression', '0');
@set_time_limit(0);
@ini_set('max_execution_time', '0');

header('Content-Type: application/sql; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $fileName . '"');
header('Content-Transfer-Encoding: binary');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
header('Access-Control-Expose-Headers: Content-Disposition');
header('Vary: Accept-Encoding');

/*
 * Gzip: 25 MB'lık döküm ~3 MB'a iner. Transfer süresi kısaldığı için
 * yavaş bağlantılarda zaman aşımına takılma riski pratikte ortadan kalkar.
 * Tarayıcı aktarım katmanında açar; kullanıcı yine düz .sql dosyası indirir.
 */
$GLOBALS['b2b_backup_gzip'] = ['ctx' => null, 'done' => false];
$acceptEncoding = strtolower((string) ($_SERVER['HTTP_ACCEPT_ENCODING'] ?? ''));
if (function_exists('deflate_init') && str_contains($acceptEncoding, 'gzip')) {
    $deflateCtx = deflate_init(ZLIB_ENCODING_GZIP, ['level' => 6]);
    if ($deflateCtx !== false) {
        $GLOBALS['b2b_backup_gzip']['ctx'] = $deflateCtx;
        header('Content-Encoding: gzip');
    }
}

$startedTransaction = false;

try {
    /*
     * TIMESTAMP kolonları oturum saat dilimine göre dönüştürülür. Dosyaya
     * "SET time_zone = '+00:00'" yazdığımız için değerleri de UTC olarak
     * okumalıyız; aksi halde geri yüklemede saat kayması olur.
     */
    $pdo->exec("SET time_zone = '+00:00'");

    // Yavaş istemcilerde bağlantının düşmemesi için (parçalı okuma ile birlikte emniyet payı).
    try {
        $pdo->exec('SET SESSION net_write_timeout = 600, SESSION net_read_timeout = 600');
    } catch (Throwable $e) {
        error_log('b2b_db_backup_get net timeout ayarlanamadı: ' . $e->getMessage());
    }

    // Tutarlı anlık görüntü: yalnızca okuma yapar, veriyi değiştirmez.
    $pdo->exec('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    $pdo->exec('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    $startedTransaction = true;

    b2b_backup_emit("-- B2B veritabanı yedeği\n");
    b2b_backup_emit('-- Veritabanı: ' . $dbName . "\n");
    b2b_backup_emit('-- Oluşturma: ' . date('Y-m-d H:i:s') . "\n");
    b2b_backup_emit("-- Kaynak: b2b_db_backup_get (salt-okunur döküm, sunucuda dosya tutulmaz)\n\n");
    b2b_backup_emit("SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n");
    b2b_backup_emit("SET time_zone = '+00:00';\n");
    b2b_backup_emit("SET NAMES utf8mb4;\n");
    b2b_backup_emit("SET FOREIGN_KEY_CHECKS = 0;\n");
    b2b_backup_emit("SET UNIQUE_CHECKS = 0;\n");

    // Görünümler tablolara bağımlı olabilir; önce tüm tablo yapısı + verisi yazılır.
    foreach ($tables as $table) {
        $quoted = b2b_backup_ident($table);
        b2b_backup_emit("\n-- ----------------------------------------------------------\n");
        b2b_backup_emit('-- Tablo yapısı: ' . $table . "\n");
        b2b_backup_emit("-- ----------------------------------------------------------\n");
        b2b_backup_emit('DROP TABLE IF EXISTS ' . $quoted . ";\n");
        b2b_backup_emit($createTable[$table] . ";\n");

        $columns = $insertColumns[$table] ?? [];
        if ($columns === []) {
            continue;
        }

        $columnSql = implode(', ', array_map('b2b_backup_ident', $columns));
        $prefix = 'INSERT INTO ' . $quoted . ' (' . $columnSql . ") VALUES\n";
        b2b_backup_emit('-- Tablo verisi: ' . $table . "\n");

        /*
         * Veri, açık bir sonuç kümesi TUTULMADAN parça parça okunur: her turda
         * satırlar belleğe alınıp imleç hemen kapatılır, sonra çıktı yazılır.
         * Böylece ağ yavaş olduğunda MySQL bağlantısı beklemede kalmaz ve
         * net_write_timeout nedeniyle döküm yarıda kesilmez.
         */
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
                    $sql .= ' WHERE ' . b2b_backup_ident($keysetCol) . ' > :lastKey';
                }
                $sql .= ' ORDER BY ' . b2b_backup_ident($keysetCol) . ' ASC LIMIT ' . B2B_BACKUP_CHUNK_ROWS;
                $stmt = $pdo->prepare($sql);
                if ($lastKey !== null) {
                    $stmt->bindValue(':lastKey', $lastKey);
                }
                $stmt->execute();
            } else {
                // Tek kolonlu birincil anahtar yok: anlık görüntü içinde OFFSET ile ilerlenir.
                $stmt = $pdo->query(
                    'SELECT ' . $columnSql . ' FROM ' . $quoted
                    . ' LIMIT ' . B2B_BACKUP_CHUNK_ROWS . ' OFFSET ' . $offset,
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
                    $values[] = b2b_backup_value($pdo, $value);
                }
                $line = '(' . implode(',', $values) . ')';
                $chunk .= $chunk === '' ? $prefix . $line : ",\n" . $line;
                $rowCount++;
                if (strlen($chunk) >= 500000) {
                    b2b_backup_emit($chunk . ";\n");
                    $chunk = '';
                }
            }

            if ($keysetCol !== null) {
                $lastKey = $batch[count($batch) - 1][$keysetIndex];
            } else {
                $offset += count($batch);
            }
            $done = count($batch) < B2B_BACKUP_CHUNK_ROWS;
            unset($batch);
            if ($done) {
                break;
            }
        }

        if ($chunk !== '') {
            b2b_backup_emit($chunk . ";\n");
        }
        b2b_backup_emit('-- ' . $table . ': ' . $rowCount . " satır\n");
    }

    foreach ($viewNames as $view) {
        if (($createView[$view] ?? '') === '') {
            continue;
        }
        b2b_backup_emit("\n-- Görünüm: " . $view . "\n");
        b2b_backup_emit('DROP VIEW IF EXISTS ' . b2b_backup_ident($view) . ";\n");
        b2b_backup_emit($createView[$view] . ";\n");
    }

    foreach ($createTrigger as $name => $sql) {
        b2b_backup_emit("\n-- Tetikleyici: " . $name . "\n");
        b2b_backup_emit('DROP TRIGGER IF EXISTS ' . b2b_backup_ident($name) . ";\n");
        b2b_backup_emit("DELIMITER ;;\n" . $sql . ";;\nDELIMITER ;\n");
    }

    foreach ($createRoutine as $routine) {
        b2b_backup_emit("\n-- " . $routine['type'] . ': ' . $routine['name'] . "\n");
        b2b_backup_emit('DROP ' . $routine['type'] . ' IF EXISTS ' . b2b_backup_ident($routine['name']) . ";\n");
        b2b_backup_emit("DELIMITER ;;\n" . $routine['sql'] . ";;\nDELIMITER ;\n");
    }

    b2b_backup_emit("\nSET FOREIGN_KEY_CHECKS = 1;\n");
    b2b_backup_emit("SET UNIQUE_CHECKS = 1;\n");

    // Tamamlandı işareti son satır olmalı; bu yüzden COMMIT ondan önce yapılır.
    $pdo->exec('COMMIT');
    $startedTransaction = false;

    b2b_backup_emit('-- Döküm tamamlandı: ' . date('Y-m-d H:i:s') . "\n", true);
} catch (Throwable $e) {
    error_log('b2b_db_backup_get döküm hatası: ' . $e->getMessage());
    // Başlıklar gönderildiği için JSON dönemeyiz; dosya sonuna açık bir hata notu bırakılır.
    b2b_backup_emit("\n-- HATA: Döküm tamamlanmadı: " . str_replace(["\r", "\n"], ' ', $e->getMessage()) . "\n", true);
    if ($startedTransaction) {
        try {
            $pdo->exec('ROLLBACK');
        } catch (Throwable) {
            // yoksay
        }
    }
}

exit;
