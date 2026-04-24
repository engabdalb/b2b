import * as XLSX from 'xlsx';
import type { OrderDto, OrderLineDto } from '../../core/models/api.types';

export interface OrdersXlsxColumnLabels {
  sheetFilters: string;
  sheetOrders: string;
  sheetLines: string;
  /** Tarih, bayi, ürün, birim, miktar — sade özet sayfa */
  sheetSimple: string;
  filterKey: string;
  filterValue: string;
  orderId: string;
  dealer: string;
  linesCount: string;
  totalExVat: string;
  vatTotal: string;
  totalIncVat: string;
  date: string;
  status: string;
  invoiceId: string;
  invoiceStatus: string;
  /** Yalnızca «Siparişler» özet sayfasında */
  orderDescription: string;
  product: string;
  sku: string;
  unit: string;
  qty: string;
  unitPrice: string;
  lineTotal: string;
  vatPct: string;
  vatAmount: string;
  lineTotalIncVat: string;
  discount: string;
  /** Miktar sütunu (adet, kg vb.) */
  simpleQty: string;
  /** Bayi başlıklı defter görünümü (kağıt sipariş defteri benzeri) */
  sheetOrderBook: string;
  /** Ürün + birim bazında sade toplam miktar (tek sayfa) */
  sheetProductTotals: string;
  productTotalsProduct: string;
  productTotalsUnit: string;
  productTotalsTotalQty: string;
}

export interface OrdersXlsxContext {
  filterRows: [string, string][];
  labels: OrdersXlsxColumnLabels;
  orderStatus: (o: OrderDto) => string;
  invoiceStatus: (inv: NonNullable<OrderDto['invoiceStatus']>) => string;
  unitLabel: (line: OrderLineDto) => string;
}

function truncateSheetName(name: string): string {
  return name.slice(0, 31);
}

type OrderBookLine = { productName: string; sku: string; unitLabel: string; qty: number };

/** Bayi → ürün+birim anahtarına göre adet toplama (aynı bayide çok sipariş birleşir) + açıklama notları. */
function aggregateOrderBookRows(
  orders: OrderDto[],
  unitLabel: (line: OrderLineDto) => string,
): Map<string, { lines: OrderBookLine[]; orderNote: string }> {
  const byDealer = new Map<string, Map<string, OrderBookLine>>();
  const notesByDealer = new Map<string, Set<string>>();

  for (const o of orders) {
    const dealer = o.dealerName;
    const t = (o.description ?? '').trim();
    if (t) {
      if (!notesByDealer.has(dealer)) {
        notesByDealer.set(dealer, new Set());
      }
      notesByDealer.get(dealer)!.add(t);
    }
    if (!byDealer.has(dealer)) {
      byDealer.set(dealer, new Map());
    }
    const m = byDealer.get(dealer)!;
    for (const ln of o.lines) {
      const key = `${ln.productId}\t${(ln.unitCode ?? '').trim()}`;
      const ul = unitLabel(ln);
      const prev = m.get(key);
      const q = (prev?.qty ?? 0) + ln.quantity;
      m.set(key, {
        productName: ln.name,
        sku: ln.sku,
        unitLabel: ul,
        qty: q,
      });
    }
  }

  const sorted = new Map<string, { lines: OrderBookLine[]; orderNote: string }>();
  const dealerNames = [...byDealer.keys()].sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }));
  for (const d of dealerNames) {
    const lines = [...byDealer.get(d)!.values()].sort((a, b) =>
      a.productName.localeCompare(b.productName, 'tr', { sensitivity: 'base' }),
    );
    const set = notesByDealer.get(d);
    const orderNote = set ? [...set].sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' })).join(' · ') : '';
    sorted.set(d, { lines, orderNote });
  }
  return sorted;
}

/**
 * Şube defteri: 1. satırda (A1:C1, D1:F1, …) birleşik bayi adı; 2. satırda aynı bloklarda birleşik açıklama;
 * altta ürün | miktar | birim.
 */
