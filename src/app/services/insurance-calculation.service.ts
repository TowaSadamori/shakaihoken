import { Injectable } from '@angular/core';
import {
  getFirestore,
  collection,
  query,
  getDocs,
  doc,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { User } from './user.service';
import { OfficeService } from './office.service';
import { SocialInsuranceCalculator } from '../utils/decimal-calculator';
import { CalculatedBonusHistoryItem } from './bonus-calculation.service';

// 等級履歴データのインターフェース
interface GradeJudgmentRecord {
  effectiveDate: Date;
  endDate?: Date;
  healthInsuranceGrade: number;
  pensionInsuranceGrade: number;
  paymentAmount?: string;
  standardBonusAmount?: string;
  healthInsuranceRate?: string;
  careInsuranceRate?: string;
  pensionInsuranceRate?: string;
}

// 保険料率・テーブルのインターフェース
interface InsuranceRateData {
  insuranceTable: {
    grade: string;
    standardSalary: string;
    nursingHalf: string;
    nonNursingHalf: string;
  }[];
  pensionTable: {
    grade: number;
    standardSalary: string;
    pensionHalf: string;
  }[];
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

    // 賞与の場合の処理
    if (month >= 13) {
      const bonusIndex = month - 13; // 0, 1, 2
      // 保存された賞与計算結果を読み込むように変更
      return this.fetchAndFormatBonusResult(user, year, bonusIndex);
    }

    try {
      const targetDate = new Date(year, month - 1, 1);
      const prefecture = await this.getPrefecture(user);
      if (!prefecture) {
        console.warn(`[計算中止] 県名が取得できませんでした (従業員ID: ${user.uid})`);
        return emptyResult;
      }

      const [gradeHistory, rateData] = await Promise.all([
        this.fetchGradeHistory(user.employeeNumber!),
        this.fetchInsuranceRateData(year, prefecture),
      ]);

      if (!rateData) {
        console.warn(
          `[計算中止] 保険料率データが見つかりません (従業員ID: ${user.uid}, 年月: ${year}/${month}, 県名: ${prefecture})`
        );
        return emptyResult;
      }

      const applicableGrade = this.findApplicableGrade(gradeHistory, targetDate);
      if (!applicableGrade) {
        console.warn(
          `[計算中止] 該当月の等級履歴が見つかりません (従業員ID: ${user.uid}, 年月: ${year}/${month})`
        );
        return emptyResult;
      }

      const result = this.calculateFees(user, applicableGrade, rateData, targetDate);
      result.healthInsuranceGrade = applicableGrade.healthInsuranceGrade;
      result.pensionInsuranceGrade = applicableGrade.pensionInsuranceGrade;

      console.log(`[計算成功] 従業員ID: ${user.uid}`, {
        applicableGrade,
        rateData,
        result,
      });

      return result;
    } catch (error) {
      console.error(`保険料計算エラー (従業員ID: ${user.uid}, 年月: ${year}/${month})`, error);
      return emptyResult;
    }
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

  // このメソッドはもう使用しないので、中身を空にするか、削除する
  private async calculateBonusInsurance(
    user: User,
    year: number,
    bonusIndex: number
  ): Promise<MonthlyInsuranceFee> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const u = user;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const y = year;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const i = bonusIndex;
    return Promise.resolve({
      healthInsuranceEmployee: '0',
      healthInsuranceCompany: '0',
      pensionInsuranceEmployee: '0',
      pensionInsuranceCompany: '0',
      careInsuranceEmployee: '0',
      careInsuranceCompany: '0',
      totalEmployee: '0',
      totalCompany: '0',
    });
  }

  private async getPrefecture(user: User): Promise<string | null> {
    if (user.prefectureCity) {
      return user.prefectureCity.replace(/[都府県].*/, '');
    }
    if (user.companyId && user.branchNumber) {
      const address = await this.officeService.findOfficeAddressPrefecture(
        user.companyId,
        user.branchNumber
      );
      return address ? address.replace(/[都府県]$/, '') : null;
    }
    return null;
  }

  private async fetchGradeHistory(employeeNumber: string): Promise<GradeJudgmentRecord[]> {
    console.log(`[fetchGradeHistory] Fetching for employeeNumber: ${employeeNumber}`);
    const history: GradeJudgmentRecord[] = [];
    const collectionPath = `gradeJudgments/${employeeNumber}/judgments`;
    const q = query(collection(this.firestore, 'gradeJudgments', employeeNumber, 'judgments'));
    try {
      const querySnapshot = await getDocs(q);
      console.log(
        `[fetchGradeHistory] Path: ${collectionPath}, Found ${querySnapshot.size} records.`
      );

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        history.push({
          effectiveDate: (data['effectiveDate'] as Timestamp).toDate(),
          endDate: data['endDate'] ? (data['endDate'] as Timestamp).toDate() : undefined,
          healthInsuranceGrade: data['healthInsuranceGrade'],
          pensionInsuranceGrade: data['pensionInsuranceGrade'],
        });
      });
    } catch (error) {
      console.error(
        `[fetchGradeHistory] Error fetching history for employeeNumber: ${employeeNumber}`,
        error
      );
    }
    return history;
  }

  private async fetchInsuranceRateData(
    year: number,
    prefecture: string
  ): Promise<InsuranceRateData | null> {
    const docRef = doc(
      this.firestore,
      `insurance_rates/${year}/prefectures/${prefecture}/rate_table/main`
    );
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? (docSnap.data() as InsuranceRateData) : null;
  }

  private findApplicableGrade(
    history: GradeJudgmentRecord[],
    targetDate: Date
  ): GradeJudgmentRecord | undefined {
    const firstDayOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
    const lastDayOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);

    console.log('[findApplicableGrade] Debug Info:', {
      history,
      targetDate,
      firstDayOfMonth,
      lastDayOfMonth,
    });

    const applicableRecords = history.filter((record, index) => {
      const effectiveDate = record.effectiveDate;
      const endDate = record.endDate;

      const isStarted = effectiveDate.getTime() <= lastDayOfMonth.getTime();
      const isNotEnded = !endDate || endDate.getTime() >= firstDayOfMonth.getTime();

      console.log(`[findApplicableGrade] Record ${index} Check:`, {
        record_effectiveDate: effectiveDate,
        record_endDate: endDate,
        isStarted,
        isNotEnded,
        result: isStarted && isNotEnded,
      });

      return isStarted && isNotEnded;
    });

    if (applicableRecords.length === 0) {
      console.log('[findApplicableGrade] No applicable records found.');
      return undefined;
    }

    const latestRecord = applicableRecords.sort(
      (a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime()
    )[0];

    console.log('[findApplicableGrade] Found latest applicable record:', latestRecord);

    return latestRecord;
  }

  private calculateFees(
    user: User,
    grade: GradeJudgmentRecord,
    rateData: InsuranceRateData,
    targetDate: Date
  ): MonthlyInsuranceFee {
    const result: MonthlyInsuranceFee = {
      healthInsuranceEmployee: '0',
      healthInsuranceCompany: '0',
      pensionInsuranceEmployee: '0',
      pensionInsuranceCompany: '0',
      careInsuranceEmployee: '0',
      careInsuranceCompany: '0',
      totalEmployee: '0',
      totalCompany: '0',
    };

    // Health Insurance
    const healthGradeInfo = rateData.insuranceTable.find(
      (g) => parseInt(g.grade.split(' ')[0], 10) == grade.healthInsuranceGrade
    );

    if (healthGradeInfo) {
      const age = this.calculateAgeAtDate(new Date(user.birthDate!), targetDate);
      const isCareApplicable = age >= 40 && age < 65;

      result.healthInsuranceEmployee = healthGradeInfo.nonNursingHalf;
      result.healthInsuranceCompany = healthGradeInfo.nonNursingHalf;

      if (isCareApplicable) {
        const totalHealthFee = healthGradeInfo.nursingHalf;
        const careFee = SocialInsuranceCalculator.subtractAmounts(
          totalHealthFee,
          healthGradeInfo.nonNursingHalf
        );
        result.healthInsuranceEmployee = totalHealthFee;
        result.healthInsuranceCompany = totalHealthFee;
        result.careInsuranceEmployee = careFee;
        result.careInsuranceCompany = careFee;
      }
    }

    // Pension Insurance
    const pensionGradeInfo = rateData.pensionTable.find(
      (g) => g.grade == grade.pensionInsuranceGrade
    );
    if (pensionGradeInfo) {
      result.pensionInsuranceEmployee = pensionGradeInfo.pensionHalf;
      result.pensionInsuranceCompany = pensionGradeInfo.pensionHalf;
    }

    // Totals
    result.totalEmployee = SocialInsuranceCalculator.addAmounts(
      result.healthInsuranceEmployee,
      result.pensionInsuranceEmployee
    );
    result.totalCompany = SocialInsuranceCalculator.addAmounts(
      result.healthInsuranceCompany,
      result.pensionInsuranceCompany
    );

    return result;
  }

  private calculateAgeAtDate(birthDate: Date, specificDate: Date): number {
    let age = specificDate.getFullYear() - birthDate.getFullYear();
    const m = specificDate.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && specificDate.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }
}
