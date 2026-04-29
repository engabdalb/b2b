import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ReportsOverviewApiResponse } from '../../core/models/api.types';
import { ApiService } from '../../core/services/api.service';

@Injectable({ providedIn: 'root' })
export class ReportsDataService {
  private readonly api = inject(ApiService);

  getOverview(dateFrom: string, dateTo: string): Observable<ReportsOverviewApiResponse> {
    return this.api.get<ReportsOverviewApiResponse>('b2b_reports_overview_get', {
      date_from: dateFrom,
      date_to: dateTo,
    });
  }
}
