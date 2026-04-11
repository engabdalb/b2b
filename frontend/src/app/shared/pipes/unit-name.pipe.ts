import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from '../../core/services/i18n.service';

/** Birim kodu + API adı ile dil dosyasından (`units.name.{code}`) etiket üretir. */
@Pipe({
  name: 'unitName',
  standalone: true,
  pure: false,
})
export class UnitNamePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(unit: { code?: string; unitCode?: string; name: string } | null | undefined): string {
    this.i18n.locale();
    const code = (unit?.code ?? unit?.unitCode ?? '').trim();
    const name = unit?.name ?? '';
    if (!code) {
      return name.trim() ? name : '—';
    }
    return this.i18n.displayUnitName(code, name);
  }
}
