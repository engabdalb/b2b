import { Component, HostListener, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LayoutUiService } from '../core/services/layout-ui.service';
import { SidebarComponent } from './sidebar/sidebar.component';
import { TopbarComponent } from './topbar/topbar.component';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
})
export class LayoutComponent {
  readonly layoutUi = inject(LayoutUiService);

  @HostListener('document:keydown', ['$event'])
  onEsc(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') {
      this.layoutUi.closeMobileNav();
    }
  }
}
