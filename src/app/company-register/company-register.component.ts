import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-company-register',
  standalone: true,
  imports: [],
  templateUrl: './company-register.component.html',
  styleUrl: './company-register.component.scss',
})
export class CompanyRegisterComponent {
  constructor(private router: Router) {}

  goHome() {
    this.router.navigate(['/']);
  }
}
