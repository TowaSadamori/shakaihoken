import { Component, OnInit } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { MatSelectModule } from '@angular/material/select';
import { OfficeService } from '../services/office.service';
import { CommonModule } from '@angular/common';

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

  constructor(
    private router: Router,
    private officeService: OfficeService
  ) {}

  async ngOnInit(): Promise<void> {
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
