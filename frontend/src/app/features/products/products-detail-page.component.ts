import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProductDto } from '../../core/models/api.types';
import { I18nService } from '../../core/services/i18n.service';
import { ProductsMockService, ProductMutationResponse } from './products-mock.service';
import { UnitsMockService } from '../units/units-mock.service';
import { DealersMockService } from '../dealers/dealers-mock.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { UnitNamePipe } from '../../shared/pipes/unit-name.pipe';

@Component({
  selector: 'app-products-detail-page',
  standalone: true,
  imports: [TranslatePipe, UnitNamePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './products-detail-page.component.html',
  styleUrl: './products-detail-page.component.scss',
})
export class ProductsDetailPageComponent implements OnInit {
  readonly data = inject(ProductsMockService);
  readonly unitsData = inject(UnitsMockService);
  readonly dealersData = inject(DealersMockService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);

  /** Düzenlenen ürün kimliği; null => yeni ürün */
  readonly productId = signal<string | null>(null);
  readonly isNew = computed(() => this.productId() === null);

  readonly loading = signal(true);
  readonly notFound = signal(false);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  /** true => ürün tüm bayilere görünür; false => yalnızca seçili bayilere */
  readonly visibleToAll = signal(true);
  readonly selectedDealerIds = signal<string[]>([]);
  readonly dealerSearch = signal('');

  readonly form = this.fb.nonNullable.group({
    sku: ['', Validators.required],
    name: ['', Validators.required],
    unitId: ['', Validators.required],
    price: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    returnablePackagingTypeId: [''],
    returnablePackagingUnitsPerQty: this.fb.control<number>(1, [
      Validators.required,
      Validators.min(0.001),
    ]),
    active: this.fb.nonNullable.control(true),
  });

  readonly unitOptions = () => this.unitsData.units().filter((u) => u.active);
  readonly packagingTypeOptions = () => this.data.packagingTypes().filter((t) => t.active);

  readonly activeDealers = computed(() => this.dealersData.dealers().filter((d) => d.active));

  readonly filteredDealers = computed(() => {
    const q = this.dealerSearch().trim().toLocaleLowerCase('tr');
    const list = this.activeDealers();
    if (q === '') {
      return list;
    }
    return list.filter((d) =>
      [d.name, d.region, d.il, d.ilce]
        .filter((x) => !!x)
        .some((x) => x.toLocaleLowerCase('tr').includes(q)),
    );
  });

  readonly selectedCount = computed(() => this.selectedDealerIds().length);
  readonly totalDealers = computed(() => this.activeDealers().length);

  ngOnInit(): void {
    this.dealersData.load();
    this.data.loadPackagingTypes();

    const idParam = this.route.snapshot.paramMap.get('id');
    if (!idParam || idParam === 'new') {
      this.productId.set(null);
      this.form.reset({
        sku: '',
        name: '',
        unitId: '',
        price: null,
        returnablePackagingTypeId: '',
        returnablePackagingUnitsPerQty: 1,
        active: true,
      });
      this.visibleToAll.set(true);
      this.selectedDealerIds.set([]);
      this.loading.set(false);
      // Birimler gelince ilk aktif birimi varsayılan seç (kullanıcı henüz değiştirmediyse).
      this.unitsData.load().subscribe(() => {
        if (!this.form.controls.unitId.value) {
          const first = this.unitOptions()[0];
          if (first) {
            this.form.controls.unitId.setValue(first.id);
          }
        }
      });
      return;
    }

    this.unitsData.load().subscribe();

    this.productId.set(idParam);
    this.data.load(null).subscribe(() => {
      const p = this.data.products().find((x) => x.id === idParam);
      if (!p) {
        this.notFound.set(true);
        this.loading.set(false);
        return;
      }
      this.hydrate(p);
      this.loading.set(false);
    });
  }

  private hydrate(p: ProductDto): void {
    const ids = p.visibleDealerIds ?? [];
    this.visibleToAll.set(ids.length === 0);
    this.selectedDealerIds.set([...ids]);
    this.form.reset({
      sku: p.sku,
      name: p.name,
      unitId: p.unitId,
      price: p.price,
      returnablePackagingTypeId: p.returnablePackagingTypeId ?? '',
      returnablePackagingUnitsPerQty:
        p.returnablePackagingUnitsPerQty !== undefined && p.returnablePackagingUnitsPerQty !== null
          ? p.returnablePackagingUnitsPerQty
          : 1,
      active: p.active !== false,
    });
  }

  toggleVisibleToAll(all: boolean): void {
    this.visibleToAll.set(all);
    if (all) {
      this.selectedDealerIds.set([]);
    }
  }

  isDealerSelected(id: string): boolean {
    return this.selectedDealerIds().includes(id);
  }

  toggleDealer(id: string, checked: boolean): void {
    const set = new Set(this.selectedDealerIds());
    if (checked) {
      set.add(id);
    } else {
      set.delete(id);
    }
    this.selectedDealerIds.set([...set]);
  }

  /** Tüm aktif bayileri seçer (arama filtresinden bağımsız). */
  selectAll(): void {
    this.selectedDealerIds.set(this.activeDealers().map((d) => d.id));
  }

  /** Tüm seçimleri kaldırır. */
  deselectAll(): void {
    this.selectedDealerIds.set([]);
  }

  cancel(): void {
    this.router.navigate(['/products']);
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

    const visibleDealerIds = this.visibleToAll() ? [] : this.selectedDealerIds();
    if (!this.visibleToAll() && visibleDealerIds.length === 0) {
      this.formError.set('products.visibilityEmpty');
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
      this.router.navigate(['/products']);
    };

    const tid = v.returnablePackagingTypeId?.trim() ?? '';
    const unitsPer = Number(v.returnablePackagingUnitsPerQty);
    const unitsPerSafe = Number.isFinite(unitsPer) && unitsPer > 0 ? unitsPer : 1;

    const id = this.productId();
    if (id) {
      const payload: ProductDto = {
        id,
        sku: v.sku.trim(),
        name: v.name.trim(),
        unitId: v.unitId,
        unit: '',
        price,
        returnablePackagingTypeId: tid !== '' ? tid : null,
        returnablePackagingUnitsPerQty: unitsPerSafe,
        active: v.active,
        visibleDealerIds,
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
          active: v.active,
          visibleDealerIds,
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
