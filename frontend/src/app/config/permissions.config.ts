import { Role } from '../core/models/role';

/** Tek kaynak permission string sabitleri */
export const Permission = {
  dashboardView: 'dashboard.view',
  usersView: 'users.view',
  usersEdit: 'users.edit',
  dealersView: 'dealers.view',
  dealersEdit: 'dealers.edit',
  productsView: 'products.view',
  productsEdit: 'products.edit',
  unitsEdit: 'units.edit',
  ordersView: 'orders.view',
  /** Gelen / mevcut siparişi düzenleme (yalnızca admin) */
  ordersEdit: 'orders.edit',
  /** Yeni sipariş oluşturma (bayi + admin) */
  ordersCreate: 'orders.create',
  reportsView: 'reports.view',
  reportsExport: 'reports.export',
  settingsView: 'settings.view',
  settingsEdit: 'settings.edit',
  /** İade edilebilir ambalaj (depozito) bakiye ve hareketler */
  depositsView: 'deposits.view',
  /** Cari hesap hareketleri (bayi bazlı) */
  ledgerView: 'ledger.view',
  _all: '*',
} as const;

export type PermissionId = (typeof Permission)[keyof typeof Permission];

const VIEW_ONLY: PermissionId[] = [
  Permission.dashboardView,
  Permission.usersView,
  Permission.dealersView,
  Permission.productsView,
  Permission.ordersView,
  Permission.reportsView,
  Permission.settingsView,
  Permission.depositsView,
  Permission.ledgerView,
];

/** Bayi: siparişleri görüntüleme ve yeni sipariş; gelen sipariş düzenleme yok */
const DEALER_PERMS: PermissionId[] = [
  Permission.ordersView,
  Permission.ordersCreate,
  Permission.depositsView,
  Permission.ledgerView,
];

/** Rol → izin kümesi (frontend mock; API ile eşleşecek) */
export const ROLE_PERMISSIONS: Record<Role, PermissionId[]> = {
  super_admin: [Permission._all],
  dealer: DEALER_PERMS,
  viewer: VIEW_ONLY,
};
