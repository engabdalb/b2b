import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Permission } from '../../config/permissions.config';
import { I18nService } from '../../core/services/i18n.service';
import { ProductsMockService } from './products-mock.service';
import { UnitsMockService } from '../units/units-mock.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { CanDirective } from '../../shared/directives/can.directive';
import { UnitNamePipe } from '../../shared/pipes/unit-name.pipe';

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [
    PageHeaderComponent,
    TranslatePipe,
    UnitNamePipe,
    CanDirective,
    DecimalPipe,
    RouterLink,
  ],
  templateUrl: './products-page.component.html',
  styleUrl: './products-page.component.scss',
})
export class ProductsPageComponent implements OnInit {
  protected readonly perm = Permission;
  readonly data = inject(ProductsMockService);
  readonly unitsData = inject(UnitsMockService);
  protected readonly i18n = inject(I18nService);

  readonly search = signal('');

  readonly filteredProducts = computed(() => {
    const q = this.search().trim().toLocaleLowerCase('tr');
    const list = this.data.products();
    if (q === '') {
      return list;
    }
    return list.filter((p) =>
      [p.sku, p.name, p.unit, p.unitCode ?? '', p.returnablePackagingTypeName ?? '']
        .filter((x) => !!x)
        .some((x) => x.toLocaleLowerCase('tr').includes(q)),
    );
  });

  ngOnInit(): void {
    this.unitsData.load().subscribe();
    this.data.loadPackagingTypes();
    this.data.load(null).subscribe();
  }
}
