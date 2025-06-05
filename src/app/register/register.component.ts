import { Component, AfterViewInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef } from '@angular/material/dialog';
import { AuthService } from '../services/auth.service';
import { MatRadioModule } from '@angular/material/radio';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatRadioModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonToggleModule,
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent implements AfterViewInit {
  registerForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<RegisterComponent>,
    private authService: AuthService,
    private ngZone: NgZone
  ) {
    this.registerForm = this.fb.group(
      {
        lastName: ['', [Validators.required]],
        firstName: ['', [Validators.required]],
        lastNameKana: ['', [Validators.required]],
        firstNameKana: ['', [Validators.required]],
        birthDate: ['', [Validators.required]],
        gender: ['', [Validators.required]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
        role: ['employee_user', [Validators.required]],
      },
      { validators: this.passwordMatchValidator }
    );
  }

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password')?.value;
    const confirmPassword = form.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  async onSubmit() {
    console.log('onSubmit called', this.registerForm.value, this.registerForm.valid);
    if (this.registerForm.valid) {
      const {
        lastName,
        firstName,
        lastNameKana,
        firstNameKana,
        birthDate,
        gender,
        email,
        password,
        role,
      } = this.registerForm.value;
      try {
        await this.authService.registerUserByAdmin(
          email,
          password,
          '',
          role,
          lastName,
          firstName,
          lastNameKana,
          firstNameKana,
          birthDate,
          gender
        );
        this.dialogRef.close({ email, password });
      } catch (err) {
        console.error('登録エラー', err);
      }
    } else {
      this.registerForm.markAllAsTouched();
      console.log('Form errors:', this.registerForm.errors, this.registerForm.value);
    }
  }

  onCancel() {
    this.dialogRef.close();
  }

  ngAfterViewInit() {
    this.removeDaySuffix();
    const calendar = document.querySelector('.mat-calendar');
    if (calendar) {
      calendar.addEventListener('click', () => {
        setTimeout(() => this.removeDaySuffix(), 0);
      });
    }
  }

  removeDaySuffix() {
    this.ngZone.runOutsideAngular(() => {
      const cells = document.querySelectorAll('.mat-calendar-body-cell-content');
      cells.forEach((el) => {
        if (el instanceof HTMLElement) {
          el.innerText = el.innerText.replace(/日$/, '');
        }
      });
    });
  }
}
