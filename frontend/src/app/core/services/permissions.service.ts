import { Injectable, inject } from '@angular/core';
import { Permission, ROLE_PERMISSIONS, PermissionId } from '../../config/permissions.config';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private readonly auth = inject(AuthService);

  /** İlk açılış / giriş sonrası yönlendirme (dashboard yetkisi yoksa siparişler) */
  defaultAuthenticatedPath(): string {
    if (this.has(Permission.dashboardView)) {
      return '/dashboard';
    }
    if (this.has(Permission.ordersView)) {
      return '/orders';
    }
    return '/forbidden';
  }

  has(permission: string): boolean {
    const user = this.auth.user();
    const allowed = ROLE_PERMISSIONS[user.role];
    if (allowed.includes('*' as PermissionId)) {
      return true;
    }
    return allowed.includes(permission as PermissionId);
  }

  hasEvery(permissions: string[]): boolean {
    return permissions.every((p) => this.has(p));
  }
}
