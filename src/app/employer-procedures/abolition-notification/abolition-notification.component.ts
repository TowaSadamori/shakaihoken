import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterModule } from '@angular/router';

@Component({
  selector: 'app-abolition-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, RouterModule],
  templateUrl: './abolition-notification.component.html',
  styleUrl: './abolition-notification.component.scss',
})
export class AbolitionNotificationComponent {
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
