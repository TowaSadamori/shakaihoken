import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-qualification-acquisition-notification',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    RouterModule,
  ],
  templateUrl: './qualification-acquisition-notification.component.html',
  styleUrls: ['./qualification-acquisition-notification.component.scss'],
})
export class QualificationAcquisitionNotificationComponent {
  isEditing = false;
  uid = '';
  userName = '';

  constructor(
    private route: ActivatedRoute,
    private userService: UserService
  ) {
    this.route.params.subscribe((params) => {
      this.uid = params['uid'];
      this.loadUserName();
    });
  }

  private async loadUserName(): Promise<void> {
    if (this.uid) {
      try {
        const user = await this.userService.getUserByUid(this.uid);
        if (user) {
          this.userName = `${user.lastName}${user.firstName}`;
        }
      } catch (error) {
        console.error('Error loading user:', error);
      }
    }
  }

  onEdit(): void {
    this.isEditing = true;
  }

  onSave(): void {
    // TODO: 保存処理の実装
    this.isEditing = false;
  }

  onCancel(): void {
    this.isEditing = false;
  }
}
