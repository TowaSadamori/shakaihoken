import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { exportOver70NonApplicationToCSV } from '../../csv-export/over70-non-application-csv-export';

@Component({
  selector: 'app-over70-non-application',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    RouterModule,
  ],
  templateUrl: './over70-non-application.component.html',
  styleUrl: './over70-non-application.component.scss',
})
export class Over70NonApplicationComponent implements OnInit {
  uid: string | null = null;
  userName = '';
  isEditing = false;
  form: FormGroup;

  // 不該当理由の選択肢（公式様式に基づく）
  nonApplicableReasons = [
    '4.退職等',
    '5.死亡',
    '7.75歳到達',
    '9.障害認定',
    '11.社会保障協定',
    'その他',
  ];

  constructor(
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private authService: AuthService,
    private userService: UserService,
    private cdr: ChangeDetectorRef
  ) {
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
      被保険者氏名カナ: [''],
      被保険者氏名漢字: [''],
      被保険者生年月日年: [''],
      被保険者生年月日月: [''],
      被保険者生年月日日: [''],
      個人番号または基礎年金番号: [''],

      // 喪失情報
      喪失年月日年: [''],
      喪失年月日月: [''],
      喪失年月日日: [''],
      喪失原因: [''],

      // 70歳不該当情報
      '70歳不該当チェック': [false],
      '70歳不該当年月日年': [''],
      '70歳不該当年月日月': [''],
      '70歳不該当年月日日': [''],

      // 備考
      備考: [''],
      添付書類確認: [''],
    });
  }

  async ngOnInit() {
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
            被保険者氏名カナ: this.userName,
            被保険者氏名漢字: this.userName,
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
          被保険者氏名カナ: this.userName,
          被保険者氏名漢字: this.userName,
        });
      } else {
        // 管理者でuid無しは何も表示しない
        this.userName = '';
      }
      this.cdr.detectChanges();
    }

    // 既存データの読み込み
    if (this.uid) {
      await this.loadExistingData();
    }
  }

  async loadExistingData() {
    if (!this.uid) return;

    try {
      const data = await this.userService.getUserApplication(this.uid, 'over70-non-application');
      if (data && data.formData) {
        // undefined/nullを空文字に変換
        const cleanData = Object.fromEntries(
          Object.entries(data.formData).map(([key, value]) => [key, value == null ? '' : value])
        );
        this.form.patchValue(cleanData);
      }
    } catch (error) {
      console.error('データの読み込みに失敗しました:', error);
    }
  }

  onEdit(): void {
    this.isEditing = true;
  }

  async onSave() {
    if (!this.uid) return;

    try {
      await this.userService.saveUserApplication(
        this.uid,
        'over70-non-application',
        this.form.value
      );
      this.isEditing = false;
      alert('保存しました');
    } catch (error) {
      console.error('保存に失敗しました:', error);
      alert('保存に失敗しました');
    }
  }

  onCancel() {
    this.isEditing = false;
    // フォームを元の状態に戻す
    if (this.uid) {
      this.loadExistingData();
    }
  }

  async onExportCSV() {
    const csv = exportOver70NonApplicationToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const pageTitle = '70歳以上被用者不該当届';
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
