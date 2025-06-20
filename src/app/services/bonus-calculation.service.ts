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
import {
  GradeManagementService,
  GradeInfo,
  GradeBasedPremiumResult,
} from './grade-management.service';

// データモデル定義
export interface FirestoreSalaryData {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  salaryTable?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface BonusHistoryItem {
  type: string;
  amount: string; // Decimal文字列として保存
  month: bigint;
  year: bigint;
  originalKey: string;
  fiscalYear?: bigint;
  paymentDate?: string;
}

export interface BonusPayment {
  paymentId: string;
  employeeId: string;
  paymentDate: string; // YYYY-MM-DD
  bonusAmount: string; // Decimal文字列として保存
  paymentCountType: 'UNDER_3_TIMES' | 'OVER_4_TIMES';
  bonusType: string; // 'summer', 'winter', 'settlement', 'other'
  fiscalYear: bigint; // 会計年度（4月-3月）
  createdAt: Date;
  updatedAt: Date;
}

export interface BonusCalculationResult {
  resultId: string;
  paymentId: string;
  employeeId: string;
  standardBonusAmountHealth: string; // 健康保険の標準賞与額（Decimal文字列）
  standardBonusAmountPension: string; // 厚生年金の標準賞与額（Decimal文字列）
  healthInsurancePremium: string; // Decimal文字列
  careInsurancePremium?: string; // 40歳以上のみ（Decimal文字列）
  pensionInsurancePremium: string; // Decimal文字列
  childRearingContribution: string; // 子ども・子育て拠出金（Decimal文字列）
  employeeBurden: string; // 個人負担額合計（Decimal文字列）
  companyBurden: string; // 会社負担額合計（Decimal文字列）
  totalPremium: string; // 保険料総額（Decimal文字列）
  calculationSnapshot: string; // JSON形式の計算詳細
  createdAt: Date;
}

export interface FiscalYearBonusTotal {
  employeeId: string;
  fiscalYear: bigint;
  totalStandardBonusAmount: string; // Decimal文字列
  lastUpdated: Date;
}

export interface InsuranceRates {
  year: bigint;
  prefecture: string;
  healthInsuranceRate: string; // Decimal文字列（パーセント）
  careInsuranceRate: string; // Decimal文字列（パーセント）
  pensionInsuranceRate: string; // Decimal文字列（パーセント）
  childRearingContributionRate: string; // Decimal文字列（パーセント）
  effectiveDate: string;
}

export interface BonusInsurancePremiums {
  healthPremium: string; // Decimal文字列
  carePremium: string; // Decimal文字列
  pensionPremium: string; // Decimal文字列
  childRearingContribution: string; // Decimal文字列
  employeeBurden: string; // Decimal文字列
  companyBurden: string; // Decimal文字列
  totalPremium: string; // Decimal文字列
}

export interface BonusLimitResult {
  healthInsuranceAmount: string; // Decimal文字列
  pensionInsuranceAmount: string; // Decimal文字列
  isHealthLimitApplied: boolean;
  isPensionLimitApplied: boolean;
  fiscalYearTotalBefore: string; // Decimal文字列
  fiscalYearTotalAfter: string; // Decimal文字列
}

export interface CalculationSnapshot {
  calculationType: 'BONUS_UNDER_3_TIMES' | 'BONUS_OVER_4_TIMES';
  inputData: {
    originalBonusAmount: string; // Decimal文字列
    paymentDate: string;
    paymentCountType: string;
    bonusType: string;
  };
  calculationDetails: {
    standardBonusAmount: string; // Decimal文字列
    appliedLimits: {
      healthInsuranceLimit: boolean;
      pensionInsuranceLimit: boolean;
    };
    appliedRates: {
      year: number; // JSON シリアライゼーション用にnumber型
      prefecture: string;
      healthInsuranceRate: string;
      careInsuranceRate: string;
      pensionInsuranceRate: string;
      childRearingContributionRate: string;
      effectiveDate: string;
    };
    fiscalYearTotalBefore: string; // Decimal文字列
    fiscalYearTotalAfter: string; // Decimal文字列
  };
  results: BonusInsurancePremiums;
  calculatedAt: Date;
}

@Injectable({
  providedIn: 'root',
})
export class BonusCalculationService {
  private firestore = getFirestore();

  constructor(private gradeManagementService: GradeManagementService) {
    // Firebase初期化は既にapp.config.tsで行われている
  }

  /**
   * 会計年度の取得（4月-3月）
   */
  getFiscalYear(date: string): bigint {
    const paymentDate = new Date(date);
    const year = BigInt(paymentDate.getFullYear());
    const month = paymentDate.getMonth() + 1; // 0ベースなので+1

    // 4月以降は当年度、3月以前は前年度
    return month >= 4 ? year : year - 1n;
  }

