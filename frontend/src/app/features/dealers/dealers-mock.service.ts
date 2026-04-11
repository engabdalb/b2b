import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { DealerDto } from '../../core/models/api.types';
import { ApiService } from '../../core/services/api.service';

interface DealersApiResponse {
  ok: boolean;
  items?: DealerDto[];
}

@Injectable({ providedIn: 'root' })
export class DealersMockService {
  private readonly api = inject(ApiService);

  readonly dealers = signal<DealerDto[]>([]);

  load(): void {
    if (!environment.apiUrl?.trim()) {
      this.dealers.set([]);
      return;
    }
    this.api.get<DealersApiResponse>('b2b_dealers_get').subscribe({
      next: (r) => this.dealers.set(r.items ?? []),
      error: () => this.dealers.set([]),
    });
  }
}
