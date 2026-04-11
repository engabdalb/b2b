import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PermissionsService } from '../../core/services/permissions.service';

/** `/` → rolüne göre dashboard veya siparişler (bayi için siparişler) */
@Component({
  selector: 'app-home-redirect',
  standalone: true,
  template: '',
})
export class HomeRedirectComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionsService);

  ngOnInit(): void {
    void this.router.navigateByUrl(this.permissions.defaultAuthenticatedPath(), { replaceUrl: true });
  }
}
