import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UnitDto } from '../../core/models/api.types';
import { ApiService } from '../../core/services/api.service';

export interface UnitMutationResponse {
  ok: boolean;
  error?: string;
  message?: string;
  item?: UnitDto;
}

interface UnitsApiResponse {
  ok: boolean;
  items?: UnitDto[];
}

@Injectable({ providedIn: 'root' })
export class UnitsMockService {
  private readonly api = inject(ApiService);

  readonly units = signal<UnitDto[]>([]);

  private hasApi(): boolean {
    return !!environment.apiUrl?.trim();
  }

  load(): void {
    if (!this.hasApi()) {
      this.units.set([]);
      return;
    }
    this.api.get<UnitsApiResponse>('b2b_units_get').subscribe({
      next: (r) => this.units.set(r.items ?? []),
      error: () => this.units.set([]),
    });
  }

  create(payload: { code: string; name: string; sort_order?: number }): Observable<UnitMutationResponse> {
    if (!this.hasApi()) {
      return of({ ok: false, error: 'no_api', message: 'API adresi tanımlı değil.' });
    }
    return this.api.post<UnitMutationResponse>('b2b_units_add', payload).pipe(
      tap((r) => {
        if (r.ok) {
          this.load();
        }
      }),
    );
  }
}
