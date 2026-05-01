import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { startWith } from 'rxjs';
import { Permission } from '../../config/permissions.config';
import { OrderCreatePayload, OrderDto, OrderLineDto, OrderUpdatePayload, ProductDto } from '../../core/models/api.types';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { DealersMockService } from '../dealers/dealers-mock.service';
import { ProductsMockService } from '../products/products-mock.service';
import { OrdersMockService } from './orders-mock.service';
import { downloadOrdersXlsx, OrdersXlsxColumnLabels } from './export-orders-xlsx';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { UnitNamePipe } from '../../shared/pipes/unit-name.pipe';
import { CanDirective } from '../../shared/directives/can.directive';

/** Sepet satırı miktarı: tam sayı ve ≥ 1 */
function cartLineIntegerQtyValidator(c: AbstractControl): ValidationErrors | null {
  const raw = c.value;
  if (raw === null || raw === undefined || raw === '') {
    return { required: true };
  }
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return { invalid: true };
  }
  if (!Number.isInteger(n)) {
    return { notInteger: true };
  }
  if (n < 1) {
    return { min: { min: 1, actual: n } };
  }
  return null;
}

/** newOrderForm.lines satırı — getRawValue çıktısı */
interface NewOrderLineFormValue {
  productId: string;
  quantity: number;
  vatRate: number | null;
  discountAmount: number;
}

interface NewOrderFormRawValue {
  dealerId: string;
  description: string;
  lines: NewOrderLineFormValue[];
}

@Component({
  selector: 'app-orders-page',
  standalone: true,
  imports: [
    PageHeaderComponent,
    TranslatePipe,
    UnitNamePipe,
    CanDirective,
    ReactiveFormsModule,
    DecimalPipe,
  ],
  templateUrl: './orders-page.component.html',
  styleUrl: './orders-page.component.scss',
})
export class OrdersPageComponent implements OnInit {
  protected readonly perm = Permission;
  readonly ordersData = inject(OrdersMockService);
  readonly productsData = inject(ProductsMockService);
  readonly dealersData = inject(DealersMockService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionsService);
  private readonly fb = inject(FormBuilder);
  protected readonly i18n = inject(I18nService);

  readonly isSuperAdmin = computed(() => this.auth.user().role === 'super_admin');

  /** Bayi seçim filtresi: süper admin ve izleyici (API bayi rolünde zaten tek bayi). */
  readonly needsDealerFilter = computed(() => {
    const r = this.auth.user().role;
    return r === 'super_admin' || r === 'viewer';
  });

  readonly filterDateFrom = signal('');
  readonly filterDateTo = signal('');
  readonly filterDealerId = signal('');
  readonly filterStatus = signal<OrderDto['status'] | ''>('');
  readonly filterInvoice = signal<'' | 'with' | 'without'>('');
  readonly filterSearch = signal('');

  readonly detailOpen = signal<OrderDto | null>(null);
  /** Liste | Sipariş oluştur (yan panel) */
  readonly ordersViewTab = signal<'list' | 'create'>('list');
  readonly createProductSearch = signal('');
  readonly createUnitFilter = signal<'all' | 'kg' | 'tepsi'>('all');
  readonly editFormOpen = signal(false);
  readonly editingOrderId = signal<string | null>(null);
  readonly editOrderMeta = signal<{ dealerName: string; createdAt: string } | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly editFormError = signal<string | null>(null);
  readonly invoicingOrderId = signal<string | null>(null);
  readonly invoiceError = signal<string | null>(null);
  private readonly requestedOrderId = signal<string | null>(null);
  private readonly autoOpenRequestedOrder = effect(() => {
    this.ordersData.orders();
    this.tryOpenRequestedOrder();
  });

  readonly newOrderForm = this.fb.nonNullable.group({
    dealerId: [''],
    description: [''],
    /** Sipariş oluştur: başlangıçta boş sepet; ürün eklenince satır eklenir */
    lines: new FormArray<FormGroup>([]),
  });

