import { Decimal } from 'decimal.js';

/**
 * 社会保険計算専用の高精度計算ユーティリティクラス
 *
 * 日本の社会保険法規では1円未満の端数処理が厳密に規定されているため、
 * 浮動小数点数の精度問題を回避するためにDecimal.jsを使用
 *
 * JavaScript numberの使用を禁止し、全てDecimal文字列で処理
 */
export class SocialInsuranceCalculator {
  /**
   * 報酬月額の平均値を計算（1円未満切り捨て）
   * @param amounts 報酬月額の配列（Decimal文字列）
   * @returns 平均報酬月額（1円未満切り捨て後）
   */
  static calculateAverageRemuneration(amounts: string[]): string {
    if (amounts.length === 0) {
      throw new Error('報酬額の配列が空です');
    }

    // カンマを除去してから合計を計算
    const cleanAmounts = amounts.map((amount) => amount.replace(/,/g, ''));
    const total = cleanAmounts.reduce((sum, amount) => {
      return new Decimal(sum).add(new Decimal(amount)).toString();
    }, '0');

    const average = new Decimal(total).dividedBy(amounts.length);
    return average.floor().toString();
  }

  /**
   * 遡及支払額を除外した報酬額の計算
   * @param totalAmount 総報酬額（Decimal文字列）
   * @param retroactivePay 遡及支払額（Decimal文字列）
   * @returns 調整後報酬額
   */
  static adjustForRetroactivePay(totalAmount: string, retroactivePay = '0'): string {
    const cleanTotalAmount = totalAmount.replace(/,/g, '');
    const cleanRetroactivePay = retroactivePay.replace(/,/g, '');

    const total = new Decimal(cleanTotalAmount);
    const retro = new Decimal(cleanRetroactivePay);

    return total.minus(retro).toString();
  }

  /**
   * 年4回以上賞与の月割り計算
   * @param annualBonusTotal 年間賞与総額（Decimal文字列）
   * @returns 月割り賞与額（1円未満切り捨て）
   */
  static calculateMonthlyBonusAdjustment(annualBonusTotal: string): string {
    const cleanAnnualBonusTotal = annualBonusTotal.replace(/,/g, '');
    const total = new Decimal(cleanAnnualBonusTotal);
    const monthlyAdjustment = total.dividedBy(12);
    return monthlyAdjustment.floor().toString();
  }

  /**
   * 等級判定のための報酬範囲チェック
   * @param amount 報酬月額（Decimal文字列）
   * @param min 最小額（Decimal文字列）
   * @param max 最大額（Decimal文字列）
   * @returns 範囲内かどうか
   */
  static isInGradeRange(amount: string, min: string, max: string): boolean {
    const cleanAmount = amount.replace(/,/g, '');
    const cleanMin = min.replace(/,/g, '');
    const cleanMax = max.replace(/,/g, '');

    const amountDecimal = new Decimal(cleanAmount);
    const minDecimal = new Decimal(cleanMin);
    const maxDecimal = new Decimal(cleanMax);

    // 等級表は「以上、未満」の条件で判定する
    // 最高等級の場合のみInfinityを許可して「以下」とする
    if (cleanMax === 'Infinity') {
      return amountDecimal.greaterThanOrEqualTo(minDecimal);
    }

    return amountDecimal.greaterThanOrEqualTo(minDecimal) && amountDecimal.lessThan(maxDecimal);
  }

  /**
   * 固定的賃金変動の計算
   * @param beforeAmount 変動前金額（Decimal文字列）
   * @param afterAmount 変動後金額（Decimal文字列）
   * @returns 変動額（正の値は増加、負の値は減少）
   */
  static calculateFixedWageChange(beforeAmount: string, afterAmount: string): string {
    const cleanBeforeAmount = beforeAmount.replace(/,/g, '');
    const cleanAfterAmount = afterAmount.replace(/,/g, '');

    const before = new Decimal(cleanBeforeAmount);
    const after = new Decimal(cleanAfterAmount);

    return after.minus(before).toString();
  }

  /**
   * パーセンテージ計算（保険料率等）
   * @param amount 基準額（Decimal文字列）
   * @param rate 料率（Decimal文字列、例: "5" = 5%）
   * @returns 計算結果（1円未満切り捨て）
   */
  static calculatePercentage(amount: string, rate: string): string {
    const cleanAmount = amount.replace(/,/g, '');
    const cleanRate = rate.replace(/,/g, '');

    const baseAmount = new Decimal(cleanAmount);
    const rateDecimal = new Decimal(cleanRate);

    const result = baseAmount.times(rateDecimal.dividedBy(100));
    return result.floor().toString();
  }

