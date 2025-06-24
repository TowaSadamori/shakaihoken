import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { exportOver70ApplicationToCSV } from '../../csv-export/over70-application-csv-export';

@Component({
  selector: 'app-over70-application',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule, ReactiveFormsModule],
  templateUrl: './over70-application.component.html',
  styleUrl: './over70-application.component.scss',
})
export class Over70ApplicationComponent implements OnInit {
  userName = '';
  uid: string | null = null;
  isEditing = false;
  form: FormGroup;

  // 該当理由の選択肢
  eligibilityReasons = [
    '70歳に達したため',
    '事業所に使用されるに至ったため',
    '適用事業所となったため',
    'その他',
  ];

  // 適用区分の選択肢
  applicationTypes = ['厚生年金保険のみ', '健康保険・厚生年金保険', '健康保険のみ'];

  constructor(
    private route: ActivatedRoute,
    private userService: UserService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder
  ) {
    // フォームの初期化
    this.form = this.fb.group({
      // 提出年月日
      提出年月日和暦: [''],
      提出年月日年: [''],
      提出年月日月: [''],
      提出年月日日: [''],

      // 事業所情報
      事業所整理記号都道府県コード: [''],
      事業所整理記号郡市区符号: [''],
      事業所整理記号事業所記号: [''],
      事業所所在地: [''],
      事業所名称: [''],
      事業主氏名: [''],
      電話番号: [''],
      社会保険労務士氏名: [''],

      // 被保険者情報
      被保険者整理番号: [''],
      被保険者氏名: ['', Validators.required],
      被保険者生年月日年: [''],
      被保険者生年月日月: [''],
      被保険者生年月日日: [''],
      個人番号: [''],

      // 該当情報
      該当年月日年: [''],
      該当年月日月: [''],
      該当年月日日: [''],
      該当理由: [''],
      報酬月額: [''],

      // 70歳到達時の情報
      '70歳到達年月日年': [''],
      '70歳到達年月日月': [''],
      '70歳到達年月日日': [''],
      '70歳到達時の報酬月額': [''],

      // 適用区分
      適用区分: [''],

      // 被扶養者情報
      被扶養者有無: [''],
      被扶養者氏名: [''],
      被扶養者生年月日年: [''],
      被扶養者生年月日月: [''],
      被扶養者生年月日日: [''],
      被扶養者続柄: [''],
      被扶養者個人番号: [''],

      // その他
      備考: [''],
      添付書類確認: [''],
    });
  }

  async ngOnInit(): Promise<void> {
    this.uid = this.route.snapshot.paramMap.get('uid');
    const currentUser = await this.authService.getCurrentUserProfileWithRole();
    if (!currentUser) {
      this.userName = '';
      this.cdr.detectChanges();
      return;
    }

    if (this.uid) {
      if (currentUser.role === 'admin' || this.uid === currentUser.uid) {
        const user = await this.userService.getUserByUid(this.uid);
        if (user) {
          this.userName = user.lastName + user.firstName;
          // 被保険者氏名に自動設定
          this.form.patchValue({
            被保険者氏名: this.userName,
          });
        } else {
          this.userName = '';
        }
        this.cdr.detectChanges();
      } else {
        // アクセス権がない場合
        this.userName = '';
        this.cdr.detectChanges();
      }
    } else {
      // uid指定なし
      if (currentUser.role === 'employee_user') {
        this.userName = currentUser.lastName + currentUser.firstName;
        this.uid = currentUser.uid;
        // 被保険者氏名に自動設定
        this.form.patchValue({
          被保険者氏名: this.userName,
        });
      } else {
        // 管理者でuid無しは何も表示しない
        this.userName = '';
      }
      this.cdr.detectChanges();
    }

    this.isEditing = false;
    this.setFormEnabled(false);
    if (this.uid) {
      const data = await this.userService.getUserApplication(this.uid, 'over70-application');
      if (data && data.formData) {
        this.form.patchValue(data.formData);
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
      await this.userService.saveUserApplication(this.uid, 'over70-application', this.form.value);
    }
    this.isEditing = false;
    this.setFormEnabled(false);
  }

  onCancel(): void {
    this.isEditing = false;
    this.setFormEnabled(false);
  }

  async onExportCSV() {
    const csv = exportOver70ApplicationToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const pageTitle = '70歳以上被用者該当届';
    const fileName = `${pageTitle}${this.userName ? '（' + this.userName + '）' : ''}.csv`;

    // ファイルダウンロード
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
