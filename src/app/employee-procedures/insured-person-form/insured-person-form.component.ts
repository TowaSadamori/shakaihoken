import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { UserService, User } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-insured-person-form',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './insured-person-form.component.html',
  styleUrl: './insured-person-form.component.scss',
})
export class InsuredPersonFormComponent implements OnInit {
  users: User[] = [];
  companyId: string | null = null;

  constructor(
    private userService: UserService,
    private authService: AuthService,
    private router: Router
  ) {}

  async ngOnInit() {
    const companyId = await this.authService.getCurrentUserCompanyId();
    if (!companyId) return;

    const currentUser = await this.authService.getCurrentUserProfileWithRole();
    if (!currentUser) return;

    if (currentUser.role === 'admin') {
      const allUsers = await this.userService.getAllUsers();
      this.users = allUsers
        .filter((user) => user.companyId === companyId)
        .sort((a, b) =>
          (a.employeeNumber || '').localeCompare(b.employeeNumber || '', undefined, {
            numeric: true,
          })
        );
    } else {
      const user = await this.userService.getUserByUid(currentUser.uid);
      if (user) {
        this.users = [user];
      } else {
        this.users = [];
      }
    }
  }

  // 従業員本人の詳細ページへ
  goToInsuredPersonDetail(uid: string) {
    this.router.navigate(['/employee-procedures/insured-person-detail', uid]);
  }
}
