import { Component } from '@angular/core';
import { RouterModule, Router } from '@angular/router';

@Component({
  selector: 'app-employer-procedures-placeholder',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './employer-procedures-placeholder.component.html',
  styleUrl: './employer-procedures-placeholder.component.scss',
})
export class EmployerProceduresPlaceholderComponent {
  constructor(private router: Router) {}

  goToCompanyRegister() {
    this.router.navigate(['/company-register']);
  }
}
