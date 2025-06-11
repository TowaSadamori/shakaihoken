import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
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
    private authService: AuthService
  ) {}

  async ngOnInit() {
    this.companyId = await this.authService.getCurrentUserCompanyId();
    if (this.companyId) {
      const users = await this.userService.getUsersByCompanyId(this.companyId);
      // employeeNumber順に昇順ソート
      this.users = users.sort((a, b) => {
        const numA = Number(a.employeeNumber) || 0;
        const numB = Number(b.employeeNumber) || 0;
        return numA - numB;
      });
    }
  }
}
