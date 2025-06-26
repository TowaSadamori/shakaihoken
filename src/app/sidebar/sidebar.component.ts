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
import { RouterModule, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { AuthService } from '../services/auth.service';
import { OfficeService } from '../services/office.service';

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
    { label: '社会保険料情報', path: '/employee-salary-bonus' },
    { label: '本人情報', path: '#' },
    { label: '被扶養者情報', path: '#' },
    { label: 'その他申請', path: '#' },
    { label: '事業所手続き', path: '/employer-procedures', icon: 'business' },
    { label: '事業所一覧', path: '/company-register' },
    { label: '設定', path: '/settings', icon: 'settings' },
    { label: '保険料マスタ', path: '/insurance-rate-list' },
  ];

  isLabelVisible = true;
  private widthTransitionMs = 200;

  constructor(
    public router: Router,
    private authService: AuthService,
    public officeService: OfficeService
  ) {}

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

  async goToMyInfo() {
    const currentUser = await this.authService.getCurrentUserProfileWithRole();
    if (currentUser) {
      this.router.navigate(['/employee-procedures/insured-person-detail', currentUser.uid]);
    }
    this.onNavItemClick();
  }

  async goToDependentInfo() {
    const currentUser = await this.authService.getCurrentUserProfileWithRole();
    if (currentUser) {
      this.router.navigate(['/employee-procedures/dependent-detail', currentUser.uid]);
    }
    this.onNavItemClick();
  }

  async goToOtherApplications() {
    const currentUser = await this.authService.getCurrentUserProfileWithRole();
    if (currentUser) {
      this.router.navigate(['/employee-procedures/application-form', currentUser.uid]);
    }
    this.onNavItemClick();
  }

  get employerProceduresPath(): string {
    const officeId = this.officeService.selectedOfficeId;
    return officeId ? `/employer-procedures/${officeId}` : '/employer-procedures';
  }

  get filteredNavItems(): NavItem[] {
    return this.isMini ? this.navItems.filter((item) => !!item.icon) : this.navItems;
  }
}
