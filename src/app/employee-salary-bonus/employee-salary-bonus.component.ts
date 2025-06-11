import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-employee-salary-bonus',
  standalone: true,
  imports: [],
  templateUrl: './employee-salary-bonus.component.html',
  styleUrl: './employee-salary-bonus.component.scss',
})
export class EmployeeSalaryBonusComponent {
  constructor(private router: Router) {}

  goHome() {
    this.router.navigate(['/']);
  }
}
