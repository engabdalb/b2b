import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/services/api.service';

export type MetricIcon =
  | 'clock'
  | 'users'
  | 'cart'
  | 'money'
  | 'invoice'
  | 'package'
  | 'layers'
  | 'calendar';

export interface MetricCard {
  labelKey: string;
  value: string;
  trendKey?: string;
  trendParams?: Record<string, string | number>;
  trendUp?: boolean;
  icon: MetricIcon;
}

export interface DashboardRecentOrder {
  id: string;
  dealerName: string;
  status: string;
  totalIncVat: number;
  createdAt: string;
  invoiceId: string | null;
}

/** API yok veya hata — gerçek veri yokken gösterilen sıfır kartları (sahte örnek sayı değil). */
const EMPTY_METRICS: MetricCard[] = [
  { labelKey: 'dashboard.metric.todayTrays', value: '0', icon: 'clock' },
  { labelKey: 'dashboard.metric.activeDealers', value: '0', icon: 'users' },
  { labelKey: 'dashboard.metric.pendingOrders', value: '0', icon: 'cart' },
  { labelKey: 'dashboard.metric.revenue', value: '₺0', icon: 'money' },
  { labelKey: 'dashboard.metric.awaitingInvoice', value: '0', icon: 'invoice' },
  { labelKey: 'dashboard.metric.notShippedYet', value: '0', icon: 'package' },
  { labelKey: 'dashboard.metric.totalOrders', value: '0', icon: 'layers' },
  { labelKey: 'dashboard.metric.ordersThisMonth', value: '0', icon: 'calendar' },
];

interface DashboardApiResponse {
  ok: boolean;
  metrics?: {
    todayTrays: string;
    activeDealers: string;
    pendingOrders: string;
    revenueTry: number;
    awaitingInvoice: string;
    notShippedYet: string;
    totalOrders: string;
    ordersThisMonth: string;
  };
  recentOrders?: DashboardRecentOrder[];
}

@Injectable({ providedIn: 'root' })
export class DashboardMockService {
  private readonly api = inject(ApiService);

  readonly metrics = signal<MetricCard[]>(EMPTY_METRICS);
  readonly recentOrders = signal<DashboardRecentOrder[]>([]);

  load(): void {
    if (!environment.apiUrl?.trim()) {
      this.metrics.set(EMPTY_METRICS);
      this.recentOrders.set([]);
      return;
    }
    this.api.get<DashboardApiResponse>('b2b_dashboard_get').subscribe({
      next: (r) => {
        if (!r.ok || !r.metrics) {
          this.metrics.set(EMPTY_METRICS);
          this.recentOrders.set([]);
          return;
        }
        const m = r.metrics;
        const revenue = new Intl.NumberFormat('tr-TR', {
          style: 'currency',
          currency: 'TRY',
          maximumFractionDigits: 0,
        }).format(m.revenueTry ?? 0);
        this.metrics.set([
          { labelKey: 'dashboard.metric.todayTrays', value: m.todayTrays ?? '0', icon: 'clock' },
          { labelKey: 'dashboard.metric.activeDealers', value: m.activeDealers ?? '0', icon: 'users' },
          { labelKey: 'dashboard.metric.pendingOrders', value: m.pendingOrders ?? '0', icon: 'cart' },
          { labelKey: 'dashboard.metric.revenue', value: revenue, icon: 'money' },
          { labelKey: 'dashboard.metric.awaitingInvoice', value: m.awaitingInvoice ?? '0', icon: 'invoice' },
          { labelKey: 'dashboard.metric.notShippedYet', value: m.notShippedYet ?? '0', icon: 'package' },
          { labelKey: 'dashboard.metric.totalOrders', value: m.totalOrders ?? '0', icon: 'layers' },
          { labelKey: 'dashboard.metric.ordersThisMonth', value: m.ordersThisMonth ?? '0', icon: 'calendar' },
        ]);
        this.recentOrders.set(r.recentOrders ?? []);
      },
      error: () => {
        this.metrics.set(EMPTY_METRICS);
        this.recentOrders.set([]);
      },
    });
  }
}