  /**
   * Step 1: 標準賞与額の決定（1,000円未満切り捨て）
   */
  calculateStandardBonusAmount(bonusAmount: string): string {
    return SocialInsuranceCalculator.floorToThousand(bonusAmount);
  }

  /**
   * Step 2: 上限額適用
   */
  async applyBonusLimits(
    employeeId: string,
    standardAmount: string,
    fiscalYear: bigint
  ): Promise<BonusLimitResult> {
    try {
      console.log('=== 賞与上限適用処理開始 ===');
      console.log('従業員ID:', employeeId);
      console.log('標準賞与額:', standardAmount);
      console.log('会計年度:', fiscalYear);

      // 健康保険：年度累計573万円チェック
      const currentTotal = await this.getFiscalYearTotal(employeeId, fiscalYear);
      const healthLimit = '5730000'; // 573万円
      const pensionLimit = '1500000'; // 150万円（1回あたり）

      let healthAmount = standardAmount;
      let pensionAmount = standardAmount;
      let isHealthLimitApplied = false;
      let isPensionLimitApplied = false;

      // 健康保険上限適用
      if (
        SocialInsuranceCalculator.compare(
          SocialInsuranceCalculator.addAmounts(currentTotal, standardAmount),
          healthLimit
        ) > 0
      ) {
        const subtractResult = SocialInsuranceCalculator.subtract(healthLimit, currentTotal);
        healthAmount =
          SocialInsuranceCalculator.compare(subtractResult, '0') > 0 ? subtractResult : '0';
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
      console.error('賞与上限適用エラー:', error);
      throw error;
    }
  }

  /**
   * 年度累計標準賞与額の取得
   */
  private async getFiscalYearTotal(employeeId: string, fiscalYear: bigint): Promise<string> {
    try {
      const docRef = doc(this.firestore, 'fiscalYearBonusTotals', `${employeeId}_${fiscalYear}`);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as FiscalYearBonusTotal;
        return data.totalStandardBonusAmount || '0';
      }

      return '0';
    } catch (error) {
      console.error('年度累計取得エラー:', error);
      return '0';
    }
  }

