import { Injectable } from '@angular/core';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { SocialInsuranceCalculator } from '../utils/decimal-calculator';
import { Decimal } from 'decimal.js';

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

// --- 新しいインターフェース ---
export interface InsuranceRates {
  nonNursingRate: string;
  nursingRate: string;
  pensionRate: string;
}

export interface BonusPremiumResult {
  standardBonusAmount: string;
  cappedPensionStandardAmount: string;
  isPensionLimitApplied: boolean;
  applicableHealthStandardAmount: string;
  isHealthLimitApplied: boolean;
  healthInsurance: { employeeBurden: string; companyBurden: string };
  careInsurance?: { employeeBurden: string; companyBurden: string };
  pensionInsurance: { employeeBurden: string; companyBurden: string };
  healthInsuranceRate: string;
  careInsuranceRate?: string;
  pensionInsuranceRate: string;
}

export type CalculatedBonusHistoryItem = BonusHistoryItem & {
  calculationResult: BonusPremiumResult;
};

@Injectable({
  providedIn: 'root',
})
export class BonusCalculationService {
  private firestore = getFirestore();

  constructor() {
    // Firebase初期化は既にapp.config.tsで行われている
  }

  /**
   * コンポーネントから呼び出すメインのオーケストレーションメソッド
   */
  public async getCalculatedBonusHistory(
    employeeId: string,
    fiscalYear: bigint,
    employeeInfo: { age: bigint; addressPrefecture: string; companyId?: string }
  ): Promise<CalculatedBonusHistoryItem[]> {
    const history = await this.getFiscalYearBonusHistory(
      employeeId,
      fiscalYear,
      employeeInfo.companyId
    );
    if (!history || history.length === 0) {
      return [];
    }

    const rates = await this.getInsuranceRates(fiscalYear, employeeInfo.addressPrefecture);
    if (!rates) {
      throw new Error('保険料率が取得できませんでした。');
    }

    return this.calculateBonusPremiums(history, rates, employeeInfo.age);
  }

  /**
   * 保険料率の取得
   */
  private async getInsuranceRates(
    year: bigint,
    prefecture: string
  ): Promise<InsuranceRates | null> {
    const normalizedPrefecture = prefecture.replace(/(都|道|府|県)$/, '');
    const docPath = `insurance_rates/${year.toString()}/prefectures/${normalizedPrefecture}/rate_table/main`;
    const docRef = doc(this.firestore, docPath);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.error('保険料率データが見つかりません:', { year, prefecture });
      return null;
    }

