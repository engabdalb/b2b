import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { InvoiceDto } from '../../core/models/api.types';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { InvoicesMockService } from './invoices-mock.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { UnitNamePipe } from '../../shared/pipes/unit-name.pipe';
@Component({
  selector: 'app-invoices-page',
  standalone: true,
  imports: [PageHeaderComponent, TranslatePipe, UnitNamePipe, DecimalPipe],
  templateUrl: './invoices-page.component.html',
  styleUrl: './invoices-page.component.scss',
})
export class InvoicesPageComponent implements OnInit {
  readonly invoicesData = inject(InvoicesMockService);
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  readonly isSuperAdmin = computed(() => this.auth.user().role === 'super_admin');

  readonly detailOpen = signal<InvoiceDto | null>(null);
  readonly statusBusyId = signal<string | null>(null);
  readonly statusError = signal<string | null>(null);

  ngOnInit(): void {
    this.invoicesData.load();
  }

  openDetail(inv: InvoiceDto): void {
    this.detailOpen.set(inv);
  }

  closeDetail(): void {
    this.detailOpen.set(null);
  }

  setStatus(inv: InvoiceDto, status: 'approved' | 'cancelled'): void {
    if (!this.isSuperAdmin()) {
      return;
    }
    this.statusError.set(null);
    this.statusBusyId.set(inv.id);
    this.invoicesData.setStatus({ invoice_id: inv.id, status }).subscribe({
      next: (r) => {
        this.statusBusyId.set(null);
        if (!r.ok) {
          this.statusError.set(r.message ?? 'invoices.statusError');
          return;
        }
        this.detailOpen.set(null);
      },
      error: (err: { error?: { message?: string } }) => {
        this.statusBusyId.set(null);
        this.statusError.set(err?.error?.message ?? 'invoices.statusError');
      },
    });
  }

  errorText(key: string): string {
    if (key.startsWith('invoices.')) {
      return this.i18n.translate(key);
    }
    return key;
  }

  hasLineDiscount(inv: InvoiceDto): boolean {
    return inv.lines.some((l) => l.discountAmount > 0);
  }

  canApproveInvoice(inv: InvoiceDto): boolean {
    return inv.status === 'pending';
  }

  /** İptal satırı kalır; sipariş tekrar faturalandırılabilir. */
  canCancelInvoice(inv: InvoiceDto): boolean {
    return inv.status === 'pending' || inv.status === 'approved';
  }
}
