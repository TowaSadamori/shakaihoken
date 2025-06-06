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
  isSelfEmployee = false;
  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<EditUserDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { user: User; currentUid: string }
  ) {
    this.isSelfEmployee = data.user.uid === data.currentUid && data.user.role === 'employee_user';
    this.editForm = this.fb.group(
      {
        lastName: [data.user.lastName, [Validators.required]],
        firstName: [data.user.firstName, [Validators.required]],
        lastNameKana: [data.user.lastNameKana, [Validators.required]],
        firstNameKana: [data.user.firstNameKana, [Validators.required]],
        birthDate: [data.user.birthDate, [Validators.required]],
        gender: [data.user.gender, [Validators.required]],
        email: [data.user.email, [Validators.required, Validators.email]],
        password: [data.user.password, [Validators.required, Validators.minLength(6)]],
        confirmPassword: [data.user.password, [Validators.required, Validators.minLength(6)]],
        role: [data.user.role, [Validators.required]],
        currentPassword: ['', this.isSelfEmployee ? [Validators.required] : []],
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
      console.log('onSave called', this.editForm.value);
      this.dialogRef.close(this.editForm.value);
    } else {
      this.editForm.markAllAsTouched();
      console.log('onSave invalid', this.editForm.errors, this.editForm.value);
    }
  }
  onCancel() {
    this.dialogRef.close();
  }
}
