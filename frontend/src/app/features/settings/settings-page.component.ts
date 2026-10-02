import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Permission } from '../../config/permissions.config';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { CanDirective } from '../../shared/directives/can.directive';
import {
  OrderWindowConfig,
  SettingsDataService,
  defaultOrderWindow,
} from './settings-data.service';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [PageHeaderComponent, TranslatePipe, CanDirective, FormsModule],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.scss',
})
export class SettingsPageComponent implements OnInit {
  protected readonly perm = Permission;
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);
  private readonly settingsData = inject(SettingsDataService);
  private readonly route = inject(ActivatedRoute);

  tenantName = 'Acme B2B';

  /** Navbar "Yedek al" kısayolundan gelindiğinde yedek kartı vurgulanır. */
  readonly highlightBackup = signal(false);

  /** Sipariş saat penceresi formu (ngModel ile düz model). */
  orderWindow: OrderWindowConfig = defaultOrderWindow();
  /** Şablonda sabit sırayla dönmek için ISO gün anahtarları. */
  readonly dayKeys = ['1', '2', '3', '4', '5', '6', '7'];

  readonly windowLoading = signal(true);
  readonly windowSaving = signal(false);
  readonly windowSaved = signal(false);
  readonly windowError = signal('');

  ngOnInit(): void {
    const focusBackup = this.route.snapshot.fragment === 'backup';
    if (focusBackup) {
      this.highlightBackup.set(true);
      setTimeout(() => this.highlightBackup.set(false), 3000);
    }

    this.settingsData.load().subscribe({
      next: (r) => {
        if (r.ok && r.order_window) {
          this.orderWindow = this.mergeWithDefaults(r.order_window);
        }
        this.windowLoading.set(false);
        if (focusBackup) {
          this.scrollToBackupCard();
        }
      },
      error: () => {
        this.windowError.set(this.i18n.translate('settings.orderWindowLoadError'));
        this.windowLoading.set(false);
        if (focusBackup) {
          this.scrollToBackupCard();
        }
      },
    });
  }

  /**
   * Yedek kartına kaydırır. Üstteki "Sipariş saatleri" kartı yüklenince sayfa
   * yüksekliği değiştiği için kaydırma, ayarlar yüklendikten sonra yapılır.
   */
  private scrollToBackupCard(): void {
    // Form render edilip sayfa yüksekliği oturduktan sonra kaydır; aksi halde
    // tarayıcı, eşzamanlı yerleşim değişikliği yüzünden kaydırmayı iptal edebiliyor.
    setTimeout(() => {
      document.getElementById('backup-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 350);
  }

  /** API'den eksik gün gelirse form bozulmasın diye varsayılanla birleştirir. */
  private mergeWithDefaults(cfg: OrderWindowConfig): OrderWindowConfig {
    const merged = defaultOrderWindow();
    merged.enabled = !!cfg.enabled;
    for (const key of this.dayKeys) {
      const day = cfg.days?.[key];
      if (day) {
        merged.days[key] = {
          open: !!day.open,
          start: (day.start ?? '').trim(),
          end: (day.end ?? '').trim(),
        };
      }
    }
    return merged;
  }

  saveOrderWindow(): void {
    if (this.windowSaving() || this.auth.isViewer()) {
      return;
    }
    this.windowSaving.set(true);
    this.windowSaved.set(false);
    this.windowError.set('');
    this.settingsData.saveOrderWindow(this.orderWindow).subscribe({
      next: (r) => {
        this.windowSaving.set(false);
        if (r.ok) {
          this.windowSaved.set(true);
        } else {
          this.windowError.set(r.message ?? this.i18n.translate('settings.orderWindowError'));
        }
      },
      error: (err: { error?: { message?: string } }) => {
        this.windowSaving.set(false);
        this.windowError.set(err?.error?.message ?? this.i18n.translate('settings.orderWindowError'));
      },
    });
  }

  readonly backupLoading = signal(false);
  readonly backupDownloading = signal(false);
  readonly backupError = signal('');

  /**
   * Veritabanı yedeğini iki aşamada indirir:
   * 1) prepare: döküm sunucuda sıkıştırılmış (.sql.gz) dosyaya üretilir — süre
   *    istemci bağlantısından bağımsızdır, zaman aşımına takılmaz.
   * 2) download: hazır (küçük) dosya indirilir; sunucu aktarım bitince dosyayı siler.
   */
  downloadBackup(): void {
    if (this.backupLoading()) {
      return;
    }
    this.backupLoading.set(true);
    this.backupDownloading.set(false);
    this.backupError.set('');

    this.api.post<{ ok: boolean; file?: string; gz_bytes?: number; message?: string }>('b2b_db_backup_prepare', {}).subscribe({
      next: (r) => {
        if (!r.ok || !r.file) {
          this.backupError.set(r.message ?? this.i18n.translate('settings.backupError'));
          this.backupLoading.set(false);
          return;
        }
        this.backupDownloading.set(true);
        this.api.getBlob('b2b_db_backup_download', { file: r.file }).subscribe({
          next: (res) => {
            const blob = res.body;
            if (!blob || blob.size === 0) {
              this.backupError.set(this.i18n.translate('settings.backupError'));
            } else {
              this.saveBlob(blob, this.resolveFileName(res.headers.get('Content-Disposition')));
            }
            this.backupLoading.set(false);
            this.backupDownloading.set(false);
          },
          error: (err: unknown) => {
            void this.reportError(err);
          },
        });
      },
      error: (err: unknown) => {
        void this.reportError(err);
      },
    });
  }

  private async reportError(err: unknown): Promise<void> {
    let detail = '';
    const body = (err as { error?: unknown })?.error;
    if (body instanceof Blob) {
      try {
        const parsed = JSON.parse(await body.text()) as { error?: string };
        detail = parsed?.error ?? '';
      } catch {
        detail = '';
      }
    }
    this.backupError.set(
      detail ? `${this.i18n.translate('settings.backupError')} ${detail}` : this.i18n.translate('settings.backupError'),
    );
    this.backupLoading.set(false);
    this.backupDownloading.set(false);
  }

  /** Content-Disposition varsa oradaki adı, yoksa zaman damgalı yedek adını kullanır. */
  private resolveFileName(disposition: string | null): string {
    const match = disposition?.match(/filename="?([^";]+)"?/i);
    if (match?.[1]) {
      return match[1];
    }
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    return `b2b_yedek_${stamp}.sql.gz`;
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    /*
     * URL'yi hemen iptal ETME: tarayıcı blob'u okumayı bitirmeden iptal edilirse
     * indirme rastgele bir boyutta yarıda kesilir. Okuma bittikten sonra bırakılır.
     */
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
