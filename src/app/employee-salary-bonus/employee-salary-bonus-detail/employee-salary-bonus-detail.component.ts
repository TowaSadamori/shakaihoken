import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-employee-salary-bonus-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './employee-salary-bonus-detail.component.html',
  styleUrl: './employee-salary-bonus-detail.component.scss',
})
export class EmployeeSalaryBonusDetailComponent {
  constructor(private router: Router) {}

  goBack() {
    this.router.navigate(['/employee-salary-bonus']);
  }
}
