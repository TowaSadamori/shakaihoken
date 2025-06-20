import { Injectable } from '@angular/core';
import { getFirestore, Timestamp } from 'firebase/firestore';
import { SocialInsuranceCalculator } from '../utils/decimal-calculator';

// Firestoreから取得する年4回以上の賞与データ
interface AnnualBonusData {
  paymentDate: Timestamp;
  amount: string; // Decimal文字列
}

// 標準報酬月額を決定するための基礎データ
interface DecisionBaseData {
  aprilAmount: string;
  mayAmount: string;
  juneAmount: string;
}

// 計算結果
interface RegularDecisionResult {
  newStandardMonthlyAmount: string; // 新しい標準報酬月額
  annualBonusTotal: string; // 対象の年間賞与総額
  monthlyBonusAmount: string; // 12で割った賞与に係る報酬額
  baseAmounts: {
    // 計算基礎となった各月の報酬額
    april: string;
    may: string;
    june: string;
  };
  averageAmount: string; // 3ヶ月平均額
}

@Injectable({
  providedIn: 'root',
})
export class RegularDecisionService {
  private firestore = getFirestore();

  /**
   * 定時決定のメインオーケストレーションメソッド
   */
  public async calculateRegularDecision(
    employeeId: string,
    year: number,
    baseData: DecisionBaseData
  ): Promise<RegularDecisionResult | null> {
    try {
      // Step 1 & 2: 年4回以上の賞与を集計し、月割額を計算
      const { annualBonusTotal, monthlyBonusAmount } = await this.getMonthlyBonusAmount(
        employeeId,
        year
      );

      // Step 3: 各月の報酬に賞与月割額を仮想的に加算
      const adjustedApril = SocialInsuranceCalculator.addAmounts(
        baseData.aprilAmount,
        monthlyBonusAmount
      );
      const adjustedMay = SocialInsuranceCalculator.addAmounts(
        baseData.mayAmount,
        monthlyBonusAmount
      );
      const adjustedJune = SocialInsuranceCalculator.addAmounts(
        baseData.juneAmount,
        monthlyBonusAmount
      );

      // Step 4: 新しい標準報酬月額を決定
      const averageAmount = SocialInsuranceCalculator.calculateThreeMonthAverage([
        adjustedApril,
        adjustedMay,
        adjustedJune,
      ]);

      // 注意: ここでは保険料額表との照合は行わず、平均額を返す
      // 実際の標準報酬月額の決定は、この平均額を基に別途行う
      const newStandardMonthlyAmount = averageAmount;

      return {
        newStandardMonthlyAmount,
        annualBonusTotal,
        monthlyBonusAmount,
        baseAmounts: {
          april: adjustedApril,
          may: adjustedMay,
          june: adjustedJune,
        },
        averageAmount,
      };
    } catch (error) {
      console.error('定時決定の計算中にエラーが発生しました:', error);
      return null;
    }
  }

  /**
   * Step 1 & 2: 年4回以上の賞与を集計し、月割額を計算する
   * @param employeeId - 従業員ID
   * @param decisionYear - 定時決定を行う年（例: 2025年7月の決定なら2025）
   */
  private async getMonthlyBonusAmount(
    employeeId: string,
    decisionYear: number
  ): Promise<{ annualBonusTotal: string; monthlyBonusAmount: string }> {
    // 集計期間: 前年7月1日〜当年6月30日
    const startDate = new Date(decisionYear - 1, 6, 1); // 前年の7月1日
    const endDate = new Date(decisionYear, 5, 30); // 当年の6月30日

    // Firestoreの employee-salary-bonus からデータを取得するロジックをここに実装
    // この例ではダミーデータを返しますが、実際にはFirestoreクエリが必要です

    // 以下はダミーのロジックです。実際にはFirestoreからデータを取得します。
    console.warn('注意: 現在、ダミーの賞与データを使用しています。');
    const dummyAnnualBonuses: AnnualBonusData[] = [
      // { paymentDate: Timestamp.fromDate(new Date('2024-09-10')), amount: '300000' },
      // { paymentDate: Timestamp.fromDate(new Date('2024-12-10')), amount: '300000' },
      // { paymentDate: Timestamp.fromDate(new Date('2025-03-10')), amount: '300000' },
      // { paymentDate: Timestamp.fromDate(new Date('2025-06-10')), amount: '300000' },
    ];

    const filteredBonuses = dummyAnnualBonuses.filter((bonus) => {
      const pDate = bonus.paymentDate.toDate();
      return pDate >= startDate && pDate <= endDate;
    });

    const annualBonusTotal = filteredBonuses.reduce((sum, bonus) => {
      return SocialInsuranceCalculator.addAmounts(sum, bonus.amount);
    }, '0');

    const monthlyBonusAmount =
      SocialInsuranceCalculator.calculateMonthlyBonusAdjustment(annualBonusTotal);

    return { annualBonusTotal, monthlyBonusAmount };
  }
}
