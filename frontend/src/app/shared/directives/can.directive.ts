import { Directive, Input, TemplateRef, ViewContainerRef, inject } from '@angular/core';
import { PermissionsService } from '../../core/services/permissions.service';

/**
 * Yetki yoksa içeriği göstermez. Ör: `<ng-container *appCan="perm.usersEdit">...</ng-container>`
 */
@Directive({
  selector: '[appCan]',
  standalone: true,
})
export class CanDirective {
  private readonly tpl = inject(TemplateRef<unknown>);
  private readonly vcr = inject(ViewContainerRef);
  private readonly permissions = inject(PermissionsService);

  @Input() set appCan(permission: string | string[] | null | undefined) {
    this.vcr.clear();
    if (permission == null || permission === '') {
      return;
    }
    const list = Array.isArray(permission) ? permission : [permission];
    if (list.every((p) => this.permissions.has(p))) {
      this.vcr.createEmbeddedView(this.tpl);
    }
  }
}
