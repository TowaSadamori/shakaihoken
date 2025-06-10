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
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import type { User } from '../create-account/create-account.component';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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
  offices: { branchNumber: string | number; name: string }[] = [];
  db = getFirestore();
  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<EditUserDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { user: User; currentUid: string },
    private dialog: MatDialog
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
        email: [
          data.user.email,
          this.isSelfEmployee ? [] : [Validators.required, Validators.email],
        ],
        password: [data.user.password, [Validators.required, Validators.minLength(6)]],
        confirmPassword: [data.user.password, [Validators.required, Validators.minLength(6)]],
        role: [data.user.role, [Validators.required]],
        currentPassword: ['', this.isSelfEmployee ? [Validators.required] : []],
        employeeNumber: [data.user.employeeNumber],
        branchNumber: [data.user.branchNumber],
      },
      { validators: this.passwordMatchValidator }
    );
    this.loadOffices();
  }
  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password')?.value;
    const confirmPassword = form.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }
  async onSave() {
    if (this.editForm.valid) {
      const employeeNumber = String(this.editForm.get('employeeNumber')?.value ?? '').trim();
      const companyId = this.data.user.companyId;
      const uid = this.data.user.uid;
      if (employeeNumber) {
        const usersCol = collection(this.db, 'users');
        const q = query(
          usersCol,
          where('companyId', '==', companyId),
          where('employeeNumber', '==', employeeNumber)
        );
        const snapshot = await getDocs(q);
        const duplicate = snapshot.docs.find((doc) => doc.id !== uid);
        if (duplicate) {
          this.editForm.get('employeeNumber')?.setErrors({ duplicate: true });
          return;
        }
      }
      if (this.isSelfEmployee) {
        const firestoreValues = { ...this.editForm.getRawValue() };
        delete firestoreValues.email;
        delete firestoreValues.password;
        delete firestoreValues.confirmPassword;
        delete firestoreValues.currentPassword;
        this.dialogRef.close(firestoreValues);
      } else {
        this.dialogRef.close(this.editForm.getRawValue());
      }
    } else {
      this.editForm.markAllAsTouched();
      console.log('onSave invalid', this.editForm.errors, this.editForm.getRawValue());
    }
  }
  onCancel() {
    this.dialogRef.close();
  }
  async onDelete() {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      disableClose: true,
      data: {
        title: '削除確認',
        message: '本当に削除しますか？',
        confirmText: 'はい',
        cancelText: 'いいえ',
        icon: 'warning',
        iconColor: '#e53935',
      },
    });
    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.dialogRef.close('deleted');
      }
    });
  }
  async loadOffices() {
    const companyId = this.data.user.companyId;
    if (!companyId) return;
    const officesCol = collection(this.db, 'offices');
    const q = query(officesCol, where('companyId', '==', companyId));
    const snapshot = await getDocs(q);
    this.offices = snapshot.docs.map((doc) => {
      const d = doc.data() as { branchNumber?: string | number; name?: string };
      return {
        branchNumber: d.branchNumber ?? '',
        name: d.name ?? '',
      };
    });
  }
}
