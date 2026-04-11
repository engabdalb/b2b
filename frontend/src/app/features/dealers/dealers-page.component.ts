import { Component, OnInit, computed, inject } from '@angular/core';
import { Permission } from '../../config/permissions.config';
import { DealersMockService } from './dealers-mock.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { DataTableComponent, DataColumn } from '../../shared/components/data-table/data-table.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { CanDirective } from '../../shared/directives/can.directive';

@Component({
  selector: 'app-dealers-page',
  standalone: true,
  imports: [PageHeaderComponent, DataTableComponent, TranslatePipe, CanDirective],
  templateUrl: './dealers-page.component.html',
})
export class DealersPageComponent implements OnInit {
  protected readonly perm = Permission;
  private readonly mock = inject(DealersMockService);

  readonly columns: DataColumn[] = [
    { key: 'name', labelKey: 'dealers.col.name' },
    { key: 'region', labelKey: 'dealers.col.region' },
    { key: 'activeLabel', labelKey: 'dealers.col.active', format: 'i18n' },
  ];

  readonly rows = computed(() =>
    this.mock.dealers().map((d) => ({
      name: d.name,
      region: d.region,
      activeLabel: d.active ? 'dealers.yes' : 'dealers.no',
    })),
  );

  ngOnInit(): void {
    this.mock.load();
  }
}