  /**
   * 等級差の計算
   * @param beforeGrade 変更前等級（Decimal文字列）
   * @param afterGrade 変更後等級（Decimal文字列）
   * @returns 等級差
   */
  static calculateGradeDifference(beforeGrade: string, afterGrade: string): string {
    const cleanBeforeGrade = beforeGrade.replace(/,/g, '');
    const cleanAfterGrade = afterGrade.replace(/,/g, '');

    const before = new Decimal(cleanBeforeGrade);
    const after = new Decimal(cleanAfterGrade);

    return after.minus(before).toString();
  }

  /**
   * 複数月の報酬から3ヶ月平均を計算（随時改定用）
   * @param monthlyAmounts 3ヶ月分の報酬配列（Decimal文字列）
   * @param retroactiveAmounts 遡及支払額配列（Decimal文字列、オプション）
   * @returns 平均報酬月額（1円未満切り捨て）
   */
  static calculateThreeMonthAverage(
    monthlyAmounts: string[],
    retroactiveAmounts: string[] = []
  ): string {
    if (monthlyAmounts.length !== 3) {
      throw new Error('随時改定には3ヶ月分のデータが必要です');
    }

    // 遡及支払額を除外した調整後金額を計算
    const adjustedAmounts = monthlyAmounts.map((amount, index) => {
      const retroPay = retroactiveAmounts[index] || '0';
      return this.adjustForRetroactivePay(amount, retroPay);
    });

    return this.calculateAverageRemuneration(adjustedAmounts);
  }

