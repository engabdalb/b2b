import { Injectable, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  InvoiceDto,
  InvoiceFromOrderResponse,
  InvoiceLineDto,
  InvoiceSetStatusPayload,
  OrderLineDto,
} from '../../core/models/api.types';
import { ApiService } from '../../core/services/api.service';

function enrichLine(l: OrderLineDto): InvoiceLineDto {
  const vatAmount =
    l.vatAmount ??
    (l.vatRate != null && l.vatRate > 0 ? Math.round(l.lineTotal * (l.vatRate / 100) * 100) / 100 : 0);
  const lineTotalIncVat =
    l.lineTotalIncVat ?? Math.round((l.lineTotal + vatAmount) * 100) / 100;
  return { ...l, vatAmount, lineTotalIncVat };
}

function withInvoiceTotals(items: InvoiceDto[]): InvoiceDto[] {
  return items.map((inv) => {
    const lines = inv.lines.map(enrichLine);
    const total = Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    const vatFromLines = Math.round(lines.reduce((s, l) => s + l.vatAmount, 0) * 100) / 100;
    const incFromLines = Math.round(lines.reduce((s, l) => s + l.lineTotalIncVat, 0) * 100) / 100;
    return {
      ...inv,
      lines,
      total: inv.total != null ? inv.total : total,
      vatTotal: inv.vatTotal != null ? inv.vatTotal : vatFromLines,
      totalIncVat: inv.totalIncVat != null ? inv.totalIncVat : incFromLines,
    };
  });
}

interface InvoicesApiResponse {
  ok: boolean;
  items?: InvoiceDto[];
}

export interface InvoicesListFilters {
  dateFrom?: string;
  dateTo?: string;
  dealerId?: string;
  status?: InvoiceDto['status'];
  search?: string;
}

function serializeInvoicesFilters(f: InvoicesListFilters): Record<string, string> {
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
  if (sq) {
    q['q'] = sq;
  }
  return q;
}

@Injectable({ providedIn: 'root' })
export class InvoicesMockService {
  private readonly api = inject(ApiService);

  readonly invoices = signal<InvoiceDto[]>([]);

  private lastFilters: InvoicesListFilters = {};

  private hasApi(): boolean {
    return !!environment.apiUrl?.trim();
  }

  /**
   * Fatura listesini yükler; Observable tamamlanınca `invoices` sinyali güncellenmiş olur.
   */
  load(filters?: Partial<InvoicesListFilters> | null): Observable<InvoiceDto[]> {
    if (filters === null) {
      this.lastFilters = {};
    } else if (filters !== undefined) {
      this.lastFilters = { ...filters };
    }
    if (!this.hasApi()) {
      this.invoices.set([]);
      return of([]);
    }
    return this.api.get<InvoicesApiResponse>('b2b_invoices_get', serializeInvoicesFilters(this.lastFilters)).pipe(
      map((r) => withInvoiceTotals(r.items ?? [])),
      tap((items) => this.invoices.set(items)),
      catchError(() => {
        this.invoices.set([]);
        return of([]);
      }),
    );
  }

  setStatus(payload: InvoiceSetStatusPayload): Observable<InvoiceFromOrderResponse> {
    if (!this.hasApi()) {
      return of({ ok: false, error: 'no_api', message: 'API adresi tanımlı değil.' });
    }
    return this.api.post<InvoiceFromOrderResponse>('b2b_invoice_set_status', payload).pipe(
      tap((r) => {
        if (r.ok) {
          this.load().subscribe();
        }
      }),
    );
  }
}
