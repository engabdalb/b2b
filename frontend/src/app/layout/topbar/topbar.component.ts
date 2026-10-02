import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Permission } from '../../config/permissions.config';
import { Role, ROLES } from '../../core/models/role';
import { AuthService } from '../../core/services/auth.service';
import { I18nService, UiLocale } from '../../core/services/i18n.service';
import { LayoutUiService } from '../../core/services/layout-ui.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { CanDirective } from '../../shared/directives/can.directive';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [FormsModule, TranslatePipe, CanDirective],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
})
export class TopbarComponent {
  protected readonly perm = Permission;
  readonly auth = inject(AuthService);
  readonly layoutUi = inject(LayoutUiService);
  readonly i18n = inject(I18nService);
  private readonly router = inject(Router);

  readonly profileOpen = signal(false);

  readonly roles = ROLES;
  readonly showDevRole = environment.useMockAuth || !environment.apiUrl?.trim();

  toggleMenu(): void {
    this.layoutUi.toggleMobileNav();
  }

  toggleProfile(): void {
    this.profileOpen.update((v) => !v);
  }

  closeProfile(): void {
    this.profileOpen.set(false);
  }

  onRoleChange(role: Role): void {
    this.auth.setMockRole(role);
  }

  setUiLocale(loc: UiLocale): void {
    void this.i18n.setLocale(loc);
  }

  /** Yedek alma hatırlatıcısı: Ayarlar sayfasındaki yedek kartına götürür. */
  goToBackup(): void {
    void this.router.navigate(['/settings'], { fragment: 'backup' });
  }

  signOut(): void {
    this.profileOpen.set(false);
    this.auth.logout();
  }
}
