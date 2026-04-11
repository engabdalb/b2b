import { Component, OnInit, inject } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Permission } from '../../config/permissions.config';
import { DashboardMockService } from './dashboard-mock.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';
import { CanDirective } from '../../shared/directives/can.directive';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    PageHeaderComponent,
    TranslatePipe,
    CanDirective,
    RouterLink,
    DecimalPipe,
    DatePipe,
  ],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent implements OnInit {
  protected readonly perm = Permission;
  private readonly data = inject(DashboardMockService);
  protected readonly i18n = inject(I18nService);

  readonly metrics = this.data.metrics;
  readonly recentOrders = this.data.recentOrders;

  ngOnInit(): void {
    this.data.load();
  }
}
