import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ProductDto } from '../../core/models/api.types';
import { ApiService } from '../../core/services/api.service';

export interface ProductMutationResponse {
  ok: boolean;
  error?: string;
  message?: string;
  item?: ProductDto;
}

interface ProductsApiResponse {
  ok: boolean;
  items?: ProductDto[];
}

@Injectable({ providedIn: 'root' })
export class ProductsMockService {
  private readonly api = inject(ApiService);

  readonly products = signal<ProductDto[]>([]);

  private hasApi(): boolean {
    return !!environment.apiUrl?.trim();
  }

  load(): void {
    if (!this.hasApi()) {
      this.products.set([]);
      return;
    }
    this.api.get<ProductsApiResponse>('b2b_products_get').subscribe({
      next: (r) => this.products.set(r.items ?? []),
      error: () => this.products.set([]),
    });
  }

  create(payload: Pick<ProductDto, 'sku' | 'name' | 'price'> & { unit_id: string }): Observable<ProductMutationResponse> {
    if (!this.hasApi()) {
      return of({ ok: false, error: 'no_api', message: 'API adresi tanımlı değil.' });
    }
    return this.api.post<ProductMutationResponse>('b2b_products_add', payload).pipe(
      tap((r) => {
        if (r.ok) {
          this.load();
        }
      }),
    );
  }

  update(payload: ProductDto): Observable<ProductMutationResponse> {
    const body = {
      id: payload.id,
      sku: payload.sku,
      name: payload.name,
      unit_id: payload.unitId,
      price: payload.price,
    };
    if (!this.hasApi()) {
      return of({ ok: false, error: 'no_api', message: 'API adresi tanımlı değil.' });
    }
    return this.api
      .post<ProductMutationResponse>('b2b_products_update', body)
      .pipe(
        tap((r) => {
          if (r.ok) {
            this.load();
          }
        }),
      );
  }
}
