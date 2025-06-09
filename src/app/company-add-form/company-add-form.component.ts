import { Component, Inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
} from 'firebase/firestore';
import { MatDialogRef } from '@angular/material/dialog';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import type { Company } from '../company-register/company-register.component';

interface CompanyDialogData {
  office?: Company;
  officeId?: string;
  isEdit?: boolean;
}

@Component({
  selector: 'app-company-add-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './company-add-form.component.html',
  styleUrl: './company-add-form.component.scss',
})
export class CompanyAddFormComponent {
  companyForm: FormGroup;
  loading = false;
  errorMsg = '';

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CompanyAddFormComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CompanyDialogData
  ) {
    this.companyForm = this.fb.group({
      name: ['', Validators.required],
      addressPrefecture: ['', Validators.required],
      addressDetail: ['', Validators.required],
      code: ['', Validators.required],
      corporationNumber: [''],
      ownerName: ['', Validators.required],
      phone: ['', Validators.required],
      businessType: ['', Validators.required],
      establishedDate: ['', Validators.required],
      employeeCount: ['', Validators.required],
      applyType: ['', Validators.required],
      beforeChange: [''],
      abolishedDate: [''],
      abolishedReason: [''],
      bankName: ['', Validators.required],
      bankBranch: ['', Validators.required],
      bankType: ['', Validators.required],
      bankNumber: ['', Validators.required],
      bankHolder: ['', Validators.required],
    });
    // 編集時は初期値をセット
    if (data && data.isEdit && data.office) {
      const office = { ...data.office };
      // establishedDateの変換
      if (office.establishedDate) {
        const d: unknown = office.establishedDate;
        let dateStr = '';
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
          dateStr = d;
        } else if (d instanceof Date) {
          dateStr = d.toISOString().slice(0, 10);
        } else if (isTimestamp(d)) {
          dateStr = d.toDate().toISOString().slice(0, 10);
        } else if (typeof d === 'string') {
          const parsed = new Date(
            Date.parse(
              d
                .replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/, '$1-$2-$3')
                .replace(' UTC+9', 'T00:00:00+09:00')
            )
          );
          if (!isNaN(parsed.getTime())) {
            dateStr = parsed.toISOString().slice(0, 10);
          }
        }
        office.establishedDate = dateStr;
      }
      // abolishedDateの変換
      if (office.abolishedDate) {
        const d: unknown = office.abolishedDate;
        let dateStr = '';
        if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
          dateStr = d;
        } else if (d instanceof Date) {
          dateStr = d.toISOString().slice(0, 10);
        } else if (isTimestamp(d)) {
          dateStr = d.toDate().toISOString().slice(0, 10);
        } else if (typeof d === 'string') {
          const parsed = new Date(
            Date.parse(
              d
                .replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/, '$1-$2-$3')
                .replace(' UTC+9', 'T00:00:00+09:00')
            )
          );
          if (!isNaN(parsed.getTime())) {
            dateStr = parsed.toISOString().slice(0, 10);
          }
        }
        office.abolishedDate = dateStr;
      }
      this.companyForm.patchValue(office);
    }
  }

  async onSubmit() {
    if (this.companyForm.invalid) return;
    this.loading = true;
    this.errorMsg = '';
    try {
      const db = getFirestore();
      if (this.data && this.data.isEdit && this.data.officeId) {
        // 編集時: updateDocでFirestoreを更新
        const officeDocRef = doc(db, 'offices', this.data.officeId);
        const formValue = this.companyForm.value;
        await updateDoc(officeDocRef, {
          ...formValue,
          address: formValue.addressPrefecture + formValue.addressDetail,
          establishedDate: formValue.establishedDate ? new Date(formValue.establishedDate) : null,
          abolishedDate: formValue.abolishedDate ? new Date(formValue.abolishedDate) : null,
          employeeCount: Number(formValue.employeeCount),
        });
        this.dialogRef.close(true);
        return;
      }
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) throw new Error('ログイン情報が取得できません');
      // ユーザーのcompanyId取得
      const userDocSnap = await getDocs(
        query(collection(db, 'users'), where('uid', '==', user.uid))
      );
      if (userDocSnap.empty) throw new Error('ユーザー情報が見つかりません');
      const userData = userDocSnap.docs[0].data();
      const companyId = userData['companyId'];
      if (!companyId) throw new Error('companyIdが取得できません');
      // 既存の事業所番号の最大値を取得
      const companiesSnap = await getDocs(
        query(collection(db, 'offices'), where('companyId', '==', companyId))
      );
      let maxBranchNumber = 0;
      companiesSnap.forEach((doc) => {
        const data = doc.data();
        if (data['branchNumber'] && typeof data['branchNumber'] === 'number') {
          maxBranchNumber = Math.max(maxBranchNumber, data['branchNumber']);
        }
      });
      const newBranchNumber = maxBranchNumber + 1;
      // Firestoreに保存
      const formValue = this.companyForm.value;
      await addDoc(collection(db, 'offices'), {
        name: formValue.name,
        address: formValue.addressPrefecture + formValue.addressDetail,
        addressPrefecture: formValue.addressPrefecture,
        addressDetail: formValue.addressDetail,
        code: formValue.code,
        corporationNumber: formValue.corporationNumber,
        ownerName: formValue.ownerName,
        phone: formValue.phone,
        businessType: formValue.businessType,
        establishedDate: formValue.establishedDate ? new Date(formValue.establishedDate) : null,
        employeeCount: Number(formValue.employeeCount),
        applyType: formValue.applyType,
        beforeChange: formValue.beforeChange,
        abolishedDate: formValue.abolishedDate ? new Date(formValue.abolishedDate) : null,
        abolishedReason: formValue.abolishedReason,
        bankName: formValue.bankName,
        bankBranch: formValue.bankBranch,
        bankType: formValue.bankType,
        bankNumber: formValue.bankNumber,
        bankHolder: formValue.bankHolder,
        companyId,
        branchNumber: newBranchNumber,
        createdAt: new Date(),
      });
      this.dialogRef.close(true);
    } catch (e: unknown) {
      this.errorMsg = e instanceof Error ? e.message : '保存に失敗しました';
    } finally {
      this.loading = false;
    }
  }

  onCancel() {
    this.dialogRef.close(false);
  }
}

function isTimestamp(obj: unknown): obj is { toDate: () => Date } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'toDate' in obj &&
    typeof (obj as { toDate: unknown }).toDate === 'function'
  );
}