    const rateData = docSnap.data();
    return {
      nonNursingRate: rateData['rates']['nonNursingRate'],
      nursingRate: rateData['rates']['nursingRate'],
      pensionRate: rateData['rates']['pensionRate'],
    };
  }

  /**
   * 賞与保険料の計算ロジック
   */
  private calculateBonusPremiums(
    bonusHistory: BonusHistoryItem[],
    rates: InsuranceRates,
    employeeAge: bigint
  ): CalculatedBonusHistoryItem[] {
    const sortedBonuses = [...bonusHistory].sort((a, b) => {
      const dateA = new Date(a.paymentDate || 0).getTime();
      const dateB = new Date(b.paymentDate || 0).getTime();
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      // 日付が同じ場合は、金額の降順でソート
      return SocialInsuranceCalculator.compare(b.amount, a.amount);
    });

    let cumulativeHealthBonus = '0';
    const HEALTH_INSURANCE_YEARLY_CAP = '5730000';
    const PENSION_INSURANCE_MONTHLY_CAP = '1500000';

    const nonNursingRateDecimal = SocialInsuranceCalculator.divide(
      rates.nonNursingRate.replace(/[^0-9.]/g, ''),
      '100'
    );
    const nursingRateDecimal = SocialInsuranceCalculator.divide(
      rates.nursingRate.replace(/[^0-9.]/g, ''),
      '100'
    );
    const careInsuranceRateDecimal = SocialInsuranceCalculator.subtract(
      nursingRateDecimal,
      nonNursingRateDecimal
    );
    const pensionRateDecimal = SocialInsuranceCalculator.divide(
      rates.pensionRate.replace(/[^0-9.]/g, ''),
      '100'
    );

    return sortedBonuses.map((item) => {
      const standardBonusAmount = SocialInsuranceCalculator.floorToThousand(item.amount);

      // --- 厚生年金保険料 ---
      const isPensionLimitApplied =
        SocialInsuranceCalculator.compare(standardBonusAmount, PENSION_INSURANCE_MONTHLY_CAP) > 0;
      const cappedPensionStandardAmount = isPensionLimitApplied
        ? PENSION_INSURANCE_MONTHLY_CAP
        : standardBonusAmount;

      // 新しい計算ロジック: 四捨五入ベース
      const pensionTotalDecimal = SocialInsuranceCalculator.multiply(
        cappedPensionStandardAmount,
        pensionRateDecimal
      );
      const pensionEmployeeDecimal = pensionTotalDecimal
        .div(2)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const pensionCompanyDecimal = pensionTotalDecimal
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .sub(pensionEmployeeDecimal);

      const pensionEmployee = pensionEmployeeDecimal.toString();
      const pensionCompany = pensionCompanyDecimal.toString();

      // --- 健康保険料 ---
      const remainingCap = SocialInsuranceCalculator.subtract(
        HEALTH_INSURANCE_YEARLY_CAP,
        cumulativeHealthBonus
      );
      const positiveRemainingCap =
        SocialInsuranceCalculator.compare(remainingCap, '0') > 0 ? remainingCap : '0';

      const isHealthLimitApplied =
        SocialInsuranceCalculator.compare(standardBonusAmount, positiveRemainingCap) > 0;
      const applicableHealthStandardAmount = isHealthLimitApplied
        ? positiveRemainingCap
        : standardBonusAmount;

      cumulativeHealthBonus = SocialInsuranceCalculator.addAmounts(
        cumulativeHealthBonus,
        standardBonusAmount
      );

      // 新しい計算ロジック: 四捨五入ベース
      const healthTotalDecimal = SocialInsuranceCalculator.multiply(
        applicableHealthStandardAmount,
        nonNursingRateDecimal
      );
      const healthEmployeeDecimal = healthTotalDecimal
        .div(2)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const healthCompanyDecimal = healthTotalDecimal
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
        .sub(healthEmployeeDecimal);
      const healthEmployee = healthEmployeeDecimal.toString();
      const healthCompany = healthCompanyDecimal.toString();

      // --- 介護保険料 (40歳以上) ---
      let careResult: { employeeBurden: string; companyBurden: string } | undefined;
      if (employeeAge >= 40n) {
        // 新しい計算ロジック: 四捨五入ベース
        const careTotalDecimal = SocialInsuranceCalculator.multiply(
          applicableHealthStandardAmount,
          careInsuranceRateDecimal
        );
        const careEmployeeDecimal = careTotalDecimal
          .div(2)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        const careCompanyDecimal = careTotalDecimal
          .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          .sub(careEmployeeDecimal);
        careResult = {
          employeeBurden: careEmployeeDecimal.toString(),
          companyBurden: careCompanyDecimal.toString(),
        };
      }

      const calculationResult: BonusPremiumResult = {
        standardBonusAmount,
        cappedPensionStandardAmount,
        isPensionLimitApplied,
        applicableHealthStandardAmount,
        isHealthLimitApplied,
        pensionInsurance: { employeeBurden: pensionEmployee, companyBurden: pensionCompany },
        healthInsurance: { employeeBurden: healthEmployee, companyBurden: healthCompany },
        careInsurance: careResult,
        healthInsuranceRate: `${new Decimal(rates.nonNursingRate.replace(/[^0-9.]/g, '')).toFixed(
          3
        )}%`,
        pensionInsuranceRate: `${new Decimal(rates.pensionRate.replace(/[^0-9.]/g, '')).toFixed(
          3
        )}%`,
        careInsuranceRate:
          employeeAge >= 40n
            ? `${new Decimal(careInsuranceRateDecimal).times(100).toFixed(3)}%`
            : undefined,
      };

      return { ...item, calculationResult };
    });
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

      // 賞与データと支給年月日データを抽出
      const bonusAmounts: Record<string, string> = {};
      const bonusDates: Record<string, string> = {};

      // 合計セクションから賞与金額を抽出
      if (salaryData.salaryTable['合計'] && typeof salaryData.salaryTable['合計'] === 'object') {
        const totalSection = salaryData.salaryTable['合計'] as Record<string, string>;
        Object.entries(totalSection).forEach(([key, value]) => {
          // 賞与金額の抽出（全角括弧で検索）
          if (key.startsWith('賞与（') && key.includes('回目')) {
            const amount = typeof value === 'string' ? value : String(value) || '0';
            const amountBigInt = BigInt(amount) || 0n;
            if (amountBigInt > 0n) {
              bonusAmounts[key] = amount;
            }
          }
        });
      }

      // 支給年月日データの抽出
      if (
        salaryData.salaryTable['支給年月日'] &&
        typeof salaryData.salaryTable['支給年月日'] === 'object'
      ) {
        const paymentDateSection = salaryData.salaryTable['支給年月日'] as Record<string, string>;
        Object.entries(paymentDateSection).forEach(([key, value]) => {
          if (key.startsWith('賞与（') && typeof value === 'string') {
            bonusDates[key] = value;
          }
        });
      }

      // 賞与データを結合してBonusHistoryItemを作成
      Object.entries(bonusAmounts).forEach(([key, amount]) => {
        const paymentDate = bonusDates[key];
        if (paymentDate) {
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
          }
        } else {
          let defaultMonth = 12n;
          let defaultYear = fiscalYear;

          if (key.includes('1回目')) {
            defaultMonth = 7n;
          } else if (key.includes('2回目')) {
            defaultMonth = 12n;
          } else if (key.includes('3回目')) {
            defaultMonth = 3n;
            defaultYear = fiscalYear + 1n;
          }

          const defaultPaymentDate = `${defaultYear}/${defaultMonth
            .toString()
            .padStart(2, '0')}/10`;

          allBonuses.push({
            type: this.mapBonusType(key),
            amount,
            month: defaultMonth,
            year: defaultYear,
            originalKey: key,
            fiscalYear: fiscalYear,
            paymentDate: defaultPaymentDate,
          });
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
  private async getEmployeeSalaryBonusData(
    employeeId: string,
    year: bigint,
    companyId?: string
  ): Promise<FirestoreSalaryData | null> {
    try {
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
}
