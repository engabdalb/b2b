import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth.service';
import { PermissionsService } from '../../core/services/permissions.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
})
export class LoginPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionsService);

  readonly useMock = environment.useMockAuth || !environment.apiUrl?.trim();

  email = '';
  password = '';
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  ngOnInit(): void {
    if (this.useMock) {
      void this.router.navigateByUrl('/');
      return;
    }
    this.auth.restoreSession();
    if (this.auth.token()) {
      void this.router.navigateByUrl(this.permissions.defaultAuthenticatedPath());
    }
  }

  submit(): void {
    this.error.set(null);
    this.busy.set(true);
    this.auth.login(this.email.trim(), this.password).subscribe({
      next: (res) => {
        this.busy.set(false);
        if (!res.ok || !res.access_token) {
          this.error.set(res.error ?? 'login.failed');
          return;
        }
        void this.router.navigateByUrl(this.permissions.defaultAuthenticatedPath());
      },
      error: (err: { error?: { error?: string } }) => {
        this.busy.set(false);
        this.error.set(err?.error?.error ?? 'login.failed');
      },
    });
  }
}
