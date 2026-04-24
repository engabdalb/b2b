import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DealerDto, DealerUnitDiscountRowDto } from '../../core/models/api.types';
import { ApiService } from '../../core/services/api.service';

export interface DealerMutationResponse {
  ok: boolean;
  error?: string;
  message?: string;
  item?: DealerDto;
}

interface DealersApiResponse {
  ok: boolean;
  items?: DealerDto[];
}

interface UnitDiscountsGetResponse {
  ok: boolean;
  items?: DealerUnitDiscountRowDto[];
  message?: string;
}

interface UnitDiscountsSaveResponse {
  ok: boolean;
  saved?: number;
  message?: string;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class DealersMockService {
  private readonly api = inject(ApiService);

  readonly dealers = signal<DealerDto[]>([]);

  private hasApi(): boolean {
    return !!environment.apiUrl?.trim();
  }

  load(): void {
    if (!this.hasApi()) {
      this.dealers.set([]);
      return;
    }
    this.api.get<DealersApiResponse>('b2b_dealers_get').subscribe({
      next: (r) => this.dealers.set(r.items ?? []),
      error: () => this.dealers.set([]),
    });
  }

  save(payload: {
    id?: string;
    name: string;
    region: string;
    il?: string;
    ilce?: string;
    konum?: string;
    telefon?: string;
    active?: boolean;
  }): Observable<DealerMutationResponse> {
    if (!this.hasApi()) {
      return of({ ok: false, error: 'no_api', message: 'API adresi tanımlı değil.' });
    }
    const body: Record<string, unknown> = {
      name: payload.name,
      region: payload.region,
      il: payload.il ?? '',
      ilce: payload.ilce ?? '',
      konum: payload.konum ?? '',
      telefon: payload.telefon ?? '',
      active: payload.active ?? true,
    };
    if (payload.id) {
      body['id'] = payload.id;
    }
    return this.api.post<DealerMutationResponse>('b2b_dealers_save', body).pipe(
      tap((r) => {
        if (r.ok) {
          this.load();
        }
      }),
    );
  }

  getUnitDiscounts(dealerId: string): Observable<UnitDiscountsGetResponse> {
    if (!this.hasApi()) {
      return of({ ok: false, message: 'API adresi tanımlı değil.' });
    }
    return this.api.get<UnitDiscountsGetResponse>('b2b_dealer_unit_discounts_get', { dealer_id: dealerId });
  }

  saveUnitDiscounts(
    dealerId: string,
    rows: { unit_id: string; discount_per_unit: number }[],
  ): Observable<UnitDiscountsSaveResponse> {
    if (!this.hasApi()) {
      return of({ ok: false, error: 'no_api', message: 'API adresi tanımlı değil.' });
    }
    return this.api.post<UnitDiscountsSaveResponse>('b2b_dealer_unit_discounts_save', {
      dealer_id: dealerId,
      rows,
    });
  }
}
