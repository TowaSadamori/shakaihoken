import { Injectable } from '@angular/core';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  query,
  getDocs,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { SocialInsuranceCalculator } from '../utils/decimal-calculator';

// 等級情報のインターフェース
export interface GradeInfo {
  healthInsuranceGrade: bigint;
  pensionInsuranceGrade: bigint;
  careInsuranceGrade?: bigint;
  standardMonthlyAmount: string;
  effectiveDate: Date;
  endDate?: Date;
  judgmentType: 'manual' | 'regular' | 'irregular';
  source: 'gradeJudgments' | 'employee_grades';
}

// 保険料額表の行データ
export interface InsuranceRateTableRow {
  grade: string;
  standardSalary: string;
  salaryRange: string;
  nonNursingRate: string;
  nonNursingTotal: string; // Decimal文字列
  nonNursingHalf: string; // Decimal文字列
  nursingRate: string;
  nursingTotal: string; // Decimal文字列
  nursingHalf: string; // Decimal文字列
  pensionRate: string;
  pensionTotal: string; // Decimal文字列
  pensionHalf: string; // Decimal文字列
}

// 厚生年金保険料額表の行データ
export interface PensionRateTableRow {
  grade: bigint;
  standardSalary: string;
  salaryRange: string;
  pensionRate: string;
  pensionTotal: string; // Decimal文字列
  pensionHalf: string; // Decimal文字列
}

// 保険料額表データ
export interface InsuranceRateTable {
  insuranceTable: InsuranceRateTableRow[];
  pensionTable: PensionRateTableRow[];
  rates: {
    nonNursingRate: string;
    nursingRate: string;
    pensionRate: string;
  };
  updatedAt: Date;
}

// 等級に基づく保険料計算結果
export interface GradeBasedPremiumResult {
  healthInsurance: {
    grade: bigint;
    standardSalary: string;
    employeeBurden: string;
    companyBurden: string;
    totalPremium: string;
  };
  careInsurance?: {
    grade: bigint;
    standardSalary: string;
    employeeBurden: string;
    companyBurden: string;
    totalPremium: string;
  };
  pensionInsurance: {
    grade: bigint;
    standardSalary: string;
    employeeBurden: string;
    companyBurden: string;
    totalPremium: string;
  };
  totalEmployeeBurden: string;
  totalCompanyBurden: string;
  appliedGrade: GradeInfo;
}

@Injectable({
  providedIn: 'root',
})
export class GradeManagementService {
  private firestore = getFirestore();

  constructor() {
    // Initialize service
  }

