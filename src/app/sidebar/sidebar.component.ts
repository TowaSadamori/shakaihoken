import {
  Component,
  ViewEncapsulation,
  Output,
  EventEmitter,
  Input,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
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
export class SidebarComponent implements OnChanges {
  @Input() isMini = false;
  @Output() navItemClick = new EventEmitter<void>();
  @Output() toggleMini = new EventEmitter<void>();
  navItems: NavItem[] = [
    { label: 'ホーム', path: '/', icon: 'home' },
    { label: '従業員手続き', path: '/employee-procedures', icon: 'person' },
    { label: '給与賞与情報', path: '/employee-salary-bonus' },
    { label: '事業所手続き', path: '/employer-procedures', icon: 'business' },
    { label: '事業所一覧', path: '/company-register' },
    { label: '設定', path: '/settings', icon: 'settings' },
    { label: '保険料マスタ', path: '/insurance-rate-list' },
  ];

  isLabelVisible = true;
  private widthTransitionMs = 200;

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isMini']) {
      if (!this.isMini) {
        this.isLabelVisible = true;
      } else {
        this.isLabelVisible = false;
      }
    }
  }

  onNavItemClick() {
    this.navItemClick.emit();
  }

  onToggleMini() {
    this.toggleMini.emit();
  }

  goToCreateAccount() {
    window.location.href = '/create-account';
  }
}
