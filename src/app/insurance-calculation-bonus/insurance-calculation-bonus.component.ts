import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BonusCalculationService } from '../services/bonus-calculation.service';
import { OfficeService } from '../services/office.service';

interface EmployeeInfo {
  name: string;
  employeeNumber: string;
  birthDate: string;
  age: number;
  companyId: string;
  branchNumber: string;
  addressPrefecture: string;
}

interface BonusCalculationResult {
  standardBonusAmountHealth: number;
  standardBonusAmountPension: number;
  healthInsurance: {
    employeeBurden: number;
    companyBurden: number;
  };
  careInsurance?: {
    employeeBurden: number;
    companyBurden: number;
  };
  pensionInsurance: {
    employeeBurden: number;
    companyBurden: number;
  };
  totalEmployeeBurden: number;
  totalCompanyBurden: number;
  limitInfo: {
    isHealthLimitApplied: boolean;
    isPensionLimitApplied: boolean;
  };
}

interface BonusDataItem {
  paymentDate: string;
  amount: number;
  type: string;
  month: number;
  year: number;
  calculationResult?: BonusCalculationResult;
}

@Component({
  selector: 'app-insurance-calculation-bonus',
  templateUrl: './insurance-calculation-bonus.component.html',
  styleUrls: ['./insurance-calculation-bonus.component.css'],
  standalone: true,
  imports: [FormsModule, CommonModule],
})
export class InsuranceCalculationBonusComponent implements OnInit {
  // 従業員情報
  employeeInfo: EmployeeInfo | null = null;
  employeeId = '';
  targetYear: number = new Date().getFullYear();

  // 賞与データリスト
  bonusDataList: BonusDataItem[] = [];

  // UI状態
  isLoading = false;
  errorMessage = '';

  // 注記関連
  hasLimitApplied = false;
  limitNotes: string[] = [];

  // 入力フォーム（内部処理用）
  paymentCountType: 'UNDER_3_TIMES' | 'OVER_4_TIMES' = 'UNDER_3_TIMES';
  bonusAmount = 0;
  paymentDate = '';
  bonusType = '';

  // 計算結果（後方互換用）
  calculationResult: BonusCalculationResult | null = null;
  isCalculating = false;

