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
import { exportNewApplicationNotificationToCSV } from '../../csv-export/new-application-notification-csv-export';

@Component({
  selector: 'app-new-application-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, RouterModule, ReactiveFormsModule, MatInputModule],
  templateUrl: './new-application-notification.component.html',
  styleUrl: './new-application-notification.component.scss',
})
export class NewApplicationNotificationComponent implements OnInit {
  uid = '';
  officeName = '';
  isEditing = false;
  form: FormGroup;

  // Excel表の項目名リスト
  formItems = [
    '提出年月日（年）',
    '提出年月日（月）',
    '提出年月日（日）',
    '事業所所在地 郵便番号 親番号',
    '事業所所在地 郵便番号 子番号',
    '事業所所在地 カナ住所',
    '事業所所在地 漢字住所',
    '事業所名称 カナ名称',
    '事業所名称 漢字名称',
    '電話番号 市外局番',
    '電話番号 局番',
    '電話番号 番号',
    '社会保険労務士記載欄',
    '事業主・代表者 カナ氏名',
    '事業主・代表者 漢字氏名',
    '問い合わせ先 担当者名',
    '問い合わせ先 内線番号',
    '事業主・代表者 住所 郵便番号 親番号',
    '事業主・代表者 住所 郵便番号 子番号',
    '事業主・代表者 住所',
    '事業主代理人氏名 カナ氏名',
    '事業主代理人氏名 漢字氏名',
    '事業主代理人住所 郵便番号 親番号',
    '事業主代理人住所 郵便番号 子番号',
    '事業主代理人住所',
    '業態区分',
    '事業の種類',
    '適用年月日（年）',
    '適用年月日（月）',
    '適用年月日（日）',
    '個人法人等区分',
    '法人番号等 番号種別',
    '法人番号等 番号',
    '本店支店区分',
    '内外国区分',
    '社会保険労務士名',
    '社会保険労務士コード',
    '健康保険組合名称 カナ名称',
    '健康保険組合名称 漢字名称',
    '厚生年金基金番号',
    '厚生年金基金名称',
    '給与計算の締切日',
    '昇給月 1回目',
    '昇給月 2回目',
    '昇給月 3回目',
    '昇給月 4回目',
    '算定基礎届媒体作成',
    '給与支払日 区分',
    '給与支払日',
    '賞与支払予定月 1回目',
    '賞与支払予定月 2回目',
    '賞与支払予定月 3回目',
    '賞与支払予定月 4回目',
    '賞与支払届媒体作成',
    '給与形態 月給',
    '給与形態 日給',
    '給与形態 日給月給',
    '給与形態 歩合給',
    '給与形態 時間給',
    '給与形態 年俸制',
    '給与形態 その他',
    '給与形態 その他 内容',
    '諸手当の種類 家族手当',
    '諸手当の種類 住宅手当',
    '諸手当の種類 役付手当',
    '諸手当の種類 通勤手当',
    '諸手当の種類 精勤手当',
    '諸手当の種類 残業手当',
    '諸手当の種類 その他',
    '諸手当の種類 その他 内容',
    '現物給与の種類 食事',
    '現物給与の種類 住宅',
    '現物給与の種類 被服',
    '現物給与の種類 定期券',
    '現物給与の種類 その他',
    '現物給与の種類 その他 内容',
    '従業員数',
    '社会保険加入 従業員数',
    '社会保険非加入 役員 人数',
    '社会保険非加入 役員 報酬有無',
    '社会保険非加入 役員 常勤 人数',
    '社会保険非加入 役員 非常勤 人数',
    '社会保険非加入 嘱託職員等 人数',
    '社会保険非加入 嘱託職員等 勤務日数 1月',
    '社会保険非加入 嘱託職員等 勤務時間 1週',
    '社会保険非加入 パート 人数',
    '社会保険非加入 パート 勤務日数 1月',
    '社会保険非加入 パート 勤務時間 1週',
    '社会保険非加入 アルバイト 人数',
    '社会保険非加入 アルバイト 勤務日数 1月',
    '社会保険非加入 アルバイト 勤務時間 1週',
    '所定労働日数',
    '所定労働時間 週単位 時間',
    '所定労働時間 週単位 分',
    '備考',
    '通知書希望形式',
    '添付書類 法人登記簿謄本',
    '添付書類 所在地を確認できる書類',
    '添付書類 その他',
    '添付書類 その他名称',
  ];

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
        'new-application-notification'
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
    // 保存処理
    const userProfile = await this.authService.getCurrentUserProfileWithRole();
    const userId = userProfile?.uid || '';
    if (this.uid && userId) {
      await this.officeService.saveApplicationForOffice(
        this.uid,
        'new-application-notification',
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
    // TODO: 必要ならフォーム値をリセット
  }

  onExportCSV() {
    const csv = exportNewApplicationNotificationToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const pageTitle = '健康保険・厚生年金保険 新規適用届';
    const fileName = `${pageTitle}${this.officeName ? '（' + this.officeName + '）' : ''}.csv`;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
