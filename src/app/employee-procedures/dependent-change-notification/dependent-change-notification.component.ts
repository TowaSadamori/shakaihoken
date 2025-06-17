import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormArray } from '@angular/forms';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-dependent-change-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule, ReactiveFormsModule],
  templateUrl: './dependent-change-notification.component.html',
  styleUrl: './dependent-change-notification.component.scss',
})
export class DependentChangeNotificationComponent implements OnInit {
  uid = '';
  userName = '';
  isEditing = false;
  form!: FormGroup;

  // 事業主記入欄
  employerFields = [
    {
      key: 'submissionDateEra',
      label: '提出年月日（元号）',
      type: 'select',
      options: ['令和', '平成'],
    },
    { key: 'submissionDateYear', label: '提出年月日（年）', type: 'text' },
    { key: 'submissionDateMonth', label: '提出年月日（月）', type: 'text' },
    { key: 'submissionDateDay', label: '提出年月日（日）', type: 'text' },
    { key: 'officeSymbolPrefecture', label: '事業所整理記号（都道府県）', type: 'text' },
    { key: 'officeSymbolArea', label: '事業所整理記号（郡市区）', type: 'text' },
    { key: 'officeSymbolOffice', label: '事業所整理記号（事業所）', type: 'text' },
    { key: 'officeLocation', label: '事業所所在地', type: 'text' },
    { key: 'officeName', label: '事業所名称', type: 'text' },
    { key: 'employerName', label: '事業主氏名', type: 'text' },
    { key: 'phoneNumber', label: '電話番号', type: 'text' },
    { key: 'socialInsuranceConsultantName', label: '社会保険労務士氏名等', type: 'text' },
  ];

  // 被保険者欄
  insuredPersonFields = [
    { key: 'insuredPersonNumber', label: '被保険者整理番号', type: 'text' },
    { key: 'insuredPersonNameKana', label: '被保険者氏名（フリガナ）', type: 'text' },
    { key: 'insuredPersonName', label: '被保険者氏名', type: 'text' },
    {
      key: 'insuredPersonBirthDateEra',
      label: '被保険者生年月日（元号）',
      type: 'select',
      options: ['令和', '平成', '昭和'],
    },
    { key: 'insuredPersonBirthDateYear', label: '被保険者生年月日（年）', type: 'text' },
    { key: 'insuredPersonBirthDateMonth', label: '被保険者生年月日（月）', type: 'text' },
    { key: 'insuredPersonBirthDateDay', label: '被保険者生年月日（日）', type: 'text' },
    { key: 'insuredPersonAge', label: '被保険者年齢', type: 'number' },
    { key: 'insuredPersonAddress', label: '被保険者住所', type: 'text' },
    { key: 'insuredPersonMyNumber', label: '被保険者個人番号', type: 'text' },
    { key: 'insuredPersonResidentCode', label: '被保険者住民票コード', type: 'text' },
  ];

  // 被扶養者の基本フィールド（動的に生成される各被扶養者に使用）
  dependentBaseFields = [
    { key: 'nameKana', label: '被扶養者氏名（フリガナ）', type: 'text' },
    { key: 'name', label: '被扶養者氏名', type: 'text' },
    { key: 'relationship', label: '続柄', type: 'text' },
    {
      key: 'birthDateEra',
      label: '被扶養者生年月日（元号）',
      type: 'select',
      options: ['令和', '平成', '昭和'],
    },
    { key: 'birthDateYear', label: '被扶養者生年月日（年）', type: 'text' },
    { key: 'birthDateMonth', label: '被扶養者生年月日（月）', type: 'text' },
    { key: 'birthDateDay', label: '被扶養者生年月日（日）', type: 'text' },
    { key: 'gender', label: '性別', type: 'select', options: ['男', '女'] },
    { key: 'address', label: '被扶養者住所', type: 'text' },
    { key: 'myNumber', label: '被扶養者個人番号', type: 'text' },
    { key: 'residentCode', label: '被扶養者住民票コード', type: 'text' },
    { key: 'annualIncome', label: '年収（見込み含む）', type: 'number' },
    { key: 'becameDependentDate', label: '被扶養者になった日', type: 'text' },
    { key: 'notDependentDate', label: '被扶養者でなくなった日', type: 'text' },
    { key: 'hasSpouse', label: '配偶者の有無', type: 'select', options: ['有', '無'] },
    {
      key: 'livingTogether',
      label: '同居・別居',
      type: 'select',
      options: ['同居', '別居'],
    },
    { key: 'occupation', label: '職業', type: 'text' },
    { key: 'other', label: 'その他', type: 'text' },
  ];

  get dependentsArray(): FormArray {
    return this.form.get('dependents') as FormArray;
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

    // 事業主記入欄
    this.employerFields.forEach((field) => {
      formConfig[field.key] = [''];
    });

    // 被保険者欄
    this.insuredPersonFields.forEach((field) => {
      formConfig[field.key] = field.type === 'number' ? [0] : [''];
    });

    // 被扶養者配列（初期は1人）
    formConfig['dependents'] = this.fb.array([this.createDependentGroup()]);

    this.form = this.fb.group(formConfig);
  }

  createDependentGroup(): FormGroup {
    const dependentConfig: Record<string, unknown[]> = {};
    this.dependentBaseFields.forEach((field) => {
      if (field.type === 'number') {
        dependentConfig[field.key] = [0];
      } else {
        dependentConfig[field.key] = [''];
      }
    });
    return this.fb.group(dependentConfig);
  }

  addDependent() {
    this.dependentsArray.push(this.createDependentGroup());
  }

  removeDependent(index: number) {
    if (this.dependentsArray.length > 1) {
      this.dependentsArray.removeAt(index);
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
          'dependent-change-notification'
        );
        if (existingData) {
          // 被扶養者データがある場合、配列を再構築
          if (
            existingData.formData &&
            existingData.formData['dependents'] &&
            Array.isArray(existingData.formData['dependents']) &&
            existingData.formData['dependents'].length > 0
          ) {
            // 既存の配列をクリア
            while (this.dependentsArray.length > 0) {
              this.dependentsArray.removeAt(0);
            }
            // 既存データ分の FormGroup を追加
            existingData.formData['dependents'].forEach(() => {
              this.dependentsArray.push(this.createDependentGroup());
            });
          }
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
          'dependent-change-notification',
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
    const pageTitle = '健康保険被扶養者（異動）届（国民年金第３号被保険者関係届）';
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

    // 事業主記入欄
    this.employerFields.forEach((field) => {
      const value = this.form.get(field.key)?.value || '';
      csvRows.push(`"事業主記入欄","${field.label}","${String(value).replace(/"/g, '""')}"`);
    });

    // 被保険者欄
    this.insuredPersonFields.forEach((field) => {
      const value = this.form.get(field.key)?.value || '';
      csvRows.push(`"被保険者欄","${field.label}","${String(value).replace(/"/g, '""')}"`);
    });

    // 被扶養者欄
    const dependents = this.form.get('dependents')?.value || [];
    dependents.forEach((dependent: Record<string, unknown>, index: number) => {
      this.dependentBaseFields.forEach((field) => {
        const value = dependent[field.key] || '';
        csvRows.push(
          `"被扶養者${index + 1}","${field.label}","${String(value).replace(/"/g, '""')}"`
        );
      });
    });

    return csvRows.join('\n');
  }
}
