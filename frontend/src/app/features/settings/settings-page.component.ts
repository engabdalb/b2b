import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Permission } from '../../config/permissions.config';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { CanDirective } from '../../shared/directives/can.directive';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [PageHeaderComponent, TranslatePipe, CanDirective, FormsModule],
  templateUrl: './settings-page.component.html',
  styleUrl: './settings-page.component.scss',
})
export class SettingsPageComponent {
  protected readonly perm = Permission;
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly i18n = inject(I18nService);

  tenantName = 'Acme B2B';

  readonly backupLoading = signal(false);
  readonly backupError = signal('');

  /** Veritabanı yedeğini indirir; sunucuda dosya bırakılmaz, çıktı doğrudan akıtılır. */
  downloadBackup(): void {
    if (this.backupLoading()) {
      return;
    }
    this.backupLoading.set(true);
    this.backupError.set('');

    this.api.getBlob('b2b_db_backup_get').subscribe({
      next: (res) => {
        const blob = res.body;
        if (!blob || blob.size === 0) {
          this.backupError.set(this.i18n.translate('settings.backupError'));
          this.backupLoading.set(false);
          return;
        }
        this.saveBlob(blob, this.resolveFileName(res.headers.get('Content-Disposition')));
        this.backupLoading.set(false);
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
    return `b2b_yedek_${stamp}.sql`;
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}
