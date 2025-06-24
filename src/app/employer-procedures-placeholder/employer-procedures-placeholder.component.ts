import { Component, OnInit } from '@angular/core';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
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
    private authService: AuthService,
    private route: ActivatedRoute
  ) {}

  async ngOnInit(): Promise<void> {
    const user = await this.authService.getCurrentUserProfileWithRole();
    this.isEmployee = user?.role !== 'admin';

    this.offices = await this.officeService.getOfficesForCurrentUser();
    if (this.offices.length > 0) {
      this.selectedOfficeId = this.officeService.selectedOfficeId || this.offices[0].id;
      this.officeService.selectedOfficeId = this.selectedOfficeId;
    }
  }

  onOfficeChange(officeId: string) {
    this.selectedOfficeId = officeId;
    this.officeService.selectedOfficeId = officeId;
    this.router.navigate(['/employer-procedures', officeId]);
  }

  goToCompanyRegister() {
    this.router.navigate(['/company-register']);
  }
}
