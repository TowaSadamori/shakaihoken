/**
 * 日本時間ベースの日付処理ユーティリティクラス
 *
 * タイムゾーンの違いによる日付のずれ問題を解決するため、
 * すべての日付処理を日本時間（ローカル時間）ベースで統一
 */
export class DateUtils {
  /**
   * 日付オブジェクトをYYYY-MM-DD形式の文字列に変換（日本時間ベース）
   * toISOString()を使わずにローカル時間で変換
   * @param date 変換する日付オブジェクト
   * @returns YYYY-MM-DD形式の文字列
   */
  static formatToYMD(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 日付文字列を正規化（日本時間ベース）
   * YYYY-MM-DD形式の文字列を確実に日本時間として処理
   * @param dateString 日付文字列
   * @returns 正規化されたYYYY-MM-DD形式の文字列
   */
  static normalizeDateString(dateString: string): string {
    if (!dateString) return '';

    // YYYY-MM-DD形式かチェック
    const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateOnlyRegex.test(dateString)) {
      // 既に正しい形式の場合はそのまま返す
      return dateString;
    }

    // 日付オブジェクトに変換してから日本時間ベースで再フォーマット
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      console.warn(`無効な日付文字列: ${dateString}`);
      return dateString;
    }

    return this.formatToYMD(date);
  }

  /**
   * 今日の日付をYYYY-MM-DD形式で取得（日本時間ベース）
   * @returns 今日の日付のYYYY-MM-DD形式文字列
   */
  static getTodayAsYMD(): string {
    return this.formatToYMD(new Date());
  }

  /**
   * 日付文字列から日付オブジェクトを作成（日本時間として解釈）
   * @param dateString YYYY-MM-DD形式の日付文字列
   * @returns 日付オブジェクト
   */
  static parseYMDAsLocal(dateString: string): Date {
    if (!dateString) return new Date();

    const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateOnlyRegex.test(dateString)) {
      // YYYY-MM-DD形式の場合、ローカル時間として解釈
      const [year, month, day] = dateString.split('-').map(Number);
      return new Date(year, month - 1, day);
    }

    // その他の形式の場合はそのまま変換
    return new Date(dateString);
  }

  /**
   * 年齢計算（日本時間ベース）
   * @param birthDate 生年月日（Date オブジェクトまたは YYYY-MM-DD 文字列）
   * @param targetDate 基準日（省略時は今日）
   * @returns 年齢
   */
  static calculateAge(birthDate: Date | string, targetDate?: Date): number {
    const birth = typeof birthDate === 'string' ? this.parseYMDAsLocal(birthDate) : birthDate;
    const target = targetDate || new Date();

    let age = target.getFullYear() - birth.getFullYear();
    const monthDiff = target.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && target.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  }

  /**
   * 日付の妥当性チェック
   * @param dateString 日付文字列
   * @returns 有効な日付かどうか
   */
  static isValidDate(dateString: string): boolean {
    if (!dateString) return false;
    const date = this.parseYMDAsLocal(dateString);
    return !isNaN(date.getTime());
  }

  /**
   * 日付範囲のチェック
   * @param targetDate 対象日付
   * @param startDate 開始日
   * @param endDate 終了日
   * @returns 範囲内かどうか
   */
  static isInDateRange(
    targetDate: string | Date,
    startDate: string | Date,
    endDate: string | Date
  ): boolean {
    const target = typeof targetDate === 'string' ? this.parseYMDAsLocal(targetDate) : targetDate;
    const start = typeof startDate === 'string' ? this.parseYMDAsLocal(startDate) : startDate;
    const end = typeof endDate === 'string' ? this.parseYMDAsLocal(endDate) : endDate;

    return target >= start && target <= end;
  }

  /**
   * 月の加算/減算
   * @param date 基準日
   * @param months 加算する月数（負の値で減算）
   * @returns 計算後の日付
   */
  static addMonths(date: Date, months: number): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + months);
    return result;
  }

  /**
   * 月末日を取得
   * @param year 年
   * @param month 月（1-12）
   * @returns 月末日
   */
  static getLastDayOfMonth(year: number, month: number): Date {
    return new Date(year, month, 0);
  }

  /**
   * 月初日を取得
   * @param year 年
   * @param month 月（1-12）
   * @returns 月初日
   */
  static getFirstDayOfMonth(year: number, month: number): Date {
    return new Date(year, month - 1, 1);
  }
}
