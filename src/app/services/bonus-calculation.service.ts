import { Injectable } from '@angular/core';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
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
  isOnLeave?: boolean; // 育休産休フラグ
  leaveType?: string; // 休業タイプ: 'none', 'maternity', 'childcare'
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
  combinedHealthAndCareRate?: string;
  pensionInsuranceRate: string;
}

export type CalculatedBonusHistoryItem = BonusHistoryItem & {
  calculationResult: BonusPremiumResult;
};

// 休業期間データ型
interface LeavePeriod {
  type: 'maternity' | 'childcare';
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
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
   * 計算済みの賞与データをFirestoreに保存する
   * @param results 計算結果データ
   * @param employeeNumber 従業員番号
   * @param fiscalYear 対象年度
   * @param companyId 会社ID
   */
  public async saveBonusCalculationResults(
    results: CalculatedBonusHistoryItem[],
    employeeNumber: string,
    fiscalYear: bigint,
    companyId: string
  ): Promise<void> {
    if (!companyId || !employeeNumber) {
      console.error('会社IDまたは従業員番号がありません。保存を中止します。');
      return;
    }

    const docPath = `companies/${companyId}/employees/${employeeNumber}/bonus_calculation_results/${fiscalYear}`;
    const docRef = doc(this.firestore, docPath);

    // BigIntを文字列に変換してFirestoreに保存できる形式にする
    const dataToSave = {
      updatedAt: new Date(),
      results: JSON.parse(
        JSON.stringify(results, (_key, value) =>
          typeof value === 'bigint' ? value.toString() : value
        )
      ),
    };

    try {
      await setDoc(docRef, dataToSave, { merge: true });
      console.log(`賞与計算結果を保存しました: ${docPath}`);
    } catch (error) {
      console.error('賞与計算結果の保存に失敗しました:', error);
      throw error; // エラーを呼び出し元に再スローする
    }
  }

  /**
   * コンポーネントから呼び出すメインのオーケストレーションメソッド
   */
  public async getCalculatedBonusHistory(
    employeeId: string,
    fiscalYear: bigint,
    employeeInfo: { age: bigint; addressPrefecture: string; companyId?: string; birthDate: string }
  ): Promise<CalculatedBonusHistoryItem[]> {
    const history = await this.getFiscalYearBonusHistory(
      employeeId,
      fiscalYear,
      employeeInfo.companyId
    );
    if (!history || history.length === 0) {
      return [];
    }

    // 年4回以上支給の賞与は除外
    const filteredHistory = history.filter(
      (b: BonusHistoryItem & { paymentCountType?: string }) =>
        !b.paymentCountType || b.paymentCountType === 'UNDER_3_TIMES'
    );

    // 月内合算処理を削除 - 個別の賞与データをそのまま渡す
    // 差額計算ロジックは calculateBonusPremiums 内で処理される

    const rates = await this.getInsuranceRates(fiscalYear, employeeInfo.addressPrefecture);
    if (!rates) {
      throw new Error('保険料率が取得できませんでした。');
    }

    // 休業期間データ取得
    const leavePeriods = await this.getEmployeeLeavePeriods(employeeId);

    return this.calculateBonusPremiums(
      filteredHistory,
      rates,
      employeeInfo.birthDate,
      leavePeriods
    );
  }

