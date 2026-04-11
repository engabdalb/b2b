import { Injectable, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  InvoiceFromOrderResponse,
  OrderCreatePayload,
  OrderCreateResponse,
  OrderDto,
  OrderLineDto,
  OrderUpdatePayload,
} from '../../core/models/api.types';
import { ApiService } from '../../core/services/api.service';

function enrichLine(l: OrderLineDto): OrderLineDto {
  const vatAmount =
    l.vatAmount ??
    (l.vatRate != null && l.vatRate > 0 ? Math.round(l.lineTotal * (l.vatRate / 100) * 100) / 100 : 0);
  const lineTotalIncVat =
    l.lineTotalIncVat ?? Math.round((l.lineTotal + vatAmount) * 100) / 100;
  return { ...l, vatAmount, lineTotalIncVat };
}

/** Satır ve sipariş toplamlarını satırlardan türetir; API’den gelen vat_total / total_inc_vat önceliklidir. */
function withTotals(orders: OrderDto[]): OrderDto[] {
  return orders.map((o) => {
    const lines = o.lines.map(enrichLine);
    const total = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    const vatFromLines = Math.round(lines.reduce((s, l) => s + l.vatAmount, 0) * 100) / 100;
    const incFromLines = Math.round(lines.reduce((s, l) => s + l.lineTotalIncVat, 0) * 100) / 100;
    return {
      ...o,
      lines,
      total,
      vatTotal: o.vatTotal != null ? o.vatTotal : vatFromLines,
      totalIncVat: o.totalIncVat != null ? o.totalIncVat : incFromLines,
    };
  });
}

interface OrdersApiResponse {
  ok: boolean;
  items?: OrderDto[];
}

/** Sunucu sorgusu — GET query parametreleri */
export interface OrdersListFilters {
  dateFrom?: string;
  dateTo?: string;
  dealerId?: string;
  status?: OrderDto['status'];
  /** Aktif fatura (bekleyen veya onaylı) var / yok */
  invoice?: 'with' | 'without';
  search?: string;
}

function serializeOrdersFilters(f: OrdersListFilters): Record<string, string> {
  const q: Record<string, string> = {};
  const df = f.dateFrom?.trim();
  const dt = f.dateTo?.trim();
  const did = f.dealerId?.trim();
  const sq = f.search?.trim();
  if (df) {
    q['date_from'] = df;
  }
  if (dt) {
    q['date_to'] = dt;
  }
  if (did) {
    q['dealer_id'] = did;
  }
  if (f.status) {
    q['status'] = f.status;
  }
  if (f.invoice === 'with' || f.invoice === 'without') {
    q['invoice'] = f.invoice;
  }
  if (sq) {
    q['q'] = sq;
  }
  return q;
}

@Injectable({ providedIn: 'root' })
export class OrdersMockService {
  private readonly api = inject(ApiService);

  readonly orders = signal<OrderDto[]>([]);

  /** Son `load` ile API’ye giden filtreler (liste ile uyumlu; Excel özeti için). */
  readonly lastLoadFilters = signal<OrdersListFilters>({});

  private lastFilters: OrdersListFilters = {};

  private hasApi(): boolean {
    return !!environment.apiUrl?.trim();
  }

  /**
   * Filtreleri günceller ve listeyi yeniden yükler.
   * Argümansız: son filtrelerle yenile. `null`: filtreleri sıfırla.
   */
  load(filters?: Partial<OrdersListFilters> | null): void {
    if (filters === null) {
      this.lastFilters = {};
    } else if (filters !== undefined) {
      this.lastFilters = { ...filters };
    }
    if (!this.hasApi()) {
      this.orders.set([]);
      this.lastLoadFilters.set({});
      return;
    }
    this.lastLoadFilters.set({ ...this.lastFilters });
    this.api.get<OrdersApiResponse>('b2b_orders_get', serializeOrdersFilters(this.lastFilters)).subscribe({
      next: (r) => this.orders.set(withTotals(r.items ?? [])),
      error: () => this.orders.set([]),
    });
  }

  create(payload: OrderCreatePayload): Observable<OrderCreateResponse> {
    if (!this.hasApi()) {
      return of({ ok: false, error: 'no_api', message: 'API adresi tanımlı değil.' });
    }
    return this.api.post<OrderCreateResponse>('b2b_order_create', payload).pipe(
      tap((r) => {
        if (r.ok && r.item) {
          this.orders.update((list) => withTotals([r.item!, ...list]));
        }
      }),
    );
  }

  update(payload: OrderUpdatePayload): Observable<OrderCreateResponse> {
    if (!this.hasApi()) {
      return of({ ok: false, error: 'no_api', message: 'API adresi tanımlı değil.' });
    }
    return this.api.post<OrderCreateResponse>('b2b_order_update', payload).pipe(
      tap((r) => {
        if (r.ok && r.item) {
          const updated = withTotals([r.item!])[0];
          this.orders.update((list) => {
            const idx = list.findIndex((x) => x.id === updated.id);
            if (idx < 0) {
              return list;
            }
            const next = [...list];
            next[idx] = updated;
            return next;
          });
        }
      }),
    );
  }

  /** Sipariş anındaki kalemleri b2b_invoices’a kopyalar; yalnız süper admin API’si. */
  invoiceFromOrder(orderId: string): Observable<InvoiceFromOrderResponse> {
    if (!this.hasApi()) {
      return of({ ok: false, error: 'no_api', message: 'API adresi tanımlı değil.' });
    }
    return this.api.post<InvoiceFromOrderResponse>('b2b_order_invoice_create', { order_id: orderId }).pipe(
      tap((r) => {
        if (r.ok) {
          this.load();
        }
      }),
    );
  }
}
