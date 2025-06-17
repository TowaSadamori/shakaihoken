import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormArray } from '@angular/forms';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-childcare-leave-end-salary-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule, ReactiveFormsModule],
  templateUrl: './childcare-leave-end-salary-notification.component.html',
  styleUrl: './childcare-leave-end-salary-notification.component.scss',
})
export class ChildcareLeaveEndSalaryNotificationComponent implements OnInit {
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

  // 申出者情報セクション
  applicantInfoFields = [
    { key: 'applicantName', label: '申出者氏名', type: 'text' },
    { key: 'applicantAddress', label: '申出者住所', type: 'text' },
    { key: 'applicantPhone', label: '申出者電話番号', type: 'text' },
  ];

  // 被保険者基本情報セクション
  insuredPersonBasicFields = [
    { key: 'insuredPersonNumber', label: '被保険者整理番号', type: 'text' },
    { key: 'insuredPersonName', label: '被保険者氏名', type: 'text' },
    { key: 'insuredPersonNameKana', label: '被保険者氏名（フリガナ）', type: 'text' },
    { key: 'insuredPersonBirthYear', label: '被保険者生年月日（年）', type: 'text' },
    { key: 'insuredPersonBirthMonth', label: '被保険者生年月日（月）', type: 'text' },
    { key: 'insuredPersonBirthDay', label: '被保険者生年月日（日）', type: 'text' },
    { key: 'childBirthYear', label: '子の生年月日（年）', type: 'text' },
    { key: 'childBirthMonth', label: '子の生年月日（月）', type: 'text' },
    { key: 'childBirthDay', label: '子の生年月日（日）', type: 'text' },
    { key: 'childGender', label: '性別', type: 'select', options: ['男', '女'] },
  ];

  // 育児休業終了情報セクション
  childcareLeaveEndFields = [
    { key: 'childcareLeaveEndYear', label: '育児休業終了年月日（年）', type: 'text' },
    { key: 'childcareLeaveEndMonth', label: '育児休業終了年月日（月）', type: 'text' },
    { key: 'childcareLeaveEndDay', label: '育児休業終了年月日（日）', type: 'text' },
    { key: 'workReturnYear', label: '職場復帰年月日（年）', type: 'text' },
    { key: 'workReturnMonth', label: '職場復帰年月日（月）', type: 'text' },
    { key: 'workReturnDay', label: '職場復帰年月日（日）', type: 'text' },
  ];

  // 3か月間の報酬月額情報（FormArrayで管理）
  salaryMonthFields = [
    { key: 'month', label: '月', type: 'text' },
    { key: 'workingDays', label: '就労日数', type: 'number' },
    { key: 'totalAmount', label: '支払基礎日数', type: 'number' },
    { key: 'salary', label: '報酬月額', type: 'number' },
  ];

  // その他セクション
  additionalFields = [
    { key: 'averageSalary', label: '平均報酬月額', type: 'number' },
    { key: 'standardSalary', label: '標準報酬月額', type: 'number' },
    { key: 'changeReason', label: '変更理由', type: 'textarea' },
    { key: 'remarks', label: '備考', type: 'textarea' },
  ];

  get salaryMonthsArray(): FormArray {
    return this.form.get('salaryMonths') as FormArray;
  }

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

    // 基本フィールドを初期化
    const basicFields = [
      ...this.officeInfoFields,
      ...this.applicantInfoFields,
      ...this.insuredPersonBasicFields,
      ...this.childcareLeaveEndFields,
      ...this.additionalFields,
    ];

    basicFields.forEach((field) => {
      if (field.type === 'checkbox') {
        formConfig[field.key] = [false];
      } else {
        formConfig[field.key] = [''];
      }
    });

    // 3か月間の報酬情報FormArrayを初期化
    formConfig['salaryMonths'] = this.fb.array([
      this.createSalaryMonthGroup(),
      this.createSalaryMonthGroup(),
      this.createSalaryMonthGroup(),
    ]);

    this.form = this.fb.group(formConfig);
  }

  createSalaryMonthGroup(): FormGroup {
    const groupConfig: Record<string, unknown> = {};
    this.salaryMonthFields.forEach((field) => {
      groupConfig[field.key] = [''];
    });
    return this.fb.group(groupConfig);
  }

  addSalaryMonth() {
    this.salaryMonthsArray.push(this.createSalaryMonthGroup());
  }

  removeSalaryMonth(index: number) {
    if (this.salaryMonthsArray.length > 1) {
      this.salaryMonthsArray.removeAt(index);
    }
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
          'childcare-leave-end-salary-notification'
        );
        if (existingData && existingData.formData) {
          // FormArrayの長さを調整
          const data = existingData.formData as Record<string, unknown>;
          const salaryMonths = (data['salaryMonths'] as unknown[]) || [];
          while (this.salaryMonthsArray.length > 0) {
            this.salaryMonthsArray.removeAt(0);
          }
          salaryMonths.forEach(() => this.salaryMonthsArray.push(this.createSalaryMonthGroup()));

          this.form.patchValue(data);
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
          'childcare-leave-end-salary-notification',
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
    const pageTitle = '育児休業等終了時報酬月額変更届';
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

    // 事業所情報
    this.officeInfoFields.forEach((field) => {
      const value = this.form.get(field.key)?.value || '';
      csvRows.push(`"事業所情報","${field.label}","${String(value).replace(/"/g, '""')}"`);
    });

    // 申出者情報
    this.applicantInfoFields.forEach((field) => {
      const value = this.form.get(field.key)?.value || '';
      csvRows.push(`"申出者情報","${field.label}","${String(value).replace(/"/g, '""')}"`);
    });

    // 被保険者基本情報
    this.insuredPersonBasicFields.forEach((field) => {
      const value = this.form.get(field.key)?.value || '';
      csvRows.push(`"被保険者基本情報","${field.label}","${String(value).replace(/"/g, '""')}"`);
    });

    // 育児休業終了情報
    this.childcareLeaveEndFields.forEach((field) => {
      const value = this.form.get(field.key)?.value || '';
      csvRows.push(`"育児休業終了情報","${field.label}","${String(value).replace(/"/g, '""')}"`);
    });

    // 3か月間の報酬情報
    this.salaryMonthsArray.controls.forEach((control, index) => {
      this.salaryMonthFields.forEach((field) => {
        const value = control.get(field.key)?.value || '';
        csvRows.push(
          `"報酬情報${index + 1}か月目","${field.label}","${String(value).replace(/"/g, '""')}"`
        );
      });
    });

    // その他情報
    this.additionalFields.forEach((field) => {
      const value = this.form.get(field.key)?.value || '';
      csvRows.push(`"その他情報","${field.label}","${String(value).replace(/"/g, '""')}"`);
    });

    return csvRows.join('\n');
  }
}
