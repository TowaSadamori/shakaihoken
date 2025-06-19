import { Decimal } from 'decimal.js';

/**
 * 社会保険計算専用の高精度計算ユーティリティクラス
 *
 * 日本の社会保険法規では1円未満の端数処理が厳密に規定されているため、
 * 浮動小数点数の精度問題を回避するためにDecimal.jsを使用
 */
export class SocialInsuranceCalculator {
  /**
   * 報酬月額の平均値を計算（1円未満切り捨て）
   * @param amounts 報酬月額の配列
   * @returns 平均報酬月額（1円未満切り捨て後）
   */
  static calculateAverageRemuneration(amounts: number[]): number {
    if (amounts.length === 0) return 0;

    // Decimalで正確な計算
    const total = amounts.reduce((sum, amount) => {
      return sum.add(new Decimal(amount));
    }, new Decimal(0));

    const average = total.dividedBy(amounts.length);

    // 1円未満切り捨て
    return average.floor().toNumber();
  }

  /**
   * 遡及支払額を除外した報酬額の計算
   * @param totalAmount 総報酬額
   * @param retroactivePay 遡及支払額
   * @returns 調整後報酬額
   */
  static adjustForRetroactivePay(totalAmount: number, retroactivePay = 0): number {
    const total = new Decimal(totalAmount);
    const retro = new Decimal(retroactivePay);

    return total.minus(retro).toNumber();
  }

  /**
   * 年4回以上賞与の月割り計算
   * @param annualBonusTotal 年間賞与総額
   * @returns 月割り賞与額（1円未満切り捨て）
   */
  static calculateMonthlyBonusAdjustment(annualBonusTotal: number): number {
    const bonusDecimal = new Decimal(annualBonusTotal);
    const monthlyAdjustment = bonusDecimal.dividedBy(12);

    return monthlyAdjustment.floor().toNumber();
  }

  /**
   * 等級判定のための報酬範囲チェック
   * @param amount 報酬月額
   * @param min 最小額
   * @param max 最大額
   * @returns 範囲内かどうか
   */
  static isInGradeRange(amount: number, min: number, max: number): boolean {
    const amountDecimal = new Decimal(amount);
    const minDecimal = new Decimal(min);
    const maxDecimal = new Decimal(max);

    return amountDecimal.greaterThanOrEqualTo(minDecimal) && amountDecimal.lessThan(maxDecimal);
  }

  /**
   * 固定的賃金変動の計算
   * @param beforeAmount 変動前金額
   * @param afterAmount 変動後金額
   * @returns 変動額（正の値は増加、負の値は減少）
   */
  static calculateFixedWageChange(beforeAmount: number, afterAmount: number): number {
    const before = new Decimal(beforeAmount);
    const after = new Decimal(afterAmount);

    return after.minus(before).toNumber();
  }

  /**
   * パーセンテージ計算（保険料率等）
   * @param amount 基準額
   * @param rate 料率（例: 0.05 = 5%）
   * @returns 計算結果（1円未満切り捨て）
   */
  static calculatePercentage(amount: number, rate: number): number {
    const baseAmount = new Decimal(amount);
    const rateDecimal = new Decimal(rate);

    const result = baseAmount.times(rateDecimal);
    return result.floor().toNumber();
  }

  /**
   * 等級差の計算
   * @param beforeGrade 変更前等級
   * @param afterGrade 変更後等級
   * @returns 等級差
   */
  static calculateGradeDifference(beforeGrade: number, afterGrade: number): number {
    const before = new Decimal(beforeGrade);
    const after = new Decimal(afterGrade);

    return after.minus(before).toNumber();
  }

  /**
   * 複数月の報酬から3ヶ月平均を計算（随時改定用）
   * @param monthlyAmounts 3ヶ月分の報酬配列
   * @param retroactiveAmounts 遡及支払額配列（オプション）
   * @returns 平均報酬月額（1円未満切り捨て）
   */
  static calculateThreeMonthAverage(
    monthlyAmounts: number[],
    retroactiveAmounts: number[] = []
  ): number {
    if (monthlyAmounts.length !== 3) {
      throw new Error('随時改定には3ヶ月分のデータが必要です');
    }

    // 遡及支払額を除外した調整後金額を計算
    const adjustedAmounts = monthlyAmounts.map((amount, index) => {
      const retroPay = retroactiveAmounts[index] || 0;
      return this.adjustForRetroactivePay(amount, retroPay);
    });

    return this.calculateAverageRemuneration(adjustedAmounts);
  }

  /**
   * 金額を表示用文字列に変換
   * @param amount 金額
   * @returns カンマ区切り文字列
   */
  static formatCurrency(amount: number): string {
    return new Decimal(amount).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * 2つの金額の比較
   * @param amount1 金額1
   * @param amount2 金額2
   * @returns 比較結果 (-1: amount1 < amount2, 0: 等しい, 1: amount1 > amount2)
   */
  static compare(amount1: number, amount2: number): number {
    const decimal1 = new Decimal(amount1);
    const decimal2 = new Decimal(amount2);

    if (decimal1.lessThan(decimal2)) return -1;
    if (decimal1.greaterThan(decimal2)) return 1;
    return 0;
  }

  /**
   * 2つの金額を加算
   * @param amount1 金額1
   * @param amount2 金額2
   * @returns 加算結果
   */
  static addAmounts(amount1: number, amount2: number): number {
    const decimal1 = new Decimal(amount1);
    const decimal2 = new Decimal(amount2);
    return decimal1.add(decimal2).toNumber();
  }

  /**
   * 2つの金額を減算
   * @param amount1 被減数
   * @param amount2 減数
   * @returns 減算結果
   */
  static subtractAmounts(amount1: number, amount2: number): number {
    const decimal1 = new Decimal(amount1);
    const decimal2 = new Decimal(amount2);
    return decimal1.minus(decimal2).toNumber();
  }

  /**
   * 金額を千円単位で四捨五入（標準報酬月額計算用）
   * @param amount 金額
   * @returns 千円単位で四捨五入した金額
   */
  static roundToThousand(amount: number): number {
    const decimal = new Decimal(amount);
    const divided = decimal.dividedBy(1000);
    const rounded = divided.round();
    return rounded.times(1000).toNumber();
  }
}
