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
import { exportMonthlyChangeNotificationToCSV } from '../../csv-export/monthly-change-notification-csv-export';

@Component({
  selector: 'app-monthly-change-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule, ReactiveFormsModule],
  templateUrl: './monthly-change-notification.component.html',
  styleUrl: './monthly-change-notification.component.scss',
})
export class MonthlyChangeNotificationComponent implements OnInit {
  uid = '';
  officeName = '';
  isEditing = false;
  form: FormGroup;

  // 提出者記入欄（事業所情報）
  formItems = [
    '提出年月日和暦',
    '提出年月日年',
    '提出年月日月',
    '提出年月日日',
    '事業所整理記号都道府県コード',
    '事業所整理記号郡市区符号',
    '事業所整理記号事業所記号',
    '事業所所在地',
    '事業所名称',
    '事業主氏名',
    '電話番号',
    '社会保険労務士氏名',
  ];

  // 被保険者欄（1人ごと）
  personItems = [
    '被保険者整理番号',
    '被保険者氏名',
    '生年月日',
    '改定年月',
    '従前の標準報酬月額',
    '従前改定月',
    '昇降給',
    '遡及支払額',
    '支給月1',
    '支給月2',
    '支給月3',
    '給与計算の基礎日数1',
    '給与計算の基礎日数2',
    '給与計算の基礎日数3',
    '通貨によるものの額1',
    '通貨によるものの額2',
    '通貨によるものの額3',
    '現物によるものの額1',
    '現物によるものの額2',
    '現物によるものの額3',
    '合計1',
    '合計2',
    '合計3',
    '総計',
    '平均額',
    '修正平均額',
    '個人番号',
    '備考',
    '該当理由チェック1',
    '該当理由チェック2',
    '該当理由チェック3',
    '該当理由チェック4',
    '該当理由チェック5',
    '該当理由チェック6',
  ];

  get insuredArray(): FormArray {
    return this.form.get('insuredList') as FormArray;
  }

  constructor(
    private route: ActivatedRoute,
    private officeService: OfficeService,
    private fb: FormBuilder,
    private authService: AuthService
  ) {
    // FormGroup直下に全ての事業所情報＋insuredList
    const formConfig: Record<string, string[] | FormArray> = {};
    this.formItems.forEach((item) => {
      formConfig[item] = [''];
    });
    formConfig['insuredList'] = this.fb.array([this.createInsuredGroup()]);

    this.form = this.fb.group(formConfig);
  }

  createInsuredGroup(): FormGroup {
    const groupConfig: Record<string, string[]> = {};
    this.personItems.forEach((item) => {
      groupConfig[item] = [''];
    });
    return this.fb.group(groupConfig);
  }

  addInsured() {
    this.insuredArray.push(this.createInsuredGroup());
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
      const appDocRef = doc(db, 'offices', this.uid, 'applications', 'monthly-change-notification');
      const appDocSnap = await getDoc(appDocRef);
      if (appDocSnap.exists()) {
        const data = appDocSnap.data();
        if (data && data['formData']) {
          // insuredListの件数分FormArrayを初期化
          let insuredList = data['formData']['insuredList'] || [];
          // undefined/nullを空文字に変換
          insuredList = insuredList.map((person: Record<string, unknown>) => {
            if (!person || typeof person !== 'object') return {};
            return Object.fromEntries(
              Object.entries(person).map(([k, v]) => [k, v == null ? '' : v])
            );
          });
          const insuredArray = this.form.get('insuredList') as FormArray;
          while (insuredArray.length > 0) {
            insuredArray.removeAt(0);
          }
          insuredList.forEach(() => insuredArray.push(this.createInsuredGroup()));
          // patchValueはFormArray再生成後に実行
          this.form.patchValue({ ...data['formData'], insuredList });
        }
      }
    }
  }

  onEdit() {
    this.isEditing = true;
  }

  async onSave() {
    const userProfile = await this.authService.getCurrentUserProfileWithRole();
    const userId = userProfile?.uid || '';
    if (this.uid && userId) {
      await this.officeService.saveApplicationForOffice(
        this.uid,
        'monthly-change-notification',
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
    console.log('form.value:', this.form.value);
    console.log('insuredList:', JSON.stringify(this.form.value.insuredList, null, 2));
    if (this.form.value.insuredList && this.form.value.insuredList.length > 0) {
      Object.keys(this.form.value.insuredList[0]).forEach((key) => {
        console.log('insuredList[0] key:', key, 'value:', this.form.value.insuredList[0][key]);
      });
    }
    const csv = exportMonthlyChangeNotificationToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv' });
    const pageTitle = '月額変更届（随時改定）';
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
