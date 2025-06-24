import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-qualification-loss-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule, ReactiveFormsModule],
  templateUrl: './qualification-loss-notification.component.html',
  styleUrls: ['./qualification-loss-notification.component.scss'],
})
export class QualificationLossNotificationComponent implements OnInit {
  isEditing = false;
  form!: FormGroup;
  userName = '';
  uid = '';

  // フォームフィールド定義
  formFields = [
    // 提出日
    { key: '提出年月日和暦年', label: '提出年月日（和暦年）', type: 'select', options: ['令和'] },
    { key: '提出年月日年', label: '提出年月日（年）', type: 'number' },
    { key: '提出年月日月', label: '提出年月日（月）', type: 'number' },
    { key: '提出年月日日', label: '提出年月日（日）', type: 'number' },

    // 届出書の種類
    { key: '健康保険被保険者資格喪失届', label: '健康保険被保険者資格喪失届', type: 'checkbox' },
    {
      key: '厚生年金保険被保険者資格喪失届',
      label: '厚生年金保険被保険者資格喪失届',
      type: 'checkbox',
    },

    // 被保険者情報
    { key: '被保険者整理番号', label: '被保険者整理番号', type: 'text' },
    { key: '被保険者氏名氏', label: '被保険者氏名（氏）', type: 'text' },
    { key: '被保険者氏名名', label: '被保険者氏名（名）', type: 'text' },
    { key: '生年月日年', label: '生年月日（年）', type: 'number' },
    { key: '生年月日月', label: '生年月日（月）', type: 'number' },
    { key: '生年月日日', label: '生年月日（日）', type: 'number' },

    // 資格喪失情報
    { key: '資格喪失年月日年', label: '資格喪失年月日（年）', type: 'number' },
    { key: '資格喪失年月日月', label: '資格喪失年月日（月）', type: 'number' },
    { key: '資格喪失年月日日', label: '資格喪失年月日（日）', type: 'number' },

    // 喪失原因
    { key: '喪失原因死亡', label: '喪失原因：死亡', type: 'checkbox' },
    { key: '喪失原因退職', label: '喪失原因：退職', type: 'checkbox' },
    { key: '喪失原因所在地変更', label: '喪失原因：所在地変更', type: 'checkbox' },
    { key: '喪失原因適用除外', label: '喪失原因：適用除外', type: 'checkbox' },
    { key: '喪失原因その他', label: '喪失原因：その他', type: 'checkbox' },

    // 保険料・給与情報
    {
      key: '保険料徴収区分',
      label: '保険料徴収区分',
      type: 'select',
      options: ['普通徴収', '特別徴収'],
    },
    { key: '標準報酬月額', label: '標準報酬月額', type: 'number' },
    { key: '賞与支払年月日年', label: '賞与支払年月日（年）', type: 'number' },
    { key: '賞与支払年月日月', label: '賞与支払年月日（月）', type: 'number' },
    { key: '賞与支払年月日日', label: '賞与支払年月日（日）', type: 'number' },
    { key: '標準賞与額', label: '標準賞与額', type: 'number' },

    // 扶養者情報
    { key: '被扶養者に関する事項', label: '被扶養者に関する事項', type: 'textarea' },

    // 事業所情報
    { key: '事業所整理記号', label: '事業所整理記号', type: 'text' },
    { key: '事業所名称', label: '事業所名称', type: 'text' },
    { key: '事業所所在地', label: '事業所所在地', type: 'text' },
    { key: '事業主氏名', label: '事業主氏名', type: 'text' },
    { key: '電話番号', label: '電話番号', type: 'text' },

    // 個人番号
    { key: '個人番号', label: '個人番号', type: 'text' },
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
        'qualification-loss-notification'
      );
      if (existingData) {
        this.form.patchValue(existingData.formData);
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
        'qualification-loss-notification',
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
    const pageTitle = '健保厚年資格喪失届';
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
