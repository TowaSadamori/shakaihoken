import { Injectable } from '@angular/core';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { User } from './user.service';
import { OfficeService } from './office.service';
import { SocialInsuranceCalculator } from '../utils/decimal-calculator';
import { CalculatedBonusHistoryItem } from './bonus-calculation.service';

// monthlyResults内の各レコードの型を定義
interface MonthlyRecord {
  month: number;
  healthInsuranceFeeEmployee: string;
  healthInsuranceFeeCompany: string;
  careInsuranceFeeEmployee: string;
  careInsuranceFeeCompany: string;
  pensionInsuranceFeeEmployee: string;
  pensionInsuranceFeeCompany: string;
  healthInsuranceGrade: string;
  pensionInsuranceGrade: string;
  year: number;
}

// 計算結果のインターフェース
export interface MonthlyInsuranceFee {
  healthInsuranceEmployee: string;
  healthInsuranceCompany: string;
  pensionInsuranceEmployee: string;
  pensionInsuranceCompany: string;
  careInsuranceEmployee: string;
  careInsuranceCompany: string;
  totalEmployee: string;
  totalCompany: string;
  healthInsuranceGrade?: number;
  pensionInsuranceGrade?: number;
  paymentAmount?: string;
  standardBonusAmount?: string;
  healthInsuranceRate?: string;
  careInsuranceRate?: string;
  pensionInsuranceRate?: string;
}

@Injectable({
  providedIn: 'root',
})
export class InsuranceCalculationService {
  private firestore = getFirestore();

  constructor(private officeService: OfficeService) {}

