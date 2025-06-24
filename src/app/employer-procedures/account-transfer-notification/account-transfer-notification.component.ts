import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { OfficeService } from '../../services/office.service';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { doc, getDoc } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { exportAccountTransferNotificationToCSV } from '../../csv-export/account-transfer-notification-csv-export';

@Component({
  selector: 'app-account-transfer-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './account-transfer-notification.component.html',
  styleUrl: './account-transfer-notification.component.scss',
})
export class AccountTransferNotificationComponent implements OnInit {
  uid = '';
  officeName = '';
  isEditing = false;
  formItems = accountTransferFormItems;
  form: FormGroup;

  constructor(
    private route: ActivatedRoute,
    private officeService: OfficeService,
    private fb: FormBuilder,
    private authService: AuthService
  ) {
    // フォーム初期化
    const controls: Record<string, unknown> = {};
    this.formItems.forEach((item) => (controls[item] = ['']));
    this.form = this.fb.group(controls);
  }

  setFormEnabled(enabled: boolean) {
    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (!control) return;
      if (enabled) {
        control.enable();
      } else {
        control.disable();
      }
    });
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
      const appDocRef = doc(
        db,
        'offices',
        this.uid,
        'applications',
        'account-transfer-notification'
      );
      const appDocSnap = await getDoc(appDocRef);
      if (appDocSnap.exists()) {
        const data = appDocSnap.data();
        if (data && data['formData']) {
          this.form.patchValue(data['formData']);
        }
      }
    }
    this.isEditing = false;
    this.setFormEnabled(false);
  }

  onEdit() {
    this.isEditing = true;
    this.setFormEnabled(true);
  }

  async onSave() {
    // Firestore保存処理
    const userProfile = await this.authService.getCurrentUserProfileWithRole();
    const userId = userProfile?.uid || '';
    if (this.uid && userId) {
      await this.officeService.saveApplicationForOffice(
        this.uid,
        'account-transfer-notification',
        this.form.value,
        userId
      );
    }
    this.isEditing = false;
    this.setFormEnabled(false);
  }

  onCancel() {
    this.isEditing = false;
    this.setFormEnabled(false);
  }

  onExportCSV() {
    const csv = exportAccountTransferNotificationToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const pageTitle = '健康保険・厚生年金保険 保険料口座振替納付（変更）申出書';
    const fileName = `${pageTitle}${this.officeName ? '（' + this.officeName + '）' : ''}.csv`;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}

export const accountTransferFormItems = [
  '提出年月日x年',
  '提出年月日x月',
  '提出年月日x日',
  '事業所整理記号',
  '事業所番号',
  '事業所所在地',
  '事業所名称xカナ',
  '事業所名称x漢字',
  '事業主氏名xカナ',
  '事業主氏名x漢字',
  '電話番号',
  '口座振替申出区分',
  '銀行区分',
  '金融機関名',
  '預金種別',
  '口座番号',
  '金融機関コード',
  '支店コード',
  '加入者名',
  '事業主番号',
  '口座番号xゆうちょ用',
  '契約種別コード',
  'お届け印',
  '対象保険料等',
  '納期の最終日',
];
