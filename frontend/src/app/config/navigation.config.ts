import { Permission } from './permissions.config';

export type NavIcon =
  | 'dashboard'
  | 'orders'
  | 'invoices'
  | 'ledger'
  | 'deposits'
  | 'audit'
  | 'dealers'
  | 'products'
  | 'units'
  | 'reports'
  | 'settings'
  | 'users';

export interface NavItemConfig {
  path: string;
  i18nKey: string;
  icon: NavIcon;
  /** Hepsi gerekli */
  permissions: string[];
  navKey: string;
}

export const NAVIGATION_ITEMS: NavItemConfig[] = [
  {
    navKey: 'dashboard',
    path: '/dashboard',
    i18nKey: 'nav.dashboard',
    icon: 'dashboard',
    permissions: [Permission.dashboardView],
  },
  {
    navKey: 'orders',
    path: '/orders',
    i18nKey: 'nav.orders',
    icon: 'orders',
    permissions: [Permission.ordersView],
  },
  {
    navKey: 'invoices',
    path: '/invoices',
    i18nKey: 'nav.invoices',
    icon: 'invoices',
    permissions: [Permission.ordersView],
  },
  {
    navKey: 'ledger',
    path: '/account-ledger',
    i18nKey: 'nav.ledger',
    icon: 'ledger',
    permissions: [Permission.ledgerView],
  },
  {
    navKey: 'deposits',
    path: '/deposits',
    i18nKey: 'nav.deposits',
    icon: 'deposits',
    permissions: [Permission.depositsView],
  },
  {
    navKey: 'audit',
    path: '/audit-logs',
    i18nKey: 'nav.audit',
    icon: 'audit',
    permissions: [Permission.auditView],
  },
  {
    navKey: 'dealers',
    path: '/dealers',
    i18nKey: 'nav.dealers',
    icon: 'dealers',
    permissions: [Permission.dealersView],
  },
  {
    navKey: 'products',
    path: '/products',
    i18nKey: 'nav.products',
    icon: 'products',
    permissions: [Permission.productsView],
  },
  {
    navKey: 'units',
    path: '/units',
    i18nKey: 'nav.units',
    icon: 'units',
    permissions: [Permission.unitsEdit],
  },
  {
    navKey: 'users',
    path: '/users',
    i18nKey: 'nav.users',
    icon: 'users',
    permissions: [Permission.usersView],
  },
  {
    navKey: 'reports',
    path: '/reports',
    i18nKey: 'nav.reports',
    icon: 'reports',
    permissions: [Permission.reportsView],
  },
  {
    navKey: 'settings',
    path: '/settings',
    i18nKey: 'nav.settings',
    icon: 'settings',
    permissions: [Permission.settingsView],
  },
];
