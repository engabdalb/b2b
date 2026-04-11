import { Injectable, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
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

@Injectable({ providedIn: 'root' })
export class InvoicesMockService {
  private readonly api = inject(ApiService);

  readonly invoices = signal<InvoiceDto[]>([]);

  private hasApi(): boolean {
    return !!environment.apiUrl?.trim();
  }

  load(): void {
    if (!this.hasApi()) {
      this.invoices.set([]);
      return;
    }
    this.api.get<InvoicesApiResponse>('b2b_invoices_get').subscribe({
      next: (r) => this.invoices.set(withInvoiceTotals(r.items ?? [])),
      error: () => this.invoices.set([]),
    });
  }

  setStatus(payload: InvoiceSetStatusPayload): Observable<InvoiceFromOrderResponse> {
    if (!this.hasApi()) {
      return of({ ok: false, error: 'no_api', message: 'API adresi tanımlı değil.' });
    }
    return this.api.post<InvoiceFromOrderResponse>('b2b_invoice_set_status', payload).pipe(
      tap((r) => {
        if (r.ok) {
          this.load();
        }
      }),
    );
  }
}
