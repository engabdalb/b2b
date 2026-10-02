import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

/** Gün yapılandırması; saatler SS:DD ya da boş (sınırsız). */
export interface OrderWindowDay {
  open: boolean;
  start: string;
  end: string;
}

/** Günler ISO numarasıyla anahtarlanır: '1'=Pazartesi … '7'=Pazar. */
export interface OrderWindowConfig {
  enabled: boolean;
  days: Record<string, OrderWindowDay>;
}

export interface OrderWindowStatus {
  open: boolean;
  enabled: boolean;
  dayIso: number;
  time: string;
  dayOpen: boolean;
  start: string;
  end: string;
}

export interface SettingsResponse {
  ok: boolean;
  order_window?: OrderWindowConfig;
  order_window_status?: OrderWindowStatus;
  message?: string;
}

export function defaultOrderWindow(): OrderWindowConfig {
  const days: Record<string, OrderWindowDay> = {};
  for (let d = 1; d <= 7; d++) {
    days[String(d)] = { open: true, start: '', end: '' };
  }
  return { enabled: false, days };
}

const ISO_DAY_BY_WEEKDAY: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

/** Şu anın Europe/Istanbul karşılığı (ISO gün + SS:DD). */
export function istanbulNow(): { dayIso: number; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Istanbul',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const dayIso = ISO_DAY_BY_WEEKDAY[get('weekday')] ?? 1;
  // Bazı ortamlar 24:00 döndürebilir; 00 olarak normalle.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { dayIso, time: `${hour}:${get('minute')}` };
}

/**
 * API'deki b2b_order_window_status ile birebir aynı kurallar (istemci tarafı,
 * ekranı canlı tutmak için). Nihai karar her zaman sunucudadır.
 */
export function evaluateOrderWindow(cfg: OrderWindowConfig | null): OrderWindowStatus {
  const { dayIso, time } = istanbulNow();
  const base: OrderWindowStatus = {
    open: true, enabled: false, dayIso, time, dayOpen: true, start: '', end: '',
  };
  if (!cfg || !cfg.enabled) {
    return base;
  }
  base.enabled = true;
  const day = cfg.days?.[String(dayIso)];
  if (!day) {
    return base;
  }
  base.dayOpen = !!day.open;
  base.start = (day.start ?? '').trim();
  base.end = (day.end ?? '').trim();
  if (!base.dayOpen) {
    base.open = false;
    return base;
  }
  const { start, end } = base;
  if (start === '' && end === '') {
    return base;
  }
  if (start !== '' && end !== '' && start > end) {
    base.open = time >= start || time <= end;
    return base;
  }
  if (start !== '' && time < start) {
    base.open = false;
    return base;
  }
  if (end !== '' && time > end) {
    base.open = false;
    return base;
  }
  return base;
}

@Injectable({ providedIn: 'root' })
export class SettingsDataService {
  private readonly api = inject(ApiService);

  load(): Observable<SettingsResponse> {
    return this.api.get<SettingsResponse>('b2b_settings_get');
  }

  saveOrderWindow(cfg: OrderWindowConfig): Observable<SettingsResponse> {
    return this.api.post<SettingsResponse>('b2b_settings_save', { order_window: cfg });
  }
}
