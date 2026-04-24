import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DealersMockService } from '../dealers/dealers-mock.service';
import { AccountLedgerDataService, PaymentMethodCode } from './account-ledger-data.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { AccountMovementRowDto } from '../../core/models/api.types';
import { catchError, finalize, of } from 'rxjs';

@Component({
  selector: 'app-account-ledger-page',
  standalone: true,
  imports: [PageHeaderComponent, TranslatePipe, DecimalPipe, FormsModule, RouterLink],
  templateUrl: './account-ledger-page.component.html',
  styleUrl: './account-ledger-page.component.scss',
})
export class AccountLedgerPageComponent implements OnInit {
  readonly data = inject(AccountLedgerDataService);
  readonly dealersData = inject(DealersMockService);
  private readonly auth = inject(AuthService);

  readonly isSuperAdmin = computed(() => this.auth.user().role === 'super_admin');
  readonly isDealerUser = computed(() => this.auth.user().role === 'dealer');

  readonly selectedDealerId = signal<string>('');
  readonly movements = signal<AccountMovementRowDto[]>([]);
  readonly closingBalance = signal<number | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  readonly payAmount = signal('');
  readonly payMethod = signal<PaymentMethodCode>('bank_transfer');
  readonly payDate = signal('');
  readonly payReference = signal('');
  readonly payNote = signal('');
  readonly payBusy = signal(false);
  readonly payError = signal<string | null>(null);
  readonly payOk = signal<string | null>(null);

  /** Doluysa üst form mevcut tahsilatı günceller (yeni satır oluşmaz). */
  readonly editingPaymentId = signal<string | null>(null);

  readonly dealerSearchQuery = signal('');

  readonly dealersSorted = computed(() =>
    [...this.dealersData.dealers().filter((d) => d.active)].sort((a, b) =>
      a.name.localeCompare(b.name, 'tr'),
    ),
  );

  readonly dealersFiltered = computed(() => {
    const q = this.dealerSearchQuery().trim().toLocaleLowerCase('tr');
    const all = this.dealersSorted();
    if (q === '') {
      return all;
    }
    return all.filter((d) => {
      const hay = `${d.name} ${d.region} ${d.il} ${d.ilce} ${d.konum} ${d.telefon}`.toLocaleLowerCase('tr');
      return hay.includes(q);
    });
  });

  constructor() {
    effect(() => {
      if (this.isDealerUser()) {
        return;
      }
      const list = this.dealersFiltered();
      if (this.selectedDealerId() === '' && list.length > 0) {
        this.selectDealer(list[0].id);
      }
    });
  }

  ngOnInit(): void {
    this.dealersData.load();
    const role = this.auth.user().role;
    const did = this.auth.user().dealerId;
    if (role === 'dealer' && did) {
      this.selectedDealerId.set(did);
      this.reloadMovements();
    }
  }

  selectDealer(id: string): void {
    this.cancelEditPayment();
    this.selectedDealerId.set(id);
    this.reloadMovements();
  }

  reloadMovements(): void {
    this.loadError.set(null);
    const id = this.selectedDealerId().trim();
    if (!id) {
      this.movements.set([]);
      this.closingBalance.set(null);
      return;
    }
    this.loading.set(true);
    this.data
      .getMovements(id)
      .pipe(
        finalize(() => this.loading.set(false)),
        catchError(() => of({ ok: false as const, message: 'ledger.loadError' })),
      )
      .subscribe((r) => {
        if (r.ok && r.items) {
          this.movements.set(r.items);
          this.closingBalance.set(
            typeof r.closingBalance === 'number' ? r.closingBalance : null,
          );
        } else {
          this.movements.set([]);
          this.closingBalance.set(null);
          this.loadError.set(r.message ?? 'ledger.loadError');
        }
      });
  }

  submitPayCard(): void {
    if (this.editingPaymentId()) {
      this.submitPaymentUpdate();
    } else {
      this.submitPayment();
    }
  }

