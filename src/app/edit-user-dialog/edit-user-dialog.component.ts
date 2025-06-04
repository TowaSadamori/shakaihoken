import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import type { User } from '../create-account/create-account.component';

@Component({
  selector: 'app-edit-user-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  templateUrl: './edit-user-dialog.component.html',
  styleUrl: './edit-user-dialog.component.scss',
})
export class EditUserDialogComponent {
  editForm: FormGroup;
  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<EditUserDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: User
  ) {
    this.editForm = this.fb.group(
      {
        lastName: [data.lastName, [Validators.required]],
        firstName: [data.firstName, [Validators.required]],
        lastNameKana: [data.lastNameKana, [Validators.required]],
        firstNameKana: [data.firstNameKana, [Validators.required]],
        birthDate: [data.birthDate, [Validators.required]],
        gender: [data.gender, [Validators.required]],
        email: [data.email, [Validators.required, Validators.email]],
        password: [data.password, [Validators.required, Validators.minLength(6)]],
        confirmPassword: [data.password, [Validators.required, Validators.minLength(6)]],
        role: [data.role, [Validators.required]],
      },
      { validators: this.passwordMatchValidator }
    );
  }
  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password')?.value;
    const confirmPassword = form.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }
  onSave() {
    if (this.editForm.valid) {
      this.dialogRef.close(this.editForm.value);
    } else {
      this.editForm.markAllAsTouched();
    }
  }
  onCancel() {
    this.dialogRef.close();
  }
}
