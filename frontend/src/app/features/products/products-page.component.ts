import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Permission } from '../../config/permissions.config';
import { ProductDto } from '../../core/models/api.types';
import { I18nService } from '../../core/services/i18n.service';
import { ProductsMockService, ProductMutationResponse } from './products-mock.service';
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
    ReactiveFormsModule,
    DecimalPipe,
  ],
  templateUrl: './products-page.component.html',
  styleUrl: './products-page.component.scss',
})
export class ProductsPageComponent implements OnInit {
  protected readonly perm = Permission;
  readonly data = inject(ProductsMockService);
  readonly unitsData = inject(UnitsMockService);
  private readonly fb = inject(FormBuilder);
  protected readonly i18n = inject(I18nService);

  readonly formOpen = signal(false);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    id: [''],
    sku: ['', Validators.required],
    name: ['', Validators.required],
    unitId: ['', Validators.required],
    price: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    returnablePackagingTypeId: [''],
    returnablePackagingUnitsPerQty: this.fb.control<number>(1, [
      Validators.required,
      Validators.min(0.001),
    ]),
  });

  readonly unitOptions = () => this.unitsData.units().filter((u) => u.active);
  readonly packagingTypeOptions = () => this.data.packagingTypes().filter((t) => t.active);

  ngOnInit(): void {
    this.unitsData.load();
    this.data.loadPackagingTypes();
    this.data.load();
  }

  openNew(): void {
    this.formError.set(null);
    const first = this.unitOptions()[0];
    this.form.reset({
      id: '',
      sku: '',
      name: '',
      unitId: first?.id ?? '',
      price: null,
      returnablePackagingTypeId: '',
      returnablePackagingUnitsPerQty: 1,
    });
    this.formOpen.set(true);
  }

  openEdit(p: ProductDto): void {
    this.formError.set(null);
    this.form.setValue({
      id: p.id,
      sku: p.sku,
      name: p.name,
      unitId: p.unitId,
      price: p.price,
      returnablePackagingTypeId: p.returnablePackagingTypeId ?? '',
      returnablePackagingUnitsPerQty:
        p.returnablePackagingUnitsPerQty !== undefined && p.returnablePackagingUnitsPerQty !== null
          ? p.returnablePackagingUnitsPerQty
          : 1,
    });
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.formError.set(null);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const price = Number(v.price);
    if (Number.isNaN(price) || price < 0) {
      this.formError.set('products.validation');
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const finish = (errKey: string | null) => {
      this.saving.set(false);
      if (errKey) {
        this.formError.set(errKey);
        return;
      }
      this.formOpen.set(false);
    };

    const tid = v.returnablePackagingTypeId?.trim() ?? '';
    const unitsPer = Number(v.returnablePackagingUnitsPerQty);
    const unitsPerSafe = Number.isFinite(unitsPer) && unitsPer > 0 ? unitsPer : 1;

    if (v.id) {
      const payload: ProductDto = {
        id: v.id,
        sku: v.sku.trim(),
        name: v.name.trim(),
        unitId: v.unitId,
        unit: '',
        price,
        returnablePackagingTypeId: tid !== '' ? tid : null,
        returnablePackagingUnitsPerQty: unitsPerSafe,
      };
      this.data.update(payload).subscribe({
        next: (r: ProductMutationResponse) => finish(!r.ok ? this.mapMutationError(r) : null),
        error: (err: { error?: { error?: string; message?: string } }) =>
          finish(this.mapHttpError(err)),
      });
    } else {
      this.data
        .create({
          sku: v.sku.trim(),
          name: v.name.trim(),
          unit_id: v.unitId,
          price,
          returnable_packaging_type_id: tid !== '' ? tid : null,
          returnable_packaging_units_per_qty: unitsPerSafe,
        })
        .subscribe({
          next: (r: ProductMutationResponse) => finish(!r.ok ? this.mapMutationError(r) : null),
          error: (err: { error?: { error?: string; message?: string } }) =>
            finish(this.mapHttpError(err)),
        });
    }
  }

  private mapMutationError(r: ProductMutationResponse): string {
    if (r.error === 'duplicate_sku') {
      return 'products.duplicateSku';
    }
    if (r.error === 'validation' && r.message) {
      return r.message;
    }
    return 'products.saveError';
  }

  private mapHttpError(err: { error?: { error?: string; message?: string } }): string {
    const e = err?.error;
    if (e?.error === 'duplicate_sku') {
      return 'products.duplicateSku';
    }
    if (e?.message) {
      return e.message;
    }
    return 'products.saveError';
  }

  errorText(key: string): string {
    return key.startsWith('products.') ? this.i18n.translate(key) : key;
  }
}
