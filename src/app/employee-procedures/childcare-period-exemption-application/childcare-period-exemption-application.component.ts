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
import { doc, setDoc, getDoc, getFirestore } from 'firebase/firestore';
import { exportChildcarePeriodExemptionToCSV } from '../../csv-export/childcare-period-exemption-csv-export';

@Component({
  selector: 'app-childcare-period-exemption-application',
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
  templateUrl: './childcare-period-exemption-application.component.html',
  styleUrl: './childcare-period-exemption-application.component.scss',
})
export class ChildcarePeriodExemptionApplicationComponent implements OnInit {
  uid: string | null = null;
  userName = '';
  isEditing = false;
  form: FormGroup;

  // 申出区分の選択肢
  applicationTypes = ['申出', '終了'];

  // 養育する子の性別選択肢
  childGenders = ['男', '女'];

  // 被保険者との続柄選択肢
  relationships = ['子', '養子', 'その他'];

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

      // 申出区分
      申出区分: [''],

      // 被保険者情報
      被保険者整理番号: [''],
      被保険者氏名カナ: [''],
      被保険者氏名漢字: [''],
      被保険者生年月日年: [''],
      被保険者生年月日月: [''],
      被保険者生年月日日: [''],
      被保険者個人番号: [''],

      // 養育する子の情報
      養育する子の氏名: [''],
      養育する子の生年月日年: [''],
      養育する子の生年月日月: [''],
      養育する子の生年月日日: [''],
      養育する子の性別: [''],
      被保険者との続柄: [''],

      // 養育期間の申出をする場合
      申出養育開始年月日年: [''],
      申出養育開始年月日月: [''],
      申出養育開始年月日日: [''],
      申出特例期間開始年月日年: [''],
      申出特例期間開始年月日月: [''],
      申出特例期間開始年月日日: [''],
      申出特例期間終了年月日年: [''],
      申出特例期間終了年月日月: [''],
      申出特例期間終了年月日日: [''],

      // 養育期間の終了をする場合
      終了養育終了年月日年: [''],
      終了養育終了年月日月: [''],
      終了養育終了年月日日: [''],
      終了特例期間終了年月日年: [''],
      終了特例期間終了年月日月: [''],
      終了特例期間終了年月日日: [''],

      // 終了について
      終了理由チェック1: [false], // 申出に係る子が3歳に到達したため
      終了理由チェック2: [false], // 退職により、申出者が厚生年金保険の被保険者資格を喪失したとき
      終了理由チェック3: [false], // 申出に係る子以外の子について養育特例措置をうけるため
      終了理由チェック4: [false], // 申出者が産前産後休業または育児休業を開始したため

      // 記入方法
      記入方法確認: [''],

      // 備考
      備考: [''],
      添付書類確認: [''],
    });
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
    this.isEditing = false;
    this.setFormEnabled(false);
  }

  async loadExistingData() {
    if (!this.uid) return;

    try {
      const db = getFirestore();
      const docRef = doc(db, 'users', this.uid, 'applications', 'childcare-period-exemption');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data) {
          // undefined/nullを空文字に変換
          const cleanData = Object.fromEntries(
            Object.entries(data).map(([key, value]) => [key, value == null ? '' : value])
          );
          this.form.patchValue(cleanData);
        }
      }
    } catch (error) {
      console.error('データの読み込みに失敗しました:', error);
    }
  }

  onEdit() {
    this.isEditing = true;
    this.setFormEnabled(true);
  }

  async onSave() {
    if (!this.uid) return;

    try {
      const db = getFirestore();
      const docRef = doc(db, 'users', this.uid, 'applications', 'childcare-period-exemption');

      await setDoc(docRef, this.form.value, { merge: true });

      this.isEditing = false;
      this.setFormEnabled(false);
      alert('保存しました');
    } catch (error) {
      console.error('保存に失敗しました:', error);
      alert('保存に失敗しました');
    }
  }

  onCancel() {
    this.isEditing = false;
    this.setFormEnabled(false);
    // フォームを元の状態に戻す
    if (this.uid) {
      this.loadExistingData();
    }
  }

  async onExportCSV() {
    const csv = exportChildcarePeriodExemptionToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const pageTitle = '養育期間標準報酬月額特例申出書／終了届';
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