  readonly editOrderForm = this.fb.nonNullable.group({
    status: this.fb.nonNullable.control<OrderDto['status']>('pending'),
    description: [''],
    lines: this.fb.array([this.createEditLineGroup()]),
  });

  /** Form değişiminde toplamları yeniden hesaplamak için */
  private readonly newOrderFormValue = toSignal(
    this.newOrderForm.valueChanges.pipe(startWith(this.newOrderForm.getRawValue())),
    { initialValue: this.newOrderForm.getRawValue() },
  );

  private readonly editOrderFormValue = toSignal(
    this.editOrderForm.valueChanges.pipe(startWith(this.editOrderForm.getRawValue())),
    { initialValue: this.editOrderForm.getRawValue() },
  );

  /** Ürün fiyatları + satırlar: KDV hariç satır tutarı, tahmini KDV, önizleme toplamları */
  readonly orderFormTotals = computed(() => {
    this.newOrderFormValue();
    const raw = this.newOrderForm.getRawValue() as NewOrderFormRawValue;
    const formLines = raw.lines;
    const products = this.productsData.products();
    const byId = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    let vatTotal = 0;
    const lines = formLines.map((l) => {
      const p = l.productId ? byId.get(String(l.productId)) : undefined;
      if (!p || l.quantity == null || l.quantity <= 0) {
        return { lineTotal: null as number | null, vatAmount: null as number | null };
      }
      const unitPrice = Math.round(p.price * 100) / 100;
      const dpu = Math.round((p.dealerDiscountPerUnit ?? 0) * 100) / 100;
      const maxDisc = Math.round(l.quantity * unitPrice * 100) / 100;
      const ruleDisc = Math.min(Math.round(dpu * l.quantity * 100) / 100, maxDisc);
      const disc = this.isSuperAdmin()
        ? Math.max(0, Math.min(Math.round(Number(l.discountAmount ?? 0) * 100) / 100, maxDisc))
        : ruleDisc;
      const lineTotal = Math.round((l.quantity * unitPrice - disc) * 100) / 100;
      if (lineTotal < 0) {
        return { lineTotal: null as number | null, vatAmount: null as number | null };
      }
      subtotal += lineTotal;

      const vr = this.parseOptionalVatRate(l.vatRate);
      let vatAmount: number | null = null;
      if (vr != null) {
        vatAmount = Math.round(lineTotal * (vr / 100) * 100) / 100;
        vatTotal += vatAmount;
      }
      return { lineTotal, vatAmount };
    });

    subtotal = Math.round(subtotal * 100) / 100;
    vatTotal = Math.round(vatTotal * 100) / 100;
    const grandWithVat = Math.round((subtotal + vatTotal) * 100) / 100;

    return { lines, subtotal, vatTotal, grandWithVat };
  });

  /** Düzenleme formu: indirim dahil satır matrahı (güncel ürün fiyatı üzerinden) */
  readonly editOrderFormTotals = computed(() => {
    this.editOrderFormValue();
    const raw = this.editOrderForm.getRawValue();
    const products = this.productsData.products();
    const byId = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    let vatTotal = 0;
    const lines = raw.lines.map((l) => {
      const p = l.productId ? byId.get(String(l.productId)) : undefined;
      const discount = Math.max(0, Math.round(Number(l.discountAmount) * 100) / 100);
      if (!p || l.quantity == null || l.quantity <= 0) {
        return { lineTotal: null as number | null, vatAmount: null as number | null };
      }
      const unitPrice = Math.round(p.price * 100) / 100;
      const lineTotal = Math.round((l.quantity * unitPrice - discount) * 100) / 100;
      if (lineTotal < 0) {
        return { lineTotal: null as number | null, vatAmount: null as number | null };
      }
      subtotal += lineTotal;

      const vr = this.parseOptionalVatRate(l.vatRate);
      let vatAmount: number | null = null;
      if (vr != null) {
        vatAmount = Math.round(lineTotal * (vr / 100) * 100) / 100;
        vatTotal += vatAmount;
      }
      return { lineTotal, vatAmount };
    });

    subtotal = Math.round(subtotal * 100) / 100;
    vatTotal = Math.round(vatTotal * 100) / 100;
    const grandWithVat = Math.round((subtotal + vatTotal) * 100) / 100;

    return { lines, subtotal, vatTotal, grandWithVat };
  });

