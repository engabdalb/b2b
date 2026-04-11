import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Permission } from '../../config/permissions.config';
import { AuthService } from '../../core/services/auth.service';
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

  tenantName = 'Acme B2B';
}
