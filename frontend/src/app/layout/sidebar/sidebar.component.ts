import { Component, HostListener, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
import { appConfig } from '../../config/app-config';
import { NavigationService } from '../../core/services/navigation.service';
import { LayoutUiService } from '../../core/services/layout-ui.service';
import { TranslatePipe } from '../../shared/pipes/translate.pipe';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TranslatePipe],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  readonly nav = inject(NavigationService);
  readonly brand = appConfig.brand;
  readonly layoutUi = inject(LayoutUiService);
  private readonly router = inject(Router);

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.layoutUi.closeMobileNav();
    });
  }

  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth > 900) {
      this.layoutUi.closeMobileNav();
    }
  }

  toggleCollapse(): void {
    this.layoutUi.toggleSidebarCollapsed();
  }

  navLinkClick(): void {
    if (window.innerWidth <= 900) {
      this.layoutUi.closeMobileNav();
    }
  }
}