  submitPayment(): void {
    if (!this.isSuperAdmin()) {
      return;
    }
    this.payError.set(null);
    this.payOk.set(null);
    const dealerId = this.selectedDealerId().trim();
    if (!dealerId) {
      this.payError.set('ledger.paySelectDealer');
      return;
    }
    const raw = this.payAmount().replace(',', '.').trim();
    const amount = parseFloat(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      this.payError.set('ledger.payInvalidAmount');
      return;
    }
    let paidAt = this.payDate().trim();
    if (paidAt.includes('T')) {
      paidAt = paidAt.replace('T', ' ');
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(paidAt)) {
        paidAt += ':00';
      }
    }
    this.payBusy.set(true);
    this.data
      .postPayment({
        dealer_id: dealerId,
        amount: Math.round(amount * 100) / 100,
        method: this.payMethod(),
        ...(paidAt !== '' ? { paid_at: paidAt } : {}),
        reference: this.payReference().trim(),
        note: this.payNote().trim() || undefined,
      })
      .pipe(finalize(() => this.payBusy.set(false)))
      .subscribe((r) => {
        if (r.ok) {
          this.payOk.set('ledger.paySaved');
          this.editingPaymentId.set(null);
          this.payAmount.set('');
          this.payReference.set('');
          this.payNote.set('');
          this.reloadMovements();
        } else {
          this.payError.set(r.message ?? 'ledger.payError');
        }
      });
  }

  submitPaymentUpdate(): void {
    if (!this.isSuperAdmin()) {
      return;
    }
    const paymentId = this.editingPaymentId();
    if (!paymentId) {
      return;
    }
    this.payError.set(null);
    this.payOk.set(null);
    const dealerId = this.selectedDealerId().trim();
    if (!dealerId) {
      this.payError.set('ledger.paySelectDealer');
      return;
    }
    const raw = this.payAmount().replace(',', '.').trim();
    const amount = parseFloat(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      this.payError.set('ledger.payInvalidAmount');
      return;
    }
    let paidAt = this.payDate().trim();
    if (paidAt.includes('T')) {
      paidAt = paidAt.replace('T', ' ');
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(paidAt)) {
        paidAt += ':00';
      }
    }
    if (paidAt === '') {
      this.payError.set('ledger.payDateRequired');
      return;
    }
    this.payBusy.set(true);
    this.data
      .updatePayment({
        payment_id: paymentId,
        dealer_id: dealerId,
        amount: Math.round(amount * 100) / 100,
        method: this.payMethod(),
        paid_at: paidAt,
        reference: this.payReference().trim(),
        note: this.payNote().trim() || undefined,
      })
      .pipe(finalize(() => this.payBusy.set(false)))
      .subscribe((r) => {
        if (r.ok) {
          this.payOk.set('ledger.paymentUpdated');
          this.cancelEditPayment();
          this.reloadMovements();
        } else {
          this.payError.set(r.message ?? 'ledger.paymentUpdateError');
        }
      });
  }

  startEditPayment(row: AccountMovementRowDto): void {
    if (!this.isSuperAdmin() || row.kind !== 'payment' || !row.paymentId) {
      return;
    }
    this.payError.set(null);
    this.payOk.set(null);
    this.editingPaymentId.set(row.paymentId);
    this.payAmount.set((Math.round(row.credit * 100) / 100).toFixed(2));
    this.payMethod.set(this.parsePaymentMethod(row.paymentMethod));
    this.payDate.set(this.movementAtToDatetimeLocal(row.movementAt));
    this.payReference.set(row.paymentReference ?? '');
    this.payNote.set(row.paymentNote ?? '');
    queueMicrotask(() =>
      document.getElementById('ledger-pay-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }

  cancelEditPayment(): void {
    this.editingPaymentId.set(null);
    this.payAmount.set('');
    this.payMethod.set('bank_transfer');
    this.payDate.set('');
    this.payReference.set('');
    this.payNote.set('');
    this.payError.set(null);
  }

  canEditPayment(row: AccountMovementRowDto): boolean {
    return row.kind === 'payment' && !!row.paymentId;
  }

  tableColspan(): number {
    return this.isSuperAdmin() ? 6 : 5;
  }

  private parsePaymentMethod(m: string | null | undefined): PaymentMethodCode {
    const allowed: PaymentMethodCode[] = ['bank_transfer', 'credit_card', 'check', 'cash', 'other'];
    if (m && (allowed as readonly string[]).includes(m)) {
      return m as PaymentMethodCode;
    }
    return 'bank_transfer';
  }

  private movementAtToDatetimeLocal(s: string): string {
    const t = s.trim().replace(' ', 'T');
    return t.length >= 16 ? t.slice(0, 16) : t;
  }

  kindLabelKey(kind: string): string {
    switch (kind) {
      case 'invoice':
        return 'ledger.kind.invoice';
      case 'payment':
        return 'ledger.kind.payment';
      case 'invoice_cancel':
        return 'ledger.kind.invoice_cancel';
      case 'adjustment':
        return 'ledger.kind.adjustment';
      default:
        return 'ledger.kind.unknown';
    }
  }

  /** Cari satırındaki fatura no Faturalar sayfasına gider */
  invoiceRowLinkable(kind: string): boolean {
    return kind === 'invoice' || kind === 'invoice_cancel';
  }
}
