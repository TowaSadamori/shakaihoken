import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-uncollectable-insurance-card-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule, ReactiveFormsModule],
  templateUrl: './uncollectable-insurance-card-notification.component.html',
  styleUrls: ['./uncollectable-insurance-card-notification.component.scss'],
})
export class UncollectableInsuranceCardNotificationComponent implements OnInit {
  isEditing = false;
  form!: FormGroup;
  userName = '';
  uid = '';

  // フォームフィールド定義（実際のフォーム画像に基づく）
  formFields = [
    // 被保険者等の記号・番号・生年月日
    { key: '被保険者証記号', label: '被保険者証記号', type: 'text' },
    { key: '被保険者証番号', label: '被保険者証番号', type: 'text' },
    {
      key: '生年月日和暦',
      label: '生年月日（和暦）',
      type: 'select',
      options: ['昭和', '平成', '令和'],
    },
    { key: '生年月日年', label: '生年月日（年）', type: 'number' },
    { key: '生年月日月', label: '生年月日（月）', type: 'number' },
    { key: '生年月日日', label: '生年月日（日）', type: 'number' },

    // 被保険者等氏名・住所・電話
    { key: '被保険者等氏名フリガナ', label: '被保険者等氏名（フリガナ）', type: 'text' },
    { key: '被保険者等氏名', label: '被保険者等氏名', type: 'text' },
    { key: '住所', label: '住所', type: 'text' },
    { key: '電話番号自宅', label: '電話番号（自宅）', type: 'text' },
    { key: '携帯電話', label: '携帯電話', type: 'text' },

    // 回収できない被保険者証等（複数対応のため代表例として1人分）
    { key: '回収不能者氏名1', label: '回収不能者氏名1', type: 'text' },
    {
      key: '回収不能者生年月日和暦1',
      label: '回収不能者生年月日（和暦）1',
      type: 'select',
      options: ['昭和', '平成', '令和'],
    },
    { key: '回収不能者生年月日年1', label: '回収不能者生年月日（年）1', type: 'number' },
    { key: '回収不能者生年月日月1', label: '回収不能者生年月日（月）1', type: 'number' },
    { key: '回収不能者生年月日日1', label: '回収不能者生年月日（日）1', type: 'number' },
    {
      key: '高齢受給者証有無1',
      label: '高齢受給者証（有無）1',
      type: 'select',
      options: ['有', '無'],
    },
    {
      key: '被保険者証等を返納できない理由1',
      label: '被保険者証等を返納できない理由1',
      type: 'textarea',
    },

    // 備考
    { key: '備考', label: '備考', type: 'textarea' },

    // 届出年月日
    { key: '届出年月日和暦', label: '届出年月日（和暦）', type: 'select', options: ['令和'] },
    { key: '届出年月日年', label: '届出年月日（年）', type: 'number' },
    { key: '届出年月日月', label: '届出年月日（月）', type: 'number' },
    { key: '届出年月日日', label: '届出年月日（日）', type: 'number' },

    // 事業所情報
    { key: '事業所所在地', label: '事業所所在地', type: 'text' },
    { key: '事業所名称', label: '事業所名称', type: 'text' },
    { key: '事業主氏名', label: '事業主氏名', type: 'text' },
    { key: '事業所電話番号', label: '事業所電話番号', type: 'text' },

    // 社会保険労務士記載欄
    { key: '社会保険労務士氏名等', label: '社会保険労務士氏名等', type: 'text' },
  ];

  constructor(
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private authService: AuthService,
    private userService: UserService
  ) {
    this.initForm();
  }

  initForm() {
    const formConfig: Record<string, unknown[]> = {};
    this.formFields.forEach((field) => {
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
      const user = await this.userService.getUserByUid(this.uid);
      if (user) {
        this.userName = `${user.lastName}${user.firstName}`;
      }

      // 既存データを取得
      const existingData = await this.userService.getUserApplication(
        this.uid,
        'uncollectable-insurance-card-notification'
      );
      if (existingData) {
        this.form.patchValue(existingData);
      }
    }
  }

  onEdit() {
    this.isEditing = true;
  }

  async onSave() {
    if (this.uid) {
      await this.userService.saveUserApplication(
        this.uid,
        'uncollectable-insurance-card-notification',
        this.form.value
      );
    }
    this.isEditing = false;
  }

  onCancel() {
    this.isEditing = false;
  }

  async onExportCSV() {
    const csv = this.exportToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const pageTitle = '被保険者証回収不能届';
    const fileName = `${pageTitle}${this.userName ? '（' + this.userName + '）' : ''}.csv`;

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

  private exportToCSV(data: Record<string, unknown>): string {
    const csvRows: string[] = [];
    csvRows.push('項目,値');

    this.formFields.forEach((field) => {
      const value = data[field.key];
      let csvValue = '';

      if (field.type === 'checkbox') {
        csvValue = value ? 'はい' : 'いいえ';
      } else {
        csvValue = String(value || '');
      }

      csvRows.push(`"${field.label}","${csvValue}"`);
    });

    return csvRows.join('\n');
  }
}
