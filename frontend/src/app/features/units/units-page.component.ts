import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Permission } from '../../config/permissions.config';
import { I18nService } from '../../core/services/i18n.service';
import { UnitsMockService, UnitMutationResponse } from './units-mock.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { UnitNamePipe } from '../../shared/pipes/unit-name.pipe';
import { CanDirective } from '../../shared/directives/can.directive';

@Component({
  selector: 'app-units-page',
  standalone: true,
  imports: [PageHeaderComponent, TranslatePipe, UnitNamePipe, CanDirective, ReactiveFormsModule],
  templateUrl: './units-page.component.html',
  styleUrl: './units-page.component.scss',
})
export class UnitsPageComponent implements OnInit {
  protected readonly perm = Permission;
  readonly data = inject(UnitsMockService);
  private readonly fb = inject(FormBuilder);
  private readonly i18n = inject(I18nService);

  readonly formOpen = signal(false);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[a-z0-9][a-z0-9_-]{0,30}$/)]],
    name: ['', Validators.required],
    sort_order: [0, [Validators.required, Validators.min(0)]],
  });

  ngOnInit(): void {
    this.data.load();
  }

  openNew(): void {
    this.formError.set(null);
    this.form.reset({ code: '', name: '', sort_order: 0 });
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
    this.saving.set(true);
    this.formError.set(null);
    this.data
      .create({
        code: v.code.trim().toLowerCase(),
        name: v.name.trim(),
        sort_order: Number(v.sort_order),
      })
      .subscribe({
        next: (r: UnitMutationResponse) => {
          this.saving.set(false);
          if (!r.ok) {
            this.formError.set(this.mapError(r));
            return;
          }
          this.closeForm();
        },
        error: (err: { error?: { error?: string; message?: string } }) => {
          this.saving.set(false);
          this.formError.set(err?.error?.message ?? 'units.saveError');
        },
      });
  }

  private mapError(r: UnitMutationResponse): string {
    if (r.error === 'duplicate_code') {
      return 'units.duplicateCode';
    }
    if (r.message) {
      return r.message;
    }
    return 'units.saveError';
  }

  errorText(key: string): string {
    return key.startsWith('units.') ? this.i18n.translate(key) : key;
  }
}
