import { Injectable, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuditLogDto } from '../../core/models/api.types';

interface AuditLogsResponse {
  ok: boolean;
  items?: AuditLogDto[];
  total?: number;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class AuditLogsDataService {
  private readonly api = inject(ApiService);

  readonly logs = signal<AuditLogDto[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  load(filters?: {
    action?: string;
    entityType?: string;
    status?: 'ok' | 'error' | '';
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .get<AuditLogsResponse>('b2b_audit_logs_get', {
        action: filters?.action ?? '',
        entity_type: filters?.entityType ?? '',
        status: filters?.status ?? '',
        date_from: filters?.dateFrom ?? '',
        date_to: filters?.dateTo ?? '',
        limit: filters?.limit ?? 200,
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          if (!res.ok) {
            this.logs.set([]);
            this.error.set('audit.loadError');
            return;
          }
          this.logs.set(res.items ?? []);
        },
        error: () => {
          this.logs.set([]);
          this.error.set('audit.loadError');
        },
      });
  }
}
