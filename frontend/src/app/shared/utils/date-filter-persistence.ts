/**
 * Liste sayfalarındaki tarih filtrelerinin kalıcılığı (localStorage).
 *
 * Davranış:
 * - Kullanıcı tarih seçip uygulayınca aralık kaydedilir; sayfadan çıkıp
 *   dönünce (veya geri gidince) aynı aralık geri gelir.
 * - İki tarih de boşsa kayıt SİLİNİR → bir sonraki girişte sayfanın
 *   varsayılan aralığı (ör. son 7 gün) yeniden uygulanır. Böylece varsayılan
 *   hiçbir zaman sabit tarih olarak kaydedilmez, her gün güncel kalır.
 * - localStorage kullanılamıyorsa (gizli pencere vb.) sessizce devam edilir;
 *   filtreler yalnızca o oturum için çalışır.
 */

export interface DateRange {
  from: string;
  to: string;
}

/** Sayfa başına localStorage anahtarları (b2b_ öneki proje genelindeki kuralla uyumlu). */
export const DATE_FILTER_KEYS = {
  orders: 'b2b_orders_date_filter',
  invoices: 'b2b_invoices_date_filter',
  ledger: 'b2b_ledger_date_filter',
  audit: 'b2b_audit_date_filter',
} as const;

/** Yerel saat dilimine göre YYYY-MM-DD (toISOString UTC kaymasına uğrar, kullanma). */
export function toLocalDateString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Bugün dahil, `daysBack` gün geriye giden aralık (daysBack=1 → dün+bugün). */
export function defaultDateRange(daysBack: number): DateRange {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - daysBack);
  return { from: toLocalDateString(from), to: toLocalDateString(to) };
}

export function readStoredDateRange(storageKey: string): DateRange | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<DateRange>;
    const from = typeof parsed.from === 'string' ? parsed.from : '';
    const to = typeof parsed.to === 'string' ? parsed.to : '';
    if (from === '' && to === '') {
      return null;
    }
    return { from, to };
  } catch {
    return null;
  }
}

/**
 * Aralığı kaydeder; iki tarih de boşsa kaydı siler (varsayılana dönüş).
 *
 * `defaultDaysBack` verilirse ve aralık o günün varsayılanına eşitse kayıt
 * yine silinir: varsayılan hiçbir zaman sabit tarih olarak donup kalmaz,
 * ertesi gün girişte güncel "son N gün" uygulanır.
 */
export function storeDateRange(
  storageKey: string,
  from: string,
  to: string,
  defaultDaysBack?: number,
): void {
  try {
    const f = from.trim();
    const t = to.trim();
    if (f === '' && t === '') {
      localStorage.removeItem(storageKey);
      return;
    }
    if (defaultDaysBack !== undefined) {
      const d = defaultDateRange(defaultDaysBack);
      if (f === d.from && t === d.to) {
        localStorage.removeItem(storageKey);
        return;
      }
    }
    localStorage.setItem(storageKey, JSON.stringify({ from: f, to: t }));
  } catch {
    // localStorage yoksa filtre yine çalışır, sadece kalıcı olmaz.
  }
}

/** Kayıtlı aralık varsa onu, yoksa sayfanın varsayılanını döndürür. */
export function initialDateRange(storageKey: string, defaultDaysBack: number): DateRange {
  return readStoredDateRange(storageKey) ?? defaultDateRange(defaultDaysBack);
}
