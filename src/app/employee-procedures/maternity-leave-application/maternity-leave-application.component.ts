import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-maternity-leave-application',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule, ReactiveFormsModule],
  templateUrl: './maternity-leave-application.component.html',
  styleUrl: './maternity-leave-application.component.scss',
})
export class MaternityLeaveApplicationComponent implements OnInit {
  uid = '';
  userName = '';
  isEditing = false;
  form!: FormGroup;

  // 事業所情報セクション（ピンク色部分相当）
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

  // 被保険者基本情報セクション（番号4-9相当）
  insuredPersonBasicFields = [
    { key: 'insuredPersonNumber', label: '被保険者整理番号', type: 'text' },
    { key: 'insuredPersonName', label: '被保険者の氏名', type: 'text' },
    { key: 'insuredPersonNameKana', label: '被保険者の氏名（フリガナ）', type: 'text' },
    { key: 'insuredPersonBirthYear', label: '被保険者の生年月日（年）', type: 'text' },
    { key: 'insuredPersonBirthMonth', label: '被保険者の生年月日（月）', type: 'text' },
    { key: 'insuredPersonBirthDay', label: '被保険者の生年月日（日）', type: 'text' },
    { key: 'expectedBirthYear', label: '出産予定年月日（年）', type: 'text' },
    { key: 'expectedBirthMonth', label: '出産予定年月日（月）', type: 'text' },
    { key: 'expectedBirthDay', label: '出産予定年月日（日）', type: 'text' },
    { key: 'birthType', label: '当てはまる出産種別', type: 'select', options: ['単胎', '多胎'] },
  ];

  // 産前産後休業予定セクション（A欄相当）
  maternityLeaveScheduleFields = [
    { key: 'maternityLeaveStartYear', label: '産前産後休業開始予定年月日（年）', type: 'text' },
    { key: 'maternityLeaveStartMonth', label: '産前産後休業開始予定年月日（月）', type: 'text' },
    { key: 'maternityLeaveStartDay', label: '産前産後休業開始予定年月日（日）', type: 'text' },
    { key: 'maternityLeaveEndYear', label: '産前産後休業終了予定年月日（年）', type: 'text' },
    { key: 'maternityLeaveEndMonth', label: '産前産後休業終了予定年月日（月）', type: 'text' },
    { key: 'maternityLeaveEndDay', label: '産前産後休業終了予定年月日（日）', type: 'text' },
  ];

  // 産前産後休業終了セクション（B欄相当）
  maternityLeaveEndFields = [
    { key: 'actualBirthYear', label: '出産年月日（年）', type: 'text' },
    { key: 'actualBirthMonth', label: '出産年月日（月）', type: 'text' },
    { key: 'actualBirthDay', label: '出産年月日（日）', type: 'text' },
    { key: 'actualLeaveEndYear', label: '産前産後休業終了年月日（年）', type: 'text' },
    { key: 'actualLeaveEndMonth', label: '産前産後休業終了年月日（月）', type: 'text' },
    { key: 'actualLeaveEndDay', label: '産前産後休業終了年月日（日）', type: 'text' },
  ];

  // その他・備考セクション
  additionalFields = [
    {
      key: 'myNumberCard',
      label: 'マイナンバーカードや基礎年金番号通知書等を確認',
      type: 'checkbox',
    },
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
      ...this.maternityLeaveScheduleFields,
      ...this.maternityLeaveEndFields,
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
      try {
        const user = await this.userService.getUserByUid(this.uid);
        if (user) {
          this.userName = `${user.lastName}${user.firstName}`;
        }
        // 既存データを取得
        const existingData = await this.userService.getUserApplication(
          this.uid,
          'maternity-leave-application'
        );
        if (existingData) {
          this.form.patchValue(existingData.formData || existingData);
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      }
    }
    this.isEditing = false;
    this.setFormEnabled(false);
  }

  onEdit(): void {
    this.isEditing = true;
    this.setFormEnabled(true);
  }

  async onSave(): Promise<void> {
    try {
      if (this.uid) {
        await this.userService.saveUserApplication(
          this.uid,
          'maternity-leave-application',
          this.form.value
        );
      }
      this.isEditing = false;
      this.setFormEnabled(false);
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }

  onCancel(): void {
    this.isEditing = false;
    this.setFormEnabled(false);
  }

  async onExportCSV(): Promise<void> {
    const csvContent = this.generateCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const pageTitle = '産前産後休業取得者申出書';
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
      let csvValue = '';
      if (field.type === 'checkbox') {
        csvValue = value ? 'はい' : 'いいえ';
      } else {
        csvValue = String(value);
      }
      csvRows.push(`"事業所情報セクション","${field.label}","${csvValue.replace(/"/g, '""')}"`);
    });

    // 被保険者基本情報セクション
    this.insuredPersonBasicFields.forEach((field) => {
      const value = this.form.get(field.key)?.value || '';
      csvRows.push(
        `"被保険者基本情報セクション","${field.label}","${String(value).replace(/"/g, '""')}"`
      );
    });

    // 産前産後休業予定セクション
    this.maternityLeaveScheduleFields.forEach((field) => {
      const value = this.form.get(field.key)?.value || '';
      csvRows.push(
        `"産前産後休業予定セクション","${field.label}","${String(value).replace(/"/g, '""')}"`
      );
    });

    // 産前産後休業終了セクション
    this.maternityLeaveEndFields.forEach((field) => {
      const value = this.form.get(field.key)?.value || '';
      csvRows.push(
        `"産前産後休業終了セクション","${field.label}","${String(value).replace(/"/g, '""')}"`
      );
    });

    // その他・備考セクション
    this.additionalFields.forEach((field) => {
      const value = this.form.get(field.key)?.value || '';
      csvRows.push(
        `"その他・備考セクション","${field.label}","${String(value).replace(/"/g, '""')}"`
      );
    });

    return csvRows.join('\n');
  }
}
