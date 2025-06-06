import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
import { Router } from '@angular/router';

@Component({
  selector: 'app-password-reset',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './password-reset.component.html',
  styleUrl: './password-reset.component.scss',
})
export class PasswordResetComponent {
  resetForm: FormGroup;
  message = '';
  error = '';
  loading = false;
  auth = getAuth();

  constructor(
    private fb: FormBuilder,
    private router: Router
  ) {
    this.resetForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  async onSubmit() {
    this.message = '';
    this.error = '';
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }
    this.loading = true;
    const email = this.resetForm.value.email;
    try {
      this.auth.languageCode = 'ja';
      await sendPasswordResetEmail(this.auth, email);
      this.message = 'パスワードリセット用のメールを送信しました。メールをご確認ください。';
    } catch (e: unknown) {
      if (e && typeof e === 'object' && 'message' in e) {
        this.error =
          (e as { message?: string }).message || 'パスワードリセットメールの送信に失敗しました。';
      } else {
        this.error = 'パスワードリセットメールの送信に失敗しました。';
      }
    } finally {
      this.loading = false;
    }
  }

  navigateToLogin() {
    this.router.navigate(['/login']);
  }
}
