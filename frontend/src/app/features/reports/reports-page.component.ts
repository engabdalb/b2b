import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ReportsDealerDebtDto,
  ReportsOverviewApiResponse,
  ReportsPaymentSummaryDto,
  ReportsRecentPaymentDto,
  ReportsTopDealerDto,
  ReportsTopProductDto,
  ReportsProductOrderTotalDto,
  ReportsTrayBalanceDto,
} from '../../core/models/api.types';
import { Permission } from '../../config/permissions.config';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { CanDirective } from '../../shared/directives/can.directive';
import { ReportsDataService } from './reports-data.service';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [PageHeaderComponent, TranslatePipe, CanDirective, DecimalPipe, DatePipe],
  templateUrl: './reports-page.component.html',
  styleUrl: './reports-page.component.scss',
})
export class ReportsPageComponent implements OnInit {
  protected readonly perm = Permission;
  private readonly data = inject(ReportsDataService);

  readonly loading = signal<boolean>(true);
  readonly loadError = signal<string | null>(null);

  readonly summary = signal<ReportsOverviewApiResponse['summary'] | null>(null);
  readonly trayBalances = signal<ReportsTrayBalanceDto[]>([]);
  readonly dealerDebts = signal<ReportsDealerDebtDto[]>([]);
  readonly paymentSummary = signal<ReportsPaymentSummaryDto[]>([]);
  readonly recentPayments = signal<ReportsRecentPaymentDto[]>([]);
  readonly topProducts = signal<ReportsTopProductDto[]>([]);
  readonly topDealers = signal<ReportsTopDealerDto[]>([]);
  readonly productOrderTotals = signal<ReportsProductOrderTotalDto[]>([]);
  readonly filterDateFrom = signal<string>('');
  readonly filterDateTo = signal<string>('');

  readonly trayDealerCount = computed(() => this.trayBalances().length);

  ngOnInit(): void {
    const today = new Date();
    const dateTo = this.toYmd(today);
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    const dateFrom = this.toYmd(from);
    this.filterDateFrom.set(dateFrom);
    this.filterDateTo.set(dateTo);
    this.load();
  }

  reload(): void {
    this.load();
  }

  applyDateFilter(): void {
    this.load();
  }

  clearDateFilter(): void {
    const today = new Date();
    const dateTo = this.toYmd(today);
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    const dateFrom = this.toYmd(from);
    this.filterDateFrom.set(dateFrom);
    this.filterDateTo.set(dateTo);
    this.load();
  }

  methodLabelKey(method: string): string {
    return `ledger.method.${method}`;
  }

  private load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    const dateFrom = this.filterDateFrom();
    const dateTo = this.filterDateTo();
    if (!dateFrom || !dateTo) {
      this.loadError.set('reports.invalidDateRange');
      this.loading.set(false);
      return;
    }
    this.data.getOverview(dateFrom, dateTo).subscribe({
      next: (res) => {
        if (!res.ok) {
          this.loadError.set('reports.loadError');
          this.loading.set(false);
          return;
        }
        this.summary.set(res.summary ?? null);
        this.trayBalances.set(res.trayBalances ?? []);
        this.dealerDebts.set(res.dealerDebts ?? []);
        this.paymentSummary.set(res.paymentSummary ?? []);
        this.recentPayments.set(res.recentPayments ?? []);
        this.topProducts.set(res.topProducts ?? []);
        this.topDealers.set(res.topDealers ?? []);
        this.productOrderTotals.set(res.productOrderTotals ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('reports.loadError');
        this.loading.set(false);
      },
    });
  }

  private toYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