  // Firestoreのsalary_calculation_resultsからデータを取得するロジック
  private async fetchInsuranceFeeDetails(
    user: User,
    year: number,
    month: number
  ): Promise<MonthlyInsuranceFee | null> {
    if (!user.companyId || !user.employeeNumber) {
      return null;
    }

    // 正しいドキュメントパスを構築
    const docPath = `companies/${user.companyId}/employees/${user.employeeNumber}/salary_calculation_results/${year}`;
    const docRef = doc(this.firestore, docPath);

    try {
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        return null;
      }

      const yearData = docSnap.data();

      // 入れ子になったmonthlyResultsオブジェクトを取得
      const monthlyResults = yearData['monthlyResults'];
      if (!monthlyResults) {
        return null;
      }

      // monthlyResultsの中から、引数monthと一致するmonthフィールドを持つオブジェクトを探す
      const monthData = Object.values(monthlyResults).find(
        (data) => (data as MonthlyRecord).month === month
      ) as MonthlyRecord | undefined;

      if (!monthData) {
        return null;
      }

      // FirestoreのデータからMonthlyInsuranceFeeを組み立てる
      // カンマ付き文字列を数値に変換可能な形式にサニタイズする
      const sanitize = (val: string | undefined) => (val || '0').replace(/,/g, '');

      const healthEmployee = sanitize(monthData['healthInsuranceFeeEmployee']);
      const healthCompany = sanitize(monthData['healthInsuranceFeeCompany']);
      const careEmployee =
        monthData['careInsuranceFeeEmployee'] === '-'
          ? '0'
          : sanitize(monthData['careInsuranceFeeEmployee']);
      const careCompany =
        monthData['careInsuranceFeeCompany'] === '-'
          ? '0'
          : sanitize(monthData['careInsuranceFeeCompany']);
      const pensionEmployee = sanitize(monthData['pensionInsuranceFeeEmployee']);
      const pensionCompany = sanitize(monthData['pensionInsuranceFeeCompany']);

      const healthAndCareEmployee = SocialInsuranceCalculator.addAmounts(
        healthEmployee,
        careEmployee
      );
      const healthAndCareCompany = SocialInsuranceCalculator.addAmounts(healthCompany, careCompany);
      const totalEmployee = SocialInsuranceCalculator.addAmounts(
        healthAndCareEmployee,
        pensionEmployee
      );
      const totalCompany = SocialInsuranceCalculator.addAmounts(
        healthAndCareCompany,
        pensionCompany
      );

      return {
        healthInsuranceEmployee: healthEmployee,
        healthInsuranceCompany: healthCompany,
        pensionInsuranceEmployee: pensionEmployee,
        pensionInsuranceCompany: pensionCompany,
        careInsuranceEmployee: careEmployee,
        careInsuranceCompany: careCompany,
        totalEmployee: totalEmployee,
        totalCompany: totalCompany,
        healthInsuranceGrade: Number(monthData['healthInsuranceGrade']) || undefined,
        pensionInsuranceGrade: Number(monthData['pensionInsuranceGrade']) || undefined,
      };
    } catch (error) {
      console.error(`保険料詳細データの取得エラー: ${docPath}`, error);
      return null;
    }
  }

  async calculateForMonth(user: User, year: number, month: number): Promise<MonthlyInsuranceFee> {
    const emptyResult: MonthlyInsuranceFee = {
      healthInsuranceEmployee: '0',
      healthInsuranceCompany: '0',
      pensionInsuranceEmployee: '0',
      pensionInsuranceCompany: '0',
      careInsuranceEmployee: '0',
      careInsuranceCompany: '0',
      totalEmployee: '0',
      totalCompany: '0',
    };

    if (!user.uid || !user.birthDate || !user.employeeNumber) {
      return emptyResult;
    }

    // 賞与の場合の処理 (月が13以上)
    if (month >= 13) {
      const bonusIndex = month - 13; // 0, 1, 2
      return this.fetchAndFormatBonusResult(user, year, bonusIndex);
    }

    // Firestoreから詳細データを取得
    const details = await this.fetchInsuranceFeeDetails(user, year, month);

    // データがあればそれを返し、なければ空の結果を返す
    return details || emptyResult;
  }

  // Firestoreから保存済みの賞与計算結果を取得して整形するメソッド
  private async fetchAndFormatBonusResult(
    user: User,
    year: number,
    bonusIndex: number
  ): Promise<MonthlyInsuranceFee> {
    const emptyResult: MonthlyInsuranceFee = {
      healthInsuranceEmployee: '0',
      healthInsuranceCompany: '0',
      pensionInsuranceEmployee: '0',
      pensionInsuranceCompany: '0',
      careInsuranceEmployee: '0',
      careInsuranceCompany: '0',
      totalEmployee: '0',
      totalCompany: '0',
    };

    if (!user.companyId || !user.employeeNumber) return emptyResult;

    const docPath = `companies/${user.companyId}/employees/${user.employeeNumber}/bonus_calculation_results/${year}`;
    const docRef = doc(this.firestore, docPath);

    try {
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const savedData = docSnap.data() as { results: CalculatedBonusHistoryItem[] };
        if (savedData.results && savedData.results.length > bonusIndex) {
          const targetBonus = savedData.results[bonusIndex];
          const targetBonusResult = targetBonus.calculationResult;

          const healthEmployee = targetBonusResult.healthInsurance.employeeBurden;
          const healthCompany = targetBonusResult.healthInsurance.companyBurden;
          const pensionEmployee = targetBonusResult.pensionInsurance.employeeBurden;
          const pensionCompany = targetBonusResult.pensionInsurance.companyBurden;
          const careEmployee = targetBonusResult.careInsurance?.employeeBurden ?? '0';
          const careCompany = targetBonusResult.careInsurance?.companyBurden ?? '0';

          const totalHealthEmployee = SocialInsuranceCalculator.addAmounts(
            healthEmployee,
            careEmployee
          );
          const totalHealthCompany = SocialInsuranceCalculator.addAmounts(
            healthCompany,
            careCompany
          );

          return {
            healthInsuranceEmployee: totalHealthEmployee,
            healthInsuranceCompany: totalHealthCompany,
            pensionInsuranceEmployee: pensionEmployee,
            pensionInsuranceCompany: pensionCompany,
            careInsuranceEmployee: careEmployee,
            careInsuranceCompany: careCompany,
            totalEmployee: SocialInsuranceCalculator.addAmounts(
              totalHealthEmployee,
              pensionEmployee
            ),
            totalCompany: SocialInsuranceCalculator.addAmounts(totalHealthCompany, pensionCompany),
            paymentAmount: targetBonus.amount,
            standardBonusAmount: targetBonusResult.standardBonusAmount,
            healthInsuranceRate: targetBonusResult.healthInsuranceRate,
            careInsuranceRate: targetBonusResult.careInsuranceRate,
            pensionInsuranceRate: targetBonusResult.pensionInsuranceRate,
          };
        }
      }
      // データが見つからない場合は空の結果を返す
      return emptyResult;
    } catch (error) {
      console.error('保存済み賞与データ取得エラー:', error);
      return emptyResult;
    }
  }
}
