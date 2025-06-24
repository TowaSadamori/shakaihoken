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
import { exportVoluntaryApplicationNotificationToCSV } from '../../csv-export/voluntary-application-notification-csv-export';

export const voluntaryApplicationFormItems = [
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
  '事業の種類',
  '被保険者数',
  '健康保険組合x所在地x郵便番号x親番号',
  '健康保険組合x所在地x郵便番号x子番号',
  '健康保険組合x所在地',
  '健康保険組合x名称',
  '健康保険組合x解散するかしないかの別',
  '任意適用取消後連絡先x住所x郵便番号x親番号',
  '任意適用取消後連絡先x住所x郵便番号x子番号',
  '任意適用取消後連絡先x住所',
  '任意適用取消後連絡先x氏名',
  '任意適用取消後連絡先x電話番号x市外局番',
  '任意適用取消後連絡先x電話番号x局番',
  '任意適用取消後連絡先x電話番号x番号',
  '備考',
  '通知書希望形式',
  '添付書類x同意書',
  '添付書類xその他',
  '添付書類xその他名称',
];

@Component({
  selector: 'app-voluntary-application-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, RouterModule, ReactiveFormsModule, MatInputModule],
  templateUrl: './voluntary-application-notification.component.html',
  styleUrl: './voluntary-application-notification.component.scss',
})
export class VoluntaryApplicationNotificationComponent implements OnInit {
  uid = '';
  officeName = '';
  isEditing = false;
  formItems = voluntaryApplicationFormItems;
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
        'voluntary-application-notification'
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
    const userProfile = await this.authService.getCurrentUserProfileWithRole();
    const userId = userProfile?.uid || '';
    if (this.uid && userId) {
      await this.officeService.saveApplicationForOffice(
        this.uid,
        'voluntary-application-notification',
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
    const csv = exportVoluntaryApplicationNotificationToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const pageTitle = '健康保険・厚生年金保険 任意適用申請書／任意適用取消申請書';
    const fileName = `${pageTitle}${this.officeName ? '（' + this.officeName + '）' : ''}.csv`;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
