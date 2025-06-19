import { Injectable } from '@angular/core';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  getDocs,
  orderBy,
} from 'firebase/firestore';
import { SocialInsuranceCalculator } from '../utils/decimal-calculator';

// データモデル定義
export interface FirestoreSalaryData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  salaryTable?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface BonusHistoryItem {
  type: string;
  amount: number;
  month: number;
  year: number;
  originalKey: string;
  fiscalYear?: number;
  paymentDate?: string;
}

export interface BonusPayment {
  paymentId: string;
  employeeId: string;
  paymentDate: string; // YYYY-MM-DD
  bonusAmount: number;
  paymentCountType: 'UNDER_3_TIMES' | 'OVER_4_TIMES';
  bonusType: string; // 'summer', 'winter', 'settlement', 'other'
  fiscalYear: number; // 会計年度（4月-3月）
  createdAt: Date;
  updatedAt: Date;
}

export interface BonusCalculationResult {
  resultId: string;
  paymentId: string;
  employeeId: string;
  standardBonusAmountHealth: number; // 健康保険の標準賞与額
  standardBonusAmountPension: number; // 厚生年金の標準賞与額
  healthInsurancePremium: number;
  careInsurancePremium?: number; // 40歳以上のみ
  pensionInsurancePremium: number;
  childRearingContribution: number; // 子ども・子育て拠出金
  employeeBurden: number; // 個人負担額合計
  companyBurden: number; // 会社負担額合計
  totalPremium: number; // 保険料総額
  calculationSnapshot: string; // JSON形式の計算詳細
  createdAt: Date;
}

export interface FiscalYearBonusTotal {
  employeeId: string;
  fiscalYear: number;
  totalStandardBonusAmount: number;
  lastUpdated: Date;
}

export interface InsuranceRates {
  year: number;
  prefecture: string;
  healthInsuranceRate: number;
  careInsuranceRate: number;
  pensionInsuranceRate: number;
  childRearingContributionRate: number;
  effectiveDate: string;
}

export interface BonusInsurancePremiums {
  healthPremium: number;
  carePremium: number;
  pensionPremium: number;
  childRearingContribution: number;
  employeeBurden: number;
  companyBurden: number;
  totalPremium: number;
}

export interface BonusLimitResult {
  healthInsuranceAmount: number;
  pensionInsuranceAmount: number;
  isHealthLimitApplied: boolean;
  isPensionLimitApplied: boolean;
  fiscalYearTotalBefore: number;
  fiscalYearTotalAfter: number;
}

export interface CalculationSnapshot {
  calculationType: 'BONUS_UNDER_3_TIMES' | 'BONUS_OVER_4_TIMES';
  inputData: {
    originalBonusAmount: number;
    paymentDate: string;
    paymentCountType: string;
    bonusType: string;
  };
  calculationDetails: {
    standardBonusAmount: number;
    appliedLimits: {
      healthInsuranceLimit: boolean;
      pensionInsuranceLimit: boolean;
    };
    appliedRates: InsuranceRates;
    fiscalYearTotalBefore: number;
    fiscalYearTotalAfter: number;
  };
  results: BonusInsurancePremiums;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root',
})
export class BonusCalculationService {
  private firestore = getFirestore();

  constructor() {
    // Firebase初期化は既にapp.config.tsで行われている
  }

  /**
   * 会計年度の取得（4月-3月）
   */
  getFiscalYear(date: string): number {
    const paymentDate = new Date(date);
    const year = paymentDate.getFullYear();
    const month = paymentDate.getMonth() + 1; // 0ベースなので+1

    // 4月以降は当年度、3月以前は前年度
    return month >= 4 ? year : year - 1;
  }

  /**
   * Step 1: 標準賞与額の決定（1,000円未満切り捨て）
   */
  calculateStandardBonusAmount(bonusAmount: number): number {
    return SocialInsuranceCalculator.floorToThousand(bonusAmount);
  }

