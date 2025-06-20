import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { OfficeService } from '../../services/office.service';

@Component({
  selector: 'app-wage-summary-report',
  standalone: true,
  imports: [CommonModule, MatButtonModule, RouterModule],
  templateUrl: './wage-summary-report.component.html',
  styleUrl: './wage-summary-report.component.scss',
})
export class WageSummaryReportComponent implements OnInit {
  uid = '';
  officeName = '';
  isEditing = false;

  constructor(
    private route: ActivatedRoute,
    private officeService: OfficeService
  ) {}

  async ngOnInit(): Promise<void> {
    this.uid = this.route.snapshot.params['uid'];
    if (this.uid) {
      const office = await this.officeService.getOfficeById(this.uid);
      this.officeName =
        (office && ((office['officeName'] as string) || (office['name'] as string) || office.id)) ||
        '';
    }
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
