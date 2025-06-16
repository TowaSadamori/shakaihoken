import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { OfficeService } from '../../services/office.service';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { doc, getDoc } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { exportRepresentativeChangeNotificationToCSV } from '../../csv-export/representative-change-notification-csv-export';

@Component({
  selector: 'app-representative-change-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './representative-change-notification.component.html',
  styleUrl: './representative-change-notification.component.scss',
})
export class RepresentativeChangeNotificationComponent implements OnInit {
  uid = '';
  officeName = '';
  isEditing = false;
  formItems = representativeChangeFormItems;
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
        'representative-change-notification'
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
        'representative-change-notification',
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
    const csv = exportRepresentativeChangeNotificationToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const pageTitle = '健康保険・厚生年金保険事業所関係変更（訂正）届';
    const fileName = `${pageTitle}${this.officeName ? '（' + this.officeName + '）' : ''}.csv`;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}

export const representativeChangeFormItems = [
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
  '変更前x事業主氏名xカナ氏名',
  '変更前x事業主氏名x漢字氏名',
  '変更前x事業主郵便番号x親番号',
  '変更前x事業主郵便番号x子番号',
  '変更前x事業主住所',
  '変更後x事業主氏名xカナ氏名',
  '変更後x事業主氏名x漢字氏名',
  '変更後x事業主郵便番号x親番号',
  '変更後x事業主郵便番号x子番号',
  '変更後x事業主住所',
  '変更年月日x元号',
  '変更年月日x年',
  '変更年月日x月',
  '変更年月日x日',
  '事業所電話番号x市外局番',
  '事業所電話番号x局番',
  '事業所電話番号x番号',
  '健康保険組合名称xカナ名称',
  '健康保険組合名称x漢字名称',
  '選任事業主代理人氏名xカナ氏名',
  '選任事業主代理人氏名x漢字氏名',
  '選任事業主代理人住所x郵便番号x親番号',
  '選任事業主代理人住所x郵便番号x子番号',
  '選任事業主代理人住所x漢字名称',
  '選任年月日x元号',
  '選任年月日x年',
  '選任年月日x月',
  '選任年月日x日',
  '解任事業主代理人氏名xカナ氏名',
  '解任事業主代理人氏名x漢字氏名',
  '解任事業主代理人住所x郵便番号x親番号',
  '解任事業主代理人住所x郵便番号x子番号',
  '解任事業主代理人住所x漢字名称',
  '解任年月日x元号',
  '解任年月日x年',
  '解任年月日x月',
  '解任年月日x日',
  '社会保険労務士',
  '社会保険労務士コード',
  '社会保険労務士名',
  '年金委員名1x区分',
  '年金委員名1xカナ氏名',
  '年金委員名1x漢字氏名',
  '年金委員名2x区分',
  '年金委員名2xカナ氏名',
  '年金委員名2x漢字氏名',
  '現物給与の種類x区分',
  '現物給与の種類x食事',
  '現物給与の種類x住宅',
  '現物給与の種類x被服',
  '現物給与の種類x定期券',
  '現物給与の種類xその他',
  '現物給与の種類xその他x内容',
  '業態区分',
  '昇給月x区分',
  '昇給月x1回目',
  '昇給月x2回目',
  '昇給月x3回目',
  '昇給月x4回目',
  '算定基礎届媒体作成',
  '賞与支払予定月x区分',
  '賞与支払予定月x1回目',
  '賞与支払予定月x2回目',
  '賞与支払予定月x3回目',
  '賞与支払予定月x4回目',
  '賞与支払届媒体作成',
  '変更前x会社法人等番号',
  '変更後x会社法人等番号',
  '会社法人等番号変更年月日x元号',
  '会社法人等番号変更年月日x年',
  '会社法人等番号変更年月日x月',
  '会社法人等番号変更年月日x日',
  '変更前x法人番号',
  '変更後x法人番号',
  '法人番号変更年月日x元号',
  '法人番号変更年月日x年',
  '法人番号変更年月日x月',
  '法人番号変更年月日x日',
  '変更前x個人法人等区分',
  '変更後x個人法人等区分',
  '変更前x本支店区分',
  '変更後x本支店区分',
  '変更前x内外国区分',
  '変更後x内外国区分',
  '備考',
  '添付書類x法人番号指定通知書のコピー',
  '添付書類x法人登記簿謄本のコピー',
  '添付書類xその他',
  '添付書類xその他名称',
];
