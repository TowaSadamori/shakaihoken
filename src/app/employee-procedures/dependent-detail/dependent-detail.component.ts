import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-dependent-detail',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './dependent-detail.component.html',
  styleUrl: './dependent-detail.component.scss',
})
export class DependentDetailComponent {}
