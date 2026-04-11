import { Component, inject, input } from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { I18nService } from '../../../core/services/i18n.service';

export interface DataColumn {
  key: string;
  labelKey: string;
  format?: 'text' | 'currency' | 'date' | 'i18n';
}

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss',
})
export class DataTableComponent {
  private readonly i18n = inject(I18nService);

  readonly columns = input.required<DataColumn[]>();
  readonly rows = input.required<Record<string, unknown>[]>();
  readonly emptyKey = input<string>('table.empty');

  displayCell(row: Record<string, unknown>, col: DataColumn): string {
    const v = row[col.key];
    if (v == null) return '—';
    if (col.format === 'currency' && typeof v === 'number') {
      return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(v);
    }
    if (col.format === 'i18n') {
      return this.i18n.translate(String(v));
    }
    return String(v);
  }
}
