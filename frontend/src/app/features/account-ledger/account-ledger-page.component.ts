import { Component, ElementRef, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
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
import { HttpErrorResponse } from '@angular/common/http';
import { I18nService } from '../../core/services/i18n.service';
import { downloadAccountLedgerXlsx } from './export-account-ledger-xlsx';

@Component({
  selector: 'app-account-ledger-page',
  standalone: true,
  imports: [PageHeaderComponent, TranslatePipe, DecimalPipe, FormsModule, RouterLink],
  templateUrl: './account-ledger-page.component.html',
  styleUrl: './account-ledger-page.component.scss',
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
})
export class AccountLedgerPageComponent implements OnInit {
  readonly data = inject(AccountLedgerDataService);
  readonly dealersData = inject(DealersMockService);
  private readonly auth = inject(AuthService);
  private readonly i18n = inject(I18nService);

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

  readonly adjAmount = signal('');
  readonly adjDate = signal('');
  readonly adjNote = signal('');
  readonly adjBusy = signal(false);
  readonly adjError = signal<string | null>(null);
  readonly adjOk = signal<string | null>(null);

  /** Borçlandırma / tahsilat kartları accordion (varsayılan kapalı) */
  readonly chargeSectionOpen = signal(false);
  readonly paymentSectionOpen = signal(false);

  /** Doluysa üst form mevcut tahsilatı günceller (yeni satır oluşmaz). */
  readonly editingPaymentId = signal<string | null>(null);

  readonly dealerSearchQuery = signal('');

  /** Aramalı bayi seçici (combobox) açık mı ve klavyeyle gezilen satır. */
  readonly dealerPickerOpen = signal(false);
  readonly dealerActiveIndex = signal(0);
  private readonly dealerPickerRef = viewChild<ElementRef<HTMLElement>>('dealerPicker');

  /** Liste + Excel: hareket `YYYY-MM-DD` (tarih kısmı) bu aralıkta mı */
  readonly filterDateFrom = signal('');
  readonly filterDateTo = signal('');

  readonly selectedDealerName = computed(() => {
    const id = this.selectedDealerId().trim();
    if (id === '') {
      return '';
    }
    const d = this.dealersData.dealers().find((x) => x.id === id);
    return d?.name ?? id;
  });

  readonly filteredMovements = computed(() => {
    const list = this.movements();
    const from = this.filterDateFrom().trim();
    const to = this.filterDateTo().trim();
    if (from === '' && to === '') {
      return list;
    }
    return list.filter((row) => {
      const day = row.movementAt.trim().slice(0, 10);
      if (from !== '' && day < from) {
        return false;
      }
      if (to !== '' && day > to) {
        return false;
      }
      return true;
    });
  });

  /**
   * Seçilen tarih aralığındaki toplamlar.
   * Satış = fatura borçları − fatura iptalleri.
   * Satış + borçlandırma = satış + manuel borçlandırmalar.
   * Tahsilat = tahsilat alacakları.
   */
  readonly periodTotals = computed(() => {
    let sales = 0;
    let charges = 0;
    let collections = 0;
    for (const row of this.filteredMovements()) {
      if (row.kind === 'invoice') {
        sales += row.debit;
      } else if (row.kind === 'invoice_cancel') {
        sales -= row.credit;
      } else if (row.kind === 'adjustment') {
        // Borçlandırma normalde borç tarafındadır; alacak yönlü düzeltme de desteklenir.
        charges += row.debit - row.credit;
      } else if (row.kind === 'payment') {
        collections += row.credit;
      }
    }
    return {
      sales: Math.round(sales * 100) / 100,
      salesWithCharges: Math.round((sales + charges) * 100) / 100,
      collections: Math.round(collections * 100) / 100,
    };
  });

  /** Toplamların hangi aralığa ait olduğunu gösteren etiket. */
  readonly periodRangeText = computed(() => {
    const from = this.filterDateFrom().trim();
    const to = this.filterDateTo().trim();
    if (from === '' && to === '') {
      return this.i18n.translate('ledger.periodAll');
    }
    return `${from || '…'} – ${to || '…'}`;
  });

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
      // İlk açılışta seçim yap; arama kutusundan bağımsız olmalı.
      const list = this.dealersSorted();
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
    this.clearAdjustmentForm();
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
    this.selectedDealerId.set(id);
    this.closeDealerPicker();
    this.reloadMovements();
  }

  /** Input'a tıklanınca tüm liste görünsün diye arama sıfırlanır. */
  openDealerPicker(): void {
    if (this.isDealerUser() || this.dealerPickerOpen()) {
      return;
    }
    this.dealerSearchQuery.set('');
    this.dealerActiveIndex.set(0);
    this.dealerPickerOpen.set(true);
  }

  closeDealerPicker(): void {
    if (!this.dealerPickerOpen()) {
      return;
    }
    this.dealerPickerOpen.set(false);
    this.dealerSearchQuery.set('');
    this.dealerActiveIndex.set(0);
  }

  toggleDealerPicker(): void {
    if (this.dealerPickerOpen()) {
      this.closeDealerPicker();
    } else {
      this.openDealerPicker();
    }
  }

  onDealerSearchInput(value: string): void {
    this.dealerPickerOpen.set(true);
    this.dealerSearchQuery.set(value);
    this.dealerActiveIndex.set(0);
  }

  onDealerKeydown(event: KeyboardEvent): void {
    const list = this.dealersFiltered();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.dealerPickerOpen()) {
          this.openDealerPicker();
          return;
        }
        if (list.length > 0) {
          this.dealerActiveIndex.update((i) => (i + 1) % list.length);
        }
        return;
      case 'ArrowUp':
        event.preventDefault();
        if (list.length > 0) {
          this.dealerActiveIndex.update((i) => (i - 1 + list.length) % list.length);
        }
        return;
      case 'Enter': {
        if (!this.dealerPickerOpen()) {
          return;
        }
        event.preventDefault();
        const target = list[this.dealerActiveIndex()];
        if (target) {
          this.selectDealer(target.id);
        }
        return;
      }
      case 'Escape':
        if (this.dealerPickerOpen()) {
          event.preventDefault();
          this.closeDealerPicker();
        }
        return;
      case 'Tab':
        this.closeDealerPicker();
        return;
      default:
        return;
    }
  }

  /** Seçici dışına tıklanınca kapat (seçenek tıklaması hariç). */
  onDocumentPointerDown(event: Event): void {
    if (!this.dealerPickerOpen()) {
      return;
    }
    const host = this.dealerPickerRef()?.nativeElement;
    const target = event.target;
    if (host && target instanceof Node && host.contains(target)) {
      return;
    }
    this.closeDealerPicker();
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

  submitAdjustment(): void {
    if (!this.isSuperAdmin()) {
      return;
    }
    this.adjError.set(null);
    this.adjOk.set(null);
    const dealerId = this.selectedDealerId().trim();
    if (!dealerId) {
      this.adjError.set('ledger.paySelectDealer');
      return;
    }
    const raw = this.adjAmount().replace(',', '.').trim();
    const amount = parseFloat(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      this.adjError.set('ledger.payInvalidAmount');
      return;
    }
    const note = this.adjNote().trim();
    if (note === '') {
      this.adjError.set('ledger.chargeNoteRequired');
      return;
    }
    let movementAt = this.adjDate().trim();
    if (movementAt.includes('T')) {
      movementAt = movementAt.replace('T', ' ');
      if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(movementAt)) {
        movementAt += ':00';
      }
    }
    this.adjBusy.set(true);
    this.data
      .postAdjustment({
        dealer_id: dealerId,
        amount: Math.round(amount * 100) / 100,
        description: note,
        ...(movementAt !== '' ? { movement_at: movementAt } : {}),
      })
      .pipe(
        catchError((err: HttpErrorResponse) => {
          const body = err.error as { message?: string } | undefined;
          const msg = typeof body?.message === 'string' ? body.message : 'ledger.chargeError';
          return of({ ok: false as const, message: msg });
        }),
        finalize(() => this.adjBusy.set(false)),
      )
      .subscribe((r) => {
        if (r.ok) {
          this.adjOk.set('ledger.chargeSaved');
          this.adjAmount.set('');
          this.adjDate.set('');
          this.adjNote.set('');
          this.reloadMovements();
        } else {
          this.adjError.set(r.message ?? 'ledger.chargeError');
        }
      });
  }

  private clearAdjustmentForm(): void {
    this.adjAmount.set('');
    this.adjDate.set('');
    this.adjNote.set('');
    this.adjError.set(null);
    this.adjOk.set(null);
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
    this.paymentSectionOpen.set(true);
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

  toggleChargeSection(): void {
    this.chargeSectionOpen.update((v) => !v);
  }

  togglePaymentSection(): void {
    this.paymentSectionOpen.update((v) => !v);
  }

  clearLedgerDateFilter(): void {
    this.filterDateFrom.set('');
    this.filterDateTo.set('');
  }

  exportLedgerToExcel(): void {
    const rows = this.filteredMovements();
    const stamp = new Date().toISOString().slice(0, 10);
    const hhmm = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
    const filename = `cari_${stamp}_${hhmm}.xlsx`;
    const t = this.i18n;
    downloadAccountLedgerXlsx({
      filename,
      dealerName: this.selectedDealerName() || this.selectedDealerId(),
      dateFrom: this.filterDateFrom().trim(),
      dateTo: this.filterDateTo().trim(),
      closingBalance: this.closingBalance(),
      rows,
      kindLabel: (k) => t.translate(this.kindLabelKey(k)),
      labels: {
        summarySheet: t.translate('ledger.export.sheetName'),
        dealer: t.translate('ledger.export.dealer'),
        periodFrom: t.translate('ledger.export.periodFrom'),
        periodTo: t.translate('ledger.export.periodTo'),
        closingBalanceLabel: t.translate('ledger.export.closingBalance'),
        lastRowBalanceLabel: t.translate('ledger.export.lastRowBalance'),
        colDate: t.translate('ledger.col.date'),
        colDescription: t.translate('ledger.col.description'),
        colKind: t.translate('ledger.col.kind'),
        colInvoice: t.translate('ledger.col.invoiceId'),
        colDebit: t.translate('ledger.col.debit'),
        colCredit: t.translate('ledger.col.credit'),
        colBalance: t.translate('ledger.col.balance'),
      },
    });
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