  /**
   * Step 2: 上限額適用
   */
  async applyBonusLimits(
    employeeId: string,
    standardAmount: number,
    fiscalYear: number
  ): Promise<BonusLimitResult> {
    try {
      console.log('=== 賞与上限額適用開始 ===');
      console.log('従業員ID:', employeeId);
      console.log('標準賞与額:', standardAmount);
      console.log('会計年度:', fiscalYear);

      // 健康保険：年度累計573万円チェック
      const currentTotal = await this.getFiscalYearTotal(employeeId, fiscalYear);
      const healthLimit = 5730000; // 573万円
      const pensionLimit = 1500000; // 150万円（1回あたり）

      let healthAmount = standardAmount;
      let pensionAmount = standardAmount;
      let isHealthLimitApplied = false;
      let isPensionLimitApplied = false;

      console.log('現在の年度累計:', currentTotal);
      console.log('健康保険上限:', healthLimit);
      console.log('厚生年金上限:', pensionLimit);

      // 健康保険上限適用
      if (SocialInsuranceCalculator.compare(currentTotal + standardAmount, healthLimit) > 0) {
        healthAmount = Math.max(0, SocialInsuranceCalculator.subtract(healthLimit, currentTotal));
        isHealthLimitApplied = true;
        console.log('健康保険上限適用:', healthAmount);
      }

      // 厚生年金上限適用
      if (SocialInsuranceCalculator.compare(standardAmount, pensionLimit) > 0) {
        pensionAmount = pensionLimit;
        isPensionLimitApplied = true;
        console.log('厚生年金上限適用:', pensionAmount);
      }

      const result: BonusLimitResult = {
        healthInsuranceAmount: healthAmount,
        pensionInsuranceAmount: pensionAmount,
        isHealthLimitApplied,
        isPensionLimitApplied,
        fiscalYearTotalBefore: currentTotal,
        fiscalYearTotalAfter: SocialInsuranceCalculator.addAmounts(currentTotal, healthAmount),
      };

      console.log('上限適用結果:', result);
      return result;
    } catch (error) {
      console.error('上限額適用エラー:', error);
      throw error;
    }
  }

