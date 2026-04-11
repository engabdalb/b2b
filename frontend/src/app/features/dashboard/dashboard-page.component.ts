import { Component, OnInit, inject } from '@angular/core';
import { Permission } from '../../config/permissions.config';
import { DashboardMockService } from './dashboard-mock.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { CanDirective } from '../../shared/directives/can.directive';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [PageHeaderComponent, TranslatePipe, CanDirective],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent implements OnInit {
  protected readonly perm = Permission;
  private readonly data = inject(DashboardMockService);

  readonly metrics = this.data.metrics;

  ngOnInit(): void {
    this.data.load();
  }
}