function buildOrderBookHorizontalAoa(
  orders: OrderDto[],
  unitLabel: (line: OrderLineDto) => string,
): (string | number)[][] {
  const byDealer = aggregateOrderBookRows(orders, unitLabel);
  const dealers = [...byDealer.keys()];
  if (dealers.length === 0) {
    return [['']];
  }
  const maxLen = Math.max(0, ...dealers.map((d) => byDealer.get(d)!.lines.length));
  const colsPerDealer = 3;
  const totalCols = dealers.length * colsPerDealer;
  const rows: (string | number)[][] = [];

  const headerRow: (string | number)[] = Array(totalCols).fill('');
  for (let d = 0; d < dealers.length; d++) {
    headerRow[d * colsPerDealer] = dealers[d];
  }
  rows.push(headerRow);

  /** Açıklama: her bayi bloğunda başlıkla aynı şekilde ilk sütunda; birleştirme satır 2’de A:C, D:F… (Excel’de 2. satır). */
  const descRow: (string | number)[] = Array(totalCols).fill('');
  for (let d = 0; d < dealers.length; d++) {
    const note = (byDealer.get(dealers[d])!.orderNote ?? '').trim();
    descRow[d * colsPerDealer] = note;
  }
  rows.push(descRow);

  for (let r = 0; r < maxLen; r++) {
    const row: (string | number)[] = Array(totalCols).fill('');
    for (let d = 0; d < dealers.length; d++) {
      const { lines } = byDealer.get(dealers[d])!;
      const line = lines[r];
      if (line) {
        row[d * colsPerDealer] = line.productName;
        row[d * colsPerDealer + 1] = line.qty;
        row[d * colsPerDealer + 2] = line.unitLabel;
      }
    }
    rows.push(row);
  }
  return rows;
}

/** Tüm dışa aktarılan siparişler: ürün + birim → toplam miktar. */
function aggregateAllProductUnitTotals(
  orders: OrderDto[],
  unitLabel: (line: OrderLineDto) => string,
): { productName: string; sku: string; unitLabel: string; totalQty: number }[] {
  const map = new Map<string, { productName: string; sku: string; unitLabel: string; totalQty: number }>();
  for (const o of orders) {
    for (const ln of o.lines) {
      const key = `${ln.productId}\t${(ln.unitCode ?? '').trim()}`;
      const ul = unitLabel(ln);
      const prev = map.get(key);
      const q = (prev?.totalQty ?? 0) + ln.quantity;
      if (prev) {
        prev.totalQty = q;
      } else {
        map.set(key, { productName: ln.name, sku: ln.sku, unitLabel: ul, totalQty: q });
      }
    }
  }
  return [...map.values()].sort((a, b) => {
    const c1 = a.productName.localeCompare(b.productName, 'tr', { sensitivity: 'base' });
    if (c1 !== 0) {
      return c1;
    }
    return a.unitLabel.localeCompare(b.unitLabel, 'tr', { sensitivity: 'base' });
  });
}

