import { Routes } from '@angular/router';
import { permissionGuard } from './core/guards/permission.guard';
import { authGuard } from './core/guards/auth.guard';
import { Permission } from './config/permissions.config';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login-page.component').then((m) => m.LoginPageComponent),
  },
  {
    path: '',
    loadComponent: () => import('./layout/layout.component').then((m) => m.LayoutComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/home/home-redirect.component').then((m) => m.HomeRedirectComponent),
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page.component').then((m) => m.DashboardPageComponent),
        canActivate: [permissionGuard],
        data: { permissions: [Permission.dashboardView] },
      },
      {
        path: 'orders',
        loadComponent: () =>
          import('./features/orders/orders-page.component').then((m) => m.OrdersPageComponent),
        canActivate: [permissionGuard],
        data: { permissions: [Permission.ordersView] },
      },
      {
        path: 'invoices',
        loadComponent: () =>
          import('./features/invoices/invoices-page.component').then((m) => m.InvoicesPageComponent),
        canActivate: [permissionGuard],
        data: { permissions: [Permission.ordersView] },
      },
      {
        path: 'deposits',
        loadComponent: () => import('./features/deposits').then((m) => m.DepositsPageComponent),
        canActivate: [permissionGuard],
        data: { permissions: [Permission.depositsView] },
      },
      {
        path: 'dealers',
        loadComponent: () =>
          import('./features/dealers/dealers-page.component').then((m) => m.DealersPageComponent),
        canActivate: [permissionGuard],
        data: { permissions: [Permission.dealersView] },
      },
      {
        path: 'products',
        loadComponent: () =>
          import('./features/products/products-page.component').then((m) => m.ProductsPageComponent),
        canActivate: [permissionGuard],
        data: { permissions: [Permission.productsView] },
      },
      {
        path: 'units',
        loadComponent: () =>
          import('./features/units/units-page.component').then((m) => m.UnitsPageComponent),
        canActivate: [permissionGuard],
        data: { permissions: [Permission.unitsEdit] },
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/users/users-page.component').then((m) => m.UsersPageComponent),
        canActivate: [permissionGuard],
        data: { permissions: [Permission.usersView] },
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports-page.component').then((m) => m.ReportsPageComponent),
        canActivate: [permissionGuard],
        data: { permissions: [Permission.reportsView] },
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings-page.component').then((m) => m.SettingsPageComponent),
        canActivate: [permissionGuard],
        data: { permissions: [Permission.settingsView] },
      },
      {
        path: 'forbidden',
        loadComponent: () =>
          import('./features/forbidden/forbidden-page.component').then((m) => m.ForbiddenPageComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
