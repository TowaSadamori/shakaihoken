import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { UserService } from '../../services/user.service';
import { OfficeService } from '../../services/office.service';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { doc, getDoc } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { exportMaternityLeaveEndSalaryNotificationToCSV } from '../../csv-export/maternity-leave-end-salary-notification-csv-export';
import { SocialInsuranceCalculator } from '../../utils/decimal-calculator';

@Component({
  selector: 'app-maternity-leave-end-salary-notification',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule, ReactiveFormsModule],
  templateUrl: './maternity-leave-end-salary-notification.component.html',
  styleUrl: './maternity-leave-end-salary-notification.component.scss',
})
export class MaternityLeaveEndSalaryNotificationComponent implements OnInit {
  uid = '';
  userName = '';
  isEditing = false;
  form: FormGroup;

  constructor(
    private route: ActivatedRoute,
    private userService: UserService,
    private officeService: OfficeService,
    private fb: FormBuilder,
    private authService: AuthService
  ) {
    this.form = this.fb.group({
      // 事業所情報
      提出年月日和暦: [''],
      提出年月日年: [''],
      提出年月日月: [''],
      提出年月日日: [''],
      事業所整理記号都道府県コード: [''],
      事業所整理記号郡市区符号: [''],
      事業所整理記号事業所記号: [''],
      事業所所在地: [''],
      事業所名称: [''],
      事業主氏名: [''],
      電話番号: [''],
      社会保険労務士氏名: [''],

      // 申出者情報
      申出者住所: [''],
      申出者氏名: [''],
      申出者続柄: [''],
      申出者電話番号: [''],

      // 被保険者基本情報
      被保険者整理番号: [''],
      個人番号: [''],
      被保険者氏名: [''],
      被保険者生年月日年: [''],
      被保険者生年月日月: [''],
      被保険者生年月日日: [''],

      // 産前産後休業終了情報
      産前産後休業終了年月日年: [''],
      産前産後休業終了年月日月: [''],
      産前産後休業終了年月日日: [''],
      産前産後休業終了予定年月日年: [''],
      産前産後休業終了予定年月日月: [''],
      産前産後休業終了予定年月日日: [''],

      // 3か月間の報酬情報
      支給年月1年: [''],
      支給年月1月: [''],
      給与計算の基礎日数1: [''],
      通貨によるものの額1: [''],
      現物によるものの額1: [''],
      合計1: [''],

      支給年月2年: [''],
      支給年月2月: [''],
      給与計算の基礎日数2: [''],
      通貨によるものの額2: [''],
      現物によるものの額2: [''],
      合計2: [''],

      支給年月3年: [''],
      支給年月3月: [''],
      給与計算の基礎日数3: [''],
      通貨によるものの額3: [''],
      現物によるものの額3: [''],
      合計3: [''],

      // 計算結果
      総計: [''],
      平均額: [''],
      修正平均額: [''],

      // その他・備考
      備考: [''],
      添付書類確認: [''],
      その他特記事項: [''],
    });
  }

  async ngOnInit(): Promise<void> {
    this.uid = this.route.snapshot.params['uid'];
    if (this.uid) {
      await this.loadUserName();
      await this.loadExistingData();
    }
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

  private async loadExistingData(): Promise<void> {
    try {
      const db = getFirestore();
      const docRef = doc(
        db,
        'users',
        this.uid,
        'applications',
        'maternity-leave-end-salary-notification'
      );
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data['formData']) {
          this.form.patchValue(data['formData']);
        }
      }
    } catch (error) {
      console.error('Error loading existing data:', error);
    }
  }

  onEdit() {
    this.isEditing = true;
  }

  async onSave() {
    const userProfile = await this.authService.getCurrentUserProfileWithRole();
    const userId = userProfile?.uid || '';

    if (this.uid && userId) {
      await this.officeService.saveApplicationForOffice(
        this.uid,
        'maternity-leave-end-salary-notification',
        this.form.value,
        userId
      );
    }
    this.isEditing = false;
  }

  onCancel() {
    this.isEditing = false;
  }

  async onExportCSV() {
    const csv = exportMaternityLeaveEndSalaryNotificationToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv' });
    const pageTitle = '産前産後休業終了時報酬月額変更届';
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

  // 計算機能
  calculateTotal(monthIndex: number) {
    const currency = this.form.get(`通貨によるものの額${monthIndex}`)?.value || '0';
    const goods = this.form.get(`現物によるものの額${monthIndex}`)?.value || '0';
    const total = SocialInsuranceCalculator.addAmounts(currency, goods);
    this.form.patchValue({ [`合計${monthIndex}`]: total });
    this.calculateGrandTotal();
  }

  calculateGrandTotal() {
    const total1 = this.form.get('合計1')?.value || '0';
    const total2 = this.form.get('合計2')?.value || '0';
    const total3 = this.form.get('合計3')?.value || '0';
    const grandTotal = SocialInsuranceCalculator.addAmounts(
      SocialInsuranceCalculator.addAmounts(total1, total2),
      total3
    );
    const average = SocialInsuranceCalculator.calculateAverageRemuneration([
      total1,
      total2,
      total3,
    ]);

    this.form.patchValue({
      総計: grandTotal,
      平均額: average,
      修正平均額: average,
    });
  }
}
