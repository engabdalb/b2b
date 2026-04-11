import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { UserListDto } from '../../core/models/api.types';
import { ApiService } from '../../core/services/api.service';

interface UsersApiResponse {
  ok: boolean;
  items?: UserListDto[];
}

@Injectable({ providedIn: 'root' })
export class UsersMockService {
  private readonly api = inject(ApiService);

  readonly users = signal<UserListDto[]>([]);

  load(): void {
    if (!environment.apiUrl?.trim()) {
      this.users.set([]);
      return;
    }
    this.api.get<UsersApiResponse>('b2b_users_get').subscribe({
      next: (r) => this.users.set(r.items ?? []),
      error: () => this.users.set([]),
    });
  }
}