/** Filtre özeti + sipariş özeti + kalem detayı + sade liste + bayi bloklu defter sayfası. */
export function downloadOrdersXlsx(orders: OrderDto[], ctx: OrdersXlsxContext, filename: string): void {
  const L = ctx.labels;
  const wb = XLSX.utils.book_new();

  const filterAoa: (string | number)[][] = [[L.filterKey, L.filterValue], ...ctx.filterRows.map(([a, b]) => [a, b])];
  const ws1 = XLSX.utils.aoa_to_sheet(filterAoa);
  XLSX.utils.book_append_sheet(wb, ws1, truncateSheetName(L.sheetFilters));

  const orderHeader = [
    L.orderId,
    L.dealer,
    L.linesCount,
    L.totalExVat,
    L.vatTotal,
    L.totalIncVat,
    L.date,
    L.status,
    L.invoiceId,
    L.invoiceStatus,
    L.orderDescription,
  ];
  const orderAoa: (string | number)[][] = [
    orderHeader,
    ...orders.map((o) => [
      o.id,
      o.dealerName,
      o.lines.length,
      o.total,
      o.vatTotal,
      o.totalIncVat,
      o.createdAt,
      ctx.orderStatus(o),
      o.invoiceId ?? '',
      o.invoiceStatus ? ctx.invoiceStatus(o.invoiceStatus) : '',
      (o.description ?? '').trim() || '',
    ]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(orderAoa);
  XLSX.utils.book_append_sheet(wb, ws2, truncateSheetName(L.sheetOrders));

  const lineHeader = [
    L.orderId,
    L.dealer,
    L.date,
    L.status,
    L.invoiceId,
    L.invoiceStatus,
    L.product,
    L.sku,
    L.unit,
    L.qty,
    L.unitPrice,
    L.lineTotal,
    L.vatPct,
    L.vatAmount,
    L.lineTotalIncVat,
    L.discount,
  ];
  const lineAoa: (string | number)[][] = [lineHeader];
  for (const o of orders) {
    const st = ctx.orderStatus(o);
    const inv = o.invoiceId ?? '';
    const invSt = o.invoiceStatus ? ctx.invoiceStatus(o.invoiceStatus) : '';
    for (const ln of o.lines) {
      lineAoa.push([
        o.id,
        o.dealerName,
        o.createdAt,
        st,
        inv,
        invSt,
        ln.name,
        ln.sku,
        ctx.unitLabel(ln),
        ln.quantity,
        ln.unitPrice,
        ln.lineTotal,
        ln.vatRate != null ? ln.vatRate : '',
        ln.vatAmount,
        ln.lineTotalIncVat,
        ln.discountAmount,
      ]);
    }
  }
  const ws3 = XLSX.utils.aoa_to_sheet(lineAoa);
  XLSX.utils.book_append_sheet(wb, ws3, truncateSheetName(L.sheetLines));

  const simpleHeader = [L.date, L.dealer, L.product, L.unit, L.simpleQty, L.orderDescription];
  const simpleAoa: (string | number)[][] = [simpleHeader];
  for (const o of orders) {
    const orderDesc = (o.description ?? '').trim() || '';
    for (const ln of o.lines) {
      simpleAoa.push([o.createdAt, o.dealerName, ln.name, ctx.unitLabel(ln), ln.quantity, orderDesc]);
    }
  }
  const ws4 = XLSX.utils.aoa_to_sheet(simpleAoa);
  XLSX.utils.book_append_sheet(wb, ws4, truncateSheetName(L.sheetSimple));

  const bookAoa = buildOrderBookHorizontalAoa(orders, ctx.unitLabel);
  const ws5 = XLSX.utils.aoa_to_sheet(bookAoa);
  if (bookAoa.length > 0 && bookAoa[0].length >= 3) {
    const blocks = Math.floor(bookAoa[0].length / 3);
    const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
    for (let d = 0; d < blocks; d++) {
      merges.push({ s: { r: 0, c: d * 3 }, e: { r: 0, c: d * 3 + 2 } });
      merges.push({ s: { r: 1, c: d * 3 }, e: { r: 1, c: d * 3 + 2 } });
    }
    ws5['!merges'] = merges;
  }
  XLSX.utils.book_append_sheet(wb, ws5, truncateSheetName(L.sheetOrderBook));

  const totals = aggregateAllProductUnitTotals(orders, ctx.unitLabel);
  const totalsAoa: (string | number)[][] = [
    [L.productTotalsProduct, L.productTotalsUnit, L.productTotalsTotalQty],
    ...totals.map((r) => [r.productName, r.unitLabel, r.totalQty]),
  ];
  const ws6 = XLSX.utils.aoa_to_sheet(totalsAoa);
  XLSX.utils.book_append_sheet(wb, ws6, truncateSheetName(L.sheetProductTotals));

  XLSX.writeFile(wb, filename);
}