  private firestore = getFirestore();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private officeService: OfficeService,
    private bonusCalculationService: BonusCalculationService
  ) {}

  async ngOnInit() {
    // URL パラメータから従業員IDと年度を取得
    this.employeeId = this.route.snapshot.paramMap.get('employeeId') || '';
    const yearParam = this.route.snapshot.queryParamMap.get('year');
    this.targetYear = yearParam ? parseInt(yearParam) : new Date().getFullYear();

    console.log('従業員ID:', this.employeeId);
    console.log('対象年度:', this.targetYear);

    if (this.employeeId) {
      await this.loadEmployeeInfo();
    }

    // デフォルトの支給日を設定
    this.paymentDate = `${this.targetYear}-12-31`;
  }

  /**
   * 従業員情報の読み込み
   */
  async loadEmployeeInfo() {
    try {
      console.log('従業員情報を読み込み中 (employeeNumber):', this.employeeId);

      const usersRef = collection(this.firestore, 'users');
      const q = query(usersRef, where('employeeNumber', '==', this.employeeId));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data();
        console.log('Firestoreから取得した従業員データ:', userData);

        const birthDate = new Date(userData['birthDate']);
        const age = this.calculateAge(birthDate);
        const formattedBirthDate = birthDate.toISOString().split('T')[0];

        let addressPrefecture = userData['addressPrefecture'] || '';

        if (!addressPrefecture && userData['companyId'] && userData['branchNumber']) {
          try {
            addressPrefecture = await this.officeService.findOfficeAddressPrefecture(
              userData['companyId'],
              userData['branchNumber']
            );
          } catch (officeError) {
            console.error('事業所所在地取得エラー:', officeError);
            addressPrefecture = '東京都';
          }
        }

        this.employeeInfo = {
          name: `${userData['lastName'] || ''} ${userData['firstName'] || ''}`.trim(),
          employeeNumber: userData['employeeNumber'] || '',
          birthDate: formattedBirthDate,
          age: age,
          companyId: userData['companyId'] || '',
          branchNumber: userData['branchNumber'] || '',
          addressPrefecture: addressPrefecture,
        };

        console.log('従業員情報設定完了:', this.employeeInfo);
      } else {
        console.error('従業員が見つかりません');
        this.errorMessage = '従業員情報が見つかりません';
      }
    } catch (error) {
      console.error('従業員情報読み込みエラー:', error);
      this.errorMessage = '従業員情報の読み込みに失敗しました';
    }
  }

  /**
   * 年齢計算
   */
  calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return age;
  }

  /**
   * フォームバリデーション
   */
  isFormValid(): boolean {
    return (
      this.employeeInfo !== null &&
      this.bonusAmount > 0 &&
      this.paymentDate !== '' &&
      this.bonusType !== ''
    );
  }

  /**
   * 保険料計算実行
   */
  async calculateInsurance() {
    if (!this.isFormValid() || !this.employeeInfo) {
      return;
    }

    this.isCalculating = true;
    this.errorMessage = '';

    try {
      const fiscalYear = this.bonusCalculationService.getFiscalYear(this.paymentDate);

      // 1. 標準賞与額の決定
      const standardAmount = this.bonusCalculationService.calculateStandardBonusAmount(
        this.bonusAmount
      );

      // 2. 上限額適用
      const limitInfo = await this.bonusCalculationService.applyBonusLimitsWithExistingData(
        this.employeeId,
        standardAmount,
        fiscalYear,
        undefined,
        this.employeeInfo.companyId
      );

      // 3. 保険料率取得
      const rates = await this.bonusCalculationService.getInsuranceRates(
        fiscalYear,
        this.employeeInfo.addressPrefecture
      );

      // 4. 保険料計算
      const premiums = await this.bonusCalculationService.calculateInsurancePremiums(
        {
          healthInsuranceAmount: limitInfo.healthInsuranceAmount,
          pensionInsuranceAmount: limitInfo.pensionInsuranceAmount,
        },
        rates,
        this.employeeInfo.age
      );

      // 5. 結果の構造化
      this.calculationResult = {
        standardBonusAmountHealth: limitInfo.healthInsuranceAmount,
        standardBonusAmountPension: limitInfo.pensionInsuranceAmount,
        healthInsurance: {
          employeeBurden: Math.floor(premiums.healthPremium / 2),
          companyBurden: Math.ceil(premiums.healthPremium / 2),
        },
        careInsurance:
          this.employeeInfo.age >= 40
            ? {
                employeeBurden: Math.floor(premiums.carePremium / 2),
                companyBurden: Math.ceil(premiums.carePremium / 2),
              }
            : undefined,
        pensionInsurance: {
          employeeBurden: Math.floor(premiums.pensionPremium / 2),
          companyBurden: Math.ceil(premiums.pensionPremium / 2),
        },
        totalEmployeeBurden: premiums.employeeBurden,
        totalCompanyBurden: premiums.companyBurden,
        limitInfo: {
          isHealthLimitApplied: limitInfo.isHealthLimitApplied,
          isPensionLimitApplied: limitInfo.isPensionLimitApplied,
        },
      };

      console.log('計算結果:', this.calculationResult);
    } catch (error) {
      console.error('保険料計算エラー:', error);
      this.errorMessage = '保険料計算中にエラーが発生しました';
    } finally {
      this.isCalculating = false;
    }
  }

  /**
   * 日付フォーマット
   */
  formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  /**
   * 健康保険等級の取得（簡易版）
   */
  getHealthInsuranceGrade(amount: number): string {
    // 簡易的な等級判定
    if (amount === 0) return '0級';
    if (amount <= 58000) return '1級';
    if (amount <= 68000) return '2級';
    if (amount <= 78000) return '3級';
    if (amount <= 88000) return '4級';
    if (amount <= 98000) return '5級';
    if (amount <= 110000) return '6級';
    if (amount <= 130000) return '7級';
    if (amount <= 150000) return '8級';
    if (amount <= 170000) return '9級';
    if (amount <= 200000) return '10級';
    if (amount <= 230000) return '11級';
    if (amount <= 260000) return '12級';
    if (amount <= 290000) return '13級';
    if (amount <= 320000) return '14級';
    if (amount <= 350000) return '15級';
    if (amount <= 380000) return '16級';
    if (amount <= 410000) return '17級';
    if (amount <= 440000) return '18級';
    if (amount <= 470000) return '19級';
    if (amount <= 500000) return '20級';

    // 50万円以上は等級ではなく金額表示
    return `${(amount / 10000).toFixed(0)}万円`;
  }

  /**
   * 厚生年金等級の取得（簡易版）
   */
  getPensionInsuranceGrade(amount: number): string {
    // 厚生年金は150万円上限
    if (amount >= 1500000) return '最高等級(150万円)';

    return this.getHealthInsuranceGrade(amount);
  }

  /**
   * 戻るボタン
   */
  goBack() {
    this.router.navigate(['/']);
  }

  /**
   * 賞与データの取り込み
   */
  async importBonusData() {
    if (!this.employeeInfo) {
      this.errorMessage = '従業員情報が読み込まれていません';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
    this.bonusDataList = [];
    this.hasLimitApplied = false;
    this.limitNotes = [];

    try {
      console.log('賞与データ取り込み開始:', this.targetYear);

      // Firestoreから賞与データを取得
      const bonusHistory = await this.bonusCalculationService.getFiscalYearBonusHistory(
        this.employeeId,
        this.targetYear,
        this.employeeInfo.companyId
      );

      console.log('取得した賞与履歴:', bonusHistory);

      // 各賞与データに対して計算を実行
      for (const bonus of bonusHistory) {
        // 支給年月日の推定：月の末日を基準とする
        const paymentDate = this.estimatePaymentDate(bonus.year, bonus.month, bonus.type);

        // 一時的に値を設定して計算
        const originalAmount = this.bonusAmount;
        const originalDate = this.paymentDate;
        const originalType = this.bonusType;

        this.bonusAmount = bonus.amount;
        this.paymentDate = paymentDate;
        this.bonusType = bonus.type;

        // 計算実行
        await this.calculateInsurance();

        // 結果をリストに追加
        if (this.calculationResult) {
          this.bonusDataList.push({
            paymentDate: bonus.paymentDate || this.formatDate(paymentDate),
            amount: bonus.amount,
            type: bonus.type,
            month: bonus.month,
            year: bonus.year,
            calculationResult: { ...this.calculationResult },
          });

          // 上限適用の注記を収集
          if (this.calculationResult.limitInfo.isHealthLimitApplied) {
            this.hasLimitApplied = true;
            this.limitNotes.push(
              `健康保険：年度累計上限573万円適用済み（${bonus.month}月分、計算対象額：${this.calculationResult.standardBonusAmountHealth.toLocaleString()}円）`
            );
          }
          if (this.calculationResult.limitInfo.isPensionLimitApplied) {
            this.hasLimitApplied = true;
            this.limitNotes.push(
              `厚生年金：1回上限150万円適用済み（${bonus.month}月分、計算対象額：${this.calculationResult.standardBonusAmountPension.toLocaleString()}円）`
            );
          }
        }

        // 元の値を復元
        this.bonusAmount = originalAmount;
        this.paymentDate = originalDate;
        this.bonusType = originalType;
      }

      if (this.bonusDataList.length === 0) {
        this.errorMessage = '指定年度の賞与データが見つかりませんでした';
      } else {
        console.log('賞与データ取り込み完了:', this.bonusDataList);
      }
    } catch (error) {
      console.error('賞与データ取り込みエラー:', error);
      this.errorMessage = '賞与データの取り込みに失敗しました';
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 支給年月日の推定
   */
  estimatePaymentDate(year: number, month: number, type: string): string {
    let day = 31; // デフォルトは月末

    // 賞与種別に応じた典型的な支給日を設定
    switch (type) {
      case 'summer':
        day = month === 6 ? 30 : 15; // 6月なら30日、その他は15日
        break;
      case 'winter':
        day = month === 12 ? 31 : 15; // 12月なら31日、その他は15日
        break;
      case 'settlement':
        day = 31; // 決算賞与は月末
        break;
      default:
        day = 15; // その他は月の中旬
        break;
    }

    // 月の最終日を超えないよう調整
    const lastDay = new Date(year, month, 0).getDate();
    day = Math.min(day, lastDay);

    return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }
}
