import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { InvoiceDto } from '../../core/models/api.types';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { DealersMockService } from '../dealers/dealers-mock.service';
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
  readonly dealersData = inject(DealersMockService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);

  readonly isSuperAdmin = computed(() => this.auth.user().role === 'super_admin');

  readonly needsDealerFilter = computed(() => {
    const r = this.auth.user().role;
    return r === 'super_admin' || r === 'viewer';
  });

  readonly filterDateFrom = signal('');
  readonly filterDateTo = signal('');
  readonly filterDealerId = signal('');
  readonly filterStatus = signal<InvoiceDto['status'] | ''>('');
  readonly filterSearch = signal('');

  readonly detailOpen = signal<InvoiceDto | null>(null);
  readonly statusBusyId = signal<string | null>(null);
  readonly statusError = signal<string | null>(null);

  ngOnInit(): void {
    if (this.needsDealerFilter()) {
      this.dealersData.load();
    }

    const invoiceFocus = this.route.snapshot.queryParamMap.get('invoice')?.trim() ?? '';
    if (invoiceFocus !== '') {
      this.filterSearch.set(invoiceFocus);
      this.invoicesData.load({ search: invoiceFocus }).subscribe((items) => {
        const inv = items.find((i) => i.id === invoiceFocus) ?? items[0];
        if (inv) {
          this.openDetail(inv);
        }
        void this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { invoice: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      });
    } else {
      this.invoicesData.load().subscribe();
    }
  }

  applyFilters(): void {
    this.invoicesData
      .load({
        dateFrom: this.filterDateFrom().trim() || undefined,
        dateTo: this.filterDateTo().trim() || undefined,
        dealerId: this.needsDealerFilter() ? (this.filterDealerId().trim() || undefined) : undefined,
        status: (this.filterStatus() || undefined) as InvoiceDto['status'] | undefined,
        search: this.filterSearch().trim() || undefined,
      })
      .subscribe();
  }

  clearFilters(): void {
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.filterDealerId.set('');
    this.filterStatus.set('');
    this.filterSearch.set('');
    this.invoicesData.load(null).subscribe();
  }

  refreshList(): void {
    this.invoicesData.load().subscribe();
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
