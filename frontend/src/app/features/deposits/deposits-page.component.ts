import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { DealersMockService } from '../dealers/dealers-mock.service';
import { DepositsDataService, DepositMovementPostBody } from './deposits-data.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-deposits-page',
  standalone: true,
  imports: [PageHeaderComponent, TranslatePipe, DecimalPipe, FormsModule],
  templateUrl: './deposits-page.component.html',
  styleUrl: './deposits-page.component.scss',
})
export class DepositsPageComponent implements OnInit {
  readonly data = inject(DepositsDataService);
  readonly dealersData = inject(DealersMockService);
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  readonly isSuperAdmin = computed(() => this.auth.user().role === 'super_admin');
  readonly needsDealerFilter = computed(() => {
    const r = this.auth.user().role;
    return r === 'super_admin' || r === 'viewer';
  });

  readonly filterDealerId = signal('');

  readonly formKind = signal<'deposit_return' | 'manual_adjustment'>('deposit_return');
  readonly formDealerId = signal('');
  readonly formTypeId = signal('');
  readonly formQuantity = signal('');
  readonly formSignedDelta = signal('');
  readonly formNote = signal('');
  readonly formBusy = signal(false);
  readonly formError = signal<string | null>(null);

  ngOnInit(): void {
    if (this.needsDealerFilter()) {
      this.dealersData.load();
    }
    this.reload();
  }

  reload(): void {
    if (this.needsDealerFilter()) {
      const q = this.filterDealerId().trim();
      this.data.load(q || undefined);
    } else {
      const dealerId = this.auth.user().dealerId;
      this.data.load(dealerId ?? undefined);
    }
  }

  applyDealerFilter(): void {
    this.reload();
  }

  activeTypes() {
    return this.data.types().filter((t) => t.active);
  }

  reasonI18n(reason: string): string {
    const key = `deposits.reason.${reason}`;
    const t = this.i18n.translate(key);
    return t === key ? reason : t;
  }

  setFormKind(v: string): void {
    if (v === 'deposit_return' || v === 'manual_adjustment') {
      this.formKind.set(v);
    }
  }

  submitForm(): void {
    if (!this.isSuperAdmin()) {
      return;
    }
    this.formError.set(null);
    const typeId = parseInt(this.formTypeId(), 10);
    if (Number.isNaN(typeId) || typeId < 1) {
      this.formError.set('deposits.saveError');
      return;
    }

    if (this.needsDealerFilter() && this.formDealerId().trim() === '') {
      this.formError.set('deposits.saveError');
      return;
    }

    let dealerId: number;
    if (this.needsDealerFilter()) {
      dealerId = parseInt(this.formDealerId(), 10);
    } else {
      dealerId = parseInt(this.auth.user().dealerId ?? '0', 10);
    }
    if (Number.isNaN(dealerId) || dealerId < 1) {
      this.formError.set('deposits.saveError');
      return;
    }

    const kind = this.formKind();
    const body: DepositMovementPostBody = {
      kind,
      dealer_id: dealerId,
      returnable_packaging_type_id: typeId,
    };

    if (kind === 'deposit_return') {
      const q = parseFloat(this.formQuantity().replace(',', '.'));
      if (Number.isNaN(q) || q <= 0) {
        this.formError.set('deposits.saveError');
        return;
      }
      body.quantity = q;
    } else {
      const sd = parseFloat(this.formSignedDelta().replace(',', '.'));
      if (Number.isNaN(sd) || Math.abs(sd) < 0.0001) {
        this.formError.set('deposits.saveError');
        return;
      }
      body.signed_delta = sd;
    }

    const note = this.formNote().trim();
    if (note) {
      body.note = note;
    }

    this.formBusy.set(true);
    this.data.postMovement(body).subscribe({
      next: (r) => {
        this.formBusy.set(false);
        if (!r.ok) {
          this.formError.set(r.message ?? 'deposits.saveError');
          return;
        }
        this.formQuantity.set('');
        this.formSignedDelta.set('');
        this.formNote.set('');
        this.reload();
      },
      error: (err: { error?: { message?: string } }) => {
        this.formBusy.set(false);
        this.formError.set(err?.error?.message ?? 'deposits.saveError');
      },
    });
  }

  errText(key: string): string {
    if (key.startsWith('deposits.')) {
      return this.i18n.translate(key);
    }
    return key;
  }
}
