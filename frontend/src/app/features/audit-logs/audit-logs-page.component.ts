import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { AuditLogsDataService } from './audit-logs-data.service';

@Component({
  selector: 'app-audit-logs-page',
  standalone: true,
  imports: [PageHeaderComponent, TranslatePipe, FormsModule],
  templateUrl: './audit-logs-page.component.html',
  styleUrl: './audit-logs-page.component.scss',
})
export class AuditLogsPageComponent implements OnInit {
  readonly data = inject(AuditLogsDataService);

  readonly action = signal('');
  readonly entityType = signal('');
  readonly status = signal<'' | 'ok' | 'error'>('');
  readonly dateFrom = signal('');
  readonly dateTo = signal('');
  readonly limit = signal('200');

  readonly hasRows = computed(() => this.data.logs().length > 0);

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    const parsedLimit = Number.parseInt(this.limit().trim(), 10);
    this.data.load({
      action: this.action().trim(),
      entityType: this.entityType().trim(),
      status: this.status(),
      dateFrom: this.dateFrom().trim(),
      dateTo: this.dateTo().trim(),
      limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 200,
    });
  }

  clearFilters(): void {
    this.action.set('');
    this.entityType.set('');
    this.status.set('');
    this.dateFrom.set('');
    this.dateTo.set('');
    this.limit.set('200');
    this.reload();
  }

  statusText(row: { meta: Record<string, unknown> }): string {
    const response = row.meta?.['response'];
    if (typeof response === 'object' && response !== null && 'ok' in response) {
      return (response as { ok?: boolean }).ok ? 'OK' : 'ERROR';
    }
    return '-';
  }

  shortText(value: string, max = 110): string {
    const t = value.trim();
    if (t.length <= max) {
      return t;
    }
    return `${t.slice(0, max)}...`;
  }
}
