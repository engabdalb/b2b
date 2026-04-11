import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Permission } from '../../config/permissions.config';
import { UserListDto } from '../../core/models/api.types';
import { Role, ROLES } from '../../core/models/role';

function roleFromUserDto(u: UserListDto): Role {
  if (u.role && ROLES.includes(u.role)) {
    return u.role;
  }
  const m = /^role\.(.+)$/.exec(u.roleKey);
  if (m && ROLES.includes(m[1] as Role)) {
    return m[1] as Role;
  }
  return 'viewer';
}
import { UsersMockService, UserMutationResponse } from './users-mock.service';
import { DealersMockService } from '../dealers/dealers-mock.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { CanDirective } from '../../shared/directives/can.directive';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [PageHeaderComponent, TranslatePipe, CanDirective, ReactiveFormsModule],
  templateUrl: './users-page.component.html',
  styleUrl: './users-page.component.scss',
})
export class UsersPageComponent implements OnInit {
  protected readonly perm = Permission;
  readonly usersData = inject(UsersMockService);
  readonly dealersData = inject(DealersMockService);
  private readonly fb = inject(FormBuilder);
  protected readonly i18n = inject(I18nService);

  readonly formOpen = signal(false);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    id: [''],
    email: ['', [Validators.required, Validators.email]],
    display_name: ['', Validators.required],
    password: [''],
    role: this.fb.control<Role>('viewer', Validators.required),
    dealerId: [''],
    active: this.fb.control(true),
  });

  ngOnInit(): void {
    this.dealersData.load();
    this.usersData.load();
  }

  openNew(): void {
    this.formError.set(null);
    const firstDealer = this.dealersData.dealers()[0];
    this.form.reset({
      id: '',
      email: '',
      display_name: '',
      password: '',
      role: 'viewer',
      dealerId: firstDealer?.id ?? '',
      active: true,
    });
    this.formOpen.set(true);
  }

  openEdit(u: UserListDto): void {
    this.formError.set(null);
    this.form.setValue({
      id: u.id,
      email: u.email,
      display_name: u.name,
      password: '',
      role: roleFromUserDto(u),
      dealerId: u.dealerId ?? '',
      active: u.active,
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
    if (v.role === 'dealer' && (!v.dealerId || v.dealerId === '')) {
      this.formError.set('users.dealerRequired');
      return;
    }
    if (!v.id && (!v.password || v.password.length < 6)) {
      this.formError.set('users.passwordNewRequired');
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

    const payload: Parameters<UsersMockService['save']>[0] = {
      id: v.id || undefined,
      email: v.email.trim(),
      display_name: v.display_name.trim(),
      role: v.role ?? 'viewer',
      active: v.active ?? true,
    };
    if (v.password) {
      payload.password = v.password;
    }
    if (v.role === 'dealer') {
      payload.dealer_id = v.dealerId;
    }

    this.usersData.save(payload).subscribe({
      next: (r: UserMutationResponse) => finish(!r.ok ? this.mapUserError(r) : null),
      error: (err: { error?: { error?: string; message?: string } }) =>
        finish(this.mapHttpError(err)),
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

  private mapHttpError(err: { error?: { error?: string; message?: string } }): string {
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
    if (key.startsWith('users.')) {
      return this.i18n.translate(key);
    }
    return key;
  }
}
