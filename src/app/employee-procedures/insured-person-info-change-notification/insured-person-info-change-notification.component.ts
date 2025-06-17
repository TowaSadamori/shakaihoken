import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';
import { exportInsuredPersonNameAddressChangeToCSV } from '../../csv-export/insured-person-name-address-change-csv-export';

@Component({
  selector: 'app-insured-person-info-change-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule, ReactiveFormsModule],
  templateUrl: './insured-person-info-change-notification.component.html',
  styleUrls: ['./insured-person-info-change-notification.component.scss'],
})
export class InsuredPersonInfoChangeNotificationComponent implements OnInit {
  uid: string | null = null;
  userName = '';
  isEditing = false;
  form: FormGroup;

  constructor(
    private route: ActivatedRoute,
    private fb: FormBuilder,
    private authService: AuthService,
    private userService: UserService,
    private cdr: ChangeDetectorRef
  ) {
    this.form = this.fb.group({
      // 提出年月日（右上）
      提出年月日和暦: [''],
      提出年月日年: [''],
      提出年月日月: [''],
      提出年月日日: [''],

      // 事業所整理記号（3つの部分）
      事業所整理記号1: [''],
      事業所整理記号2: [''],
      事業所整理記号3: [''],

      // 被保険者証記号
      被保険者証記号: [''],

      // 個人番号または基礎年金番号
      個人番号または基礎年金番号: [''],

      // 生年月日
      生年月日和暦: [''],
      生年月日年: [''],
      生年月日月: [''],
      生年月日日: [''],

      // 被保険者氏名（変更後）
      被保険者氏名変更後フリガナ: [''],
      被保険者氏名変更後漢字: [''],

      // 変更年月日
      変更年月日和暦: [''],
      変更年月日年: [''],
      変更年月日月: [''],
      変更年月日日: [''],

      // 備考
      備考: [''],

      // 事業所情報
      事業所所在地: [''],
      事業所名称: [''],
      事業主氏名: [''],
      電話番号: [''],

      // 社会保険労務士情報（右下）
      社会保険労務士事務所整理番号: [''],
      社会保険労務士氏名: [''],

      // その他
      添付書類確認: [''],
      備考詳細: [''],
    });
  }

  async ngOnInit(): Promise<void> {
    this.uid = this.route.snapshot.params['uid'];
    if (this.uid) {
      const user = await this.userService.getUserByUid(this.uid);
      this.userName = user ? user.lastName + user.firstName : '';

      // 既存データ取得（UserService方式）
      try {
        const data = await this.userService.getUserApplication(
          this.uid,
          'insured-person-name-address-change'
        );
        if (data && data.formData) {
          this.form.patchValue(data.formData);
        } else {
          // 新規作成時は被保険者氏名に自動設定
          this.form.patchValue({
            被保険者氏名変更後フリガナ: this.userName,
            被保険者氏名変更後漢字: this.userName,
          });
        }
      } catch (error) {
        console.error('データ取得エラー:', error);
        // エラー時も被保険者氏名に自動設定
        this.form.patchValue({
          被保険者氏名変更後フリガナ: this.userName,
          被保険者氏名変更後漢字: this.userName,
        });
      }
    } else {
      // uidがない場合のフォールバック
      const currentUser = await this.authService.getCurrentUserProfileWithRole();
      if (currentUser) {
        this.userName = currentUser.lastName + currentUser.firstName;
        this.uid = currentUser.uid;
        // 被保険者氏名に自動設定
        this.form.patchValue({
          被保険者氏名変更後フリガナ: this.userName,
          被保険者氏名変更後漢字: this.userName,
        });
      }
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
        'insured-person-name-address-change',
        this.form.value
      );
      this.isEditing = false;
      alert('保存しました');
    } catch (error) {
      console.error('保存に失敗しました:', error);
      alert('保存に失敗しました');
    }
  }

  async onCancel() {
    this.isEditing = false;
    // フォームを元の状態に戻す
    if (this.uid) {
      try {
        const data = await this.userService.getUserApplication(
          this.uid,
          'insured-person-name-address-change'
        );
        if (data && data.formData) {
          this.form.patchValue(data.formData);
        }
      } catch (error) {
        console.error('データ再読み込みエラー:', error);
      }
    }
  }

  async onExportCSV() {
    const csv = exportInsuredPersonNameAddressChangeToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const pageTitle = '健康保険・厚生年金保険被保険者氏名変更（訂正）届・住所変更届';
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
