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

/** Filtre özeti + sipariş özeti + kalem detayı + sade tarih/bayi/ürün/birim/miktar sayfası. */
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

  XLSX.writeFile(wb, filename);
}