  /**
   * 指定日時点での有効な等級を取得
   * @param employeeId 従業員ID
   * @param targetDate 対象日（YYYY-MM-DD）
   * @returns 有効な等級情報
   */
  async getCurrentValidGrade(employeeId: string, targetDate: string): Promise<GradeInfo | null> {
    try {
      console.log('等級取得開始:', { employeeId, targetDate });

      const target = new Date(targetDate);
      let validGrade: GradeInfo | null = null;

      // 1. gradeJudgmentsコレクションから検索
      const gradeJudgmentsRef = collection(
        this.firestore,
        'gradeJudgments',
        employeeId,
        'judgments'
      );
      const gradeJudgmentsQuery = query(gradeJudgmentsRef, orderBy('effectiveDate', 'desc'));
      const gradeJudgmentsSnapshot = await getDocs(gradeJudgmentsQuery);

      for (const doc of gradeJudgmentsSnapshot.docs) {
        const data = doc.data();
        const effectiveDate = this.convertToDate(data['effectiveDate']);
        const endDate = data['endDate'] ? this.convertToDate(data['endDate']) : null;

        // 有効期間内かチェック
        if (effectiveDate <= target && (!endDate || target <= endDate)) {
          validGrade = {
            healthInsuranceGrade: BigInt(data['healthInsuranceGrade']),
            pensionInsuranceGrade: BigInt(data['pensionInsuranceGrade']),
            careInsuranceGrade: data['careInsuranceGrade']
              ? BigInt(data['careInsuranceGrade'])
              : undefined,
            standardMonthlyAmount: data['standardMonthlyAmount'],
            effectiveDate: effectiveDate,
            endDate: endDate || undefined,
            judgmentType: data['judgmentType'],
            source: 'gradeJudgments',
          };
          break;
        }
      }

      // 2. employee_gradesコレクションから検索（gradeJudgmentsで見つからない場合）
      if (!validGrade) {
        const gradeTypes = ['manual', 'regular', 'revision'];

        for (const gradeType of gradeTypes) {
          const docId = `${employeeId}_${gradeType}`;
          const docRef = doc(this.firestore, 'employee_grades', docId);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            const applicableYear = Number(data['applicableYear']);
            const applicableMonth = Number(data['applicableMonth']);
            const effectiveDate = new Date(applicableYear, applicableMonth - 1, 1);

            let endDate: Date | undefined;
            if (data['endYear'] && data['endMonth']) {
              const endYear = Number(data['endYear']);
              const endMonth = Number(data['endMonth']);
              endDate = new Date(endYear, endMonth - 1, 1);
            }

            // 有効期間内かチェック
            if (effectiveDate <= target && (!endDate || target <= endDate)) {
              const judgmentResult = data['judgmentResult'];
              validGrade = {
                healthInsuranceGrade: BigInt(judgmentResult['healthInsuranceGrade']),
                pensionInsuranceGrade: BigInt(judgmentResult['pensionInsuranceGrade']),
                careInsuranceGrade: judgmentResult['careInsuranceGrade']
                  ? BigInt(judgmentResult['careInsuranceGrade'])
                  : undefined,
                standardMonthlyAmount:
                  gradeType === 'manual' ? data['monthlyAmount'] : data['averageAmount'],
                effectiveDate: effectiveDate,
                endDate: endDate,
                judgmentType: gradeType as 'manual' | 'regular' | 'irregular',
                source: 'employee_grades',
              };
              break;
            }
          }
        }
      }

      console.log('取得した等級情報:', validGrade);
      return validGrade;
    } catch (error) {
      console.error('等級取得エラー:', error);
      return null;
    }
  }

  /**
   * 保険料額表を取得
   * @param year 年度
   * @param prefecture 都道府県名
   * @returns 保険料額表データ
   */
  async getInsuranceRateTable(
    year: string,
    prefecture: string
  ): Promise<InsuranceRateTable | null> {
    try {
      console.log('保険料額表取得開始:', { year, prefecture });

      const docRef = doc(
        this.firestore,
        `insurance_rates/${year}/prefectures/${prefecture}/rate_table/main`
      );
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        console.log('保険料額表が見つかりません');
        return null;
      }

      const data = docSnap.data();

      // 数値データをDecimal文字列に変換
      const insuranceTable: InsuranceRateTableRow[] = (data['insuranceTable'] || []).map(
        (row: Partial<InsuranceRateTableRow>) => ({
          grade: row.grade ?? '',
          standardSalary: row.standardSalary ?? '',
          salaryRange: row.salaryRange ?? '',
          nonNursingRate: row.nonNursingRate ?? '',
          nonNursingTotal: row.nonNursingTotal?.toString() || '0',
          nonNursingHalf: row.nonNursingHalf?.toString() || '0',
          nursingRate: row.nursingRate ?? '',
          nursingTotal: row.nursingTotal?.toString() || '0',
          nursingHalf: row.nursingHalf?.toString() || '0',
          pensionRate: row.pensionRate ?? '',
          pensionTotal: row.pensionTotal?.toString() || '0',
          pensionHalf: row.pensionHalf?.toString() || '0',
        })
      );

      const pensionTable: PensionRateTableRow[] = (data['pensionTable'] || []).map(
        (row: Partial<PensionRateTableRow> & { grade?: string | number }) => ({
          grade: BigInt(row.grade ?? 0),
          standardSalary: row.standardSalary ?? '',
          salaryRange: row.salaryRange ?? '',
          pensionRate: row.pensionRate ?? '',
          pensionTotal: row.pensionTotal?.toString() || '0',
          pensionHalf: row.pensionHalf?.toString() || '0',
        })
      );

      const result: InsuranceRateTable = {
        insuranceTable,
        pensionTable,
        rates: data['rates'] || { nonNursingRate: '', nursingRate: '', pensionRate: '' },
        updatedAt: this.convertToDate(data['updatedAt']),
      };

      console.log('保険料額表取得完了:', result);
      return result;
    } catch (error) {
      console.error('保険料額表取得エラー:', error);
      return null;
    }
  }

  /**
   * 等級に基づく賞与保険料を計算
   * @param gradeInfo 等級情報
   * @param bonusAmount 賞与額
   * @param year 年度
   * @param prefecture 都道府県名
   * @param employeeAge 従業員年齢
   * @returns 保険料計算結果
   */
  async calculateGradeBasedBonusPremium(
    gradeInfo: GradeInfo,
    bonusAmount: string,
    year: string,
    prefecture: string,
    employeeAge: bigint
  ): Promise<GradeBasedPremiumResult | null> {
    try {
      console.log('等級ベース賞与保険料計算開始:', {
        gradeInfo,
        bonusAmount,
        year,
        prefecture,
        employeeAge,
      });

      // 保険料額表を取得
      const rateTable = await this.getInsuranceRateTable(year, prefecture);
      if (!rateTable) {
        throw new Error('保険料額表が取得できません');
      }

      // 標準賞与額を計算（1,000円未満切り捨て）
      const standardBonusAmount = SocialInsuranceCalculator.floorToThousand(bonusAmount);

      // 健康保険の等級に対応する保険料を取得
      const healthInsuranceRow = rateTable.insuranceTable.find(
        (row) => row.grade === gradeInfo.healthInsuranceGrade.toString()
      );

      if (!healthInsuranceRow) {
        throw new Error(`健康保険等級${gradeInfo.healthInsuranceGrade}の保険料が見つかりません`);
      }

      // 厚生年金保険の等級に対応する保険料を取得
      const pensionRow = rateTable.pensionTable.find(
        (row) => row.grade === gradeInfo.pensionInsuranceGrade
      );

      if (!pensionRow) {
        throw new Error(
          `厚生年金保険等級${gradeInfo.pensionInsuranceGrade}の保険料が見つかりません`
        );
      }

      // 標準賞与額に基づく保険料計算（等級の標準報酬月額ではなく、実際の賞与額ベース）
      const healthPremiumEmployee = SocialInsuranceCalculator.multiplyAndFloor(
        standardBonusAmount,
        SocialInsuranceCalculator.divide(rateTable.rates.nonNursingRate.replace('%', ''), '200') // 個人負担は半分
      );
      const healthPremiumCompany = healthPremiumEmployee;
      const healthPremiumTotal = SocialInsuranceCalculator.addAmounts(
        healthPremiumEmployee,
        healthPremiumCompany
      );

      const pensionPremiumEmployee = SocialInsuranceCalculator.multiplyAndFloor(
        standardBonusAmount,
        SocialInsuranceCalculator.divide(rateTable.rates.pensionRate.replace('%', ''), '200') // 個人負担は半分
      );
      const pensionPremiumCompany = pensionPremiumEmployee;
      const pensionPremiumTotal = SocialInsuranceCalculator.addAmounts(
        pensionPremiumEmployee,
        pensionPremiumCompany
      );

      // 結果オブジェクトを構築
      const result: GradeBasedPremiumResult = {
        healthInsurance: {
          grade: gradeInfo.healthInsuranceGrade,
          standardSalary: standardBonusAmount,
          employeeBurden: healthPremiumEmployee,
          companyBurden: healthPremiumCompany,
          totalPremium: healthPremiumTotal,
        },
        pensionInsurance: {
          grade: gradeInfo.pensionInsuranceGrade,
          standardSalary: standardBonusAmount,
          employeeBurden: pensionPremiumEmployee,
          companyBurden: pensionPremiumCompany,
          totalPremium: pensionPremiumTotal,
        },
        totalEmployeeBurden: SocialInsuranceCalculator.addAmounts(
          healthPremiumEmployee,
          pensionPremiumEmployee
        ),
        totalCompanyBurden: SocialInsuranceCalculator.addAmounts(
          healthPremiumCompany,
          pensionPremiumCompany
        ),
        appliedGrade: gradeInfo,
      };

      // 介護保険（40歳以上の場合）
      if (employeeAge >= BigInt(40) && gradeInfo.careInsuranceGrade) {
        const carePremiumEmployee = SocialInsuranceCalculator.multiplyAndFloor(
          standardBonusAmount,
          SocialInsuranceCalculator.divide(rateTable.rates.nursingRate.replace('%', ''), '200') // 個人負担は半分
        );
        const carePremiumCompany = carePremiumEmployee;
        const carePremiumTotal = SocialInsuranceCalculator.addAmounts(
          carePremiumEmployee,
          carePremiumCompany
        );

        result.careInsurance = {
          grade: gradeInfo.careInsuranceGrade,
          standardSalary: standardBonusAmount,
          employeeBurden: carePremiumEmployee,
          companyBurden: carePremiumCompany,
          totalPremium: carePremiumTotal,
        };

        // 合計に介護保険を追加
        result.totalEmployeeBurden = SocialInsuranceCalculator.addAmounts(
          result.totalEmployeeBurden,
          carePremiumEmployee
        );
        result.totalCompanyBurden = SocialInsuranceCalculator.addAmounts(
          result.totalCompanyBurden,
          carePremiumCompany
        );
      }

      console.log('等級ベース保険料計算完了:', result);
      return result;
    } catch (error) {
      console.error('等級ベース保険料計算エラー:', error);
      return null;
    }
  }

  /**
   * Timestamp型またはDate型をDate型に変換
   */
  private convertToDate(value: unknown): Date {
    if (value instanceof Timestamp) {
      return value.toDate();
    } else if (value instanceof Date) {
      return value;
    } else if (typeof value === 'string') {
      return new Date(value);
    } else {
      return new Date();
    }
  }
}
