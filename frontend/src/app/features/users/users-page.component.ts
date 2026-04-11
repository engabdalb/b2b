import { Component, OnInit, computed, inject } from '@angular/core';
import { Permission } from '../../config/permissions.config';
import { UsersMockService } from './users-mock.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, DataColumn } from '../../shared/components/data-table/data-table.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { CanDirective } from '../../shared/directives/can.directive';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [PageHeaderComponent, DataTableComponent, TranslatePipe, CanDirective],
  templateUrl: './users-page.component.html',
})
export class UsersPageComponent implements OnInit {
  protected readonly perm = Permission;
  private readonly mock = inject(UsersMockService);
  private readonly i18n = inject(I18nService);

  readonly columns: DataColumn[] = [
    { key: 'name', labelKey: 'users.col.name' },
    { key: 'email', labelKey: 'users.col.email' },
    { key: 'roleLabel', labelKey: 'users.col.role' },
    { key: 'activeLabel', labelKey: 'users.col.active', format: 'i18n' },
  ];

  readonly rows = computed(() =>
    this.mock.users().map((u) => ({
      name: u.name,
      email: u.email,
      roleLabel: this.i18n.translate(u.roleKey),
      activeLabel: u.active ? 'dealers.yes' : 'dealers.no',
    })),
  );

  ngOnInit(): void {
    this.mock.load();
  }
}
