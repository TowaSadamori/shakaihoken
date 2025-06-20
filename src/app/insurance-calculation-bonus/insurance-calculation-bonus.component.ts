import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BonusCalculationService } from '../services/bonus-calculation.service';
import { OfficeService } from '../services/office.service';
import { SocialInsuranceCalculator } from '../utils/decimal-calculator';

interface EmployeeInfo {
  name: string;
  employeeNumber: string;
  birthDate: string;
  age: bigint;
  companyId: string;
  branchNumber: string;
  addressPrefecture: string;
}

interface BonusCalculationResult {
  standardBonusAmountHealth: string;
  standardBonusAmountPension: string;
  healthInsurance: {
    employeeBurden: string;
    companyBurden: string;
  };
  careInsurance?: {
    employeeBurden: string;
    companyBurden: string;
  };
  pensionInsurance: {
    employeeBurden: string;
    companyBurden: string;
  };
  totalEmployeeBurden: string;
  totalCompanyBurden: string;
  limitInfo: {
    isHealthLimitApplied: boolean;
    isPensionLimitApplied: boolean;
  };
}

interface BonusDataItem {
  paymentDate: string;
  amount: string;
  type: string;
  month: bigint;
  year: bigint;
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
  targetYear = BigInt(new Date().getFullYear());

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
  bonusAmount = '0';
  paymentDate = '';
  bonusType = '';

  // 計算結果（後方互換用）
  calculationResult: BonusCalculationResult | null = null;
  isCalculating = false;

  // 計算モード選択
  calculationMode: 'traditional' | 'gradeBased' | 'comparison' = 'traditional';
  gradeBasedResult: any = null;
  comparisonResult: any = null;

