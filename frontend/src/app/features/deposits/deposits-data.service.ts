import { Injectable, inject, signal } from '@angular/core';
import { Observable, forkJoin, finalize } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import {
  ReturnablePackagingBalanceDto,
  ReturnablePackagingMovementDto,
  ReturnablePackagingTypeDto,
} from '../../core/models/api.types';

interface ListResponse<T> {
  ok: boolean;
  items?: T[];
  message?: string;
}

export interface DepositMovementPostBody {
  kind: 'deposit_return' | 'manual_adjustment';
  dealer_id: number;
  returnable_packaging_type_id: number;
  quantity?: number;
  signed_delta?: number;
  note?: string | null;
}

@Injectable({ providedIn: 'root' })
export class DepositsDataService {
  private readonly api = inject(ApiService);

  readonly types = signal<ReturnablePackagingTypeDto[]>([]);
  readonly balances = signal<ReturnablePackagingBalanceDto[]>([]);
  readonly movements = signal<ReturnablePackagingMovementDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  load(dealerId?: string): void {
    this.loading.set(true);
    this.error.set(null);
    const q =
      dealerId !== undefined && dealerId !== ''
        ? { dealer_id: dealerId }
        : undefined;
    forkJoin({
      types: this.api.get<ListResponse<ReturnablePackagingTypeDto>>('b2b_returnable_packaging_types_get'),
      balances: this.api.get<ListResponse<ReturnablePackagingBalanceDto>>(
        'b2b_returnable_packaging_balances_get',
        q,
      ),
      movements: this.api.get<ListResponse<ReturnablePackagingMovementDto>>(
        'b2b_returnable_packaging_movements_get',
        q,
      ),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          if (!res.types.ok || !res.balances.ok || !res.movements.ok) {
            this.error.set('deposits.loadError');
            return;
          }
          this.types.set(res.types.items ?? []);
          this.balances.set(res.balances.items ?? []);
          this.movements.set(res.movements.items ?? []);
        },
        error: () => this.error.set('deposits.loadError'),
      });
  }

  postMovement(body: DepositMovementPostBody): Observable<{ ok: boolean; message?: string }> {
    return this.api.post<{ ok: boolean; message?: string }>('b2b_returnable_packaging_movement_post', body);
  }
}
