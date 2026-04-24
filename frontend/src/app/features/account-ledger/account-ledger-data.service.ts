import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AccountMovementsApiResponse,
  PaymentPostResponse,
  PaymentUpdateResponse,
} from '../../core/models/api.types';
import { ApiService } from '../../core/services/api.service';

export type PaymentMethodCode = 'bank_transfer' | 'credit_card' | 'check' | 'cash' | 'other';

@Injectable({ providedIn: 'root' })
export class AccountLedgerDataService {
  private readonly api = inject(ApiService);

  getMovements(dealerId: string): Observable<AccountMovementsApiResponse> {
    return this.api.get<AccountMovementsApiResponse>('b2b_account_movements_get', {
      dealer_id: dealerId,
    });
  }

  postPayment(body: {
    dealer_id: string;
    amount: number;
    method: PaymentMethodCode;
    paid_at?: string;
    reference?: string;
    note?: string;
  }): Observable<PaymentPostResponse> {
    return this.api.post<PaymentPostResponse>('b2b_payment_post', body);
  }

  updatePayment(body: {
    payment_id: string;
    dealer_id: string;
    amount: number;
    method: PaymentMethodCode;
    paid_at: string;
    reference?: string;
    note?: string;
  }): Observable<PaymentUpdateResponse> {
    return this.api.post<PaymentUpdateResponse>('b2b_payment_update_post', body);
  }
}
