import { Component, AfterViewInit, NgZone, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { AuthService } from '../services/auth.service';
import { MatRadioModule } from '@angular/material/radio';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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
  offices: { branchNumber: string | number; name: string }[] = [];
  db = getFirestore();

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<RegisterComponent>,
    private authService: AuthService,
    private ngZone: NgZone,
    @Inject(MAT_DIALOG_DATA) public data: { companyId: string }
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
        companyId: [this.data.companyId, [Validators.required]],
        employeeNumber: ['', []],
        branchNumber: ['', []],
      },
      { validators: this.passwordMatchValidator }
    );
    this.loadOffices();
  }

  async loadOffices() {
    const companyId = this.data.companyId;
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

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password')?.value;
    const confirmPassword = form.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  async onSubmit() {
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
        companyId,
        employeeNumber,
        branchNumber,
      } = this.registerForm.value;

      const employeeNumberStr = String(employeeNumber ?? '').trim();
      if (employeeNumberStr) {
        const { getFirestore, collection, getDocs, query, where } = await import(
          'firebase/firestore'
        );
        const db = getFirestore();
        const usersCol = collection(db, 'users');
        const q = query(
          usersCol,
          where('companyId', '==', companyId),
          where('employeeNumber', '==', employeeNumberStr)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          this.registerForm.get('employeeNumber')?.setErrors({ duplicate: true });
          return;
        }
      }
      try {
        await this.authService.registerUserByAdmin(
          email,
          password,
          role,
          lastName,
          firstName,
          lastNameKana,
          firstNameKana,
          birthDate,
          gender,
          companyId,
          employeeNumber,
          branchNumber
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
