import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';
import { FirebaseError } from 'firebase/app';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  loginForm: FormGroup;
  errorMessage = '';
  loading = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  async onSubmit() {
    this.errorMessage = '';
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    this.loading = true;
    const { email, password } = this.loginForm.value;
    try {
      await this.authService.login(email, password);
      this.router.navigate(['/']); // 成功時にトップへ遷移（必要に応じて変更）
    } catch (error) {
      this.errorMessage = this.getErrorMessage(error as FirebaseError);
    } finally {
      this.loading = false;
    }
  }

  getErrorMessage(error: FirebaseError): string {
    if (error && error.code) {
      switch (error.code) {
        case 'auth/user-not-found':
          return 'ユーザーが存在しません';
        case 'auth/wrong-password':
          return 'パスワードが間違っています';
        case 'auth/invalid-email':
          return 'メールアドレスの形式が正しくありません';
        default:
          return 'ログインに失敗しました';
      }
    }
    return 'ログインに失敗しました';
  }
}
