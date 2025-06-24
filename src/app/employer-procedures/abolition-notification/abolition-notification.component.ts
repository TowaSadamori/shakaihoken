import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { OfficeService } from '../../services/office.service';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../services/auth.service';
import { doc, getDoc } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { exportAbolitionNotificationToCSV } from '../../csv-export/abolition-notification-csv-export';

export const abolitionNotificationFormItems = [
  '提出年月日x年',
  '提出年月日x月',
  '提出年月日x日',
  '事業所整理記号x都道府県コード',
  '事業所整理記号x郡市区記号',
  '事業所整理記号x事業所記号',
  '事業所番号',
  '事業所所在地x郵便番号x親番号',
  '事業所所在地x郵便番号x子番号',
  '事業所所在地',
  '事業所名称',
  '事業主氏名',
  '電話番号x市外局番',
  '電話番号x局番',
  '電話番号x番号',
  '社会保険労務士記載欄',
  '全喪年月日x年',
  '全喪年月日x月',
  '全喪年月日x日',
  '全喪の事由',
  '全喪の事由xその他',
  '全喪後の連絡先x住所x郵便番号x親番号',
  '全喪後の連絡先x住所x郵便番号x子番号',
  '全喪後の連絡先x住所',
  '全喪後の連絡先x氏名',
  '全喪後の連絡先x電話番号x市外局番',
  '全喪後の連絡先x電話番号x局番',
  '全喪後の連絡先x電話番号x番号',
  '事業再開見込年月日x年',
  '事業再開見込年月日x月',
  '事業再開見込年月日x日',
  '備考',
  '添付書類x資格喪失届',
  '添付書類x適用事業所廃止届事業主控え',
  '添付書類x登記簿謄本',
  '添付書類x適用事業所非該当確認書類',
  '添付書類xその他',
  '添付書類xその他名称',
];

@Component({
  selector: 'app-abolition-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, RouterModule, ReactiveFormsModule, MatInputModule],
  templateUrl: './abolition-notification.component.html',
  styleUrl: './abolition-notification.component.scss',
})
export class AbolitionNotificationComponent implements OnInit {
  uid = '';
  officeName = '';
  isEditing = false;
  form: FormGroup;
  formItems = abolitionNotificationFormItems;

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
      const appDocRef = doc(db, 'offices', this.uid, 'applications', 'abolition-notification');
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
    const userProfile = await this.authService.getCurrentUserProfileWithRole();
    const userId = userProfile?.uid || '';
    if (this.uid && userId) {
      await this.officeService.saveApplicationForOffice(
        this.uid,
        'abolition-notification',
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
    const csv = exportAbolitionNotificationToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const pageTitle = '健康保険・厚生年金保険 適用事業所全喪届';
    const fileName = `${pageTitle}${this.officeName ? '（' + this.officeName + '）' : ''}.csv`;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
