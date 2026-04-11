import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DecimalPipe } from '@angular/common';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { startWith } from 'rxjs';
import { Permission } from '../../config/permissions.config';
import { OrderDto, OrderLineDto } from '../../core/models/api.types';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { DealersMockService } from '../dealers/dealers-mock.service';
import { ProductsMockService } from '../products/products-mock.service';
import { OrdersMockService } from './orders-mock.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { UnitNamePipe } from '../../shared/pipes/unit-name.pipe';
import { CanDirective } from '../../shared/directives/can.directive';

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
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionsService);
  private readonly fb = inject(FormBuilder);
  protected readonly i18n = inject(I18nService);

  readonly isSuperAdmin = computed(() => this.auth.user().role === 'super_admin');

  readonly detailOpen = signal<OrderDto | null>(null);
  readonly formOpen = signal(false);
  readonly editFormOpen = signal(false);
  readonly editingOrderId = signal<string | null>(null);
  readonly editOrderMeta = signal<{ dealerName: string; createdAt: string } | null>(null);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  readonly editFormError = signal<string | null>(null);
  readonly invoicingOrderId = signal<string | null>(null);
  readonly invoiceError = signal<string | null>(null);

  readonly newOrderForm = this.fb.nonNullable.group({
    dealerId: [''],
    lines: this.fb.array([this.createLineGroup()]),
  });

  readonly editOrderForm = this.fb.nonNullable.group({
    status: this.fb.nonNullable.control<OrderDto['status']>('pending'),
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
    const raw = this.newOrderForm.getRawValue();
    const products = this.productsData.products();
    const byId = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    let vatTotal = 0;
    const lines = raw.lines.map((l) => {
      const p = l.productId ? byId.get(String(l.productId)) : undefined;
      if (!p || l.quantity == null || l.quantity <= 0) {
        return { lineTotal: null as number | null, vatAmount: null as number | null };
      }
      const unitPrice = Math.round(p.price * 100) / 100;
      const lineTotal = Math.round(l.quantity * unitPrice * 100) / 100;
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

  ngOnInit(): void {
    this.ordersData.load();
    this.productsData.load();
    if (this.isSuperAdmin()) {
      this.dealersData.load();
    }
  }

  private createLineGroup() {
    return this.fb.nonNullable.group({
      productId: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.001)]],
      /** Varsayılan %10; boşaltılırsa API’de vat_rate gönderilmez (null). */
      vatRate: this.fb.control<number | null>(10),
    });
  }

  private createEditLineGroup(line?: OrderLineDto) {
    return this.fb.nonNullable.group({
      productId: [line?.productId ?? '', Validators.required],
      quantity: [line?.quantity ?? 1, [Validators.required, Validators.min(0.001)]],
      vatRate: this.fb.control<number | null>(
        line ? (line.vatRate ?? null) : 10,
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

  get lineControls(): FormArray {
    return this.newOrderForm.controls.lines as FormArray;
  }

  get editLineControls(): FormArray {
    return this.editOrderForm.controls.lines as FormArray;
  }

  addLine(): void {
    this.lineControls.push(this.createLineGroup());
  }

  removeLine(index: number): void {
    if (this.lineControls.length <= 1) {
      return;
    }
    this.lineControls.removeAt(index);
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

  openNew(): void {
    this.formError.set(null);
    this.newOrderForm.reset({
      dealerId: this.isSuperAdmin() ? '' : (this.auth.user().dealerId ?? ''),
    });
    this.lineControls.clear();
    this.lineControls.push(this.createLineGroup());
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.formError.set(null);
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
    this.editingOrderId.set(o.id);
    this.editOrderMeta.set({ dealerName: o.dealerName, createdAt: o.createdAt });
    this.editOrderForm.controls.status.setValue(o.status);
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
    this.ordersData.update({ order_id: oid, status: raw.status, lines }).subscribe({
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

    const raw = this.newOrderForm.getRawValue();

    for (const l of raw.lines) {
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

    const lines = raw.lines
      .filter((l) => l.productId && l.quantity > 0)
      .map((l) => {
        const row: {
          product_id: string;
          quantity: number;
          vat_rate?: number | null;
        } = {
          product_id: String(l.productId).trim(),
          quantity: Number(l.quantity),
        };
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

    const payload: { dealer_id?: string; lines: typeof lines } = { lines };
    if (this.isSuperAdmin()) {
      payload.dealer_id = String(raw.dealerId).trim();
    } else {
      const did = this.auth.user().dealerId;
      if (did) {
        payload.dealer_id = did;
      }
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
        this.closeForm();
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
      !order.invoiceId &&
      order.lines.length > 0
    );
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
