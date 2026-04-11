import { Component } from '@angular/core';
import { Permission } from '../../config/permissions.config';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { CanDirective } from '../../shared/directives/can.directive';

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [PageHeaderComponent, TranslatePipe, CanDirective],
  templateUrl: './reports-page.component.html',
  styleUrl: './reports-page.component.scss',
})
export class ReportsPageComponent {
  protected readonly perm = Permission;
}
