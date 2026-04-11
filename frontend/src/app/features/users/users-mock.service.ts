import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserListDto } from '../../core/models/api.types';
import { ApiService } from '../../core/services/api.service';

export interface UserMutationResponse {
  ok: boolean;
  error?: string;
  message?: string;
  item?: UserListDto;
}

interface UsersApiResponse {
  ok: boolean;
  items?: UserListDto[];
}

@Injectable({ providedIn: 'root' })
export class UsersMockService {
  private readonly api = inject(ApiService);

  readonly users = signal<UserListDto[]>([]);

  private hasApi(): boolean {
    return !!environment.apiUrl?.trim();
  }

  load(): void {
    if (!this.hasApi()) {
      this.users.set([]);
      return;
    }
    this.api.get<UsersApiResponse>('b2b_users_get').subscribe({
      next: (r) => this.users.set(r.items ?? []),
      error: () => this.users.set([]),
    });
  }

  save(payload: {
    id?: string;
    email: string;
    display_name: string;
    password?: string;
    role: string;
    dealer_id?: string | null;
    active?: boolean;
  }): Observable<UserMutationResponse> {
    if (!this.hasApi()) {
      return of({ ok: false, error: 'no_api', message: 'API adresi tanımlı değil.' });
    }
    const body: Record<string, unknown> = {
      email: payload.email,
      display_name: payload.display_name,
      role: payload.role,
      active: payload.active ?? true,
    };
    if (payload.id) {
      body['id'] = payload.id;
    }
    if (payload.password !== undefined && payload.password !== '') {
      body['password'] = payload.password;
    }
    if (payload.dealer_id !== undefined && payload.dealer_id !== null && payload.dealer_id !== '') {
      body['dealer_id'] = payload.dealer_id;
    }
    return this.api.post<UserMutationResponse>('b2b_users_save', body).pipe(
      tap((r) => {
        if (r.ok) {
          this.load();
        }
      }),
    );
  }
}
