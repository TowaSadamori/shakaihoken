import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterModule } from '@angular/router';

@Component({
  selector: 'app-wage-summary-report',
  standalone: true,
  imports: [CommonModule, MatButtonModule, RouterModule],
  templateUrl: './wage-summary-report.component.html',
  styleUrl: './wage-summary-report.component.scss',
})
export class WageSummaryReportComponent {
  uid = '';
  isEditing = false;

  constructor(private route: ActivatedRoute) {
    this.route.params.subscribe((params) => {
      this.uid = params['uid'];
    });
  }

  onEdit() {
    this.isEditing = true;
  }

  onSave() {
    this.isEditing = false;
    // TODO: 保存処理の実装
  }

  onCancel() {
    this.isEditing = false;
  }
}
