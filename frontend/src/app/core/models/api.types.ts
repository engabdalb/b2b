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

export interface ProductDto {
  id: string;
  sku: string;
  name: string;
  unitId: string;
  /** API: kısa kod (ör. tepsi, kg) */
  unitCode?: string;
  /** Görünen birim adı */
  unit: string;
  price: number;
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