  /**
   * 金額を表示用文字列に変換
   * @param amount 金額（Decimal文字列）
   * @returns カンマ区切り文字列
   */
  static formatCurrency(amount: string): string {
    const cleanAmount = String(amount || '0').replace(/,/g, '');
    return new Decimal(cleanAmount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * 金額を表示用文字列に変換（formatCurrencyのエイリアス）
   * @param amount 金額（Decimal文字列）
   * @returns カンマ区切り文字列
   */
  static formatAmount(amount: string): string {
    return this.formatCurrency(amount);
  }

  /**
   * 絶対値を取得
   * @param amount 金額（Decimal文字列）
   * @returns 絶対値
   */
  static abs(amount: string): string {
    const cleanAmount = amount.replace(/,/g, '');
    return new Decimal(cleanAmount).abs().toString();
  }

  /**
   * 2つの金額の比較
   * @param amount1 金額1（Decimal文字列）
   * @param amount2 金額2（Decimal文字列）
   * @returns 比較結果 (-1: amount1 < amount2, 0: 等しい, 1: amount1 > amount2)
   */
  static compare(
    amount1: string | number | null | undefined,
    amount2: string | number | null | undefined
  ): number {
    const num1 = new Decimal(amount1 || 0);
    const num2 = new Decimal(amount2 || 0);
    return num1.comparedTo(num2);
  }

  /**
   * 2つの金額を加算
   * @param amount1 金額1（Decimal文字列）
   * @param amount2 金額2（Decimal文字列）
   * @returns 加算結果
   */
  static addAmounts(amount1: string, amount2: string): string {
    const cleanAmount1 = String(amount1 || '0').replace(/,/g, '');
    const cleanAmount2 = String(amount2 || '0').replace(/,/g, '');

    const decimal1 = new Decimal(cleanAmount1 || '0');
    const decimal2 = new Decimal(cleanAmount2 || '0');
    return decimal1.add(decimal2).toString();
  }

  /**
   * 2つの金額を減算
   * @param amount1 被減数（Decimal文字列）
   * @param amount2 減数（Decimal文字列）
   * @returns 減算結果
   */
  static subtractAmounts(amount1: string, amount2: string): string {
    const cleanAmount1 = amount1.replace(/,/g, '');
    const cleanAmount2 = amount2.replace(/,/g, '');

    const decimal1 = new Decimal(cleanAmount1);
    const decimal2 = new Decimal(cleanAmount2);
    return decimal1.minus(decimal2).toString();
  }

  /**
   * 金額を千円単位で四捨五入（標準報酬月額計算用）
   * @param amount 金額（Decimal文字列）
   * @returns 千円単位で四捨五入した金額
   */
  static roundToThousand(amount: string): string {
    const cleanAmount = amount.replace(/,/g, '');
    const decimal = new Decimal(cleanAmount);
    const divided = decimal.dividedBy(1000);
    const rounded = divided.round();
    return rounded.times(1000).toString();
  }

  /**
   * 金額を千円単位で切り捨て（標準賞与額計算用）
   * @param amount 金額（Decimal文字列）
   * @returns 千円単位で切り捨てした金額
   */
  static floorToThousand(amount: string): string {
    const cleanAmount = amount.replace(/,/g, '');
    const decimal = new Decimal(cleanAmount);
    const divided = decimal.dividedBy(1000);
    const floored = divided.floor();
    return floored.times(1000).toString();
  }

  /**
   * 掛け算と切り捨て（保険料計算用）
   * @param amount 基準額（Decimal文字列）
   * @param rate 料率（Decimal文字列）
   * @returns 計算結果（1円未満切り捨て）
   */
  static multiplyAndFloor(amount: string, rate: string): string {
    const cleanAmount = amount.replace(/,/g, '');
    const cleanRate = rate.replace(/,/g, '');

    const baseAmount = new Decimal(cleanAmount);
    const rateDecimal = new Decimal(cleanRate);

    const result = baseAmount.times(rateDecimal);
    return result.floor().toString();
  }

  /**
   * 除算
   * @param dividend 被除数（Decimal文字列）
   * @param divisor 除数（Decimal文字列）
   * @returns 除算結果
   */
  static divide(dividend: string, divisor: string): string {
    const cleanDividend = dividend.replace(/,/g, '');
    const cleanDivisor = divisor.replace(/,/g, '');

    const dividendDecimal = new Decimal(cleanDividend);
    const divisorDecimal = new Decimal(cleanDivisor);

    return dividendDecimal.dividedBy(divisorDecimal).toString();
  }

  /**
   * 除算と切り捨て
   * @param dividend 被除数（Decimal文字列）
   * @param divisor 除数（Decimal文字列）
   * @returns 除算結果（1円未満切り捨て）
   */
  static divideAndFloor(dividend: string, divisor: string): string {
    const cleanDividend = dividend.replace(/,/g, '');
    const cleanDivisor = divisor.replace(/,/g, '');

    const dividendDecimal = new Decimal(cleanDividend);
    const divisorDecimal = new Decimal(cleanDivisor);

    const result = dividendDecimal.dividedBy(divisorDecimal);
    return result.floor().toString();
  }

  /**
   * 減算
   * @param amount1 被減数（Decimal文字列）
   * @param amount2 減数（Decimal文字列）
   * @returns 減算結果
   */
  static subtract(amount1: string, amount2: string): string {
    return this.subtractAmounts(amount1, amount2);
  }

  /**
   * 2つの金額を乗算
   * @param amount1 金額1（Decimal文字列）
   * @param amount2 金額2（Decimal文字列）
   * @returns 乗算結果
   */
  static multiply(amount1: string, amount2: string): Decimal {
    const cleanAmount1 = String(amount1).replace(/,/g, '');
    const cleanAmount2 = String(amount2).replace(/,/g, '');
    return new Decimal(cleanAmount1).mul(new Decimal(cleanAmount2));
  }

  /**
   * 被保険者負担分の端数処理（50銭以下切り捨て、50銭超切り上げ）
   * @param amount 処理前の金額 (Decimal.jsオブジェクト)
   * @returns 処理後の金額 (文字列)
   */
  static roundForEmployeeBurden(amount: Decimal): string {
    const floorAmount = amount.floor();
    const fraction = amount.sub(floorAmount);

    if (fraction.comparedTo(new Decimal('0.5')) > 0) {
      // 0.5より大きい場合 (e.g., 0.501) は切り上げ
      return floorAmount.add(1).toString();
    } else {
      // 0.5以下の場合 (e.g., 0.5, 0.499) は切り捨て
      return floorAmount.toString();
    }
  }

  /**
   * 全額（会社負担分含む）の端数処理（50銭以下切り捨て、50銭超切り上げ）
   * @param amount 処理前の金額 (Decimal.jsオブジェクト)
   * @returns 処理後の金額 (文字列)
   */
  static roundForTotalAmount(amount: Decimal): string {
    const floorAmount = amount.floor();
    const fraction = amount.sub(floorAmount);

    if (fraction.comparedTo(new Decimal('0.5')) > 0) {
      // 0.5より大きい場合 (e.g., 0.501) は切り上げ
      return floorAmount.add(1).toString();
    } else {
      // 0.5以下の場合 (e.g., 0.5, 0.499) は切り捨て
      return floorAmount.toString();
    }
  }
}
