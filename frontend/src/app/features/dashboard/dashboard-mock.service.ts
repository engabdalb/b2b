import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { ApiService } from '../../core/services/api.service';

export interface MetricCard {
  labelKey: string;
  value: string;
  trendKey?: string;
  trendParams?: Record<string, string | number>;
  trendUp?: boolean;
  icon: 'clock' | 'users' | 'cart' | 'money';
}

/** API yok veya hata — gerçek veri yokken gösterilen sıfır kartları (sahte örnek sayı değil). */
const EMPTY_METRICS: MetricCard[] = [
  { labelKey: 'dashboard.metric.todayTrays', value: '0', icon: 'clock' },
  { labelKey: 'dashboard.metric.activeDealers', value: '0', icon: 'users' },
  { labelKey: 'dashboard.metric.pendingOrders', value: '0', icon: 'cart' },
  { labelKey: 'dashboard.metric.revenue', value: '₺0', icon: 'money' },
];

interface DashboardApiResponse {
  ok: boolean;
  metrics?: {
    todayTrays: string;
    activeDealers: string;
    pendingOrders: string;
    revenueTry: number;
  };
}

@Injectable({ providedIn: 'root' })
export class DashboardMockService {
  private readonly api = inject(ApiService);

  readonly metrics = signal<MetricCard[]>(EMPTY_METRICS);

  load(): void {
    if (!environment.apiUrl?.trim()) {
      this.metrics.set(EMPTY_METRICS);
      return;
    }
    this.api.get<DashboardApiResponse>('b2b_dashboard_get').subscribe({
      next: (r) => {
        if (!r.ok || !r.metrics) {
          this.metrics.set(EMPTY_METRICS);
          return;
        }
        const m = r.metrics;
        const revenue = new Intl.NumberFormat('tr-TR', {
          style: 'currency',
          currency: 'TRY',
          maximumFractionDigits: 0,
        }).format(m.revenueTry);
        this.metrics.set([
          { labelKey: 'dashboard.metric.todayTrays', value: m.todayTrays, icon: 'clock' },
          { labelKey: 'dashboard.metric.activeDealers', value: m.activeDealers, icon: 'users' },
          { labelKey: 'dashboard.metric.pendingOrders', value: m.pendingOrders, icon: 'cart' },
          { labelKey: 'dashboard.metric.revenue', value: revenue, icon: 'money' },
        ]);
      },
      error: () => this.metrics.set(EMPTY_METRICS),
    });
  }
}
