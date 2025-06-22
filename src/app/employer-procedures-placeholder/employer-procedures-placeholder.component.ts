import { Component, OnInit } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { MatSelectModule } from '@angular/material/select';
import { OfficeService } from '../services/office.service';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-employer-procedures-placeholder',
  standalone: true,
  imports: [CommonModule, RouterModule, MatSelectModule],
  templateUrl: './employer-procedures-placeholder.component.html',
  styleUrl: './employer-procedures-placeholder.component.scss',
})
export class EmployerProceduresPlaceholderComponent implements OnInit {
  offices: { id: string; [key: string]: unknown }[] = [];
  selectedOfficeId: string | null = null;
  isEmployee = false;

  constructor(
    private router: Router,
    private officeService: OfficeService,
    private authService: AuthService
  ) {}

  async ngOnInit(): Promise<void> {
    const user = await this.authService.getCurrentUserProfileWithRole();
    this.isEmployee = user?.role !== 'admin';

    this.offices = await this.officeService.getOfficesForCurrentUser();
    if (this.offices.length > 0) {
      this.selectedOfficeId = this.offices[0].id;
    }
  }

  onOfficeChange(officeId: string) {
    // 現在のURLを維持しつつ、officeIdをパラメータとして遷移
    // 例: /employer-procedures/:officeId
    this.router.navigate(['/employer-procedures', officeId]);
  }

  goToCompanyRegister() {
    this.router.navigate(['/company-register']);
  }
}
