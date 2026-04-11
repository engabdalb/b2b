import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Role, ROLES } from '../models/role';
import { User } from '../models/user.model';
import { ApiService } from './api.service';

const MOCK_USERS: Record<Role, User> = {
  super_admin: {
    id: '1',
    email: 'admin@tenant.local',
    displayName: 'Merkez Yönetici',
    role: 'super_admin',
    avatarInitials: 'MY',
  },
  dealer: {
    id: '2',
    email: 'bayi@tenant.local',
    displayName: 'Bayi Sorumlusu',
    role: 'dealer',
    dealerId: '2',
    avatarInitials: 'BS',
  },
  viewer: {
    id: '3',
    email: 'viewer@tenant.local',
    displayName: 'İzleyici Kullanıcı',
    role: 'viewer',
    avatarInitials: 'İK',
  },
};

const TOKEN_KEY = 'b2b_token';
const USER_KEY = 'b2b_user';

export interface LoginResponse {
  ok: boolean;
  access_token?: string;
  user?: {
    id: string;
    email: string;
    displayName: string;
    role: Role;
    dealerId?: string | null;
    avatarInitials?: string;
  };
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  private readonly _token = signal<string | null>(null);
  private readonly _user = signal<User>(MOCK_USERS.super_admin);

  readonly token = this._token.asReadonly();
  readonly user = this._user.asReadonly();
  readonly role = computed(() => this._user().role);
  readonly isViewer = computed(() => this._user().role === 'viewer');

  readonly roles = ROLES;

  constructor() {
    this.restoreSession();
  }

  /** Uygulama açılışında localStorage senkronu */
  restoreSession(): void {
    if (environment.useMockAuth || !environment.apiUrl?.trim()) {
      return;
    }
    const t = localStorage.getItem(TOKEN_KEY);
    const raw = localStorage.getItem(USER_KEY);
    if (!t || !raw) {
      return;
    }
    try {
      const u = JSON.parse(raw) as User;
      this._token.set(t);
      this._user.set(u);
    } catch {
      this.clearSession();
    }
  }

  setMockRole(role: Role): void {
    if (!(environment.useMockAuth || !environment.apiUrl?.trim())) {
      return;
    }
    this._user.set({ ...MOCK_USERS[role] });
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('b2b_login', { email, password }).pipe(
      tap((res) => {
        if (!res.ok || !res.access_token || !res.user) {
          return;
        }
        const u: User = {
          id: res.user.id,
          email: res.user.email,
          displayName: res.user.displayName,
          role: res.user.role,
          dealerId: res.user.dealerId ?? undefined,
          avatarInitials: res.user.avatarInitials,
        };
        localStorage.setItem(TOKEN_KEY, res.access_token);
        localStorage.setItem(USER_KEY, JSON.stringify(u));
        this._token.set(res.access_token);
        this._user.set(u);
      }),
    );
  }

  logout(): void {
    this.clearSession();
    if (!environment.useMockAuth && environment.apiUrl?.trim()) {
      void this.router.navigate(['/login']);
    }
  }

  private clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this._token.set(null);
    this._user.set(MOCK_USERS.super_admin);
  }

  setUser(user: User): void {
    this._user.set(user);
  }
}