  /** Sipariş oluştur sekmesi: arama + kg/tepsi filtreleri */
  readonly productsFilteredForCreate = computed(() => {
    const products = this.productsData.products();
    const q = this.createProductSearch().trim().toLowerCase();
    const uf = this.createUnitFilter();
    return products.filter((p) => {
      if (p.active === false) {
        return false;
      }
      const code = (p.unitCode ?? '').trim().toLowerCase();
      if (uf === 'kg' && code !== 'kg') {
        return false;
      }
      if (uf === 'tepsi' && code !== 'tepsi') {
        return false;
      }
      if (!q) {
        return true;
      }
      const hay = `${p.name} ${p.sku}`.toLowerCase();
      return hay.includes(q);
    });
  });

  /** Sipariş düzenleme: aktif ürünler + satırda seçili pasif ürün (geçmiş sipariş koruma). */
  productsSelectableForEditLine(currentProductId: string | null | undefined): ProductDto[] {
    const cur = String(currentProductId ?? '').trim();
    return this.productsData.products().filter(
      (p) => p.active !== false || (cur !== '' && p.id === cur),
    );
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const id = String(params.get('orderId') ?? '').trim();
      this.requestedOrderId.set(id || null);
      this.tryOpenRequestedOrder();
    });

    this.ordersData.load();
    if (!this.isSuperAdmin()) {
      this.productsData.load(this.auth.user().dealerId ?? null).subscribe();
    }
    if (this.needsDealerFilter()) {
      this.dealersData.load();
    }
    if (this.isSuperAdmin()) {
      this.newOrderForm.controls.dealerId.valueChanges
        .pipe(startWith(this.newOrderForm.controls.dealerId.value))
        .subscribe((dealer) => {
          const id = String(dealer ?? '').trim() || null;
          this.productsData.load(id).subscribe(() => {
            if (this.ordersViewTab() === 'create') {
              this.syncDealerLineDiscounts();
            }
          });
        });
    }
  }

  private tryOpenRequestedOrder(): void {
    const orderId = this.requestedOrderId();
    if (!orderId) {
      return;
    }
    const order = this.ordersData.orders().find((o) => o.id === orderId);
    if (!order) {
      return;
    }
    this.openDetail(order);
    this.requestedOrderId.set(null);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { orderId: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  applyFilters(): void {
    this.ordersData.load({
      dateFrom: this.filterDateFrom().trim() || undefined,
      dateTo: this.filterDateTo().trim() || undefined,
      dealerId: this.needsDealerFilter() ? (this.filterDealerId().trim() || undefined) : undefined,
      status: (this.filterStatus() || undefined) as OrderDto['status'] | undefined,
      invoice: this.filterInvoice() || undefined,
      search: this.filterSearch().trim() || undefined,
    });
  }

  clearFilters(): void {
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.filterDealerId.set('');
    this.filterStatus.set('');
    this.filterInvoice.set('');
    this.filterSearch.set('');
    this.ordersData.load(null);
  }

  private createLineGroup() {
    return this.fb.nonNullable.group({
      productId: ['', Validators.required],
      quantity: [1, [cartLineIntegerQtyValidator]],
      /** Varsayılan %1; boşaltılırsa API’de vat_rate gönderilmez (null). */
      vatRate: this.fb.control<number | null>(1),
      discountAmount: this.fb.control(0, { nonNullable: true, validators: [Validators.min(0)] }),
    });
  }

  private createEditLineGroup(line?: OrderLineDto) {
    return this.fb.nonNullable.group({
      productId: [line?.productId ?? '', Validators.required],
      quantity: [line?.quantity ?? 1, [Validators.required, Validators.min(0.001)]],
      vatRate: this.fb.control<number | null>(
        line ? (line.vatRate ?? null) : 1,
      ),
      discountAmount: [line?.discountAmount ?? 0, [Validators.required, Validators.min(0)]],
    });
  }

  /** 0–100 arası sayı veya boş; aksi halde undefined (gönderilmez). */
  private parseOptionalVatRate(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return undefined;
    }
    const r = Math.round(n * 100) / 100;
    if (r < 0 || r > 100) {
      return undefined;
    }
    return r;
  }

  /** Bayi birim indirimine göre satır toplam indirimini doldurur */
  private syncDealerLineDiscounts(): void {
    const raw = this.newOrderForm.getRawValue() as NewOrderFormRawValue;
    const did = this.isSuperAdmin()
      ? String(raw.dealerId ?? '').trim()
      : String(this.auth.user().dealerId ?? '').trim();
    if (this.isSuperAdmin() && !did) {
      this.lineControls.controls.forEach((g) => {
        g.get('discountAmount')?.patchValue(0, { emitEvent: false });
      });
      return;
    }
    const products = this.productsData.products();
    const byId = new Map(products.map((p) => [p.id, p]));
    this.lineControls.controls.forEach((g) => {
      const pid = String(g.get('productId')?.value ?? '').trim();
      const qty = Math.max(1, Math.floor(Number(g.get('quantity')?.value) || 1));
      const p = pid ? byId.get(pid) : undefined;
      if (!p) {
        g.get('discountAmount')?.patchValue(0, { emitEvent: false });
        return;
      }
      const list = Math.round(p.price * 100) / 100;
      const dpu = Math.round((p.dealerDiscountPerUnit ?? 0) * 100) / 100;
      const maxDisc = Math.round(qty * list * 100) / 100;
      const rule = Math.min(Math.round(dpu * qty * 100) / 100, maxDisc);
      g.get('discountAmount')?.patchValue(rule, { emitEvent: false });
    });
  }

  get lineControls(): FormArray {
    return this.newOrderForm.controls.lines as FormArray;
  }

  get editLineControls(): FormArray {
    return this.editOrderForm.controls.lines as FormArray;
  }

  removeLine(index: number): void {
    this.lineControls.removeAt(index);
    this.syncDealerLineDiscounts();
  }

  addEditLine(): void {
    this.editLineControls.push(this.createEditLineGroup());
  }

  removeEditLine(index: number): void {
    if (this.editLineControls.length <= 1) {
      return;
    }
    this.editLineControls.removeAt(index);
  }

  private resetNewOrderForm(): void {
    this.formError.set(null);
    this.newOrderForm.reset({
      dealerId: this.isSuperAdmin() ? '' : (this.auth.user().dealerId ?? ''),
      description: '',
    });
    this.lineControls.clear();
    this.syncDealerLineDiscounts();
  }

  /** Üst başlıktaki “Yeni sipariş” ve alt sekme: sipariş oluştur görünümü */
  openCreateTab(): void {
    if (!this.permissions.has(Permission.ordersCreate)) {
      return;
    }
    this.resetNewOrderForm();
    this.createProductSearch.set('');
    this.createUnitFilter.set('all');
    this.ordersViewTab.set('create');
    const after = () => this.syncDealerLineDiscounts();
    if (this.isSuperAdmin()) {
      const did = String(this.newOrderForm.controls.dealerId.value ?? '').trim() || null;
      this.productsData.load(did).subscribe({ next: after });
    } else {
      this.productsData.load(this.auth.user().dealerId ?? null).subscribe({ next: after });
    }
  }

  goToListTab(): void {
    this.ordersViewTab.set('list');
  }

  cancelCreateTab(): void {
    this.formError.set(null);
    this.resetNewOrderForm();
    this.ordersViewTab.set('list');
  }

  setCreateUnitFilter(v: 'all' | 'kg' | 'tepsi'): void {
    this.createUnitFilter.set(v);
  }

  productById(id: string | null | undefined): ProductDto | undefined {
    const s = String(id ?? '').trim();
    if (!s) {
      return undefined;
    }
    return this.productsData.products().find((p) => p.id === s);
  }

  /** Ürün kartından veya tekrar tıklamayla: aynı üründe miktar artar */
  addProductToOrder(productId: string): void {
    const pid = String(productId).trim();
    if (!pid) {
      return;
    }
    const arr = this.lineControls;
    for (let i = 0; i < arr.length; i++) {
      const g = arr.at(i);
      if (String(g.get('productId')?.value ?? '').trim() === pid) {
        const q = Number(g.get('quantity')?.value) || 0;
        g.get('quantity')?.setValue(Math.max(1, Math.floor(q) + 1));
        this.syncDealerLineDiscounts();
        return;
      }
    }
    for (let i = 0; i < arr.length; i++) {
      const g = arr.at(i);
      if (!String(g.get('productId')?.value ?? '').trim()) {
        g.patchValue({
          productId: pid,
          quantity: Math.max(1, Math.floor(Number(g.get('quantity')?.value) || 1)),
        });
        this.syncDealerLineDiscounts();
        return;
      }
    }
    const g = this.createLineGroup();
    g.patchValue({ productId: pid, quantity: 1 });
    arr.push(g);
    this.syncDealerLineDiscounts();
  }

  adjustLineQty(index: number, delta: number): void {
    const g = this.lineControls.at(index);
    if (!g) {
      return;
    }
    const q = Number(g.get('quantity')?.value) || 0;
    const base = Math.floor(q);
    const next = base + delta;
    g.get('quantity')?.setValue(Math.max(1, next));
    this.syncDealerLineDiscounts();
  }

  /** Sepet miktarı: yalnızca rakamlar; e/E/+-/ondalık ve harf engellenir. */
  onCartQtyKeydown(ev: KeyboardEvent): void {
    const allowedNav = new Set([
      'Backspace',
      'Delete',
      'Tab',
      'Escape',
      'Enter',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Home',
      'End',
    ]);
    if (allowedNav.has(ev.key)) {
      return;
    }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) {
      return;
    }
    const k = ev.key;
    if (k === 'e' || k === 'E' || k === '+' || k === '-') {
      ev.preventDefault();
      return;
    }
    if (k === '.' || k === ',') {
      const t = ev.target as HTMLInputElement;
      const val = String(t.value ?? '');
      if (val.includes('.') || val.includes(',')) {
        ev.preventDefault();
      }
      return;
    }
    if (!/^\d$/.test(k)) {
      ev.preventDefault();
    }
  }

  onCartQtyPaste(ev: ClipboardEvent, index: number): void {
    ev.preventDefault();
    const sanitized = (ev.clipboardData?.getData('text') ?? '').replace(/\D/g, '');
    const n = parseInt(sanitized, 10);
    if (!Number.isFinite(n) || n < 1) {
      return;
    }
    const q = Math.min(n, 1e9);
    const g = this.lineControls.at(index);
    const c = g?.get('quantity');
    if (!c) {
      return;
    }
    c.setValue(q);
    (ev.target as HTMLInputElement).value = String(q);
    this.syncDealerLineDiscounts();
  }

  onCartQtyBlur(index: number, ev: FocusEvent): void {
    const el = ev.target as HTMLInputElement;
    const g = this.lineControls.at(index);
    const c = g?.get('quantity');
    if (!c) {
      return;
    }
    const raw = String(el.value ?? '').replace(/\D/g, '');
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) {
      c.setValue(1);
      el.value = '1';
      this.syncDealerLineDiscounts();
      return;
    }
    const q = Math.min(n, 1e9);
    c.setValue(q);
    el.value = String(q);
    this.syncDealerLineDiscounts();
  }

  /** Miktar 1 iken azaltma (sipariş oluştur sepeti) */
  qtyDecreaseDisabled(index: number): boolean {
    const g = this.lineControls.at(index);
    if (!g) {
      return true;
    }
    const q = Number(g.get('quantity')?.value);
    if (!Number.isFinite(q)) {
      return true;
    }
    return q <= 1;
  }

  openDetail(o: OrderDto): void {
    this.detailOpen.set(o);
  }

  closeDetail(): void {
    this.detailOpen.set(null);
  }

  openEdit(o: OrderDto): void {
    if (!this.permissions.has(Permission.ordersEdit)) {
      return;
    }
    this.closeDetail();
    this.editFormError.set(null);
    this.productsData.load(o.dealerId ?? null).subscribe();
    this.editingOrderId.set(o.id);
    this.editOrderMeta.set({ dealerName: o.dealerName, createdAt: o.createdAt });
    this.editOrderForm.controls.status.setValue(o.status);
    this.editOrderForm.controls.description.setValue(o.description ?? '');
    const arr = this.editLineControls;
    arr.clear();
    if (o.lines.length === 0) {
      arr.push(this.createEditLineGroup());
    } else {
      for (const ln of o.lines) {
        arr.push(this.createEditLineGroup(ln));
      }
    }
    this.editFormOpen.set(true);
  }

  closeEditForm(): void {
    this.editFormOpen.set(false);
    this.editFormError.set(null);
    this.editingOrderId.set(null);
    this.editOrderMeta.set(null);
    if (this.isSuperAdmin()) {
      this.productsData.load(null).subscribe();
    } else {
      this.productsData.load(this.auth.user().dealerId ?? null).subscribe();
    }
  }

  submitEdit(): void {
    const oid = this.editingOrderId();
    if (!oid) {
      return;
    }
    if (this.editOrderForm.invalid) {
      this.editOrderForm.markAllAsTouched();
      return;
    }

    const raw = this.editOrderForm.getRawValue();

    for (const l of raw.lines) {
      if (!l.productId || !(l.quantity > 0)) {
        continue;
      }
      const v = l.vatRate;
      const hasVat =
        v !== null && v !== undefined && !(typeof v === 'string' && String(v).trim() === '');
      if (hasVat && this.parseOptionalVatRate(v) === undefined) {
        this.editFormError.set('orders.vatInvalid');
        return;
      }
    }

    const lines = raw.lines
      .filter((l) => l.productId && l.quantity > 0)
      .map((l) => {
        const row: {
          product_id: string;
          quantity: number;
          discount_amount: number;
          vat_rate?: number | null;
        } = {
          product_id: String(l.productId).trim(),
          quantity: Number(l.quantity),
          discount_amount: Math.max(0, Math.round(Number(l.discountAmount) * 100) / 100),
        };
        const vr = this.parseOptionalVatRate(l.vatRate);
        if (vr !== undefined) {
          row.vat_rate = vr;
        }
        return row;
      });

    if (lines.length === 0) {
      this.editFormError.set('orders.linesRequired');
      return;
    }

    this.saving.set(true);
    this.editFormError.set(null);
    const updatePayload: OrderUpdatePayload = {
      order_id: oid,
      status: raw.status,
      description: String(raw.description ?? '').trim(),
      lines,
    };
    this.ordersData.update(updatePayload).subscribe({
      next: (r) => {
        this.saving.set(false);
        if (!r.ok) {
          this.editFormError.set(r.message ?? 'orders.saveError');
          return;
        }
        this.closeEditForm();
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.editFormError.set(err?.error?.message ?? 'orders.saveError');
      },
    });
  }

  submitNew(): void {
    if (this.newOrderForm.invalid) {
      this.newOrderForm.markAllAsTouched();
      return;
    }
    if (this.isSuperAdmin() && !String(this.newOrderForm.controls.dealerId.value).trim()) {
      this.formError.set('orders.dealerRequired');
      return;
    }

    const raw = this.newOrderForm.getRawValue() as NewOrderFormRawValue;
    const formLines = raw.lines;

    for (const l of formLines) {
      if (!l.productId || !(l.quantity > 0)) {
        continue;
      }
      const v = l.vatRate;
      const hasVat =
        v !== null && v !== undefined && !(typeof v === 'string' && String(v).trim() === '');
      if (hasVat && this.parseOptionalVatRate(v) === undefined) {
        this.formError.set('orders.vatInvalid');
        return;
      }
    }

    const lines = formLines
      .filter((l) => l.productId && l.quantity > 0)
      .map((l) => {
        const row: {
          product_id: string;
          quantity: number;
          vat_rate?: number | null;
          discount_amount?: number;
        } = {
          product_id: String(l.productId).trim(),
          quantity: Number(l.quantity),
        };
        if (this.isSuperAdmin()) {
          row.discount_amount = Math.max(
            0,
            Math.round(Number(l.discountAmount ?? 0) * 100) / 100,
          );
        }
        const vr = this.parseOptionalVatRate(l.vatRate);
        if (vr !== undefined) {
          row.vat_rate = vr;
        }
        return row;
      });

    if (lines.length === 0) {
      this.formError.set('orders.linesRequired');
      return;
    }

    const payload: OrderCreatePayload = { lines };
    if (this.isSuperAdmin()) {
      payload.dealer_id = String(raw.dealerId).trim();
    } else {
      const did = this.auth.user().dealerId;
      if (did) {
        payload.dealer_id = did;
      }
    }
    const descTrim = String(raw.description ?? '').trim();
    if (descTrim) {
      payload.description = descTrim;
    }

    if (!window.confirm(this.i18n.translate('orders.createConfirmMessage'))) {
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    this.ordersData.create(payload).subscribe({
      next: (r) => {
        this.saving.set(false);
        if (!r.ok) {
          this.formError.set(r.message ?? 'orders.saveError');
          return;
        }
        this.resetNewOrderForm();
        this.ordersViewTab.set('list');
        this.ordersData.load();
      },
      error: (err: { error?: { message?: string } }) => {
        this.saving.set(false);
        this.formError.set(err?.error?.message ?? 'orders.saveError');
      },
    });
  }

  errorText(key: string): string {
    if (key.startsWith('orders.')) {
      return this.i18n.translate(key);
    }
    return key;
  }

  hasLineDiscount(o: OrderDto): boolean {
    return o.lines.some((l) => l.discountAmount > 0);
  }

  canInvoice(order: OrderDto): boolean {
    return (
      this.permissions.has(Permission.ordersEdit) &&
      order.status !== 'cancelled' &&
      !order.invoiceId &&
      order.lines.length > 0
    );
  }

  /** Son API yüklemesiyle uyumlu filtre özeti (Excel ilk sayfası). */
  private buildExportFilterRows(): [string, string][] {
    const f = this.ordersData.lastLoadFilters();
    const t = (k: string) => this.i18n.translate(k);
    const rows: [string, string][] = [];
    rows.push([t('filters.dateFrom'), f.dateFrom?.trim() || '—']);
    rows.push([t('filters.dateTo'), f.dateTo?.trim() || '—']);
    if (this.needsDealerFilter()) {
      const did = f.dealerId?.trim() ?? '';
      let dealer: string;
      if (did) {
        const d = this.dealersData.dealers().find((x) => x.id === did);
        dealer = d ? `${d.name} — ${d.region}` : did;
      } else {
        dealer = t('filters.allDealers');
      }
      rows.push([t('orders.col.dealer'), dealer]);
    }
    const st = f.status;
    rows.push([t('orders.col.status'), st ? t(`orders.status.${st}`) : t('filters.allStatuses')]);
    const inv = f.invoice;
    let invLabel = t('filters.invoiceAny');
    if (inv === 'with') {
      invLabel = t('filters.invoiceWith');
    } else if (inv === 'without') {
      invLabel = t('filters.invoiceWithout');
    }
    rows.push([t('filters.invoiceLink'), invLabel]);
    rows.push([t('filters.search'), f.search?.trim() || '—']);
    return rows;
  }

  private exportColumnLabels(): OrdersXlsxColumnLabels {
    const t = (k: string) => this.i18n.translate(k);
    return {
      sheetFilters: t('orders.export.sheetFilters'),
      sheetOrders: t('orders.export.sheetOrders'),
      sheetLines: t('orders.export.sheetLines'),
      sheetSimple: t('orders.export.sheetSimple'),
      filterKey: t('orders.export.filterKey'),
      filterValue: t('orders.export.filterValue'),
      orderId: t('orders.col.id'),
      dealer: t('orders.col.dealer'),
      linesCount: t('orders.col.lines'),
      totalExVat: t('orders.col.total'),
      vatTotal: t('orders.detailVatSum'),
      totalIncVat: t('orders.detailTotalIncVat'),
      date: t('orders.col.date'),
      status: t('orders.col.status'),
      invoiceId: t('invoices.col.id'),
      invoiceStatus: t('invoices.col.status'),
      orderDescription: t('orders.description'),
      product: t('orders.line.product'),
      sku: t('orders.line.sku'),
      unit: t('orders.line.unit'),
      qty: t('orders.line.qty'),
      unitPrice: t('orders.line.unitPrice'),
      lineTotal: t('orders.line.lineTotal'),
      vatPct: t('orders.line.vat'),
      vatAmount: t('orders.line.vatAmount'),
      lineTotalIncVat: t('orders.line.lineTotalIncVat'),
      discount: t('orders.line.discount'),
      simpleQty: t('orders.export.simpleQty'),
      sheetOrderBook: t('orders.export.sheetOrderBook'),
      sheetProductTotals: t('orders.export.sheetProductTotals'),
      productTotalsProduct: t('orders.export.productTotalsProduct'),
      productTotalsUnit: t('orders.export.productTotalsUnit'),
      productTotalsTotalQty: t('orders.export.productTotalsTotalQty'),
    };
  }

  exportOrdersExcel(): void {
    const list = this.ordersData.orders();
    if (list.length === 0) {
      return;
    }
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `siparisler_${stamp}.xlsx`;

    downloadOrdersXlsx(list, {
      filterRows: this.buildExportFilterRows(),
      labels: this.exportColumnLabels(),
      orderStatus: (o) => this.i18n.translate(`orders.status.${o.status}`),
      invoiceStatus: (inv) => this.i18n.translate(`invoices.status.${inv}`),
      unitLabel: (line) => this.i18n.displayUnitName(line.unitCode ?? '', line.unit),
    }, filename);
  }

  invoiceFromOrder(o: OrderDto): void {
    if (!this.canInvoice(o)) {
      return;
    }
    this.invoiceError.set(null);
    this.invoicingOrderId.set(o.id);
    this.ordersData.invoiceFromOrder(o.id).subscribe({
      next: (r) => {
        this.invoicingOrderId.set(null);
        if (!r.ok) {
          this.invoiceError.set(r.message ?? 'orders.invoiceError');
          return;
        }
        this.invoiceError.set(null);
      },
      error: (err: { error?: { message?: string } }) => {
        this.invoicingOrderId.set(null);
        this.invoiceError.set(err?.error?.message ?? 'orders.invoiceError');
      },
    });
  }
}
