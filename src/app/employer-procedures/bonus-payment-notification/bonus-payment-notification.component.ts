import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { OfficeService } from '../../services/office.service';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormArray } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { doc, getDoc } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { exportBonusPaymentNotificationToCSV } from '../../csv-export/bonus-payment-notification-csv-export';

@Component({
  selector: 'app-bonus-payment-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule, ReactiveFormsModule],
  templateUrl: './bonus-payment-notification.component.html',
  styleUrl: './bonus-payment-notification.component.scss',
})
export class BonusPaymentNotificationComponent implements OnInit {
  uid = '';
  officeName = '';
  isEditing = false;
  formItems = [
    '提出年月日x年',
    '提出年月日x月',
    '提出年月日x日',
    '事業所整理記号',
    '事業所番号',
    '事業所所在地',
    '事業所名称',
    '事業主氏名',
    '電話番号',
    '社会保険労務士氏名',
    // 1～10行目まで繰り返し
    ...Array.from({ length: 10 }, (_, i) => [
      `被保険者整理番号${i + 1}`,
      `被保険者氏名${i + 1}`,
      `生年月日${i + 1}`,
      `賞与支払年月日${i + 1}`,
      `賞与支払額${i + 1}`,
      `賞与額（千円未満切捨て）${i + 1}`,
      `個人番号（基礎年金番号）${i + 1}`,
      `備考${i + 1}`,
    ]).flat(),
  ];
  form: FormGroup;
  get insuredArray(): FormArray {
    return this.form.get('insuredList') as FormArray;
  }

  constructor(
    private route: ActivatedRoute,
    private officeService: OfficeService,
    private fb: FormBuilder,
    private authService: AuthService
  ) {
    // フォーム初期化
    this.form = this.fb.group({
      提出年月日x年: [''],
      提出年月日x月: [''],
      提出年月日x日: [''],
      事業所整理記号: [''],
      事業所番号: [''],
      事業所所在地: [''],
      事業所名称: [''],
      事業主氏名: [''],
      電話番号: [''],
      社会保険労務士氏名: [''],
      insuredList: this.fb.array([this.createInsuredGroup()]),
    });
  }

  createInsuredGroup(): FormGroup {
    return this.fb.group({
      被保険者整理番号: [''],
      被保険者氏名: [''],
      生年月日: [''],
      賞与支払年月日: [''],
      賞与支払額: [''],
      賞与額千円未満切捨て: [''],
      個人番号基礎年金番号: [''],
      備考: [''],
    });
  }

  addInsured() {
    if (this.insuredArray.length < 10) {
      this.insuredArray.push(this.createInsuredGroup());
    }
  }

  removeInsured(index: number) {
    if (this.insuredArray.length > 1) {
      this.insuredArray.removeAt(index);
    }
  }

  async ngOnInit(): Promise<void> {
    this.uid = this.route.snapshot.params['uid'];
    if (this.uid) {
      const office = await this.officeService.getOfficeById(this.uid);
      this.officeName =
        (office && ((office['officeName'] as string) || (office['name'] as string) || office.id)) ||
        '';
      // 既存データ取得
      const db = getFirestore();
      const appDocRef = doc(db, 'offices', this.uid, 'applications', 'bonus-payment-notification');
      const appDocSnap = await getDoc(appDocRef);
      if (appDocSnap.exists()) {
        const data = appDocSnap.data();
        if (data && data['formData']) {
          // insuredListの件数分FormArrayを初期化
          const insuredList = data['formData']['insuredList'] || [];
          const insuredArray = this.form.get('insuredList') as FormArray;
          while (insuredArray.length > 0) {
            insuredArray.removeAt(0);
          }
          insuredList.forEach(() => insuredArray.push(this.createInsuredGroup()));
          this.form.patchValue({ ...data['formData'], insuredList });
        }
      }
    }
  }

  onEdit() {
    this.isEditing = true;
  }

  async onSave() {
    // Firestore保存処理
    const userProfile = await this.authService.getCurrentUserProfileWithRole();
    const userId = userProfile?.uid || '';
    if (this.uid && userId) {
      await this.officeService.saveApplicationForOffice(
        this.uid,
        'bonus-payment-notification',
        this.form.value,
        userId
      );
    }
    this.isEditing = false;
  }

  onCancel() {
    this.isEditing = false;
  }

  async onExportCSV() {
    const csv = exportBonusPaymentNotificationToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv' });
    const pageTitle = '賞与支払届';
    const fileName = `${pageTitle}${this.officeName ? '（' + this.officeName + '）' : ''}.csv`;
    const navigatorWithSave: Navigator & {
      msSaveOrOpenBlob?: (blob: Blob, fileName: string) => void;
    } = window.navigator as Navigator & {
      msSaveOrOpenBlob?: (blob: Blob, fileName: string) => void;
    };
    if (navigatorWithSave.msSaveOrOpenBlob) {
      navigatorWithSave.msSaveOrOpenBlob(blob, fileName);
    } else {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      window.URL.revokeObjectURL(url);
    }
  }
}
