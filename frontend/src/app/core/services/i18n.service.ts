import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom, tap } from 'rxjs';
import { appConfig } from '../../config/app-config';

export type UiLocale = 'tr' | 'en';

const LOCALE_STORAGE = 'b2b_ui_locale';

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly http = inject(HttpClient);
  private readonly dict = signal<Record<string, string>>({});
  private readonly loaded = signal(false);

  /** Aktif arayüz dili (birim adları ve JSON çevirileri). */
  readonly locale = signal<UiLocale>('tr');

  /** Sayı/tutar formatı için Angular locale id. */
  readonly numberLocale = computed(() => (this.locale() === 'en' ? 'en-US' : 'tr-TR'));

  readonly ready = this.loaded.asReadonly();

  init(): Promise<void> {
    const raw = localStorage.getItem(LOCALE_STORAGE);
    const loc: UiLocale = raw === 'en' || raw === 'tr' ? raw : (appConfig.defaultLocale as UiLocale);
    return this.loadLocale(loc);
  }

  setLocale(loc: UiLocale): Promise<void> {
    localStorage.setItem(LOCALE_STORAGE, loc);
    return this.loadLocale(loc);
  }

  private loadLocale(loc: UiLocale): Promise<void> {
    const url = `assets/i18n/${loc}.json`;
    return firstValueFrom(
      this.http.get<Record<string, string>>(url).pipe(
        tap((t) => {
          this.dict.set(t);
          this.locale.set(loc);
          document.documentElement.lang = loc === 'en' ? 'en' : 'tr';
          this.loaded.set(true);
        }),
      ),
    ).then(() => undefined);
  }

  translate(key: string, params?: Record<string, string | number>): string {
    let s = this.dict()[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.replace(`{{${k}}}`, String(v));
      }
    }
    return s;
  }

  /**
   * Birim görünen adı: `units.name.{code}` dil dosyasında varsa onu, yoksa API’den gelen fallback (name).
   */
  displayUnitName(code: string, fallbackName: string): string {
    const key = `units.name.${code}`;
    const s = this.translate(key);
    return s === key ? fallbackName : s;
  }
}
