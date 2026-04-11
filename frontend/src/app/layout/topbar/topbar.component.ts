import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Role, ROLES } from '../../core/models/role';
import { AuthService } from '../../core/services/auth.service';
import { I18nService, UiLocale } from '../../core/services/i18n.service';
import { LayoutUiService } from '../../core/services/layout-ui.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
})
export class TopbarComponent {
  readonly auth = inject(AuthService);
  readonly layoutUi = inject(LayoutUiService);
  readonly i18n = inject(I18nService);

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

  signOut(): void {
    this.profileOpen.set(false);
    this.auth.logout();
  }
}
