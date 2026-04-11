import { Injectable, inject } from '@angular/core';
import { NAVIGATION_ITEMS, NavItemConfig } from '../../config/navigation.config';
import { PermissionsService } from './permissions.service';

@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly permissions = inject(PermissionsService);

  visibleItems(): NavItemConfig[] {
    return NAVIGATION_ITEMS.filter((item) => this.permissions.hasEvery(item.permissions));
  }
}
