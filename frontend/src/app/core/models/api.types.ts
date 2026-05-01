/** İleride PHP yanıtlarıyla hizalanacak ortak tipler */

export interface ListResult<T> {
  items: T[];
  total: number;
}

export interface DealerDto {
  id: string;
  name: string;
  region: string;
  /** Serbest metin (bağlantılı il/ilçe tablosu yok) */
  il: string;
  ilce: string;
  konum: string;
  telefon: string;
  active: boolean;
}

export interface UnitDto {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

/** Bayi birim indirim satırı (API: tüm aktif birimler, indirim 0 olabilir) */
export interface DealerUnitDiscountRowDto {
  unitId: string;
  unitCode: string;
  unitName: string;
  sortOrder: number;
  discountPerUnit: number;
}

export interface ProductDto {
  id: string;
  sku: string;
  name: string;
  /** Siparişe çıkarılabilir mi (pasif ürün yeni sipariş satırına eklenemez). API’da yoksa aktif kabul edilir. */
  active?: boolean;
  unitId: string;
  /** API: kısa kod (ör. tepsi, kg) */
  unitCode?: string;
  /** Görünen birim adı */
  unit: string;
  /** Liste fiyatı (satış birimi başına) */
  price: number;
  /** Bayi + ürünün birim türü için tanımlı indirim / birim (TRY) */
  dealerDiscountPerUnit?: number;
  /** İndirim sonrası birim fiyat (önizleme) */
  effectiveUnitPrice?: number;
  /** İade edilebilir ambalaj türü (ürün başına; NULL = ambalaj borcu yok) */
  returnablePackagingTypeId?: string | null;
  returnablePackagingUnitsPerQty?: number;
  returnablePackagingTypeCode?: string | null;
  returnablePackagingTypeName?: string | null;
}

export interface ReturnablePackagingTypeDto {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface ReturnablePackagingBalanceDto {
  dealerId: string;
  dealerName: string;
  typeId: string;
  typeCode: string;
  typeName: string;
  quantity: number;
}

export interface ReturnablePackagingMovementDto {
  id: string;
  dealerId: string;
  dealerName: string;
  typeId: string;
  typeCode: string;
  typeName: string;
  quantityDelta: number;
  reason: string;
  referenceOrderId: string | null;
  referenceOrderExternalId: string | null;
  note: string | null;
  createdAt: string;
}

export interface AuditLogDto {
  id: string;
  actorUserId: string | null;
  actorRole: string;
  actorDealerId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  meta: Record<string, unknown>;
  requestId: string;
  ipAddress: string;
  userAgent: string;
  deviceType: string;
  appVersion: string;
  platform: string;
  createdAt: string;
}

/** Sipariş satırı — fiyatlar sipariş anına sabitlenir; matrah line_total, KDV tutarı ayrı saklanır. */
export interface OrderLineDto {
  id: string;
  productId: string;
  sku: string;
  name: string;
  /** Birim kodu (i18n: units.name.{unitCode}) */
  unitCode?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  /** KDV hariç satır tutarı (matrah) */
  lineTotal: number;
  vatRate: number | null;
  /** Satır KDV tutarı (TRY) */
  vatAmount: number;
  /** KDV dahil satır toplamı */
  lineTotalIncVat: number;
  discountAmount: number;
}

export interface OrderDto {
  id: string;
  dealerId?: string;
  dealerName: string;
  status: 'pending' | 'confirmed' | 'shipped' | 'cancelled';
  /** Matrah toplamı (KDV hariç) */
  total: number;
  /** Sipariş KDV toplamı */
  vatTotal: number;
  /** Vergili genel toplam */
  totalIncVat: number;
  createdAt: string;
  /** Serbest metin sipariş açıklaması */
  description?: string | null;
  lines: OrderLineDto[];
  /** Aktif fatura (beklemede veya onaylı) yoksa null */
  invoiceId?: string | null;
  invoiceStatus?: 'pending' | 'approved' | null;
}

/** Fatura kalemi sipariş satırı ile aynı alan yapısını kullanır (anlık kopya). */
export type InvoiceLineDto = OrderLineDto;

export interface InvoiceDto {
  id: string;
  orderId: string;
  dealerName: string;
  status: 'pending' | 'approved' | 'cancelled';
  total: number;
  vatTotal: number;
  totalIncVat: number;
  invoiceDate: string;
  createdAt: string;
  lines: InvoiceLineDto[];
}

export interface InvoiceFromOrderResponse {
  ok: boolean;
  item?: InvoiceDto;
  error?: string;
  message?: string;
}

export interface InvoiceSetStatusPayload {
  invoice_id: string;
  status: 'approved' | 'cancelled';
}

export interface OrderCreatePayload {
  dealer_id?: string;
  /** İsteğe bağlı; en fazla 2000 karakter */
  description?: string;
  lines: { product_id: string; quantity: number; discount_amount?: number; vat_rate?: number | null }[];
}

export interface OrderCreateResponse {
  ok: boolean;
  item?: OrderDto;
  error?: string;
  message?: string;
}

export interface OrderUpdatePayload {
  order_id: string;
  status: OrderDto['status'];
  /** Süper admin düzenlemede isteğe bağlı */
  description?: string;
  lines: {
    product_id: string;
    quantity: number;
    discount_amount?: number;
    vat_rate?: number | null;
  }[];
}

/** Cari ekstre satırı (kronolojik; bakiye kümülatif) */
export interface AccountMovementRowDto {
  id: string;
  dealerId: string;
  movementAt: string;
  kind: 'invoice' | 'payment' | 'invoice_cancel' | 'adjustment';
  description: string;
  /** Kesilen / borç artışı */
  debit: number;
  /** Ödeme veya mahsup (borç azalışı) */
  credit: number;
  /** Bu satırdan sonra kalan borç */
  balance: number;
  invoiceId?: string | null;
  /** Tahsilat satırı: b2b_payments.id */
  paymentId?: string | null;
  paymentNote?: string | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
}

export interface AccountMovementsApiResponse {
  ok: boolean;
  items?: AccountMovementRowDto[];
  total?: number;
  closingBalance?: number;
  error?: string;
  message?: string;
}

export interface PaymentPostResponse {
  ok: boolean;
  paymentId?: string;
  error?: string;
  message?: string;
}

export interface PaymentUpdateResponse {
  ok: boolean;
  error?: string;
  message?: string;
}

export interface AccountAdjustmentPostResponse {
  ok: boolean;
  movementId?: string;
  error?: string;
  message?: string;
}

export interface UserListDto {
  id: string;
  name: string;
  email: string;
  /** API: super_admin | dealer | viewer (yoksa roleKey üzerinden çıkarılır) */
  role?: 'super_admin' | 'dealer' | 'viewer';
  roleKey: string;
  active: boolean;
  dealerId?: string | null;
}

export interface ReportsTrayBalanceDto {
  dealerId: string;
  dealerName: string;
  trayBalance: number;
}

export interface ReportsDealerDebtDto {
  dealerId: string;
  dealerName: string;
  balanceDue: number;
}

export interface ReportsPaymentSummaryDto {
  method: 'bank_transfer' | 'credit_card' | 'check' | 'cash' | 'other' | string;
  paymentCount: number;
  totalAmount: number;
}

export interface ReportsRecentPaymentDto {
  id: string;
  dealerId: string;
  dealerName: string;
  amount: number;
  method: 'bank_transfer' | 'credit_card' | 'check' | 'cash' | 'other' | string;
  reference: string;
  note?: string | null;
  paidAt: string;
}

export interface ReportsTopProductDto {
  productId: string;
  sku: string;
  productName: string;
  unitName: string;
  totalQuantity: number;
  totalRevenue: number;
}

export interface ReportsTopDealerDto {
  dealerId: string;
  dealerName: string;
  approvedInvoiceCount: number;
  totalRevenue: number;
}

/** Dönem içi siparişlerde ürün bazında toplam miktar ve sipariş adedi */
export interface ReportsProductOrderTotalDto {
  productId: string;
  sku: string;
  productName: string;
  unitName: string;
  totalQuantity: number;
  /** Ürünün satır olarak geçtiği farklı sipariş sayısı */
  orderCount: number;
}

export interface ReportsOverviewApiResponse {
  ok: boolean;
  summary?: {
    totalDebt: number;
    totalTrayBalance: number;
    totalPaymentAmount: number;
    dealerDebtCount: number;
  };
  dateRange?: {
    dateFrom: string;
    dateTo: string;
  };
  trayBalances?: ReportsTrayBalanceDto[];
  dealerDebts?: ReportsDealerDebtDto[];
  paymentSummary?: ReportsPaymentSummaryDto[];
  recentPayments?: ReportsRecentPaymentDto[];
  topProducts?: ReportsTopProductDto[];
  topDealers?: ReportsTopDealerDto[];
  productOrderTotals?: ReportsProductOrderTotalDto[];
  error?: string;
  message?: string;
}