  private firestore = getFirestore();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private officeService: OfficeService,
    private bonusCalculationService: BonusCalculationService
  ) {}

  async ngOnInit() {
    // ルートパラメータから従業員IDと年度を取得
    this.route.paramMap.subscribe(async (params) => {
      const employeeId = params.get('employeeId');
      if (employeeId) {
        this.employeeId = employeeId;
        console.log('従業員ID:', this.employeeId);

        // クエリパラメータから年度を取得
        this.route.queryParams.subscribe(async (queryParams) => {
          if (queryParams['year']) {
            this.targetYear = BigInt(queryParams['year']);
          }
          console.log('対象年度:', this.targetYear);

          // 従業員情報と保存されたデータを読み込み
          await this.loadEmployeeInfo();
          await this.loadSavedBonusData();
        });
      }
    });
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
  calculateAge(birthDate: Date): bigint {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    return BigInt(age);
  }

  /**
   * フォームバリデーション
   */
  isFormValid(): boolean {
    return (
      this.employeeInfo !== null &&
      SocialInsuranceCalculator.compare(this.bonusAmount, '0') > 0 &&
      this.paymentDate !== '' &&
      this.bonusType !== ''
    );
  }

  /**
   * 計算モードの変更
   */
  onCalculationModeChange() {
    // モード変更時に結果をクリア
    this.calculationResult = null;
    this.gradeBasedResult = null;
    this.comparisonResult = null;
    this.errorMessage = '';
    console.log('計算モード変更:', this.calculationMode);
  }

  /**
   * 保険料計算（モード別）
   */
  async calculateInsurance() {
    if (!this.isFormValid()) {
      this.errorMessage = 'すべての必須項目を入力してください';
      return;
    }

    this.isCalculating = true;
    this.errorMessage = '';
    this.calculationResult = null;
    this.gradeBasedResult = null;
    this.comparisonResult = null;

    try {
      console.log('=== 保険料計算開始 ===');
      console.log('計算モード:', this.calculationMode);
      console.log('従業員ID:', this.employeeId);
      console.log('賞与額:', this.bonusAmount);
      console.log('支払日:', this.paymentDate);
      console.log('賞与種別:', this.bonusType);

      if (!this.employeeInfo) {
        throw new Error('従業員情報が取得できません');
      }

      switch (this.calculationMode) {
        case 'traditional':
          await this.calculateTraditionalInsurance();
          break;
        case 'gradeBased':
          await this.calculateGradeBasedInsurance();
          break;
        case 'comparison':
          await this.calculateComparisonInsurance();
          break;
      }

      console.log('=== 保険料計算完了 ===');
    } catch (error) {
      console.error('保険料計算エラー:', error);
      this.errorMessage = '保険料計算中にエラーが発生しました';
    } finally {
      this.isCalculating = false;
    }
  }

  /**
   * 従来の保険料計算
   */
  private async calculateTraditionalInsurance() {
    if (!this.employeeInfo) return;

    // 1. 標準賞与額計算
    const standardAmount = this.bonusCalculationService.calculateStandardBonusAmount(
      this.bonusAmount
    );
    console.log('標準賞与額:', standardAmount);

    // 2. 上限適用
    const fiscalYear = this.bonusCalculationService.getFiscalYear(this.paymentDate);
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
        employeeBurden: premiums.healthPremium,
        companyBurden: premiums.healthPremium,
      },
      careInsurance:
        this.employeeInfo.age >= 40n
          ? {
              employeeBurden: premiums.carePremium,
              companyBurden: premiums.carePremium,
            }
          : undefined,
      pensionInsurance: {
        employeeBurden: premiums.pensionPremium,
        companyBurden: premiums.pensionPremium,
      },
      totalEmployeeBurden: premiums.employeeBurden,
      totalCompanyBurden: premiums.companyBurden,
      limitInfo: {
        isHealthLimitApplied: limitInfo.isHealthLimitApplied,
        isPensionLimitApplied: limitInfo.isPensionLimitApplied,
      },
    };

    console.log('従来計算結果:', this.calculationResult);
  }

  /**
   * 等級ベース保険料計算
   */
  private async calculateGradeBasedInsurance() {
    if (!this.employeeInfo) return;

    const result = await this.bonusCalculationService.calculateGradeBasedBonusInsurance(
      this.employeeId,
      this.bonusAmount,
      this.paymentDate,
      this.bonusType,
      this.employeeInfo.age,
      this.employeeInfo.addressPrefecture,
      this.employeeInfo.companyId
    );

    if (result) {
      this.gradeBasedResult = result;
      console.log('等級ベース計算結果:', this.gradeBasedResult);
    } else {
      throw new Error('等級ベース計算に失敗しました');
    }
  }

  /**
   * 比較計算（両方式を実行）
   */
  private async calculateComparisonInsurance() {
    if (!this.employeeInfo) return;

    const result = await this.bonusCalculationService.compareBonusCalculationMethods(
      this.employeeId,
      this.bonusAmount,
      this.paymentDate,
      this.bonusType,
      this.employeeInfo.age,
      this.employeeInfo.addressPrefecture,
      this.employeeInfo.companyId
    );

    this.comparisonResult = result;
    console.log('比較計算結果:', this.comparisonResult);

    // 比較モードでは従来計算の結果も表示用に設定
    if (result.traditional) {
      this.calculationResult = {
        standardBonusAmountHealth: result.traditional.calculationResult.standardBonusAmountHealth,
        standardBonusAmountPension: result.traditional.calculationResult.standardBonusAmountPension,
        healthInsurance: {
          employeeBurden: result.traditional.calculationResult.healthInsurancePremium,
          companyBurden: result.traditional.calculationResult.healthInsurancePremium,
        },
        careInsurance: result.traditional.calculationResult.careInsurancePremium
          ? {
              employeeBurden: result.traditional.calculationResult.careInsurancePremium,
              companyBurden: result.traditional.calculationResult.careInsurancePremium,
            }
          : undefined,
        pensionInsurance: {
          employeeBurden: result.traditional.calculationResult.pensionInsurancePremium,
          companyBurden: result.traditional.calculationResult.pensionInsurancePremium,
        },
        totalEmployeeBurden: result.traditional.calculationResult.employeeBurden,
        totalCompanyBurden: result.traditional.calculationResult.companyBurden,
        limitInfo: {
          isHealthLimitApplied: result.traditional.limitResult.isHealthLimitApplied,
          isPensionLimitApplied: result.traditional.limitResult.isPensionLimitApplied,
        },
      };
    }

    if (result.gradeBased) {
      this.gradeBasedResult = result.gradeBased;
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
   * 健康保険等級の取得（正確な等級表対応）
   */
  getHealthInsuranceGrade(amount: string): string {
    if (amount === '0') return '-';

    // 健康保険標準報酬等級表（令和5年度版）
    const gradeTable = [
      { min: '0', max: '63000', grade: '1' },
      { min: '63001', max: '73000', grade: '2' },
      { min: '73001', max: '83000', grade: '3' },
      { min: '83001', max: '93000', grade: '4' },
      { min: '93001', max: '101000', grade: '5' },
      { min: '101001', max: '107000', grade: '6' },
      { min: '107001', max: '114000', grade: '7' },
      { min: '114001', max: '122000', grade: '8' },
      { min: '122001', max: '130000', grade: '9' },
      { min: '130001', max: '138000', grade: '10' },
      { min: '138001', max: '146000', grade: '11' },
      { min: '146001', max: '155000', grade: '12' },
      { min: '155001', max: '165000', grade: '13' },
      { min: '165001', max: '175000', grade: '14' },
      { min: '175001', max: '185000', grade: '15' },
      { min: '185001', max: '195000', grade: '16' },
      { min: '195001', max: '210000', grade: '17' },
      { min: '210001', max: '230000', grade: '18' },
      { min: '230001', max: '250000', grade: '19' },
      { min: '250001', max: '270000', grade: '20' },
      { min: '270001', max: '290000', grade: '21' },
      { min: '290001', max: '310000', grade: '22' },
      { min: '310001', max: '330000', grade: '23' },
      { min: '330001', max: '350000', grade: '24' },
      { min: '350001', max: '370000', grade: '25' },
      { min: '370001', max: '395000', grade: '26' },
      { min: '395001', max: '425000', grade: '27' },
      { min: '425001', max: '455000', grade: '28' },
      { min: '455001', max: '485000', grade: '29' },
      { min: '485001', max: '515000', grade: '30' },
      { min: '515001', max: '545000', grade: '31' },
      { min: '545001', max: '575000', grade: '32' },
      { min: '575001', max: '605000', grade: '33' },
      { min: '605001', max: '635000', grade: '34' },
      { min: '635001', max: '665000', grade: '35' },
      { min: '665001', max: '695000', grade: '36' },
      { min: '695001', max: '730000', grade: '37' },
      { min: '730001', max: '770000', grade: '38' },
      { min: '770001', max: '810000', grade: '39' },
      { min: '810001', max: '855000', grade: '40' },
      { min: '855001', max: '905000', grade: '41' },
      { min: '905001', max: '955000', grade: '42' },
      { min: '955001', max: '1005000', grade: '43' },
      { min: '1005001', max: '1055000', grade: '44' },
      { min: '1055001', max: '1115000', grade: '45' },
      { min: '1115001', max: '1175000', grade: '46' },
      { min: '1175001', max: '1235000', grade: '47' },
      { min: '1235001', max: '1295000', grade: '48' },
      { min: '1295001', max: '1355000', grade: '49' },
      { min: '1355001', max: '99999999', grade: '50' },
    ];

    for (const item of gradeTable) {
      // SocialInsuranceCalculatorを使用したDecimal文字列比較
      if (
        SocialInsuranceCalculator.compare(amount, item.min) >= 0 &&
        SocialInsuranceCalculator.compare(amount, item.max) <= 0
      ) {
        return `${item.grade}級`;
      }
    }

    return '50級'; // 最高等級
  }

  /**
   * 厚生年金等級の取得（正確な等級表対応）
   */
  getPensionInsuranceGrade(amount: string): string {
    if (amount === '0') return '-';

    // 厚生年金標準報酬等級表（令和5年度版）
    const gradeTable = [
      { min: '0', max: '63000', grade: '1' },
      { min: '63001', max: '73000', grade: '2' },
      { min: '73001', max: '83000', grade: '3' },
      { min: '83001', max: '93000', grade: '4' },
      { min: '93001', max: '101000', grade: '5' },
      { min: '101001', max: '107000', grade: '6' },
      { min: '107001', max: '114000', grade: '7' },
      { min: '114001', max: '122000', grade: '8' },
      { min: '122001', max: '130000', grade: '9' },
      { min: '130001', max: '138000', grade: '10' },
      { min: '138001', max: '146000', grade: '11' },
      { min: '146001', max: '155000', grade: '12' },
      { min: '155001', max: '165000', grade: '13' },
      { min: '165001', max: '175000', grade: '14' },
      { min: '175001', max: '185000', grade: '15' },
      { min: '185001', max: '195000', grade: '16' },
      { min: '195001', max: '210000', grade: '17' },
      { min: '210001', max: '230000', grade: '18' },
      { min: '230001', max: '250000', grade: '19' },
      { min: '250001', max: '270000', grade: '20' },
      { min: '270001', max: '290000', grade: '21' },
      { min: '290001', max: '310000', grade: '22' },
      { min: '310001', max: '330000', grade: '23' },
      { min: '330001', max: '350000', grade: '24' },
      { min: '350001', max: '370000', grade: '25' },
      { min: '370001', max: '395000', grade: '26' },
      { min: '395001', max: '425000', grade: '27' },
      { min: '425001', max: '455000', grade: '28' },
      { min: '455001', max: '485000', grade: '29' },
      { min: '485001', max: '515000', grade: '30' },
      { min: '515001', max: '545000', grade: '31' },
    ];

    // 厚生年金は31級が最高（標準報酬月額の上限は62万円、賞与は150万円が上限）
    for (const item of gradeTable) {
      // SocialInsuranceCalculatorを使用したDecimal文字列比較
      if (
        SocialInsuranceCalculator.compare(amount, item.min) >= 0 &&
        SocialInsuranceCalculator.compare(amount, item.max) <= 0
      ) {
        return `${item.grade}級`;
      }
    }

    // 31級を超える場合（厚生年金の賞与上限150万円まで）
    if (SocialInsuranceCalculator.compare(amount, '1500000') <= 0) {
      return '31級';
    }

    return '31級'; // 最高等級
  }

  /**
   * 戻るボタン
   */
  goBack() {
    this.router.navigate(['/']);
  }

  /**
   * 賞与データの取り込み（簡略化版）
   */
  async importBonusData() {
    if (!this.employeeInfo) {
      this.errorMessage = '従業員情報が読み込まれていません';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';
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

      if (bonusHistory.length > 0) {
        this.limitNotes.unshift(`✅ ${bonusHistory.length}件の賞与データを取得しました`);
        await this.loadSavedBonusData();
      } else {
        this.errorMessage = '指定年度の賞与データが見つかりませんでした';
      }
    } catch (error) {
      console.error('賞与データ取り込みエラー:', error);
      this.errorMessage = '賞与データの取り込みに失敗しました';
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 支給予定日の推定
   */
  estimatePaymentDate(month: bigint): string {
    const today = new Date();
    const currentYear = BigInt(today.getFullYear());

    // 月をnumberに変換して日付計算
    const monthNum = Number(month);
    const yearNum = Number(currentYear);

    // 月末日を取得
    const lastDay = new Date(yearNum, monthNum, 0).getDate();

    return `${currentYear}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
  }

  /**
   * 金額フォーマット（表示用）
   */
  formatAmount(amount: string): string {
    if (!amount || amount === '0') return '0';

    // Decimal文字列を数値として表示フォーマット
    try {
      const num = parseFloat(amount);
      return num.toLocaleString('ja-JP');
    } catch {
      return amount;
    }
  }

  /**
   * パーセント表示フォーマット
   */
  formatPercentage(rate: string): string {
    if (!rate || rate === '0') return '0.00%';

    try {
      const num = parseFloat(rate);
      return `${num.toFixed(2)}%`;
    } catch {
      return `${rate}%`;
    }
  }

  /**
   * 年度表示フォーマット
   */
  formatFiscalYear(fiscalYear: bigint): string {
    return `${fiscalYear}年度`;
  }

  /**
   * 年度変更
   */
  changeYear(delta: bigint) {
    this.targetYear = this.targetYear + delta;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { year: this.targetYear.toString() },
      queryParamsHandling: 'merge',
    });
    this.loadSavedBonusData();
  }

  /**
   * 前年度へ
   */
  previousYear() {
    this.changeYear(-1n);
  }

  /**
   * 次年度へ
   */
  nextYear() {
    this.changeYear(1n);
  }

  /**
   * 現在年度へ
   */
  currentYear() {
    const currentFiscalYear = this.bonusCalculationService.getFiscalYear(
      new Date().toISOString().split('T')[0]
    );
    this.targetYear = currentFiscalYear;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { year: this.targetYear.toString() },
      queryParamsHandling: 'merge',
    });
    this.loadSavedBonusData();
  }

  /**
   * 保存されたデータの読み込み（簡略化版）
   */
  async loadSavedBonusData() {
    if (!this.employeeInfo) {
      console.log('従業員情報が未読み込みのため、保存データ読み込みをスキップ');
      return;
    }

    try {
      console.log('賞与履歴データ読み込み開始:', this.targetYear);

      // 賞与履歴データを直接取得
      const bonusHistory = await this.bonusCalculationService.getFiscalYearBonusHistory(
        this.employeeId,
        this.targetYear,
        this.employeeInfo.companyId
      );

      console.log('取得した賞与履歴:', bonusHistory);

      // 既存のデータリストをクリア
      this.bonusDataList = [];
      this.hasLimitApplied = false;
      this.limitNotes = [];

      // データが取得できなかった場合の処理
      if (!bonusHistory || bonusHistory.length === 0) {
        console.log('賞与履歴データはありません');
        return;
      }

      // UI表示用にデータを変換
      for (const bonus of bonusHistory) {
        try {
          // 支給年月日の推定
          const paymentDate = bonus.paymentDate || this.estimatePaymentDate(bonus.month);

          this.bonusDataList.push({
            paymentDate: paymentDate,
            amount: bonus.amount,
            type: bonus.type,
            month: bonus.month,
            year: bonus.year,
            calculationResult: undefined, // 計算結果は別途実装が必要
          });
        } catch (itemError) {
          console.error('個別データ変換エラー:', itemError, bonus);
        }
      }

      if (this.bonusDataList.length > 0) {
        console.log('賞与履歴データ表示完了:', this.bonusDataList);
      } else {
        console.log('表示可能なデータがありませんでした');
      }
    } catch (error) {
      console.error('賞与履歴データ読み込みエラー:', error);
      this.errorMessage = 'データの読み込みに問題が発生しました。';
    }
  }

  /**
   * 年度変更時の処理
   */
  async onYearChange() {
    if (this.employeeInfo) {
      console.log('年度変更:', this.targetYear);
      await this.loadSavedBonusData();
    }
  }
}
