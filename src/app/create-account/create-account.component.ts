import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { RegisterComponent } from '../register/register.component';

@Component({
  selector: 'app-create-account',
  standalone: true,
  imports: [CommonModule, RouterModule, MatDialogModule],
  template: `
    <div class="create-account-container">
      <h2>アカウント作成ページ</h2>
      <button (click)="openRegisterDialog()" class="main-create-account-btn">アカウント作成</button>
      <!-- アカウント一覧表示エリア（仮） -->
      <div class="account-list-placeholder">
        <h3>作成済みアカウント一覧（サンプル）</h3>
        <ul>
          <li>山田 太郎（管理者）</li>
          <li>佐藤 花子（従業員）</li>
        </ul>
      </div>
      <button routerLink="/settings">設定に戻る</button>
    </div>
  `,
  styles: [
    `
      .create-account-container {
        padding: 32px;
        text-align: center;
      }
      .main-create-account-btn {
        margin-bottom: 32px;
      }
      .account-list-placeholder {
        margin: 32px auto;
        max-width: 400px;
        background: #f5f5f5;
        border-radius: 12px;
        padding: 24px;
        text-align: left;
      }
      .account-list-placeholder h3 {
        margin-top: 0;
        color: #1976d2;
      }
      .account-list-placeholder ul {
        padding-left: 1.2em;
      }
      button {
        margin-top: 24px;
        padding: 8px 24px;
        font-size: 16px;
      }
    `,
  ],
})
export class CreateAccountComponent {
  constructor(private dialog: MatDialog) {}

  openRegisterDialog() {
    this.dialog.open(RegisterComponent, {
      width: '400px',
      disableClose: false,
    });
  }
}
