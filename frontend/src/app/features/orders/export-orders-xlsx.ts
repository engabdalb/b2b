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

/** Bayi → ürün+birim anahtarına göre adet toplama (aynı bayide çok sipariş birleşir). */
function aggregateOrderBookRows(
  orders: OrderDto[],
  unitLabel: (line: OrderLineDto) => string,
): Map<string, { productName: string; sku: string; unitLabel: string; qty: number }[]> {
  const byDealer = new Map<
    string,
    Map<string, { productName: string; sku: string; unitLabel: string; qty: number }>
  >();

  for (const o of orders) {
    const dealer = o.dealerName;
    if (!byDealer.has(dealer)) {
      byDealer.set(dealer, new Map());
    }
    const m = byDealer.get(dealer)!;
    for (const ln of o.lines) {
      const key = `${ln.productId}\t${(ln.unitCode ?? '').trim()}`;
      const ul = unitLabel(ln);
      const prev = m.get(key);
      const qty = (prev?.qty ?? 0) + ln.quantity;
      m.set(key, {
        productName: ln.name,
        sku: ln.sku,
        unitLabel: ul,
        qty,
      });
    }
  }

  const sorted = new Map<string, { productName: string; sku: string; unitLabel: string; qty: number }[]>();
  const dealerNames = [...byDealer.keys()].sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }));
  for (const d of dealerNames) {
    const rows = [...byDealer.get(d)!.values()].sort((a, b) =>
      a.productName.localeCompare(b.productName, 'tr', { sensitivity: 'base' }),
    );
    sorted.set(d, rows);
  }
  return sorted;
}

/**
 * Şube defteri: satır 1’de her şube 3 sütunluk blokta (A1/D1/G1… şube adı),
 * alt satırlarda ürün | miktar | birim. İkinci şube D1’de (B1 ilk bloğun miktar sütunudur).
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
  const maxLen = Math.max(0, ...dealers.map((d) => byDealer.get(d)!.length));
  const colsPerDealer = 3;
  const totalCols = dealers.length * colsPerDealer;
  const rows: (string | number)[][] = [];

  const headerRow: (string | number)[] = Array(totalCols).fill('');
  for (let d = 0; d < dealers.length; d++) {
    headerRow[d * colsPerDealer] = dealers[d];
  }
  rows.push(headerRow);

  for (let r = 0; r < maxLen; r++) {
    const row: (string | number)[] = Array(totalCols).fill('');
    for (let d = 0; d < dealers.length; d++) {
      const lines = byDealer.get(dealers[d])!;
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

  const simpleHeader = [L.date, L.dealer, L.product, L.unit, L.simpleQty];
  const simpleAoa: (string | number)[][] = [simpleHeader];
  for (const o of orders) {
    for (const ln of o.lines) {
      simpleAoa.push([o.createdAt, o.dealerName, ln.name, ctx.unitLabel(ln), ln.quantity]);
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
    }
    ws5['!merges'] = merges;
  }
  XLSX.utils.book_append_sheet(wb, ws5, truncateSheetName(L.sheetOrderBook));

  XLSX.writeFile(wb, filename);
}
