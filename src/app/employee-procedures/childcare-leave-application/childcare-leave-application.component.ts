import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-childcare-leave-application',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule, ReactiveFormsModule],
  templateUrl: './childcare-leave-application.component.html',
  styleUrl: './childcare-leave-application.component.scss',
})
export class ChildcareLeaveApplicationComponent implements OnInit {
  uid = '';
  userName = '';
  isEditing = false;
  form!: FormGroup;

  // 事業所情報セクション
  officeInfoFields = [
    { key: 'submissionDateYear', label: '届書提出日（年）', type: 'text' },
    { key: 'submissionDateMonth', label: '届書提出日（月）', type: 'text' },
    { key: 'submissionDateDay', label: '届書提出日（日）', type: 'text' },
    { key: 'officeSymbol', label: '事業所整理記号', type: 'text' },
    { key: 'officeAddress', label: '事業所所在地', type: 'text' },
    { key: 'officeName', label: '事業所名称', type: 'text' },
    { key: 'employerName', label: '事業主氏名', type: 'text' },
    { key: 'phoneNumber', label: '電話番号', type: 'text' },
  ];

  // 被保険者基本情報セクション
  insuredPersonBasicFields = [
    { key: 'insuredPersonNumber', label: '被保険者整理番号', type: 'text' },
    { key: 'insuredPersonName', label: '被保険者氏名', type: 'text' },
    { key: 'insuredPersonNameKana', label: '被保険者氏名（フリガナ）', type: 'text' },
    { key: 'insuredPersonBirthYear', label: '被保険者生年月日（年）', type: 'text' },
    { key: 'insuredPersonBirthMonth', label: '被保険者生年月日（月）', type: 'text' },
    { key: 'insuredPersonBirthDay', label: '被保険者生年月日（日）', type: 'text' },
    { key: 'childBirthYear', label: '育児する子の生年月日（年）', type: 'text' },
    { key: 'childBirthMonth', label: '育児する子の生年月日（月）', type: 'text' },
    { key: 'childBirthDay', label: '育児する子の生年月日（日）', type: 'text' },
    { key: 'childGender', label: '性別', type: 'select', options: ['男', '女'] },
    { key: 'childRelation', label: '続柄', type: 'select', options: ['実子', 'その他'] },
  ];

  // 育児休業取得予定セクション
  childcareLeaveScheduleFields = [
    { key: 'childcareLeaveStartYear', label: '育児休業開始予定年月日（年）', type: 'text' },
    { key: 'childcareLeaveStartMonth', label: '育児休業開始予定年月日（月）', type: 'text' },
    { key: 'childcareLeaveStartDay', label: '育児休業開始予定年月日（日）', type: 'text' },
    { key: 'childcareLeaveEndYear', label: '育児休業終了（予定）年月日（年）', type: 'text' },
    { key: 'childcareLeaveEndMonth', label: '育児休業終了（予定）年月日（月）', type: 'text' },
    { key: 'childcareLeaveEndDay', label: '育児休業終了（予定）年月日（日）', type: 'text' },
  ];

  // 育児休業終了・変更セクション
  childcareLeaveEndFields = [
    { key: 'actualLeaveEndYear', label: '育児休業取得日数（年）', type: 'text' },
    { key: 'actualLeaveEndMonth', label: '育児休業取得日数（月）', type: 'text' },
    { key: 'actualLeaveEndDay', label: '育児休業取得日数（日）', type: 'text' },
    { key: 'changeReason', label: '変更理由', type: 'textarea' },
  ];

  // パパ・ママ育休プラス・その他セクション
  additionalFields = [
    { key: 'papamamaBonus', label: 'パパ・ママ育休プラス該当区分', type: 'checkbox' },
    { key: 'myNumberConfirmed', label: 'マイナンバーを確認', type: 'checkbox' },
    { key: 'remarks', label: '備考', type: 'textarea' },
  ];

  constructor(
    private route: ActivatedRoute,
    private userService: UserService,
    private fb: FormBuilder,
    private authService: AuthService
  ) {
    this.initForm();
  }

  initForm() {
    const formConfig: Record<string, unknown> = {};

    // 全セクションのフィールドを初期化
    const allFields = [
      ...this.officeInfoFields,
      ...this.insuredPersonBasicFields,
      ...this.childcareLeaveScheduleFields,
      ...this.childcareLeaveEndFields,
      ...this.additionalFields,
    ];

    allFields.forEach((field) => {
      if (field.type === 'checkbox') {
        formConfig[field.key] = [false];
      } else {
        formConfig[field.key] = [''];
      }
    });

    this.form = this.fb.group(formConfig);
  }

  async ngOnInit(): Promise<void> {
    this.uid = this.route.snapshot.params['uid'];
    if (this.uid) {
      try {
        const user = await this.userService.getUserByUid(this.uid);
        if (user) {
          this.userName = `${user.lastName}${user.firstName}`;
        }

        // 既存データを取得
        const existingData = await this.userService.getUserApplication(
          this.uid,
          'childcare-leave-application'
        );
        if (existingData) {
          this.form.patchValue(existingData.formData || existingData);
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    }
  }

  onEdit(): void {
    this.isEditing = true;
  }

  async onSave(): Promise<void> {
    try {
      if (this.uid) {
        await this.userService.saveUserApplication(
          this.uid,
          'childcare-leave-application',
          this.form.value
        );
      }
      this.isEditing = false;
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }

  onCancel(): void {
    this.isEditing = false;
  }

  async onExportCSV(): Promise<void> {
    const csvContent = this.generateCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const pageTitle = '育児休業等取得者申出書';
    const fileName = `${pageTitle}（${this.userName}）.csv`;

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

  private generateCSV(): string {
    const csvRows: string[] = [];
    csvRows.push('セクション,項目,値');

    // 事業所情報セクション
    this.officeInfoFields.forEach((field) => {
      const value = this.form.get(field.key)?.value || '';
      csvRows.push(`"事業所情報","${field.label}","${String(value).replace(/"/g, '""')}"`);
    });

    // 被保険者基本情報セクション
    this.insuredPersonBasicFields.forEach((field) => {
      const value = this.form.get(field.key)?.value || '';
      csvRows.push(`"被保険者基本情報","${field.label}","${String(value).replace(/"/g, '""')}"`);
    });

    // 育児休業取得予定セクション
    this.childcareLeaveScheduleFields.forEach((field) => {
      const value = this.form.get(field.key)?.value || '';
      csvRows.push(`"育児休業取得予定","${field.label}","${String(value).replace(/"/g, '""')}"`);
    });

    // 育児休業終了・変更セクション
    this.childcareLeaveEndFields.forEach((field) => {
      const value = this.form.get(field.key)?.value || '';
      csvRows.push(`"育児休業終了・変更","${field.label}","${String(value).replace(/"/g, '""')}"`);
    });

    // その他セクション
    this.additionalFields.forEach((field) => {
      const value = this.form.get(field.key)?.value || '';
      let csvValue = '';
      if (field.type === 'checkbox') {
        csvValue = value ? 'はい' : 'いいえ';
      } else {
        csvValue = String(value);
      }
      csvRows.push(`"その他・備考","${field.label}","${csvValue.replace(/"/g, '""')}"`);
    });

    return csvRows.join('\n');
  }
}
