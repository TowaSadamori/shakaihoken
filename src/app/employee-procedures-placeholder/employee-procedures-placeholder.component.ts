import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-employee-procedures-placeholder',
  standalone: true,
  imports: [],
  templateUrl: './employee-procedures-placeholder.component.html',
  styleUrl: './employee-procedures-placeholder.component.scss',
})
export class EmployeeProceduresPlaceholderComponent {
  constructor(private router: Router) {}

  goToSalaryBonus() {
    this.router.navigate(['/employee-salary-bonus']);
  }
}
