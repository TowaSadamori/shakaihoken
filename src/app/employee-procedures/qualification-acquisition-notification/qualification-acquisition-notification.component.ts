import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { UserService } from '../../services/user.service';
import { exportQualificationAcquisitionNotificationToCSV } from '../../csv-export/qualification-acquisition-notification-csv-export';

@Component({
  selector: 'app-qualification-acquisition-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, ReactiveFormsModule, RouterModule],
  templateUrl: './qualification-acquisition-notification.component.html',
  styleUrls: ['./qualification-acquisition-notification.component.scss'],
})
export class QualificationAcquisitionNotificationComponent implements OnInit {
  isEditing = false;
  uid = '';
  userName = '';
  form: FormGroup;

  // 実際の帳票画像から読み取った項目
  formItems = [
    '届書提出日年',
    '届書提出日月',
    '届書提出日日',
    '事業所整理記号',
    '事業所番号',
    '事業所所在地',
    '事業所名称',
    '事業主氏名',
    '電話番号',
    '被保険者整理番号',
    '被保険者氏名',
    'フリガナ',
    '生年月日',
    '性別',
    '資格取得年月日',
    '報酬月額',
    '従事する事業の内容',
    '就労形態',
    '所定労働時間',
    '所定労働日数',
    '契約期間',
    '住所',
    '基礎年金番号',
    '個人番号マイナンバー',
    '70歳以上被用者該当',
    '国籍等',
    '在留カード番号等',
    '現物給与食事',
    '現物給与住宅',
    '現物給与通勤定期券等',
    '備考',
  ];

  constructor(
    private route: ActivatedRoute,
    private userService: UserService,
    private fb: FormBuilder
  ) {
    // FormGroup作成
    const formConfig: Record<string, string[]> = {};
    this.formItems.forEach((item) => {
      formConfig[item] = [''];
    });
    this.form = this.fb.group(formConfig);

    this.route.params.subscribe((params) => {
      this.uid = params['uid'];
      this.loadUserName();
    });
  }

  async ngOnInit(): Promise<void> {
    if (this.uid) {
      // 既存データ取得
      const existingData = await this.userService.getUserApplication(
        this.uid,
        'qualification-acquisition-notification'
      );
      if (existingData && existingData.formData) {
        this.form.patchValue(existingData.formData);
      }
    }
    this.isEditing = false;
    this.setFormEnabled(false);
  }

  private async loadUserName(): Promise<void> {
    if (this.uid) {
      try {
        const user = await this.userService.getUserByUid(this.uid);
        if (user) {
          this.userName = `${user.lastName}${user.firstName}`;
        }
      } catch (error) {
        console.error('Error loading user:', error);
      }
    }
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

  onEdit(): void {
    this.isEditing = true;
    this.setFormEnabled(true);
  }

  async onSave(): Promise<void> {
    if (this.uid) {
      await this.userService.saveUserApplication(
        this.uid,
        'qualification-acquisition-notification',
        this.form.value
      );
    }
    this.isEditing = false;
    this.setFormEnabled(false);
  }

  onCancel(): void {
    this.isEditing = false;
    this.setFormEnabled(false);
  }

  async onExportCSV(): Promise<void> {
    console.log('form.value:', this.form.value);
    const csv = exportQualificationAcquisitionNotificationToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv' });
    const pageTitle = '健保厚年資格取得届';
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
}
