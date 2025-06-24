import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { OfficeService } from '../../services/office.service';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormBuilder, FormGroup, FormArray, ReactiveFormsModule } from '@angular/forms';
import { doc, getDoc, setDoc, getFirestore } from 'firebase/firestore';
import { exportCareInsuranceExemptionToCSV } from '../../csv-export/care-insurance-exemption-csv-export';

@Component({
  selector: 'app-care-insurance-exemption-application',
  standalone: true,
  imports: [RouterModule, CommonModule, MatButtonModule, MatIconModule, ReactiveFormsModule],
  templateUrl: './care-insurance-exemption-application.component.html',
  styleUrl: './care-insurance-exemption-application.component.scss',
})
export class CareInsuranceExemptionApplicationComponent implements OnInit {
  userName = '';
  uid: string | null = null;
  isEditing = false;
  form: FormGroup;

  constructor(
    private route: ActivatedRoute,
    private userService: UserService,
    private authService: AuthService,
    private officeService: OfficeService,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder
  ) {
    this.form = this.fb.group({
      // 提出年月日
      提出年月日和暦: [''],
      提出年月日年: [''],
      提出年月日月: [''],
      提出年月日日: [''],

      // 事業所整理記号
      事業所整理記号都道府県コード: [''],
      事業所整理記号郡市区符号: [''],
      事業所整理記号事業所記号: [''],

      // 被保険者情報
      被保険者氏名: [''],
      被保険者生年月日年: [''],
      被保険者生年月日月: [''],
      被保険者生年月日日: [''],
      被保険者整理番号: [''],

      // 被扶養者情報（FormArray）
      被扶養者リスト: this.fb.array([this.createDependentGroup()]),

      // 事業所情報
      事業所所在地: [''],
      事業所名称: [''],
      事業主氏名: [''],
      事業所電話番号: [''],
      社会保険労務士氏名: [''],
    });
  }

  get dependentArray(): FormArray {
    return this.form.get('被扶養者リスト') as FormArray;
  }

  createDependentGroup(): FormGroup {
    return this.fb.group({
      // 被扶養者基本情報
      被扶養者氏名: [''],
      被扶養者生年月日年: [''],
      被扶養者生年月日月: [''],
      被扶養者生年月日日: [''],
      続柄: [''],
      被扶養者作成年月日年: [''],
      被扶養者作成年月日月: [''],
      被扶養者作成年月日日: [''],

      // 受給被保険者情報
      受給被保険者住所: [''],
      受給被保険者氏名: [''],

      // 適用除外理由
      適用除外理由該当1: [false],
      適用除外理由該当2: [false],
      適用除外理由非該当1: [false],
      適用除外理由非該当2: [false],

      // 該当年月日
      該当年月日年: [''],
      該当年月日月: [''],
      該当年月日日: [''],

      // 入居施設情報
      入居施設名称: [''],
      入居施設所在地: [''],
      電話番号: [''],

      // 備考
      備考: [''],
    });
  }

  addDependent() {
    this.dependentArray.push(this.createDependentGroup());
  }

  removeDependent(index: number) {
    if (this.dependentArray.length > 1) {
      this.dependentArray.removeAt(index);
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

    // 既存データの読み込み
    if (this.uid) {
      await this.loadExistingData();
    }

    this.isEditing = false;
    this.setFormEnabled(false);
  }

  async loadExistingData() {
    if (!this.uid) return;

    const db = getFirestore();
    const appDocRef = doc(
      db,
      'users',
      this.uid,
      'applications',
      'care-insurance-exemption-application'
    );
    const appDocSnap = await getDoc(appDocRef);

    if (appDocSnap.exists()) {
      const data = appDocSnap.data();
      if (data && data['formData']) {
        // 被扶養者リストの件数分FormArrayを初期化
        const dependentList = data['formData']['被扶養者リスト'] || [];
        const dependentArray = this.form.get('被扶養者リスト') as FormArray;

        // 既存のFormArrayをクリア
        while (dependentArray.length > 0) {
          dependentArray.removeAt(0);
        }

        // データの件数分FormGroupを追加
        dependentList.forEach(() => dependentArray.push(this.createDependentGroup()));

        // データをパッチ
        this.form.patchValue(data['formData']);
      }
    }
  }

  onEdit() {
    this.isEditing = true;
    this.setFormEnabled(true);
  }

  async onSave() {
    const userProfile = await this.authService.getCurrentUserProfileWithRole();
    const userId = userProfile?.uid || '';

    if (this.uid && userId) {
      // ユーザー申請なのでuserServiceを使用
      const db = getFirestore();
      const appDocRef = doc(
        db,
        'users',
        this.uid,
        'applications',
        'care-insurance-exemption-application'
      );

      await setDoc(appDocRef, {
        formData: this.form.value,
        updatedAt: new Date(),
        updatedBy: userId,
      });
    }
    this.isEditing = false;
    this.setFormEnabled(false);
  }

  onCancel() {
    this.isEditing = false;
    this.setFormEnabled(false);
    // フォームを元に戻す
    this.loadExistingData();
  }

  async onExportCSV() {
    // FormArrayデータをそのまま渡す
    const csv = exportCareInsuranceExemptionToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const pageTitle = '介護保険適用除外等（該当・非該当）届';
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