  /**
   * 年度累計標準賞与額の更新
   */
  private async updateFiscalYearTotal(
    employeeId: string,
    fiscalYear: bigint,
    additionalAmount: string
  ): Promise<void> {
    try {
      const currentTotal = await this.getFiscalYearTotal(employeeId, fiscalYear);
      const newTotal = SocialInsuranceCalculator.addAmounts(currentTotal, additionalAmount);

      // Firestoreに保存するためにbigintをnumberに変換
      const firestoreTotalData = {
        employeeId,
        fiscalYear: Number(fiscalYear), // bigint → number
        totalStandardBonusAmount: newTotal,
        lastUpdated: new Date(),
      };

      const docRef = doc(this.firestore, 'fiscalYearBonusTotals', `${employeeId}_${fiscalYear}`);
      await setDoc(docRef, firestoreTotalData);

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
      healthInsuranceAmount: string;
      pensionInsuranceAmount: string;
    },
    rates: InsuranceRates,
    employeeAge: bigint
  ): Promise<BonusInsurancePremiums> {
    try {
      console.log('=== 保険料計算開始 ===');
      console.log('標準賞与額:', standardAmounts);
      console.log('保険料率:', rates);
      console.log('従業員年齢:', employeeAge);

      // 健康保険料
      const healthPremium = SocialInsuranceCalculator.multiplyAndFloor(
        standardAmounts.healthInsuranceAmount,
        SocialInsuranceCalculator.divide(rates.healthInsuranceRate, '100')
      );

      // 介護保険料（40歳以上のみ）
      const carePremium =
        employeeAge >= 40n
          ? SocialInsuranceCalculator.multiplyAndFloor(
              standardAmounts.healthInsuranceAmount,
              SocialInsuranceCalculator.divide(rates.careInsuranceRate, '100')
            )
          : '0';

      // 厚生年金保険料
      const pensionPremium = SocialInsuranceCalculator.multiplyAndFloor(
        standardAmounts.pensionInsuranceAmount,
        SocialInsuranceCalculator.divide(rates.pensionInsuranceRate, '100')
      );

      // 子ども・子育て拠出金（全額事業主負担）
      const childRearingContribution = SocialInsuranceCalculator.multiplyAndFloor(
        standardAmounts.pensionInsuranceAmount,
        SocialInsuranceCalculator.divide(rates.childRearingContributionRate, '100')
      );

      // 個人負担額（健康保険料 + 介護保険料 + 厚生年金保険料）の半額
      const totalEmployeePremium = SocialInsuranceCalculator.addAmounts(
        SocialInsuranceCalculator.addAmounts(healthPremium, carePremium),
        pensionPremium
      );
      const employeeBurden = SocialInsuranceCalculator.divideAndFloor(totalEmployeePremium, '2');

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
  async getInsuranceRates(year: bigint, prefecture: string): Promise<InsuranceRates> {
    try {
      console.log('=== 保険料率取得開始 ===');
      console.log('年度:', year, '都道府県:', prefecture);

      const docRef = doc(this.firestore, 'insuranceRates', `${year}_${prefecture}`);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log('取得した保険料率データ:', data);

        return {
          year,
          prefecture,
          healthInsuranceRate: data['healthInsuranceRate'] || '10.0',
          careInsuranceRate: data['careInsuranceRate'] || '1.6',
          pensionInsuranceRate: data['pensionInsuranceRate'] || '18.3',
          childRearingContributionRate: data['childRearingContributionRate'] || '0.36',
          effectiveDate: data['effectiveDate'] || `${year}-04-01`,
        };
      }

      console.log('保険料率データが見つからないため、デフォルト値を使用');
      return {
        year,
        prefecture,
        healthInsuranceRate: '10.0',
        careInsuranceRate: '1.6',
        pensionInsuranceRate: '18.3',
        childRearingContributionRate: '0.36',
        effectiveDate: `${year}-04-01`,
      };
    } catch (error) {
      console.error('保険料率取得エラー:', error);
      // エラー時はデフォルト値を返す
      return {
        year,
        prefecture,
        healthInsuranceRate: '10.0',
        careInsuranceRate: '1.6',
        pensionInsuranceRate: '18.3',
        childRearingContributionRate: '0.36',
        effectiveDate: `${year}-04-01`,
      };
    }
  }

  /**
   * 年4回以上賞与の年間集計（定時決定用）
   */
  async calculateAnnualBonusForStandardSalary(
    employeeId: string,
    targetYear: bigint
  ): Promise<string> {
    try {
      console.log('=== 年4回以上賞与集計開始 ===');
      console.log('従業員ID:', employeeId, '対象年:', targetYear);

      // 前年7月1日〜当年6月30日の集計
      const startDate = `${targetYear - 1n}-07-01`;
      const endDate = `${targetYear}-06-30`;

      console.log('集計期間:', startDate, '〜', endDate);

      // 実装：実際のFirestoreクエリでデータを取得
      const bonusPayments: BonusPayment[] = []; // 実装が必要

      const totalAmount = bonusPayments.reduce(
        (sum, payment) => SocialInsuranceCalculator.addAmounts(sum, payment.bonusAmount),
        '0'
      );

      // 12で割って月割り額を計算
      const monthlyAmount = SocialInsuranceCalculator.divideAndFloor(totalAmount, '12');

      console.log('年間賞与合計:', totalAmount);
      console.log('月割り賞与額:', monthlyAmount);

      return monthlyAmount;
    } catch (error) {
      console.error('年間賞与集計エラー:', error);
      return '0';
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
      calculatedAt: new Date(),
    };
  }

  /**
   * 賞与支払いデータの保存
   */
  async saveBonusPayment(
    payment: Omit<BonusPayment, 'paymentId' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    try {
      console.log('=== 賞与支払いデータ保存開始 ===');

      // ユニークなIDを生成
      const paymentId = `${payment.employeeId}_${payment.paymentDate}_${Date.now()}`;

      // Firestoreに保存するためにbigintをnumberに変換
      const firestorePayment = {
        ...payment,
        fiscalYear: Number(payment.fiscalYear), // bigint → number
        paymentId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const docRef = doc(this.firestore, 'bonusPayments', paymentId);
      await setDoc(docRef, firestorePayment);

      console.log('賞与支払いデータ保存完了:', paymentId);
      return paymentId;
    } catch (error) {
      console.error('賞与支払いデータ保存エラー:', error);
      throw error;
    }
  }

  /**
   * 賞与計算結果の保存
   */
  async saveBonusCalculationResult(result: BonusCalculationResult): Promise<void> {
    try {
      console.log('=== 賞与計算結果保存開始 ===');

      const docRef = doc(this.firestore, 'bonusCalculationResults', result.resultId);
      await setDoc(docRef, result);

      console.log('賞与計算結果保存完了:', result.resultId);
    } catch (error) {
      console.error('賞与計算結果保存エラー:', error);
      throw error;
    }
  }

  /**
   * 保存された賞与支払いデータの取得
   */
  async getSavedBonusPayments(employeeId: string, fiscalYear: bigint): Promise<BonusPayment[]> {
    try {
      console.log('=== 保存された賞与支払いデータ取得開始 ===');
      console.log('従業員ID:', employeeId, '会計年度:', fiscalYear);

      const paymentsRef = collection(this.firestore, 'bonusPayments');

      // 最初に employeeId のみでクエリを実行
      const q = query(paymentsRef, where('employeeId', '==', employeeId));

      const querySnapshot = await getDocs(q);
      const payments: BonusPayment[] = [];

      console.log(`employeeIdクエリ結果: ${querySnapshot.size}件`);

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const payment = {
          paymentId: doc.id,
          ...data,
          fiscalYear: BigInt(data['fiscalYear']), // number → bigint
        } as BonusPayment;

        console.log('取得したドキュメント:', doc.id, payment);

        // クライアントサイドで fiscalYear をフィルタリング
        if (payment.fiscalYear.toString() === fiscalYear.toString()) {
          payments.push(payment);
        }
      });

      // データが取得できない場合、より広範囲で検索
      if (payments.length === 0) {
        console.log('employeeIdクエリで結果なし、全データから検索します');

        const allDocsSnapshot = await getDocs(paymentsRef);
        console.log(`bonusPaymentsコレクション全体: ${allDocsSnapshot.size}件`);

        // 全データの詳細調査
        allDocsSnapshot.forEach((doc) => {
          const data = doc.data();
          const payment = {
            paymentId: doc.id,
            ...data,
            fiscalYear: BigInt(data['fiscalYear']), // number → bigint
          } as BonusPayment;

          console.log('全データ検索 - ドキュメント:', doc.id, {
            employeeId: payment.employeeId,
            fiscalYear: payment.fiscalYear,
            employeeIdType: typeof payment.employeeId,
            fiscalYearType: typeof payment.fiscalYear,
            employeeIdMatch: payment.employeeId === employeeId,
            fiscalYearMatch: payment.fiscalYear.toString() === fiscalYear.toString(),
          });

          // クライアントサイドで employeeId と fiscalYear をフィルタリング
          if (
            payment.employeeId === employeeId &&
            payment.fiscalYear.toString() === fiscalYear.toString()
          ) {
            payments.push(payment);
          }
        });
      }

      // クライアントサイドで paymentDate による並び替え
      payments.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));

