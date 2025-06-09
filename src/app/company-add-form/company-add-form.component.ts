import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { getAuth } from 'firebase/auth';
import { getFirestore, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { MatDialogRef } from '@angular/material/dialog';

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
    private dialogRef: MatDialogRef<CompanyAddFormComponent>
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
  }

  async onSubmit() {
    if (this.companyForm.invalid) return;
    this.loading = true;
    this.errorMsg = '';
    try {
      const auth = getAuth();
      const db = getFirestore();
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