  /**
   * 年度累計標準賞与額の取得
   */
  private async getFiscalYearTotal(employeeId: string, fiscalYear: number): Promise<number> {
    try {
      const docRef = doc(this.firestore, 'fiscalYearBonusTotals', `${employeeId}_${fiscalYear}`);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as FiscalYearBonusTotal;
        return data.totalStandardBonusAmount || 0;
      }

      return 0;
    } catch (error) {
      console.error('年度累計取得エラー:', error);
      return 0;
    }
  }

  /**
   * 年度累計標準賞与額の更新
   */
  private async updateFiscalYearTotal(
    employeeId: string,
    fiscalYear: number,
    additionalAmount: number
  ): Promise<void> {
    try {
      const docRef = doc(this.firestore, 'fiscalYearBonusTotals', `${employeeId}_${fiscalYear}`);
      const currentTotal = await this.getFiscalYearTotal(employeeId, fiscalYear);
      const newTotal = SocialInsuranceCalculator.addAmounts(currentTotal, additionalAmount);

      const data: FiscalYearBonusTotal = {
        employeeId,
        fiscalYear,
        totalStandardBonusAmount: newTotal,
        lastUpdated: new Date(),
      };

      await setDoc(docRef, data);
      console.log('年度累計更新完了:', newTotal);
    } catch (error) {
      console.error('年度累計更新エラー:', error);
      throw error;
    }
  }

  /**
   * Step 3: 各種保険料計算（Decimal.js使用）
   */
  async calculateInsurancePremiums(
    standardAmounts: {
      healthInsuranceAmount: number;
      pensionInsuranceAmount: number;
    },
    rates: InsuranceRates,
    employeeAge: number
  ): Promise<BonusInsurancePremiums> {
    try {
      console.log('=== 保険料計算開始 ===');
      console.log('標準賞与額:', standardAmounts);
      console.log('保険料率:', rates);
      console.log('従業員年齢:', employeeAge);

      // 健康保険料
      const healthPremium = SocialInsuranceCalculator.multiplyAndFloor(
        standardAmounts.healthInsuranceAmount,
        SocialInsuranceCalculator.divide(rates.healthInsuranceRate, 100)
      );

      // 介護保険料（40歳以上のみ）
      const carePremium =
        employeeAge >= 40
          ? SocialInsuranceCalculator.multiplyAndFloor(
              standardAmounts.healthInsuranceAmount,
              SocialInsuranceCalculator.divide(rates.careInsuranceRate, 100)
            )
          : 0;

      // 厚生年金保険料
      const pensionPremium = SocialInsuranceCalculator.multiplyAndFloor(
        standardAmounts.pensionInsuranceAmount,
        SocialInsuranceCalculator.divide(rates.pensionInsuranceRate, 100)
      );

      // 子ども・子育て拠出金（全額事業主負担）
      const childRearingContribution = SocialInsuranceCalculator.multiplyAndFloor(
        standardAmounts.pensionInsuranceAmount,
        SocialInsuranceCalculator.divide(rates.childRearingContributionRate, 100)
      );

      // 個人負担額（健康保険料 + 介護保険料 + 厚生年金保険料）の半額
      const totalEmployeePremium = SocialInsuranceCalculator.addAmounts(
        SocialInsuranceCalculator.addAmounts(healthPremium, carePremium),
        pensionPremium
      );
      const employeeBurden = SocialInsuranceCalculator.divideAndFloor(totalEmployeePremium, 2);

      // 会社負担額（個人負担額 + 子ども・子育て拠出金）
      const companyBurden = SocialInsuranceCalculator.addAmounts(
        SocialInsuranceCalculator.subtract(totalEmployeePremium, employeeBurden),
        childRearingContribution
      );

      const totalPremium = SocialInsuranceCalculator.addAmounts(
        totalEmployeePremium,
        childRearingContribution
      );

      const result: BonusInsurancePremiums = {
        healthPremium,
        carePremium,
        pensionPremium,
        childRearingContribution,
        employeeBurden,
        companyBurden,
        totalPremium,
      };

      console.log('保険料計算結果:', result);
      return result;
    } catch (error) {
      console.error('保険料計算エラー:', error);
      throw error;
    }
  }

  /**
   * 保険料率の取得
   */
  async getInsuranceRates(year: number, prefecture: string): Promise<InsuranceRates> {
    try {
      console.log('=== 保険料率取得開始 ===');
      console.log('年度:', year);
      console.log('都道府県:', prefecture);

      const docRef = doc(
        this.firestore,
        'insurance_rates',
        year.toString(),
        'prefectures',
        prefecture,
        'rate_table',
        'main'
      );
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();

        // 賞与用の料率データを抽出
        const rates: InsuranceRates = {
          year,
          prefecture,
          healthInsuranceRate: data['healthInsuranceRate'] || 10.0,
          careInsuranceRate: data['careInsuranceRate'] || 1.6,
          pensionInsuranceRate: data['pensionInsuranceRate'] || 18.3,
          childRearingContributionRate: data['childRearingContributionRate'] || 0.36,
          effectiveDate: data['effectiveDate'] || `${year}-04-01`,
        };

        console.log('取得した保険料率:', rates);
        return rates;
      } else {
        console.warn('保険料率データが見つかりません。デフォルト値を使用します。');
        // デフォルト値を返す
        return {
          year,
          prefecture,
          healthInsuranceRate: 10.0,
          careInsuranceRate: 1.6,
          pensionInsuranceRate: 18.3,
          childRearingContributionRate: 0.36,
          effectiveDate: `${year}-04-01`,
        };
      }
    } catch (error) {
      console.error('保険料率取得エラー:', error);
      throw error;
    }
  }

  /**
   * 年4回以上賞与の年間集計（定時決定用）
   */
  async calculateAnnualBonusForStandardSalary(
    employeeId: string,
    targetYear: number
  ): Promise<number> {
    try {
      console.log('=== 年4回以上賞与集計開始 ===');
      console.log('従業員ID:', employeeId);
      console.log('対象年度:', targetYear);

      // 前年7月1日〜当年6月30日の集計
      const startDate = `${targetYear - 1}-07-01`;
      const endDate = `${targetYear}-06-30`;

      const bonusPayments = await this.getAnnualBonusPayments(
        employeeId,
        startDate,
        endDate,
        'OVER_4_TIMES'
      );

      const totalAmount = bonusPayments.reduce(
        (sum, payment) => SocialInsuranceCalculator.addAmounts(sum, payment.bonusAmount),
        0
      );

      // 12で割って月割り額を計算
      const monthlyAmount = SocialInsuranceCalculator.divideAndFloor(totalAmount, 12);

      console.log('年間賞与合計:', totalAmount);
      console.log('月割り額:', monthlyAmount);

      return monthlyAmount;
    } catch (error) {
      console.error('年間賞与集計エラー:', error);
      return 0;
    }
  }

  /**
   * 期間内の賞与支払履歴取得
   */
  private async getAnnualBonusPayments(
    employeeId: string,
    startDate: string,
    endDate: string,
    paymentCountType: 'UNDER_3_TIMES' | 'OVER_4_TIMES'
  ): Promise<BonusPayment[]> {
    try {
      const bonusRef = collection(this.firestore, 'bonusPayments');
      const q = query(
        bonusRef,
        where('employeeId', '==', employeeId),
        where('paymentCountType', '==', paymentCountType),
        where('paymentDate', '>=', startDate),
        where('paymentDate', '<=', endDate),
        orderBy('paymentDate', 'asc')
      );

      const querySnapshot = await getDocs(q);
      const payments: BonusPayment[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        payments.push({
          paymentId: doc.id,
          ...data,
        } as BonusPayment);
      });

      return payments;
    } catch (error) {
      console.error('賞与履歴取得エラー:', error);
      return [];
    }
  }

  /**
   * 計算スナップショットの作成
   */
  createCalculationSnapshot(
    inputData: CalculationSnapshot['inputData'],
    calculationDetails: CalculationSnapshot['calculationDetails'],
    results: BonusInsurancePremiums
  ): CalculationSnapshot {
    return {
      calculationType: 'BONUS_UNDER_3_TIMES',
      inputData,
      calculationDetails,
      results,
      timestamp: new Date(),
    };
  }

  /**
   * 賞与計算結果の保存
   */
  async saveBonusCalculationResult(result: BonusCalculationResult): Promise<void> {
    try {
      const docRef = doc(this.firestore, 'bonusCalculationResults', result.resultId);
      await setDoc(docRef, result);

      // 年度累計の更新
      const fiscalYear = this.getFiscalYear(result.resultId.split('_')[1]); // 仮の実装
      await this.updateFiscalYearTotal(
        result.employeeId,
        fiscalYear,
        result.standardBonusAmountHealth
      );

      console.log('賞与計算結果保存完了:', result.resultId);
    } catch (error) {
      console.error('賞与計算結果保存エラー:', error);
      throw error;
    }
  }

  /**
   * Firestoreから既存の給与賞与データを取得
   */
  async getEmployeeSalaryBonusData(
    employeeId: string,
    year: number,
    companyId?: string
  ): Promise<FirestoreSalaryData | null> {
    try {
      console.log('=== 給与賞与データ取得開始 ===');
      console.log('従業員ID:', employeeId);
      console.log('対象年度:', year);
      console.log('会社ID:', companyId);

      // companyIdが提供されている場合はそれを使用、そうでなければデフォルト値を使用
      const finalCompanyId = companyId || '67ac7930-bc24-406a-99a2-1ba44489c76d';

      const docRef = doc(
        this.firestore,
        'employee-salary-bonus',
        finalCompanyId,
        'employees',
        employeeId,
        'years',
        year.toString()
      );
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as FirestoreSalaryData;
        console.log('取得したデータ:', data);
        return data;
      } else {
        console.log('データが見つかりません');
        return null;
      }
    } catch (error) {
      console.error('給与賞与データ取得エラー:', error);
      return null;
    }
  }

  /**
   * 既存の賞与データから年度累計を計算
   */
  async calculateExistingBonusTotal(
    employeeId: string,
    fiscalYear: number,
    currentMonth?: number,
    companyId?: string
  ): Promise<number> {
    try {
      console.log('=== 既存賞与累計計算開始 ===');

      const salaryData = await this.getEmployeeSalaryBonusData(employeeId, fiscalYear, companyId);
      if (!salaryData || !salaryData.salaryTable) {
        console.log('給与データが見つかりません');
        return 0;
      }

      let totalBonus = 0;
      const salaryTable = salaryData.salaryTable;

      // 会計年度内の賞与を集計（4月から翌年3月まで）
      for (let month = 4; month <= 12; month++) {
        const monthKey = `${month}月`;
        if (salaryTable[monthKey]) {
          // 各種賞与を合計
          const bonusData = ['その他（現物支給）', 'その他（金銭支給）'];

          bonusData.forEach((key) => {
            if (salaryTable[monthKey][key]) {
              Object.entries(salaryTable[monthKey][key]).forEach(([bonusKey, value]) => {
                if (bonusKey.includes('賞与') && typeof value === 'string') {
                  const amount = parseInt(value) || 0;
                  totalBonus = SocialInsuranceCalculator.addAmounts(totalBonus, amount);
                }
              });
            }
          });
        }
      }

      // 翌年1月〜3月（現在月まで）
      const nextYear = fiscalYear + 1;
      const nextYearData = await this.getEmployeeSalaryBonusData(employeeId, nextYear, companyId);
      if (nextYearData?.salaryTable) {
        const maxMonth = currentMonth && currentMonth <= 3 ? currentMonth - 1 : 3;

        for (let month = 1; month <= maxMonth; month++) {
          const monthKey = `${month}月`;
          if (nextYearData.salaryTable![monthKey]) {
            const bonusData = ['その他（現物支給）', 'その他（金銭支給）'];

            bonusData.forEach((key) => {
              if (nextYearData.salaryTable![monthKey][key]) {
                Object.entries(nextYearData.salaryTable![monthKey][key]).forEach(
                  ([bonusKey, value]) => {
                    if (bonusKey.includes('賞与') && typeof value === 'string') {
                      const amount = parseInt(value) || 0;
                      totalBonus = SocialInsuranceCalculator.addAmounts(totalBonus, amount);
                    }
                  }
                );
              }
            });
          }
        }
      }

      console.log('既存賞与累計:', totalBonus);
      return totalBonus;
    } catch (error) {
      console.error('既存賞与累計計算エラー:', error);
      return 0;
    }
  }

  /**
   * 月別賞与データの取得
   */
  async getMonthlyBonusData(
    employeeId: string,
    year: number,
    month: number,
    companyId?: string
  ): Promise<BonusHistoryItem[]> {
    try {
      console.log('=== 月別賞与データ取得 ===');
      console.log(`${year}年${month}月の賞与データを取得`);

      const salaryData = await this.getEmployeeSalaryBonusData(employeeId, year, companyId);
      if (!salaryData || !salaryData.salaryTable) {
        return [];
      }

      const monthKey = `${month}月`;
      const monthData = salaryData.salaryTable[monthKey];

      console.log(`${monthKey}のデータ構造:`, monthData);

      if (!monthData) {
        console.log(`${monthKey}のデータが存在しません`);
        return [];
      }

      const bonuses: BonusHistoryItem[] = [];

      // データ構造を詳細に確認
      console.log(`${monthKey}の全キー:`, Object.keys(monthData));

      // その他（金銭支給）から賞与データを抽出
      if (monthData['その他（金銭支給）']) {
        console.log('その他（金銭支給）のデータ:', monthData['その他（金銭支給）']);
        Object.entries(monthData['その他（金銭支給）']).forEach(([key, value]) => {
          console.log(`キー: ${key}, 値: ${value}, タイプ: ${typeof value}`);
          if (key.includes('賞与') && typeof value === 'string') {
            const amount = parseInt(value) || 0;
            console.log(`賞与データ発見: ${key} = ${amount}`);
            if (amount > 0) {
              bonuses.push({
                type: this.mapBonusType(key),
                amount: amount,
                month: month,
                year: year,
                originalKey: key,
              });
            }
          }
        });
      } else {
        console.log('その他（金銭支給）のデータが存在しません');
      }

      // その他（現物支給）も確認
      if (monthData['その他（現物支給）']) {
        console.log('その他（現物支給）のデータ:', monthData['その他（現物支給）']);
        Object.entries(monthData['その他（現物支給）']).forEach(([key, value]) => {
          console.log(`現物支給 - キー: ${key}, 値: ${value}, タイプ: ${typeof value}`);
          if (key.includes('賞与') && typeof value === 'string') {
            const amount = parseInt(value) || 0;
            console.log(`現物支給賞与データ発見: ${key} = ${amount}`);
            if (amount > 0) {
              bonuses.push({
                type: this.mapBonusType(key),
                amount: amount,
                month: month,
                year: year,
                originalKey: key,
              });
            }
          }
        });
      }

      // 全てのセクションを確認
      Object.keys(monthData).forEach((sectionKey) => {
        console.log(`セクション: ${sectionKey}`);
        if (typeof monthData[sectionKey] === 'object' && monthData[sectionKey] !== null) {
          Object.entries(monthData[sectionKey]).forEach(([key, value]) => {
            if (key.includes('賞与') || key.includes('ボーナス')) {
              console.log(`賞与関連データ発見 [${sectionKey}]: ${key} = ${value}`);
            }
          });
        }
      });

      console.log('抽出した賞与データ:', bonuses);
      return bonuses;
    } catch (error) {
      console.error('月別賞与データ取得エラー:', error);
      return [];
    }
  }

  /**
   * 賞与種別のマッピング
   */
  private mapBonusType(key: string): string {
    if (key.includes('1回目') || key.includes('夏')) {
      return 'summer';
    } else if (key.includes('2回目') || key.includes('冬')) {
      return 'winter';
    } else if (key.includes('3回目') || key.includes('決算')) {
      return 'settlement';
    } else if (key.includes('4回目以上')) {
      return 'over_4_times';
    }
    return 'other';
  }

  /**
   * 年度内の全賞与履歴を取得（実際のFirestore構造に対応）
   */
  async getFiscalYearBonusHistory(
    employeeId: string,
    fiscalYear: number,
    companyId?: string
  ): Promise<BonusHistoryItem[]> {
    try {
      console.log('=== 年度賞与履歴取得 ===');

      const allBonuses: BonusHistoryItem[] = [];

      // 指定年度のデータを取得
      const salaryData = await this.getEmployeeSalaryBonusData(employeeId, fiscalYear, companyId);
      if (!salaryData || !salaryData.salaryTable) {
        console.log('給与データまたはsalaryTableが見つかりません');
        return allBonuses;
      }

      console.log('取得したデータの全キー:', Object.keys(salaryData));
      console.log('salaryTableの全キー:', Object.keys(salaryData.salaryTable));

      // 賞与データと支給年月日データを抽出
      const bonusAmounts: Record<string, number> = {};
      const bonusDates: Record<string, string> = {};

      // 合計セクションから賞与金額を抽出
      if (salaryData.salaryTable['合計'] && typeof salaryData.salaryTable['合計'] === 'object') {
        console.log('合計セクション:', salaryData.salaryTable['合計']);
        const totalSection = salaryData.salaryTable['合計'] as Record<string, string>;
        Object.entries(totalSection).forEach(([key, value]) => {
          console.log(`合計セクションフィールド: ${key} = ${value}`);

          // 賞与金額の抽出（全角括弧で検索）
          if (key.startsWith('賞与（') && key.includes('回目')) {
            const amount =
              typeof value === 'string' ? parseInt(value) || 0 : (value as number) || 0;
            if (amount > 0) {
              bonusAmounts[key] = amount;
              console.log(`賞与金額発見: ${key} = ${amount}`);
            }
          }
        });
      }

      // 支給年月日データの抽出
      if (
        salaryData.salaryTable['支給年月日'] &&
        typeof salaryData.salaryTable['支給年月日'] === 'object'
      ) {
        console.log('支給年月日セクション:', salaryData.salaryTable['支給年月日']);
        const paymentDateSection = salaryData.salaryTable['支給年月日'] as Record<string, string>;
        Object.entries(paymentDateSection).forEach(([key, value]) => {
          if (key.startsWith('賞与（') && typeof value === 'string') {
            bonusDates[key] = value;
            console.log(`支給年月日発見: ${key} = ${value}`);
          }
        });
      } else {
        // 支給年月日が直接フィールドとして保存されている場合
        Object.entries(salaryData.salaryTable).forEach(([key, value]) => {
          if (
            key.startsWith('賞与（') &&
            key.includes('回目') &&
            typeof value === 'string' &&
            value.includes('/')
          ) {
            bonusDates[key] = value;
            console.log(`支給年月日発見（直接）: ${key} = ${value}`);
          }
        });
      }

      // 賞与データを結合してBonusHistoryItemを作成
      Object.entries(bonusAmounts).forEach(([key, amount]) => {
        const paymentDate = bonusDates[key];
        if (paymentDate) {
          // 支給年月日から月と年を抽出
          const dateMatch = paymentDate.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
          if (dateMatch) {
            const year = parseInt(dateMatch[1]);
            const month = parseInt(dateMatch[2]);

            allBonuses.push({
              type: this.mapBonusType(key),
              amount: amount,
              month: month,
              year: year,
              originalKey: key,
              fiscalYear: fiscalYear,
              paymentDate: paymentDate,
            });

            console.log(`賞与データ作成: ${key}, 金額: ${amount}, 支給日: ${paymentDate}`);
          }
        } else {
          console.log(`支給年月日が見つからない賞与: ${key}`);
          // 支給年月日がない場合でも、デフォルト日付で作成
          let defaultMonth = 12; // デフォルトは12月
          let defaultYear = fiscalYear;

          // 賞与の種類から推定
          if (key.includes('1回目')) {
            defaultMonth = 7; // 夏季賞与
          } else if (key.includes('2回目')) {
            defaultMonth = 12; // 冬季賞与
          } else if (key.includes('3回目')) {
            defaultMonth = 3; // 決算賞与
            defaultYear = fiscalYear + 1;
          }

          const defaultPaymentDate = `${defaultYear}/${defaultMonth.toString().padStart(2, '0')}/31`;

          allBonuses.push({
            type: this.mapBonusType(key),
            amount: amount,
            month: defaultMonth,
            year: defaultYear,
            originalKey: key,
            fiscalYear: fiscalYear,
            paymentDate: defaultPaymentDate,
          });

          console.log(
            `賞与データ作成（推定日付）: ${key}, 金額: ${amount}, 推定支給日: ${defaultPaymentDate}`
          );
        }
      });

      console.log('年度賞与履歴:', allBonuses);
      return allBonuses;
    } catch (error) {
      console.error('年度賞与履歴取得エラー:', error);
      return [];
    }
  }

  /**
   * 標準賞与額の累計計算（既存データを考慮）
   */
  async calculateStandardBonusTotalWithExisting(
    employeeId: string,
    fiscalYear: number,
    currentBonusAmount: number,
    excludeMonth?: number,
    companyId?: string
  ): Promise<{
    existingTotal: number;
    standardCurrentBonus: number;
    projectedTotal: number;
  }> {
    try {
      console.log('=== 標準賞与額累計計算（既存考慮） ===');

      // 既存の賞与履歴を取得
      const bonusHistory = await this.getFiscalYearBonusHistory(employeeId, fiscalYear, companyId);

      // 除外月がある場合はフィルタリング
      const filteredHistory = excludeMonth
        ? bonusHistory.filter((bonus) => bonus.month !== excludeMonth)
        : bonusHistory;

      // 既存の標準賞与額累計を計算
      let existingTotal = 0;
      filteredHistory.forEach((bonus) => {
        const standardAmount = this.calculateStandardBonusAmount(bonus.amount);
        existingTotal = SocialInsuranceCalculator.addAmounts(existingTotal, standardAmount);
      });

      // 現在の賞与の標準額
      const standardCurrentBonus = this.calculateStandardBonusAmount(currentBonusAmount);

      // 予想累計
      const projectedTotal = SocialInsuranceCalculator.addAmounts(
        existingTotal,
        standardCurrentBonus
      );

      const result = {
        existingTotal,
        standardCurrentBonus,
        projectedTotal,
      };

      console.log('標準賞与額累計計算結果:', result);
      return result;
    } catch (error) {
      console.error('標準賞与額累計計算エラー:', error);
      return {
        existingTotal: 0,
        standardCurrentBonus: this.calculateStandardBonusAmount(currentBonusAmount),
        projectedTotal: this.calculateStandardBonusAmount(currentBonusAmount),
      };
    }
  }

  /**
   * 改良された上限額適用（既存データ考慮版）
   */
  async applyBonusLimitsWithExistingData(
    employeeId: string,
    standardAmount: number,
    fiscalYear: number,
    excludeMonth?: number,
    companyId?: string
  ): Promise<BonusLimitResult> {
    try {
      console.log('=== 賞与上限額適用（既存データ考慮）開始 ===');

      // 既存データを考慮した累計計算
      const totalInfo = await this.calculateStandardBonusTotalWithExisting(
        employeeId,
        fiscalYear,
        standardAmount,
        excludeMonth,
        companyId
      );

      const healthLimit = 5730000; // 573万円
      const pensionLimit = 1500000; // 150万円（1回あたり）

      let healthAmount = standardAmount;
      let pensionAmount = standardAmount;
      let isHealthLimitApplied = false;
      let isPensionLimitApplied = false;

      console.log('既存累計:', totalInfo.existingTotal);
      console.log('現在標準額:', totalInfo.standardCurrentBonus);
      console.log('予想累計:', totalInfo.projectedTotal);

      // 健康保険上限適用
      if (SocialInsuranceCalculator.compare(totalInfo.projectedTotal, healthLimit) > 0) {
        healthAmount = Math.max(
          0,
          SocialInsuranceCalculator.subtract(healthLimit, totalInfo.existingTotal)
        );
        isHealthLimitApplied = true;
        console.log('健康保険上限適用:', healthAmount);
      }

      // 厚生年金上限適用
      if (SocialInsuranceCalculator.compare(standardAmount, pensionLimit) > 0) {
        pensionAmount = pensionLimit;
        isPensionLimitApplied = true;
        console.log('厚生年金上限適用:', pensionAmount);
      }

      const result: BonusLimitResult = {
        healthInsuranceAmount: healthAmount,
        pensionInsuranceAmount: pensionAmount,
        isHealthLimitApplied,
        isPensionLimitApplied,
        fiscalYearTotalBefore: totalInfo.existingTotal,
        fiscalYearTotalAfter: SocialInsuranceCalculator.addAmounts(
          totalInfo.existingTotal,
          healthAmount
        ),
      };

      console.log('上限適用結果:', result);
      return result;
    } catch (error) {
      console.error('上限額適用エラー:', error);
      throw error;
    }
  }
}