  /**
   * 保険料率の取得
   */
  public async getInsuranceRates(year: bigint, prefecture: string): Promise<InsuranceRates | null> {
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
   * 同一月内複数回支給時は、2回目以降は差額のみ計算する
   */
  private calculateBonusPremiums(
    bonusHistory: BonusHistoryItem[],
    rates: InsuranceRates,
    birthDate: string,
    leavePeriods: LeavePeriod[] = [],
    initialCumulativeHealthBonus = '0'
  ): CalculatedBonusHistoryItem[] {
    // 支給日昇順でソート
    const sortedBonuses = [...bonusHistory].sort((a, b) => {
      const dateA = new Date(a.paymentDate || 0).getTime();
      const dateB = new Date(b.paymentDate || 0).getTime();
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      // 日付が同じ場合は、金額の降順でソート
      return SocialInsuranceCalculator.compare(b.amount, a.amount);
    });

    // 月ごとにグループ化
    const monthlyGroups: Record<string, BonusHistoryItem[]> = {};
    for (const item of sortedBonuses) {
      if (!item.paymentDate) continue;
      const payDate = new Date(item.paymentDate);
      const monthKey = `${payDate.getFullYear()}-${String(payDate.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyGroups[monthKey]) monthlyGroups[monthKey] = [];
      monthlyGroups[monthKey].push(item);
    }

    let cumulativeHealthBonus = initialCumulativeHealthBonus;
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
    const pensionRateDecimal = SocialInsuranceCalculator.divide(
      rates.pensionRate.replace(/[^0-9.]/g, ''),
      '100'
    );

    // 結果格納用
    const results: CalculatedBonusHistoryItem[] = [];

    // 免除時の計算結果テンプレート
    const EXEMPTED_BONUS_RESULT = (rates: InsuranceRates): BonusPremiumResult => ({
      standardBonusAmount: '0',
      cappedPensionStandardAmount: '0',
      isPensionLimitApplied: false,
      applicableHealthStandardAmount: '0',
      isHealthLimitApplied: false,
      pensionInsurance: { employeeBurden: '0', companyBurden: '0' },
      healthInsurance: { employeeBurden: '0', companyBurden: '0' },
      careInsurance: undefined,
      healthInsuranceRate: rates.nonNursingRate,
      pensionInsuranceRate: rates.pensionRate,
      careInsuranceRate: undefined,
      combinedHealthAndCareRate: rates.nursingRate,
    });

    // 月ごとに処理
    for (const monthKey of Object.keys(monthlyGroups).sort()) {
      const items = monthlyGroups[monthKey].sort((a, b) => {
        const dateA = new Date(a.paymentDate || 0).getTime();
        const dateB = new Date(b.paymentDate || 0).getTime();
        return dateA - dateB;
      });
      let prevResult: BonusPremiumResult | null = null;
      for (let i = 0; i < items.length; i++) {
        const subItems = items.slice(0, i + 1);
        // 合計額
        const totalAmount = subItems.reduce(
          (acc, cur) => acc.add(new Decimal(cur.amount)),
          new Decimal(0)
        );
        // 休業免除判定
        const leaveType = items[i].leaveType || '';
        const isExempted =
          this.isExemptedByLeave(items[i].paymentDate || '', leavePeriods) ||
          leaveType === 'maternity' ||
          leaveType === 'childcare';

        // 計算
        let calcResult: BonusPremiumResult;
        if (isExempted) {
          calcResult = EXEMPTED_BONUS_RESULT(rates);
        } else {
          // 通常計算
          const standardBonusAmount = SocialInsuranceCalculator.floorToThousand(
            totalAmount.toString()
          );
          // --- 厚生年金保険料 ---
          let pensionEmployee = '0';
          let pensionCompany = '0';
          let isPensionLimitApplied = false;
          let cappedPensionStandardAmount = standardBonusAmount;
          // 支払日時点の年齢を計算
          const ageAtPayment = this._calculateAgeAtDate(birthDate, items[i].paymentDate!);
          const isCareInsuranceApplicable = ageAtPayment >= 40 && ageAtPayment < 65;
          if (ageAtPayment < 70) {
            isPensionLimitApplied =
              SocialInsuranceCalculator.compare(
                standardBonusAmount,
                PENSION_INSURANCE_MONTHLY_CAP
              ) > 0;
            cappedPensionStandardAmount = isPensionLimitApplied
              ? PENSION_INSURANCE_MONTHLY_CAP
              : standardBonusAmount;
            const pensionTotalDecimal = SocialInsuranceCalculator.multiply(
              cappedPensionStandardAmount,
              pensionRateDecimal
            );
            const pensionEmployeeDecimal = pensionTotalDecimal.div(2);
            pensionEmployee =
              SocialInsuranceCalculator.roundForEmployeeBurden(pensionEmployeeDecimal);
            pensionCompany = pensionTotalDecimal.div(2).toString();
          } else {
            isPensionLimitApplied = false;
            cappedPensionStandardAmount = '0';
          }
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
          // 健康保険料率を決定
          const healthRateDecimal = isCareInsuranceApplicable
            ? nursingRateDecimal
            : nonNursingRateDecimal;
          const healthInsuranceRateStr = isCareInsuranceApplicable
            ? rates.nursingRate
            : rates.nonNursingRate;
          // 健康保険料の計算
          const healthTotalDecimal = SocialInsuranceCalculator.multiply(
            applicableHealthStandardAmount,
            healthRateDecimal.toString()
          );
          const healthEmployeeDecimal = healthTotalDecimal.div(2);
          const healthInsuranceEmployee =
            SocialInsuranceCalculator.roundForEmployeeBurden(healthEmployeeDecimal);
          const healthInsurance = {
            employeeBurden: healthInsuranceEmployee,
            companyBurden: healthTotalDecimal.div(2).toString(),
          };
          calcResult = {
            standardBonusAmount,
            cappedPensionStandardAmount,
            isPensionLimitApplied,
            applicableHealthStandardAmount,
            isHealthLimitApplied,
            pensionInsurance: { employeeBurden: pensionEmployee, companyBurden: pensionCompany },
            healthInsurance,
            healthInsuranceRate: healthInsuranceRateStr,
            pensionInsuranceRate: rates.pensionRate,
            // careInsurance, careInsuranceRate, combinedHealthAndCareRateは不要
          };
        }
        // 差額計算
        let diffResult: BonusPremiumResult = calcResult;
        if (i > 0 && prevResult) {
          // 各保険料の差額を計算
          const diff = (a: string, b: string) => new Decimal(a).minus(new Decimal(b)).toString();
          diffResult = {
            ...calcResult,
            pensionInsurance: {
              employeeBurden: diff(
                calcResult.pensionInsurance.employeeBurden,
                prevResult.pensionInsurance.employeeBurden
              ),
              companyBurden: diff(
                calcResult.pensionInsurance.companyBurden,
                prevResult.pensionInsurance.companyBurden
              ),
            },
            healthInsurance: {
              employeeBurden: diff(
                calcResult.healthInsurance.employeeBurden,
                prevResult.healthInsurance.employeeBurden
              ),
              companyBurden: diff(
                calcResult.healthInsurance.companyBurden,
                prevResult.healthInsurance.companyBurden
              ),
            },
            careInsurance:
              calcResult.careInsurance && prevResult.careInsurance
                ? {
                    employeeBurden: diff(
                      calcResult.careInsurance.employeeBurden,
                      prevResult.careInsurance.employeeBurden
                    ),
                    companyBurden: diff(
                      calcResult.careInsurance.companyBurden,
                      prevResult.careInsurance.companyBurden
                    ),
                  }
                : calcResult.careInsurance,
          };
          // マイナスは0に
          const zeroIfNegative = (v: string) => (new Decimal(v).isNegative() ? '0' : v);
          diffResult.pensionInsurance.employeeBurden = zeroIfNegative(
            diffResult.pensionInsurance.employeeBurden
          );
          diffResult.pensionInsurance.companyBurden = zeroIfNegative(
            diffResult.pensionInsurance.companyBurden
          );
          diffResult.healthInsurance.employeeBurden = zeroIfNegative(
            diffResult.healthInsurance.employeeBurden
          );
          diffResult.healthInsurance.companyBurden = zeroIfNegative(
            diffResult.healthInsurance.companyBurden
          );
          if (diffResult.careInsurance) {
            diffResult.careInsurance.employeeBurden = zeroIfNegative(
              diffResult.careInsurance.employeeBurden
            );
            diffResult.careInsurance.companyBurden = zeroIfNegative(
              diffResult.careInsurance.companyBurden
            );
          }
        }
        // 結果をpush
        results.push({ ...items[i], calculationResult: diffResult });
        prevResult = calcResult;
      }
    }
    return results;
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

  /**
   * Firestoreから従業員の産休・育休期間データを取得
   */
  private async getEmployeeLeavePeriods(employeeId: string): Promise<LeavePeriod[]> {
    // maternity-leaves, childcare-leaves などのコレクション構造を想定
    const periods: LeavePeriod[] = [];
    // 産休
    const maternityRef = doc(this.firestore, 'employee-leaves', employeeId, 'maternity', 'current');
    const maternitySnap = await getDoc(maternityRef);
    if (maternitySnap.exists()) {
      const data = maternitySnap.data();
      periods.push({
        type: 'maternity',
        startDate: data['startDate'],
        endDate: data['endDate'],
      });
    }
    // 育休
    const childcareRef = doc(this.firestore, 'employee-leaves', employeeId, 'childcare', 'current');
    const childcareSnap = await getDoc(childcareRef);
    if (childcareSnap.exists()) {
      const data = childcareSnap.data();
      periods.push({
        type: 'childcare',
        startDate: data['startDate'],
        endDate: data['endDate'],
      });
    }
    return periods;
  }

  /**
   * 指定日が休業期間内かどうか判定（産休・育休）
   * 育休は1ヶ月超の期間のみ免除対象
   */
  private isExemptedByLeave(paymentDate: string, leavePeriods: LeavePeriod[]): boolean {
    if (!paymentDate) return false;
    const payDate = new Date(paymentDate);
    // 支払月の末日を取得
    const endOfMonth = new Date(payDate.getFullYear(), payDate.getMonth() + 1, 0);
    for (const period of leavePeriods) {
      const start = new Date(period.startDate);
      const end = new Date(period.endDate);
      if (endOfMonth >= start && endOfMonth <= end) {
        if (period.type === 'maternity') {
          return true;
        } else if (period.type === 'childcare') {
          // 育休期間が1ヶ月超か判定
          const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
          if (diff > 30) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * 支払日時点の満年齢を計算
   */
  private _calculateAgeAtDate(birthDateStr: string, targetDateStr: string): number {
    const birthDate = new Date(birthDateStr);
    const targetDate = new Date(targetDateStr);
    let age = targetDate.getFullYear() - birthDate.getFullYear();
    const m = targetDate.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && targetDate.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  /**
   * 単一の賞与アイテムの保険料を計算する
   * @param bonusItem 計算対象の賞与データ
   * @param employeeInfo 従業員情報
   * @param cumulativeHealthBonus 年間累計標準賞与額（健康保険）
   * @returns 計算結果
   */
  public async calculateSingleBonusPremium(
    bonusItem: BonusHistoryItem,
    employeeInfo: { age: bigint; addressPrefecture: string; birthDate: string; companyId?: string },
    cumulativeHealthBonus = '0'
  ): Promise<CalculatedBonusHistoryItem | null> {
    const rates = await this.getInsuranceRates(
      bonusItem.fiscalYear || BigInt(new Date().getFullYear()),
      employeeInfo.addressPrefecture
    );

    if (!rates) {
      console.error('保険料率が取得できませんでした。');
      return null;
    }

    // 単一アイテムを配列に入れて既存のロジックを再利用
    const calculatedItems = this.calculateBonusPremiums(
      [bonusItem],
      rates,
      employeeInfo.birthDate,
      [], // 休業期間はここでは考慮しない
      cumulativeHealthBonus
    );

    return calculatedItems.length > 0 ? calculatedItems[0] : null;
  }
}
