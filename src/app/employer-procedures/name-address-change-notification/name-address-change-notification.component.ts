import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { OfficeService } from '../../services/office.service';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { exportNameAddressChangeNotificationToCSV } from '../../csv-export/name-address-change-notification-csv-export';
import { AuthService } from '../../services/auth.service';
import { doc, getDoc } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';

export const nameAddressChangeFormItems = [
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
  '変更区分',
  '変更前x事業所名称',
  '変更前x事業所所在地x郵便番号x親番号',
  '変更前x事業所所在地x郵便番号x子番号',
  '変更前x事業所所在地x漢字住所',
  '変更年月日x年',
  '変更年月日x月',
  '変更年月日x日',
  '変更後x事業所名称xカナ名称',
  '変更後x事業所名称x漢字名称',
  '変更後x事業所所在地x郵便番号x親番号',
  '変更後x事業所所在地x郵便番号x子番号',
  '変更後x事業所所在地xカナ住所',
  '変更後x事業所所在地x漢字住所',
  '変更後x事業所x電話番号x市外局番',
  '変更後x事業所x電話番号x局番',
  '変更後x事業所x電話番号x番号',
  '口座振替の継続',
  '振替口座の変更',
  '通知書希望形式',
  '添付書類x法人登記簿謄本のコピー',
  '添付書類x名称が確認できる書類',
  '添付書類x事業主の住民票の写しのコピー',
  '添付書類xその他',
  '添付書類xその他名称',
];

@Component({
  selector: 'app-name-address-change-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './name-address-change-notification.component.html',
  styleUrl: './name-address-change-notification.component.scss',
})
export class NameAddressChangeNotificationComponent implements OnInit {
  uid = '';
  officeName = '';
  isEditing = false;
  formItems = nameAddressChangeFormItems;
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
        'name-address-change-notification'
      );
      const appDocSnap = await getDoc(appDocRef);
      if (appDocSnap.exists()) {
        const data = appDocSnap.data();
        if (data && data['formData']) {
          this.form.patchValue(data['formData']);
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
        'name-address-change-notification',
        this.form.value,
        userId
      );
    }
    this.isEditing = false;
  }

  onCancel() {
    this.isEditing = false;
  }

  onExportCSV() {
    const csv = exportNameAddressChangeNotificationToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const pageTitle = '健康保険・厚生年金保険 適用事業所 名称／所在地変更（訂正）届';
    const fileName = `${pageTitle}${this.officeName ? '（' + this.officeName + '）' : ''}.csv`;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
