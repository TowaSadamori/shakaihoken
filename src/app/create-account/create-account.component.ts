import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-create-account',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="create-account-container">
      <h2>アカウント作成ページ</h2>
      <button routerLink="/settings">設定に戻る</button>
    </div>
  `,
  styles: [
    `
      .create-account-container {
        padding: 32px;
        text-align: center;
      }
      button {
        margin-top: 24px;
        padding: 8px 24px;
        font-size: 16px;
      }
    `,
  ],
})
export class CreateAccountComponent {}
