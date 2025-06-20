import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
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
  healthInsuranceGrade?: string;
  pensionInsuranceGrade?: string;
}

interface GradeTableItem {
  salaryRange?: string;
  standardSalary?: string;
  grade?: string;
  nonNursingTotal?: string;
  nonNursingHalf?: string;
  nursingTotal?: string;
  nursingHalf?: string;
  pensionTotal?: string;
  pensionHalf?: string;
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
  gradeBasedResult: object | null = null;
  comparisonResult: object | null = null;

  private firestore = getFirestore();

  // 等級データのキャッシュ
  private healthInsuranceGradeCache = new Map<string, GradeTableItem[]>();
  private pensionInsuranceGradeCache = new Map<string, GradeTableItem[]>();

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
   * 健康保険等級の取得（Firestoreから年度・都道府県別に取得）
   */
  async getHealthInsuranceGradeFromFirestore(amount: string): Promise<string> {
    console.log('🏥🏥🏥 健康保険等級メソッド開始 - 金額:', amount);

    if (amount === '0') {
      console.log('⚠️ 健康保険等級取得: 金額が0のため処理終了');
      return '-';
    }

    if (!this.employeeInfo) {
      // console.log('健康保険等級取得: 従業員情報が未設定のため処理終了');
      return '-';
    }

    try {
      const normalizedPrefecture = this.normalizePrefectureName(
        this.employeeInfo.addressPrefecture
      );
      const cacheKey = `${this.targetYear}_${normalizedPrefecture}`;
      console.log('健康保険等級取得 - キャッシュキー:', cacheKey);

      // キャッシュから取得を試行
      let gradeTable = this.healthInsuranceGradeCache.get(cacheKey);

      if (!gradeTable) {
        // Firestoreから等級データを取得
        const docPath = `insurance_rates/${this.targetYear.toString()}/prefectures/${normalizedPrefecture}/rate_table/main`;
        console.log('健康保険等級データ取得パス:', docPath);

        const docRef = doc(this.firestore, docPath);
        const docSnap = await getDoc(docRef);

        console.log('健康保険等級データ存在確認:', docSnap.exists());

        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log('取得した健康保険等級データ:', data);

          // 健康保険等級テーブルの取得（複数のフィールド名を試行）
          gradeTable =
            (data['healthInsuranceTable'] as GradeTableItem[]) ||
            (data['insuranceTable'] as GradeTableItem[]) ||
            [];

          console.log('健康保険等級テーブル:', gradeTable.length, '件');
          console.log('利用可能なフィールド:', Object.keys(data));

          // 使用したフィールド名を確認
          if (data['healthInsuranceTable']) {
            console.log('✅ healthInsuranceTableフィールドを使用');
          } else if (data['insuranceTable']) {
            console.log('✅ insuranceTableフィールドを使用');
          } else {
            console.log('❌ 適切なフィールドが見つからない');
          }

          // キャッシュに保存
          this.healthInsuranceGradeCache.set(cacheKey, gradeTable);
        } else {
          console.warn('等級データが見つかりません:', cacheKey, 'パス:', docPath);

          // フォールバック: 2024年度のデータを試行
          const fallbackDocPath = `insurance_rates/2024/prefectures/${normalizedPrefecture}/rate_table/main`;
          console.log('フォールバック等級データ取得パス:', fallbackDocPath);

          const fallbackDocRef = doc(this.firestore, fallbackDocPath);
          const fallbackDocSnap = await getDoc(fallbackDocRef);

          if (fallbackDocSnap.exists()) {
            const fallbackData = fallbackDocSnap.data();
            console.log('フォールバック等級データ取得成功:', fallbackData);
            gradeTable =
              (fallbackData['healthInsuranceTable'] as GradeTableItem[]) ||
              (fallbackData['insuranceTable'] as GradeTableItem[]) ||
              [];
            this.healthInsuranceGradeCache.set(cacheKey, gradeTable);
          } else {
            console.error('フォールバック等級データも見つかりません');
            return '-';
          }
        }
      } else {
        console.log('健康保険等級データをキャッシュから取得:', gradeTable.length, '件');
      }

      // 等級を検索
      if (gradeTable) {
        console.log(`🏥 健康保険等級判定開始: ${amount}円`);

        // 40級～45級のデータを詳しく確認
        const grades40to45 = gradeTable.filter((item) => {
          const grade = parseInt(item.grade || '0');
          return grade >= 40 && grade <= 45;
        });

        console.log('🏥 40級～45級のFirestoreデータ:');
        grades40to45.forEach((item) => {
          console.log(
            `🏥 等級${item.grade}: 範囲="${item.salaryRange}", 標準="${item.standardSalary}"`
          );
        });

        // 926,500円の判定に関連する等級を特別にチェック
        if (amount === '926500') {
          console.log('🔍 926,500円の詳細判定開始');
          const relevantGrades = gradeTable.filter((item) => {
            const grade = parseInt(item.grade || '0');
            return grade >= 41 && grade <= 43;
          });
          console.log('🔍 41-43級の詳細データ:', relevantGrades);
        }

        for (const item of gradeTable) {
          const salaryRange = item.salaryRange || '';
          const standardSalary = item.standardSalary || '';
          const grade = item.grade || '';

          // 全等級のチェック状況を表示
          console.log(
            `🏥 等級${grade}チェック中 - 範囲:"${salaryRange}", 標準:"${standardSalary}"`
          );

          // 判定条件の詳細を表示
          if (standardSalary) {
            const cleanStandardSalary = standardSalary.replace(/,/g, '');
            const standardMatch =
              SocialInsuranceCalculator.compare(amount, cleanStandardSalary) === 0;
            console.log(
              `🏥 等級${grade} 標準額判定: ${amount} === ${cleanStandardSalary} → ${standardMatch}`
            );
          }

          if (salaryRange && (salaryRange.includes('~') || salaryRange.includes('～'))) {
            const separator = salaryRange.includes('～') ? '～' : '~';
            const [minStr, maxStr] = salaryRange.split(separator).map((s: string) => s.trim());
            if (minStr) {
              const cleanMinStr = minStr.replace(/,/g, '');
              const cleanMaxStr = maxStr ? maxStr.replace(/,/g, '') : '';
              const minCheck = SocialInsuranceCalculator.compare(amount, cleanMinStr) >= 0;
              const maxCheck = cleanMaxStr
                ? SocialInsuranceCalculator.compare(amount, cleanMaxStr) <= 0
                : true;
              console.log(
                `🏥 等級${grade} 範囲判定: ${amount} >= ${cleanMinStr} → ${minCheck}, ${amount} <= ${cleanMaxStr} → ${maxCheck}`
              );
            }
          }

          // 標準報酬月額と一致するかチェック（カンマを除去して比較）
          if (standardSalary) {
            const cleanStandardSalary = standardSalary.replace(/,/g, '');
            if (SocialInsuranceCalculator.compare(amount, cleanStandardSalary) === 0) {
              console.log(`✅ 健康保険等級決定: ${grade}級 (標準額一致: ${amount})`);
              return `${grade}級`;
            }
          }

          // 範囲内かチェック（複数の区切り文字に対応）
          if (salaryRange && (salaryRange.includes('~') || salaryRange.includes('～'))) {
            // 日本語の波ダッシュ（～）と英語のチルダ（~）の両方に対応
            const separator = salaryRange.includes('～') ? '～' : '~';
            const [minStr, maxStr] = salaryRange.split(separator).map((s: string) => s.trim());

            if (minStr) {
              // カンマを除去して数値比較
              const cleanMinStr = minStr.replace(/,/g, '');
              const cleanMaxStr = maxStr ? maxStr.replace(/,/g, '') : '';

              // 最低額以上であることを確認
              if (SocialInsuranceCalculator.compare(amount, cleanMinStr) >= 0) {
                // 上限がある場合は上限以下であることも確認
                if (cleanMaxStr && cleanMaxStr !== '') {
                  if (SocialInsuranceCalculator.compare(amount, cleanMaxStr) <= 0) {
                    console.log(`✅ 健康保険等級決定: ${grade}級 (範囲内: ${minStr}～${maxStr})`);
                    return `${grade}級`;
                  }
                } else {
                  // 上限がない場合（最高等級）は最低額以上であればOK
                  console.log(`✅ 健康保険等級決定: ${grade}級 (最高等級: ${minStr}以上)`);
                  return `${grade}級`;
                }
              }
            }
          }
        }
      }

      console.log('❌ 健康保険等級: 該当する等級が見つかりませんでした (金額:', amount, ')');
      return '-';
    } catch (error) {
      console.error('健康保険等級取得エラー:', error);
      return '-';
    }
  }

  /**
   * 等級ベースで健康保険料を取得
   */
  async getHealthInsurancePremiumByGrade(
    amount: string,
    employeeAge: bigint
  ): Promise<{
    employeeBurden: string;
    companyBurden: string;
    total: string;
  }> {
    try {
      if (!this.employeeInfo) {
        return { employeeBurden: '0', companyBurden: '0', total: '0' };
      }

      const normalizedPrefecture = this.normalizePrefectureName(
        this.employeeInfo.addressPrefecture
      );
      const cacheKey = `${this.targetYear}_${normalizedPrefecture}`;

      // キャッシュから取得を試行
      let gradeTable = this.healthInsuranceGradeCache.get(cacheKey);

      if (!gradeTable) {
        // Firestoreから等級データを取得
        const docPath = `insurance_rates/${this.targetYear.toString()}/prefectures/${normalizedPrefecture}/rate_table/main`;
        const docRef = doc(this.firestore, docPath);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          gradeTable = (data['insuranceTable'] as GradeTableItem[]) || [];
          this.healthInsuranceGradeCache.set(cacheKey, gradeTable);
        } else {
          return { employeeBurden: '0', companyBurden: '0', total: '0' };
        }
      }

      // 等級を判定
      for (const item of gradeTable) {
        const salaryRange = item.salaryRange || '';

        if (salaryRange && (salaryRange.includes('~') || salaryRange.includes('～'))) {
          const separator = salaryRange.includes('～') ? '～' : '~';
          const [minStr, maxStr] = salaryRange.split(separator).map((s: string) => s.trim());

          if (minStr) {
            const cleanMinStr = minStr.replace(/,/g, '');
            const cleanMaxStr = maxStr ? maxStr.replace(/,/g, '') : '';

            // 範囲内かチェック
            if (SocialInsuranceCalculator.compare(amount, cleanMinStr) >= 0) {
              if (cleanMaxStr && cleanMaxStr !== '') {
                if (SocialInsuranceCalculator.compare(amount, cleanMaxStr) <= 0) {
                  // 40歳以上は介護保険対象
                  const isNursingTarget = employeeAge >= 40n;
                  const employeeBurden = isNursingTarget
                    ? item.nursingHalf || '0'
                    : item.nonNursingHalf || '0';
                  const total = isNursingTarget
                    ? item.nursingTotal || '0'
                    : item.nonNursingTotal || '0';
                  const companyBurden = SocialInsuranceCalculator.subtract(total, employeeBurden);

                  console.log(
                    `💰 等級${item.grade}の保険料取得: 従業員${employeeBurden}円, 会社${companyBurden}円, 合計${total}円`
                  );

                  return {
                    employeeBurden,
                    companyBurden,
                    total,
                  };
                }
              } else {
                // 最高等級
                const isNursingTarget = employeeAge >= 40n;
                const employeeBurden = isNursingTarget
                  ? item.nursingHalf || '0'
                  : item.nonNursingHalf || '0';
                const total = isNursingTarget
                  ? item.nursingTotal || '0'
                  : item.nonNursingTotal || '0';
                const companyBurden = SocialInsuranceCalculator.subtract(total, employeeBurden);

                return {
                  employeeBurden,
                  companyBurden,
                  total,
                };
              }
            }
          }
        }
      }

      console.log('❌ 該当する等級が見つかりませんでした');
      return { employeeBurden: '0', companyBurden: '0', total: '0' };
    } catch (error) {
      console.error('等級ベース保険料取得エラー:', error);
      return { employeeBurden: '0', companyBurden: '0', total: '0' };
    }
  }

  /**
   * 厚生年金等級の取得（Firestoreから年度・都道府県別に取得）
   */
  async getPensionInsuranceGradeFromFirestore(amount: string): Promise<string> {
    console.log('厚生年金等級取得開始 - 入力金額:', amount);

    if (amount === '0') {
      console.log('厚生年金等級取得: 金額が0のため処理終了');
      return '-';
    }

    if (!this.employeeInfo) {
      console.log('厚生年金等級取得: 従業員情報が未設定のため処理終了');
      return '-';
    }

    try {
      const normalizedPrefecture = this.normalizePrefectureName(
        this.employeeInfo.addressPrefecture
      );
      const cacheKey = `${this.targetYear}_${normalizedPrefecture}`;
      console.log('厚生年金等級取得 - キャッシュキー:', cacheKey);

      // キャッシュから取得を試行
      let gradeTable = this.pensionInsuranceGradeCache.get(cacheKey);

      if (!gradeTable) {
        // Firestoreから等級データを取得
        const docPath = `insurance_rates/${this.targetYear.toString()}/prefectures/${normalizedPrefecture}/rate_table/main`;
        console.log('厚生年金等級データ取得パス:', docPath);

        const docRef = doc(this.firestore, docPath);
        const docSnap = await getDoc(docRef);

        console.log('厚生年金等級データ存在確認:', docSnap.exists());

        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log('取得した厚生年金等級データ:', data);
          gradeTable = (data['pensionTable'] as GradeTableItem[]) || [];
          console.log('厚生年金等級テーブル:', gradeTable.length, '件');

          // キャッシュに保存
          this.pensionInsuranceGradeCache.set(cacheKey, gradeTable);
        } else {
          console.warn('等級データが見つかりません:', cacheKey, 'パス:', docPath);

          // フォールバック: 2024年度のデータを試行
          const fallbackDocPath = `insurance_rates/2024/prefectures/${normalizedPrefecture}/rate_table/main`;
          console.log('フォールバック等級データ取得パス:', fallbackDocPath);

          const fallbackDocRef = doc(this.firestore, fallbackDocPath);
          const fallbackDocSnap = await getDoc(fallbackDocRef);

          if (fallbackDocSnap.exists()) {
            const fallbackData = fallbackDocSnap.data();
            console.log('フォールバック等級データ取得成功:', fallbackData);
            gradeTable = (fallbackData['pensionTable'] as GradeTableItem[]) || [];
            this.pensionInsuranceGradeCache.set(cacheKey, gradeTable);
          } else {
            console.error('フォールバック等級データも見つかりません');
            return '-';
          }
        }
      } else {
        console.log('厚生年金等級データをキャッシュから取得:', gradeTable.length, '件');
      }

      // 等級を検索（厚生年金は上限なし、Firestoreのデータに従う）
      if (gradeTable) {
        console.log('厚生年金等級検索開始 - 対象金額:', amount);

        for (const item of gradeTable) {
          const salaryRange = item.salaryRange || '';
          const standardSalary = item.standardSalary || '';
          const grade = item.grade || '';

          console.log(`等級${grade}をチェック - 範囲:${salaryRange}, 標準:${standardSalary}`);

          // 標準報酬月額と一致するかチェック（カンマを除去して比較）
          if (standardSalary) {
            const cleanStandardSalary = standardSalary.replace(/,/g, '');
            if (SocialInsuranceCalculator.compare(amount, cleanStandardSalary) === 0) {
              console.log(`厚生年金等級決定（標準一致）: ${grade}級`);
              return `${grade}級`;
            }
          }

          // 範囲内かチェック（複数の区切り文字に対応）
          if (salaryRange && (salaryRange.includes('~') || salaryRange.includes('～'))) {
            // 日本語の波ダッシュ（～）と英語のチルダ（~）の両方に対応
            const separator = salaryRange.includes('～') ? '～' : '~';
            const [minStr, maxStr] = salaryRange.split(separator).map((s: string) => s.trim());
            if (minStr) {
              // カンマを除去して数値比較
              const cleanMinStr = minStr.replace(/,/g, '');
              const cleanMaxStr = maxStr ? maxStr.replace(/,/g, '') : '';

              console.log(
                `範囲チェック: ${amount} が ${cleanMinStr} ~ ${cleanMaxStr || '上限なし'} の範囲内か`
              );

              // 最低額以上であることを確認
              if (SocialInsuranceCalculator.compare(amount, cleanMinStr) >= 0) {
                // 上限がある場合は上限以下であることも確認
                if (cleanMaxStr && cleanMaxStr !== '') {
                  if (SocialInsuranceCalculator.compare(amount, cleanMaxStr) <= 0) {
                    console.log(`厚生年金等級決定（範囲一致）: ${grade}級`);
                    return `${grade}級`;
                  }
                } else {
                  // 上限がない場合（最高等級）は最低額以上であればOK
                  console.log(`厚生年金等級決定（最高等級）: ${grade}級`);
                  return `${grade}級`;
                }
              }
            }
          }
        }

        // 最高等級を超える場合は最高等級を返す
        if (gradeTable.length > 0) {
          const highestGrade = gradeTable[gradeTable.length - 1];
          console.log(`厚生年金等級: 最高等級として${highestGrade.grade}級を返す`);
          return `${highestGrade.grade}級`;
        }
      }

      console.log('厚生年金等級: 該当する等級が見つかりませんでした');
      return '-';
    } catch (error) {
      console.error('厚生年金等級取得エラー:', error);
      return '-';
    }
  }

  /**
   * 都道府県名の正規化（Firestore用）
   */
  private normalizePrefectureName(prefecture: string): string {
    // 「東京都」→「東京」、「大阪府」→「大阪」、「京都府」→「京都」、「北海道」→「北海道」
    return prefecture.replace('都', '').replace('府', '').replace('県', '');
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

      // データを変換してBonusDataItem形式に設定
      this.bonusDataList = await Promise.all(
        bonusHistory.map(async (item) => {
          try {
            // paymentDateのnullチェック
            const paymentDateStr = item.paymentDate || this.estimatePaymentDate(item.month);
            const paymentDate = new Date(paymentDateStr);
            const month = BigInt(paymentDate.getMonth() + 1);
            const year = BigInt(paymentDate.getFullYear());

            // 等級ベースで健康保険料を取得
            const gradePremiums = await this.getHealthInsurancePremiumByGrade(
              item.amount,
              this.employeeInfo!.age
            );

            // 等級ベースで厚生年金保険料を取得
            const pensionPremiums = await this.getPensionInsurancePremiumByGrade(item.amount);

            // 各賞与データに対して保険料計算を実行
            const calculationResult =
              await this.bonusCalculationService.calculateAndSaveBonusInsurance(
                this.employeeId,
                item.amount,
                paymentDateStr,
                item.type,
                this.employeeInfo!.age,
                this.employeeInfo!.addressPrefecture,
                this.employeeInfo!.companyId
              );

            // 計算結果をコンポーネント用の形式に変換（等級ベース保険料を使用）
            const componentResult: BonusCalculationResult = {
              standardBonusAmountHealth:
                calculationResult.calculationResult.standardBonusAmountHealth,
              standardBonusAmountPension:
                calculationResult.calculationResult.standardBonusAmountPension,
              healthInsurance: {
                employeeBurden: gradePremiums.employeeBurden,
                companyBurden: gradePremiums.companyBurden,
              },
              careInsurance: calculationResult.calculationResult.careInsurancePremium
                ? {
                    employeeBurden: SocialInsuranceCalculator.divide(
                      calculationResult.calculationResult.careInsurancePremium,
                      '2'
                    ),
                    companyBurden: SocialInsuranceCalculator.divide(
                      calculationResult.calculationResult.careInsurancePremium,
                      '2'
                    ),
                  }
                : undefined,
              pensionInsurance: {
                employeeBurden: pensionPremiums.employeeBurden,
                companyBurden: pensionPremiums.companyBurden,
              },
              totalEmployeeBurden: calculationResult.calculationResult.employeeBurden,
              totalCompanyBurden: calculationResult.calculationResult.companyBurden,
              limitInfo: {
                isHealthLimitApplied: calculationResult.limitResult.isHealthLimitApplied,
                isPensionLimitApplied: calculationResult.limitResult.isPensionLimitApplied,
              },
            };

            // 等級を計算（生の賞与額を直接使用）
            const healthInsuranceGrade = await this.getHealthInsuranceGradeFromFirestore(
              item.amount
            );
            const pensionInsuranceGrade = await this.getPensionInsuranceGradeFromFirestore(
              item.amount
            );

            const bonusDataItem = {
              paymentDate: paymentDateStr,
              amount: item.amount,
              type: item.type,
              month: month,
              year: year,
              calculationResult: componentResult,
              healthInsuranceGrade: healthInsuranceGrade,
              pensionInsuranceGrade: pensionInsuranceGrade,
            };

            return bonusDataItem;
          } catch (error) {
            console.error('個別賞与計算エラー:', error, item);
            // エラーの場合は計算結果なしで返す
            const paymentDateStr = item.paymentDate || this.estimatePaymentDate(item.month);
            const paymentDate = new Date(paymentDateStr);
            const month = BigInt(paymentDate.getMonth() + 1);
            const year = BigInt(paymentDate.getFullYear());

            return {
              paymentDate: paymentDateStr,
              amount: item.amount,
              type: item.type,
              month: month,
              year: year,
              calculationResult: undefined,
              healthInsuranceGrade: '-',
              pensionInsuranceGrade: '-',
            };
          }
        })
      );

      if (this.bonusDataList.length > 0) {
        console.log('賞与履歴データ表示完了:', this.bonusDataList.length, '件');
        this.bonusDataList.forEach((item, index) => {
          console.log(`賞与データ[${index}]:`, {
            paymentDate: item.paymentDate,
            amount: item.amount,
            healthInsuranceGrade: item.healthInsuranceGrade,
            pensionInsuranceGrade: item.pensionInsuranceGrade,
            hasCalculationResult: !!item.calculationResult,
          });
        });
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

  /**
   * 厚生年金保険料を等級から取得
   */
  async getPensionInsurancePremiumByGrade(amount: string): Promise<{
    employeeBurden: string;
    companyBurden: string;
    total: string;
  }> {
    console.log('厚生年金保険料取得開始 - 入力金額:', amount);

    if (amount === '0') {
      console.log('厚生年金保険料取得: 金額が0のため処理終了');
      return {
        employeeBurden: '0',
        companyBurden: '0',
        total: '0',
      };
    }

    if (!this.employeeInfo) {
      console.log('厚生年金保険料取得: 従業員情報が未設定のため処理終了');
      return {
        employeeBurden: '0',
        companyBurden: '0',
        total: '0',
      };
    }

    try {
      const normalizedPrefecture = this.normalizePrefectureName(
        this.employeeInfo.addressPrefecture
      );
      const cacheKey = `${this.targetYear}_${normalizedPrefecture}`;
      console.log('厚生年金保険料取得 - キャッシュキー:', cacheKey);

      // キャッシュから取得を試行
      let gradeTable = this.pensionInsuranceGradeCache.get(cacheKey);

      if (!gradeTable) {
        // Firestoreから等級データを取得
        const docPath = `insurance_rates/${this.targetYear.toString()}/prefectures/${normalizedPrefecture}/rate_table/main`;
        console.log('厚生年金保険料データ取得パス:', docPath);

        const docRef = doc(this.firestore, docPath);
        const docSnap = await getDoc(docRef);

        console.log('厚生年金保険料データ存在確認:', docSnap.exists());

        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log('取得した厚生年金保険料データ:', data);
          gradeTable = (data['pensionTable'] as GradeTableItem[]) || [];
          console.log('厚生年金保険料テーブル:', gradeTable.length, '件');

          // キャッシュに保存
          this.pensionInsuranceGradeCache.set(cacheKey, gradeTable);
        } else {
          console.warn('厚生年金保険料データが見つかりません:', cacheKey, 'パス:', docPath);

          // フォールバック: 2024年度のデータを試行
          const fallbackDocPath = `insurance_rates/2024/prefectures/${normalizedPrefecture}/rate_table/main`;
          console.log('フォールバック厚生年金保険料データ取得パス:', fallbackDocPath);

          const fallbackDocRef = doc(this.firestore, fallbackDocPath);
          const fallbackDocSnap = await getDoc(fallbackDocRef);

          if (fallbackDocSnap.exists()) {
            const fallbackData = fallbackDocSnap.data();
            console.log('フォールバック厚生年金保険料データ取得成功:', fallbackData);
            gradeTable = (fallbackData['pensionTable'] as GradeTableItem[]) || [];
            this.pensionInsuranceGradeCache.set(cacheKey, gradeTable);
          } else {
            console.error('フォールバック厚生年金保険料データも見つかりません');
            return {
              employeeBurden: '0',
              companyBurden: '0',
              total: '0',
            };
          }
        }
      } else {
        console.log('厚生年金保険料データをキャッシュから取得:', gradeTable.length, '件');
      }

      // 等級を検索して保険料を取得
      if (gradeTable) {
        console.log('厚生年金保険料検索開始 - 対象金額:', amount);

        for (const item of gradeTable) {
          const salaryRange = item.salaryRange || '';
          const standardSalary = item.standardSalary || '';
          const grade = item.grade || '';
          const pensionTotal = item.pensionTotal || '0';
          const pensionHalf = item.pensionHalf || '0';

          console.log(
            `等級${grade}をチェック - 範囲:${salaryRange}, 標準:${standardSalary}, 保険料合計:${pensionTotal}, 保険料半額:${pensionHalf}`
          );

          // 標準報酬月額と一致するかチェック（カンマを除去して比較）
          if (standardSalary) {
            const cleanStandardSalary = standardSalary.replace(/,/g, '');
            if (SocialInsuranceCalculator.compare(amount, cleanStandardSalary) === 0) {
              console.log(
                `厚生年金保険料決定（標準一致）: ${grade}級 - 保険料合計:${pensionTotal}, 保険料半額:${pensionHalf}`
              );
              return {
                employeeBurden: pensionHalf,
                companyBurden: pensionHalf,
                total: pensionTotal,
              };
            }
          }

          // 範囲内かチェック（複数の区切り文字に対応）
          if (salaryRange && (salaryRange.includes('~') || salaryRange.includes('～'))) {
            // 日本語の波ダッシュ（～）と英語のチルダ（~）の両方に対応
            const separator = salaryRange.includes('～') ? '～' : '~';
            const [minStr, maxStr] = salaryRange.split(separator).map((s: string) => s.trim());
            if (minStr) {
              // カンマを除去して数値比較
              const cleanMinStr = minStr.replace(/,/g, '');
              const cleanMaxStr = maxStr ? maxStr.replace(/,/g, '') : '';

              console.log(
                `範囲チェック: ${amount} が ${cleanMinStr} ~ ${cleanMaxStr || '上限なし'} の範囲内か`
              );

              // 最低額以上であることを確認
              if (SocialInsuranceCalculator.compare(amount, cleanMinStr) >= 0) {
                // 上限がある場合は上限以下であることも確認
                if (cleanMaxStr && cleanMaxStr !== '') {
                  if (SocialInsuranceCalculator.compare(amount, cleanMaxStr) <= 0) {
                    console.log(
                      `厚生年金保険料決定（範囲一致）: ${grade}級 - 保険料合計:${pensionTotal}, 保険料半額:${pensionHalf}`
                    );
                    return {
                      employeeBurden: pensionHalf,
                      companyBurden: pensionHalf,
                      total: pensionTotal,
                    };
                  }
                } else {
                  // 上限がない場合（最高等級）は最低額以上であればOK
                  console.log(
                    `厚生年金保険料決定（最高等級）: ${grade}級 - 保険料合計:${pensionTotal}, 保険料半額:${pensionHalf}`
                  );
                  return {
                    employeeBurden: pensionHalf,
                    companyBurden: pensionHalf,
                    total: pensionTotal,
                  };
                }
              }
            }
          }
        }

        // 最高等級を超える場合は最高等級の保険料を返す
        if (gradeTable.length > 0) {
          const highestGrade = gradeTable[gradeTable.length - 1];
          const pensionTotal = highestGrade.pensionTotal || '0';
          const pensionHalf = highestGrade.pensionHalf || '0';
          console.log(
            `厚生年金保険料: 最高等級として${highestGrade.grade}級の保険料を返す - 保険料合計:${pensionTotal}, 保険料半額:${pensionHalf}`
          );
          return {
            employeeBurden: pensionHalf,
            companyBurden: pensionHalf,
            total: pensionTotal,
          };
        }
      }

      console.log('厚生年金保険料: 該当する等級が見つかりませんでした');
      return {
        employeeBurden: '0',
        companyBurden: '0',
        total: '0',
      };
    } catch (error) {
      console.error('厚生年金保険料取得エラー:', error);
      return {
        employeeBurden: '0',
        companyBurden: '0',
        total: '0',
      };
    }
  }
}
