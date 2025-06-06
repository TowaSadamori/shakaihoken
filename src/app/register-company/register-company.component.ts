import { Component } from '@angular/core';
import { Router } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  ValidatorFn,
  AbstractControl,
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';

function katakanaValidator(): ValidatorFn {
  return (control: AbstractControl) => {
    const value = control.value;
    if (!value) return null;
    return /^[\u30A0-\u30FF]+$/.test(value) ? null : { katakana: true };
  };
}

@Component({
  selector: 'app-register-company',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './register-company.component.html',
  styleUrl: './register-company.component.scss',
})
export class RegisterCompanyComponent {
  registerForm: FormGroup;
  submitted = false;
  errorMessage = '';
  successMessage = '';
  loading = false;

  constructor(
    private router: Router,
    private fb: FormBuilder,
    private authService: AuthService
  ) {
    this.registerForm = this.fb.group(
      {
        companyName: ['', [Validators.required, Validators.maxLength(50)]],
        lastName: ['', [Validators.required, Validators.maxLength(20)]],
        firstName: ['', [Validators.required, Validators.maxLength(20)]],
        lastNameKana: ['', [Validators.required, katakanaValidator()]],
        firstNameKana: ['', [Validators.required, katakanaValidator()]],
        birthDate: ['', [Validators.required]],
        gender: ['', [Validators.required]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
        role: ['admin'],
      },
      { validators: this.passwordMatchValidator }
    );
  }

  passwordMatchValidator(form: AbstractControl) {
    const password = form.get('password')?.value;
    const confirmPassword = form.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  goBack() {
    this.router.navigate(['/login']);
  }

  async onSubmit() {
    this.submitted = true;
    this.errorMessage = '';
    this.successMessage = '';
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }
    this.loading = true;
    try {
      await this.authService.registerCompanyAdmin(this.registerForm.value);
      this.successMessage = 'アカウント作成が完了しました。ログイン画面からログインしてください。';
      setTimeout(() => this.router.navigate(['/login']), 2000);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'message' in err) {
        this.errorMessage = (err as { message?: string }).message || 'アカウント作成に失敗しました';
      } else {
        this.errorMessage = 'アカウント作成に失敗しました';
      }
    } finally {
      this.loading = false;
    }
  }

  get f() {
    return this.registerForm.controls;
  }
}
