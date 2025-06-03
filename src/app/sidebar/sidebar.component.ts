import { Component, ViewEncapsulation, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';

export interface NavItem {
  label: string;
  path: string;
  icon?: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatSidenavModule, MatListModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class SidebarComponent {
  @Output() navItemClick = new EventEmitter<void>();
  isMini = false;
  navItems: NavItem[] = [
    { label: 'ホーム', path: '/', icon: 'home' },
    { label: '従業員手続き', path: '/employee-procedures', icon: 'person' },
    { label: '事業所手続き', path: '/employer-procedures', icon: 'business' },
    { label: '設定', path: '/settings', icon: 'settings' },
  ];

  onNavItemClick() {
    this.navItemClick.emit();
  }

  toggleMini() {
    this.isMini = !this.isMini;
  }
}
