import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PermissionsService } from '../services/permissions.service';

export const permissionGuard: CanActivateFn = (route) => {
  const permissions = route.data['permissions'] as string[] | undefined;
  if (!permissions?.length) {
    return true;
  }
  const perms = inject(PermissionsService);
  if (perms.hasEvery(permissions)) {
    return true;
  }
  return inject(Router).createUrlTree(['/forbidden']);
};
