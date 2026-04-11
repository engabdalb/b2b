import { environment } from '../../environments/environment';

export interface AppBrandConfig {
  brandNameI18nKey: string;
  /** Opsiyonel harici logo URL; boşsa SVG placeholder */
  logoUrl: string | null;
  supportTitleI18nKey: string;
  supportTextI18nKey: string;
  supportCtaI18nKey: string;
}

const defaults: AppBrandConfig = {
  brandNameI18nKey: 'brand.name',
  logoUrl: null,
  supportTitleI18nKey: 'sidebar.supportTitle',
  supportTextI18nKey: 'sidebar.supportText',
  supportCtaI18nKey: 'sidebar.supportCta',
};

export const appConfig = {
  brand: { ...defaults },
  apiUrl: environment.apiUrl,
  defaultLocale: 'tr',
} as const;
