import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { UserService, User } from '../services/user.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-employee-procedures-placeholder',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './employee-procedures-placeholder.component.html',
  styleUrl: './employee-procedures-placeholder.component.scss',
})
export class EmployeeProceduresPlaceholderComponent implements OnInit {
  users: User[] = [];
  sortOrder: 'asc' | 'desc' = 'asc';

  constructor(
    private router: Router,
    private userService: UserService,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    const companyId = await this.authService.getCurrentUserCompanyId();
    const allUsers = await this.userService.getAllUsers();
    this.users = allUsers
      .filter((user) => user.companyId === companyId)
      .sort((a, b) =>
        (a.employeeNumber || '').localeCompare(b.employeeNumber || '', undefined, { numeric: true })
      );
    this.sortOrder = 'asc';
  }

  sortByEmployeeNumber() {
    if (this.sortOrder === 'asc') {
      this.users.sort((a, b) =>
        (a.employeeNumber || '').localeCompare(b.employeeNumber || '', undefined, { numeric: true })
      );
      this.sortOrder = 'desc';
    } else {
      this.users.sort((a, b) =>
        (b.employeeNumber || '').localeCompare(a.employeeNumber || '', undefined, { numeric: true })
      );
      this.sortOrder = 'asc';
    }
  }

  goToSalaryBonus() {
    this.router.navigate(['/employee-salary-bonus']);
  }

  async goToApplication() {
    const currentUser = await this.authService.getCurrentUserProfileWithRole();
    if (currentUser) {
      this.router.navigate(['/employee-procedures/application-form', currentUser.uid]);
    }
  }
}