      console.log('最終的に取得した支払いデータ:', payments);
      return payments;
    } catch (error) {
      console.error('保存された賞与支払いデータ取得エラー:', error);

      // エラーが発生した場合も全データから検索を試行
      try {
        console.log('エラー発生のため、フォールバック検索を実行');
        const paymentsRef = collection(this.firestore, 'bonusPayments');
        const querySnapshot = await getDocs(paymentsRef);
        const allPayments: BonusPayment[] = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          const payment = {
            paymentId: doc.id,
            ...data,
            fiscalYear: BigInt(data['fiscalYear']), // number → bigint
          } as BonusPayment;

          // クライアントサイドで employeeId と fiscalYear をフィルタリング
          if (
            payment.employeeId === employeeId &&
            payment.fiscalYear.toString() === fiscalYear.toString()
          ) {
            allPayments.push(payment);
          }
        });

        // クライアントサイドで paymentDate による並び替え
        allPayments.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));

        console.log('フォールバック取得した支払いデータ:', allPayments);
        return allPayments;
      } catch (fallbackError) {
        console.error('フォールバック取得もエラー:', fallbackError);
        return [];
      }
    }
  }

  /**
   * 保存されたデータと計算結果を組み合わせて取得
   */
  async getSavedBonusDataWithCalculations(
    employeeId: string,
    fiscalYear: bigint
  ): Promise<
    {
      payment: BonusPayment;
      calculation: BonusCalculationResult;
    }[]
  > {
    try {
      console.log('=== 保存されたデータ組み合わせ取得開始 ===');
      console.log('検索条件 - employeeId:', employeeId, 'fiscalYear:', fiscalYear);

      const payments = await this.getSavedBonusPayments(employeeId, fiscalYear);
      console.log('取得した支払いデータ数:', payments.length);

      if (payments.length === 0) {
        console.log('支払いデータが0件のため、処理を終了');
        return [];
      }

      const results: {
        payment: BonusPayment;
        calculation: BonusCalculationResult;
      }[] = [];

      for (const payment of payments) {
        try {
          console.log(`計算結果取得試行: paymentId=${payment.paymentId}`);

          // 対応する計算結果を取得
          const calculationId = `${payment.paymentId}_result`;
          console.log('計算結果ID:', calculationId);

          const calculationRef = doc(this.firestore, 'bonusCalculationResults', calculationId);
          const calculationSnap = await getDoc(calculationRef);

          if (calculationSnap.exists()) {
            const calculationData = calculationSnap.data() as BonusCalculationResult;
            console.log(`計算結果取得成功: ${calculationId}`, calculationData);

            results.push({
              payment,
              calculation: {
                ...calculationData,
                resultId: calculationSnap.id,
              },
            });
          } else {
            console.warn(`計算結果が見つかりません: ${calculationId}`);
          }
        } catch (error) {
          console.error(`計算結果取得エラー (${payment.paymentId}):`, error);
        }
      }

      console.log('最終的な組み合わせ結果数:', results.length);
      console.log('組み合わせた結果:', results);
      return results;
    } catch (error) {
      console.error('保存されたデータ組み合わせ取得エラー:', error);
      return [];
    }
  }

  /**
   * 完全な賞与計算と保存処理
   */
  async calculateAndSaveBonusInsurance(
    employeeId: string,
    bonusAmount: string,
    paymentDate: string,
    bonusType: string,
    employeeAge: bigint,
    prefecture: string,
    companyId?: string
  ): Promise<{
    paymentId: string;
    calculationResult: BonusCalculationResult;
    limitResult: BonusLimitResult;
  }> {
    try {
      console.log('=== 完全な賞与計算・保存処理開始 ===');
      console.log('入力データ:', {
        employeeId,
        bonusAmount,
        paymentDate,
        bonusType,
        employeeAge,
        prefecture,
      });

      // 1. 会計年度の取得
      const fiscalYear = this.getFiscalYear(paymentDate);
      console.log('会計年度:', fiscalYear);

      // 2. 標準賞与額の計算
      const standardBonusAmount = this.calculateStandardBonusAmount(bonusAmount);
      console.log('標準賞与額:', standardBonusAmount);

      // 3. 上限適用処理
      const limitResult = await this.applyBonusLimitsWithExistingData(
        employeeId,
        standardBonusAmount,
        fiscalYear,
        undefined,
        companyId
      );

      // 4. 保険料率の取得
      const paymentYear = BigInt(new Date(paymentDate).getFullYear());
      const rates = await this.getInsuranceRates(paymentYear, prefecture);

      // 5. 保険料計算
      const premiums = await this.calculateInsurancePremiums(
        {
          healthInsuranceAmount: limitResult.healthInsuranceAmount,
          pensionInsuranceAmount: limitResult.pensionInsuranceAmount,
        },
        rates,
        employeeAge
      );

      // 6. 賞与支払いデータの保存
      const paymentId = await this.saveBonusPayment({
        employeeId,
        paymentDate,
        bonusAmount,
        paymentCountType: 'UNDER_3_TIMES', // デフォルト値、必要に応じて動的に設定
        bonusType,
        fiscalYear,
      });

      // 7. 計算スナップショットの作成
      const snapshot = this.createCalculationSnapshot(
        {
          originalBonusAmount: bonusAmount,
          paymentDate,
          paymentCountType: 'UNDER_3_TIMES',
          bonusType,
        },
        {
          standardBonusAmount,
          appliedLimits: {
            healthInsuranceLimit: limitResult.isHealthLimitApplied,
            pensionInsuranceLimit: limitResult.isPensionLimitApplied,
          },
          appliedRates: {
            ...rates,
            year: Number(rates.year), // bigint → number
          },
          fiscalYearTotalBefore: limitResult.fiscalYearTotalBefore,
          fiscalYearTotalAfter: limitResult.fiscalYearTotalAfter,
        },
        premiums
      );

      // 8. 計算結果の保存
      const resultId = `${paymentId}_result`;
      const calculationResult: BonusCalculationResult = {
        resultId,
        paymentId,
        employeeId,
        standardBonusAmountHealth: limitResult.healthInsuranceAmount,
        standardBonusAmountPension: limitResult.pensionInsuranceAmount,
        healthInsurancePremium: premiums.healthPremium,
        careInsurancePremium: premiums.carePremium,
        pensionInsurancePremium: premiums.pensionPremium,
        childRearingContribution: premiums.childRearingContribution,
        employeeBurden: premiums.employeeBurden,
        companyBurden: premiums.companyBurden,
        totalPremium: premiums.totalPremium,
        calculationSnapshot: JSON.stringify(snapshot),
        createdAt: new Date(),
      };

      await this.saveBonusCalculationResult(calculationResult);

      console.log('完全な賞与計算・保存処理完了');
      return {
        paymentId,
        calculationResult,
        limitResult,
      };
    } catch (error) {
      console.error('完全な賞与計算・保存処理エラー:', error);
      throw error;
    }
  }

  /**
   * 改良された上限額適用（既存データ考慮版）
   */
  async applyBonusLimitsWithExistingData(
    employeeId: string,
    standardAmount: string,
    fiscalYear: bigint,
    excludeMonth?: bigint,
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

      const healthLimit = '5730000'; // 573万円
      const pensionLimit = '1500000'; // 150万円（1回あたり）

      let healthAmount = standardAmount;
      let pensionAmount = standardAmount;
      let isHealthLimitApplied = false;
      let isPensionLimitApplied = false;

      console.log('既存累計:', totalInfo.existingTotal);
      console.log('現在標準額:', totalInfo.standardCurrentBonus);
      console.log('予想累計:', totalInfo.projectedTotal);

      // 健康保険上限適用
      if (SocialInsuranceCalculator.compare(totalInfo.projectedTotal, healthLimit) > 0) {
        const subtractResult = SocialInsuranceCalculator.subtract(
          healthLimit,
          totalInfo.existingTotal
        );
        healthAmount =
          SocialInsuranceCalculator.compare(subtractResult, '0') > 0 ? subtractResult : '0';
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

  /**
   * 標準賞与額の累計計算（既存データを考慮）
   */
  async calculateStandardBonusTotalWithExisting(
    employeeId: string,
    fiscalYear: bigint,
    currentBonusAmount: string,
    excludeMonth?: bigint,
    companyId?: string
  ): Promise<{
    existingTotal: string;
    standardCurrentBonus: string;
    projectedTotal: string;
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
      let existingTotal = '0';
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
        existingTotal: '0',
        standardCurrentBonus: this.calculateStandardBonusAmount(currentBonusAmount),
        projectedTotal: this.calculateStandardBonusAmount(currentBonusAmount),
      };
    }
  }

  /**
   * 月別賞与データの取得
   */
  async getMonthlyBonusData(
    employeeId: string,
    year: bigint,
    month: bigint,
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
            const amount = BigInt(value) || 0n;
            console.log(`賞与データ発見: ${key} = ${amount}`);
            if (amount > 0n) {
              bonuses.push({
                type: this.mapBonusType(key),
                amount: amount.toString(),
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
            const amount = BigInt(value) || 0n;
            console.log(`現物支給賞与データ発見: ${key} = ${amount}`);
            if (amount > 0n) {
              bonuses.push({
                type: this.mapBonusType(key),
                amount: amount.toString(),
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
    fiscalYear: bigint,
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

      // console.log('取得したデータの全キー:', Object.keys(salaryData));
      // console.log('salaryTableの全キー:', Object.keys(salaryData.salaryTable));

      // 賞与データと支給年月日データを抽出
      const bonusAmounts: Record<string, string> = {};
      const bonusDates: Record<string, string> = {};

      // 合計セクションから賞与金額を抽出
      if (salaryData.salaryTable['合計'] && typeof salaryData.salaryTable['合計'] === 'object') {
        console.log('合計セクション:', salaryData.salaryTable['合計']);
        const totalSection = salaryData.salaryTable['合計'] as Record<string, string>;
        Object.entries(totalSection).forEach(([key, value]) => {
          console.log(`合計セクションフィールド: ${key} = ${value}`);

          // 賞与金額の抽出（全角括弧で検索）
          if (key.startsWith('賞与（') && key.includes('回目')) {
            const amount = typeof value === 'string' ? value : String(value) || '0';
            const amountBigInt = BigInt(amount) || 0n;
            if (amountBigInt > 0n) {
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
            const year = BigInt(dateMatch[1]);
            const month = BigInt(dateMatch[2]);

            allBonuses.push({
              type: this.mapBonusType(key),
              amount,
              month,
              year,
              originalKey: key,
              fiscalYear: fiscalYear,
              paymentDate: paymentDate,
            });

            console.log(`賞与データ作成: ${key}, 金額: ${amount}, 支給日: ${paymentDate}`);
          }
        } else {
          console.log(`支給年月日が見つからない賞与: ${key}`);
          // 支給年月日がない場合でも、デフォルト日付で作成
          let defaultMonth = 12n; // デフォルトは12月
          let defaultYear = fiscalYear;

          // 賞与の種類から推定
          if (key.includes('1回目')) {
            defaultMonth = 7n; // 夏季賞与
          } else if (key.includes('2回目')) {
            defaultMonth = 12n; // 冬季賞与
          } else if (key.includes('3回目')) {
            defaultMonth = 3n; // 決算賞与
            defaultYear = fiscalYear + 1n;
          }

          const defaultPaymentDate = `${defaultYear}/${defaultMonth.toString().padStart(2, '0')}/31`;

          allBonuses.push({
            type: this.mapBonusType(key),
            amount,
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
   * Firestoreから既存の給与賞与データを取得
   */
  async getEmployeeSalaryBonusData(
    employeeId: string,
    year: bigint,
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
    fiscalYear: bigint,
    currentMonth?: bigint,
    companyId?: string
  ): Promise<string> {
    try {
      console.log('=== 既存賞与累計計算開始 ===');

      const salaryData = await this.getEmployeeSalaryBonusData(employeeId, fiscalYear, companyId);
      if (!salaryData || !salaryData.salaryTable) {
        console.log('給与データが見つかりません');
        return '0';
      }

      let totalBonus = '0';
      const salaryTable = salaryData.salaryTable;

      // 会計年度内の賞与を集計（4月から翌年3月まで）
      for (let month = 4n; month <= 12n; month++) {
        const monthKey = `${month}月`;
        if (salaryTable[monthKey]) {
          // 各種賞与を合計
          const bonusData = ['その他（現物支給）', 'その他（金銭支給）'];

          bonusData.forEach((key) => {
            if (salaryTable[monthKey][key]) {
              Object.entries(salaryTable[monthKey][key]).forEach(([bonusKey, value]) => {
                if (bonusKey.includes('賞与') && typeof value === 'string') {
                  const amount = BigInt(value) || 0n;
                  totalBonus = SocialInsuranceCalculator.addAmounts(totalBonus, amount.toString());
                }
              });
            }
          });
        }
      }

      // 翌年1月〜3月（現在月まで）
      const nextYear = fiscalYear + 1n;
      const nextYearData = await this.getEmployeeSalaryBonusData(employeeId, nextYear, companyId);
      if (nextYearData?.salaryTable) {
        const maxMonth = currentMonth && currentMonth <= 3n ? currentMonth - 1n : 3n;

        for (let month = 1n; month <= maxMonth; month++) {
          const monthKey = `${month}月`;
          if (nextYearData.salaryTable![monthKey]) {
            const bonusData = ['その他（現物支給）', 'その他（金銭支給）'];

            bonusData.forEach((key) => {
              if (nextYearData.salaryTable![monthKey][key]) {
                Object.entries(nextYearData.salaryTable![monthKey][key]).forEach(
                  ([bonusKey, value]) => {
                    if (bonusKey.includes('賞与') && typeof value === 'string') {
                      const amount = BigInt(value) || 0n;
                      totalBonus = SocialInsuranceCalculator.addAmounts(
                        totalBonus,
                        amount.toString()
                      );
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
      return '0';
    }
  }

  /**
   * 等級ベースの賞与保険料計算（新機能）
   * @param employeeId 従業員ID
   * @param bonusAmount 賞与額
   * @param paymentDate 支払日
   * @param bonusType 賞与種類
   * @param employeeAge 従業員年齢
   * @param prefecture 都道府県名
   * @param companyId 会社ID（オプション）
   * @returns 等級ベースの計算結果
   */
  async calculateGradeBasedBonusInsurance(
    employeeId: string,
    bonusAmount: string,
    paymentDate: string,
    bonusType: string,
    employeeAge: bigint,
    prefecture: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    companyId?: string
  ): Promise<{
    paymentId: string;
    gradeBasedResult: GradeBasedPremiumResult;
    appliedGrade: GradeInfo;
  } | null> {
    try {
      console.log('=== 等級ベース賞与保険料計算開始 ===');
      console.log('従業員ID:', employeeId);
      console.log('賞与額:', bonusAmount);
      console.log('支払日:', paymentDate);

      // 1. 支払日時点での有効等級を取得
      const validGrade = await this.gradeManagementService.getCurrentValidGrade(
        employeeId,
        paymentDate
      );
      if (!validGrade) {
        console.error('有効な等級が見つかりません');
        return null;
      }

      console.log('適用等級:', validGrade);

      // 2. 会計年度を取得
      const fiscalYear = this.getFiscalYear(paymentDate);
      const year = fiscalYear.toString();

      // 3. 等級ベースの保険料計算
      const gradeBasedResult = await this.gradeManagementService.calculateGradeBasedBonusPremium(
        validGrade,
        bonusAmount,
        year,
        prefecture,
        employeeAge
      );

      if (!gradeBasedResult) {
        console.error('等級ベース保険料計算に失敗しました');
        return null;
      }

      // 4. 賞与支払いデータを保存
      const paymentData: Omit<BonusPayment, 'paymentId' | 'createdAt' | 'updatedAt'> = {
        employeeId,
        paymentDate,
        bonusAmount,
        paymentCountType: 'UNDER_3_TIMES', // 等級ベースでは通常3回以下として扱う
        bonusType,
        fiscalYear,
      };

      const paymentId = await this.saveBonusPayment(paymentData);

      // 5. 計算結果を保存
      const calculationResult: BonusCalculationResult = {
        resultId: `${paymentId}_grade_based`,
        paymentId,
        employeeId,
        standardBonusAmountHealth: gradeBasedResult.healthInsurance.standardSalary,
        standardBonusAmountPension: gradeBasedResult.pensionInsurance.standardSalary,
        healthInsurancePremium: gradeBasedResult.healthInsurance.employeeBurden,
        careInsurancePremium: gradeBasedResult.careInsurance?.employeeBurden,
        pensionInsurancePremium: gradeBasedResult.pensionInsurance.employeeBurden,
        childRearingContribution: '0', // 等級ベースでは子ども・子育て拠出金は0として扱う
        employeeBurden: gradeBasedResult.totalEmployeeBurden,
        companyBurden: gradeBasedResult.totalCompanyBurden,
        totalPremium: SocialInsuranceCalculator.addAmounts(
          gradeBasedResult.totalEmployeeBurden,
          gradeBasedResult.totalCompanyBurden
        ),
        calculationSnapshot: JSON.stringify({
          calculationType: 'GRADE_BASED_BONUS',
          appliedGrade: validGrade,
          gradeBasedResult,
          calculatedAt: new Date(),
        }),
        createdAt: new Date(),
      };

      await this.saveBonusCalculationResult(calculationResult);

      console.log('=== 等級ベース賞与保険料計算完了 ===');
      return {
        paymentId,
        gradeBasedResult,
        appliedGrade: validGrade,
      };
    } catch (error) {
      console.error('等級ベース賞与保険料計算エラー:', error);
      return null;
    }
  }

  /**
   * 従来の計算方式と等級ベース計算方式の比較
   * @param employeeId 従業員ID
   * @param bonusAmount 賞与額
   * @param paymentDate 支払日
   * @param bonusType 賞与種類
   * @param employeeAge 従業員年齢
   * @param prefecture 都道府県名
   * @param companyId 会社ID（オプション）
   * @returns 両方式の計算結果比較
   */
  async compareBonusCalculationMethods(
    employeeId: string,
    bonusAmount: string,
    paymentDate: string,
    bonusType: string,
    employeeAge: bigint,
    prefecture: string,
    companyId?: string
  ): Promise<{
    traditional: {
      paymentId: string;
      calculationResult: BonusCalculationResult;
      limitResult: BonusLimitResult;
    } | null;
    gradeBased: {
      paymentId: string;
      gradeBasedResult: GradeBasedPremiumResult;
      appliedGrade: GradeInfo;
    } | null;
    comparison: {
      employeeBurdenDifference: string;
      companyBurdenDifference: string;
      totalPremiumDifference: string;
      recommendedMethod: 'traditional' | 'gradeBased';
    } | null;
  }> {
    try {
      console.log('=== 賞与計算方式比較開始 ===');

      // 1. 従来の計算方式
      const traditionalResult = await this.calculateAndSaveBonusInsurance(
        employeeId,
        bonusAmount,
        paymentDate,
        bonusType,
        employeeAge,
        prefecture,
        companyId
      );

      // 2. 等級ベース計算方式
      const gradeBasedResult = await this.calculateGradeBasedBonusInsurance(
        employeeId,
        bonusAmount,
        paymentDate,
        bonusType,
        employeeAge,
        prefecture,
        companyId
      );

      // 3. 比較分析
      let comparison = null;
      if (traditionalResult && gradeBasedResult) {
        const employeeBurdenDiff = SocialInsuranceCalculator.subtract(
          gradeBasedResult.gradeBasedResult.totalEmployeeBurden,
          traditionalResult.calculationResult.employeeBurden
        );
        const companyBurdenDiff = SocialInsuranceCalculator.subtract(
          gradeBasedResult.gradeBasedResult.totalCompanyBurden,
          traditionalResult.calculationResult.companyBurden
        );
        const totalPremiumDiff = SocialInsuranceCalculator.subtract(
          SocialInsuranceCalculator.addAmounts(
            gradeBasedResult.gradeBasedResult.totalEmployeeBurden,
            gradeBasedResult.gradeBasedResult.totalCompanyBurden
          ),
          traditionalResult.calculationResult.totalPremium
        );

        // より低い保険料の方式を推奨
        const recommendedMethod: 'traditional' | 'gradeBased' =
          SocialInsuranceCalculator.compare(totalPremiumDiff, '0') <= 0
            ? 'gradeBased'
            : 'traditional';

        comparison = {
          employeeBurdenDifference: employeeBurdenDiff,
          companyBurdenDifference: companyBurdenDiff,
          totalPremiumDifference: totalPremiumDiff,
          recommendedMethod,
        };
      }

      console.log('=== 賞与計算方式比較完了 ===');
      return {
        traditional: traditionalResult,
        gradeBased: gradeBasedResult,
        comparison,
      };
    } catch (error) {
      console.error('賞与計算方式比較エラー:', error);
      return {
        traditional: null,
        gradeBased: null,
        comparison: null,
      };
    }
  }
}
