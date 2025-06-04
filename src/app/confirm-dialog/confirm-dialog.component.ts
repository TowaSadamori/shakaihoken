import { Component, Input, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';

interface ConfirmDialogData {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  icon?: string;
  iconColor?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  @Input() title = '確認';
  @Input() message = 'この操作を実行しますか？';
  @Input() confirmText = 'はい';
  @Input() cancelText = 'いいえ';
  @Input() icon = 'help'; // warning, delete, info など
  @Input() iconColor = '#1976d2';

  constructor(
    private dialogRef: MatDialogRef<ConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData
  ) {
    if (data) {
      if (data.title) this.title = data.title;
      if (data.message) this.message = data.message;
      if (data.confirmText) this.confirmText = data.confirmText;
      if (data.cancelText) this.cancelText = data.cancelText;
      if (data.icon) this.icon = data.icon;
      if (data.iconColor) this.iconColor = data.iconColor;
    }
  }

  onCancel() {
    this.dialogRef.close(false);
  }
  onConfirm() {
    this.dialogRef.close(true);
  }
}
