import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { exportInsuranceCardReissueToCSV } from '../../csv-export/insurance-card-reissue-csv-export';

@Component({
  selector: 'app-insurance-card-reissue-application',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    RouterModule,
  ],
  templateUrl: './insurance-card-reissue-application.component.html',
  styleUrls: ['./insurance-card-reissue-application.component.scss'],
})
export class InsuranceCardReissueApplicationComponent implements OnInit {
  uid: string | null = null;
  userName = '';
  isEditing = false;
  form: FormGroup;

  // 再交付を必要とする理由の選択肢
  reissueReasons = ['汚した', '破った', '紛失した', 'その他'];

  // 船員保険被保険者証の選択肢
  seamenInsuranceOptions = ['有', '無'];

  constructor(
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private authService: AuthService,
    private userService: UserService,
    private cdr: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      // 提出年月日
      提出年月日年: [''],
      提出年月日月: [''],
      提出年月日日: [''],

      // 事業所情報
      事業所整理記号: [''],
      事業所所在地: [''],
      事業所名称: [''],
      事業主氏名: [''],
      電話番号: [''],

      // 被保険者情報
      被保険者証記号: [''],
      被保険者証番号: [''],
      被保険者氏名カナ: [''],
      被保険者氏名漢字: [''],
      被保険者生年月日年: [''],
      被保険者生年月日月: [''],
      被保険者生年月日日: [''],
      被保険者住所: [''],
      電話番号被保険者: [''],

      // 再交付を申請する被保険者証
      被保険者本人分: [false],
      被扶養者家族分: [false],

      // 被扶養者情報（複数人対応）
      被扶養者1氏名: [''],
      被扶養者1続柄: [''],
      被扶養者1生年月日年: [''],
      被扶養者1生年月日月: [''],
      被扶養者1生年月日日: [''],
      被扶養者2氏名: [''],
      被扶養者2続柄: [''],
      被扶養者2生年月日年: [''],
      被扶養者2生年月日月: [''],
      被扶養者2生年月日日: [''],
      被扶養者3氏名: [''],
      被扶養者3続柄: [''],
      被扶養者3生年月日年: [''],
      被扶養者3生年月日月: [''],
      被扶養者3生年月日日: [''],

      // 再交付を必要とする理由
      再交付理由: [''],
      再交付理由詳細: [''],

      // 船員保険被保険者証
      船員保険被保険者証有無: [''],
      船員保険事業所整理記号: [''],
      船員保険被保険者氏名: [''],
      船員保険被保険者証番号: [''],

      // 添付書類
      添付書類確認: [''],

      // 備考
      備考: [''],
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
      } else {
        // 管理者でuid無しは何も表示しない
        this.userName = '';
      }
      this.cdr.detectChanges();
    }
  }

  async loadExistingData() {
    if (!this.uid) return;

    try {
      const data = await this.userService.getUserApplication(this.uid, 'insurance-card-reissue');
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

  onEdit() {
    this.isEditing = true;
  }

  async onSave() {
    if (!this.uid) return;

    try {
      await this.userService.saveUserApplication(
        this.uid,
        'insurance-card-reissue',
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
    const csv = exportInsuranceCardReissueToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const pageTitle = '健康保険被保険者証再交付申請書';
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
