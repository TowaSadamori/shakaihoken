import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterModule } from '@angular/router';

@Component({
  selector: 'app-voluntary-application-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, RouterModule],
  templateUrl: './voluntary-application-notification.component.html',
  styleUrl: './voluntary-application-notification.component.scss',
})
export class VoluntaryApplicationNotificationComponent {
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
