import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-maternity-leave-end-salary-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, RouterModule],
  templateUrl: './maternity-leave-end-salary-notification.component.html',
  styleUrl: './maternity-leave-end-salary-notification.component.scss',
})
export class MaternityLeaveEndSalaryNotificationComponent {
  uid = '';
  userName = '';
  isEditing = false;

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
