import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Permission } from '../../config/permissions.config';
import { DealerDto } from '../../core/models/api.types';
import { DealersMockService, DealerMutationResponse } from './dealers-mock.service';
import { UsersMockService, UserMutationResponse } from '../users/users-mock.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { CanDirective } from '../../shared/directives/can.directive';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-dealers-page',
  standalone: true,
  imports: [PageHeaderComponent, TranslatePipe, CanDirective, ReactiveFormsModule],
  templateUrl: './dealers-page.component.html',
  styleUrl: './dealers-page.component.scss',
})
export class DealersPageComponent implements OnInit {
  protected readonly perm = Permission;
  readonly dealersData = inject(DealersMockService);
  private readonly usersData = inject(UsersMockService);
  private readonly fb = inject(FormBuilder);
  protected readonly i18n = inject(I18nService);

  readonly dealerFormOpen = signal(false);
  readonly dealerSaving = signal(false);
  readonly dealerFormError = signal<string | null>(null);

  readonly userFormOpen = signal(false);
  readonly userSaving = signal(false);
  readonly userFormError = signal<string | null>(null);
  readonly userContextDealerId = signal<string | null>(null);
  readonly userContextDealerName = signal<string>('');

  readonly dealerForm = this.fb.nonNullable.group({
    id: [''],
    name: ['', Validators.required],
    region: ['', Validators.required],
    il: [''],
    ilce: [''],
    konum: [''],
    telefon: [''],
    active: this.fb.control(true),
  });

  readonly userForm = this.fb.nonNullable.group({
    id: [''],
    email: ['', [Validators.required, Validators.email]],
    display_name: ['', Validators.required],
    password: [''],
    active: this.fb.control(true),
  });

  ngOnInit(): void {
    this.dealersData.load();
  }

  openNewDealer(): void {
    this.dealerFormError.set(null);
    this.dealerForm.reset({
      id: '',
      name: '',
      region: '',
      il: '',
      ilce: '',
      konum: '',
      telefon: '',
      active: true,
    });
    this.dealerFormOpen.set(true);
  }

  openEditDealer(d: DealerDto): void {
    this.dealerFormError.set(null);
    this.dealerForm.setValue({
      id: d.id,
      name: d.name,
      region: d.region,
      il: d.il,
      ilce: d.ilce,
      konum: d.konum,
      telefon: d.telefon,
      active: d.active,
    });
    this.dealerFormOpen.set(true);
  }

  closeDealerForm(): void {
    this.dealerFormOpen.set(false);
    this.dealerFormError.set(null);
  }

  submitDealer(): void {
    if (this.dealerForm.invalid) {
      this.dealerForm.markAllAsTouched();
      return;
    }
    const v = this.dealerForm.getRawValue();
    this.dealerSaving.set(true);
    this.dealerFormError.set(null);

    const finish = (errKey: string | null) => {
      this.dealerSaving.set(false);
      if (errKey) {
        this.dealerFormError.set(errKey);
        return;
      }
      this.dealerFormOpen.set(false);
    };

    this.dealersData
      .save({
        id: v.id || undefined,
        name: v.name.trim(),
        region: v.region.trim(),
        il: v.il.trim(),
        ilce: v.ilce.trim(),
        konum: v.konum.trim(),
        telefon: v.telefon.trim(),
        active: v.active ?? true,
      })
      .subscribe({
        next: (r: DealerMutationResponse) => finish(!r.ok ? this.mapDealerError(r) : null),
        error: (err: { error?: { message?: string } }) => finish(err?.error?.message ?? 'dealers.saveError'),
      });
  }

  private mapDealerError(r: DealerMutationResponse): string {
    if (r.error === 'validation' && r.message) {
      return r.message;
    }
    return 'dealers.saveError';
  }

  openUserForDealer(d: DealerDto): void {
    this.userFormError.set(null);
    this.userContextDealerId.set(d.id);
    this.userContextDealerName.set(d.name);
    this.userForm.reset({
      id: '',
      email: '',
      display_name: '',
      password: '',
      active: true,
    });
    this.userFormOpen.set(true);
  }

  closeUserForm(): void {
    this.userFormOpen.set(false);
    this.userFormError.set(null);
    this.userContextDealerId.set(null);
    this.userContextDealerName.set('');
  }

  submitUserForDealer(): void {
    const dealerId = this.userContextDealerId();
    if (!dealerId) {
      return;
    }
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }
    const v = this.userForm.getRawValue();
    if (!v.password || v.password.length < 6) {
      this.userFormError.set('users.passwordNewRequired');
      return;
    }

    this.userSaving.set(true);
    this.userFormError.set(null);

    const finish = (errKey: string | null) => {
      this.userSaving.set(false);
      if (errKey) {
        this.userFormError.set(errKey);
        return;
      }
      this.closeUserForm();
    };

    this.usersData
      .save({
        email: v.email.trim(),
        display_name: v.display_name.trim(),
        password: v.password,
        role: 'dealer',
        dealer_id: dealerId,
        active: v.active ?? true,
      })
      .subscribe({
        next: (r: UserMutationResponse) => finish(!r.ok ? this.mapUserError(r) : null),
        error: (err: { error?: { error?: string; message?: string } }) =>
          finish(this.mapUserHttpError(err)),
      });
  }

  private mapUserError(r: UserMutationResponse): string {
    if (r.error === 'duplicate_email') {
      return 'users.duplicateEmail';
    }
    if (r.error === 'validation' && r.message) {
      return r.message;
    }
    return 'users.saveError';
  }

  private mapUserHttpError(err: { error?: { error?: string; message?: string } }): string {
    const e = err?.error;
    if (e?.error === 'duplicate_email') {
      return 'users.duplicateEmail';
    }
    if (e?.message) {
      return e.message;
    }
    return 'users.saveError';
  }

  errorText(key: string): string {
    if (key.startsWith('dealers.') || key.startsWith('users.')) {
      return this.i18n.translate(key);
    }
    return key;
  }
}
