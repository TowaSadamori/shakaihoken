import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  Timestamp,
  setDoc,
} from 'firebase/firestore';
import { OfficeService } from '../services/office.service';
import { SocialInsuranceCalculator } from '../utils/decimal-calculator';
import { AuthService } from '../services/auth.service';
import { RoundForEmployeeBurdenPipe } from './round-for-employee-burden.pipe';
import { Decimal } from 'decimal.js';

interface EmployeeInfo {
  uid: string;
  name: string;
  employeeNumber: string;
  birthDate: string;
  age: number;
  companyId: string;
  branchNumber: string;
  addressPrefecture: string;
}

// 等級履歴データのインターフェース
interface GradeJudgmentRecord {
  effectiveDate: Date;
  endDate?: Date;
  healthInsuranceGrade: number;
  pensionInsuranceGrade: number;
  judgmentReason?: string;
}

// 保険料率・テーブルのインターフェース
interface InsuranceRateData {
  rates: {
    nonNursingRate: string;
    nursingRate: string;
    pensionRate: string;
  };
  insuranceTable: {
    grade: string;
    standardSalary: string;
    nursingHalf: string;
    nonNursingHalf: string;
    nursingTotal: string; // 介護保険該当全額
    nonNursingTotal: string; // 介護保険非該当全額
  }[];
  pensionTable: {
    grade: number;
    standardSalary: string;
    pensionHalf: string;
    pensionTotal: string; // 厚生年金全額
  }[];
}

// 月別計算結果のインターフェース
interface MonthlyCalculationResult {
  month: number;
  year: number;
  healthInsuranceGrade: number | string | null;
  healthInsuranceFeeEmployee: string | null;
  healthInsuranceFeeCompany: string | null;
  careInsuranceFeeEmployee: string | null;
  careInsuranceFeeCompany: string | null;
  pensionInsuranceGrade: number | string | null;
  pensionInsuranceFeeEmployee: string | null;
  pensionInsuranceFeeCompany: string | null;
}

// DB保存用の月別計算結果のインターフェース
interface MonthlyCalculationResultForDb {
  month: string;
  year: string;
  healthInsuranceGrade: string;
  healthInsuranceFeeEmployee: string;
  healthInsuranceFeeCompany: string;
  careInsuranceFeeEmployee: string;
  careInsuranceFeeCompany: string;
  pensionInsuranceGrade: string;
  pensionInsuranceFeeEmployee: string;
  pensionInsuranceFeeCompany: string;
}

// 保険期間情報の型
interface InsurancePeriods {
  careInsurancePeriod?: { start: string; end: string };
  healthInsurancePeriod?: { start: string; end: string };
  pensionInsurancePeriod?: { start: string; end: string };
}

@Component({
  selector: 'app-insurance-calculation-salary',
  standalone: true,
  imports: [CommonModule, FormsModule, RoundForEmployeeBurdenPipe],
  templateUrl: './insurance-calculation-salary.component.html',
  styleUrls: ['./insurance-calculation-salary.component.scss'],
})
export class InsuranceCalculationSalaryComponent implements OnInit {
  employeeInfo: EmployeeInfo | null = null;
  isLoading = false;
  errorMessage = '';

  targetYear: number | null = null;
  monthlyResults: MonthlyCalculationResult[] = [];

  // 保険期間情報
  employeeInsurancePeriods: InsurancePeriods = {};

  private employeeId: string | null = null;
  private uid: string | null = null;
  private firestore = getFirestore();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private officeService: OfficeService,
    private authService: AuthService
  ) {}

  async ngOnInit(): Promise<void> {
    this.employeeId = this.route.snapshot.paramMap.get('employeeId');
    const yearParam = this.route.snapshot.queryParamMap.get('year');
    if (yearParam) {
      this.targetYear = +yearParam;
    }

    if (this.employeeId) {
      await this.loadEmployeeInfo();
      await this.calculateAllMonths();
    }
  }

  private async loadEmployeeInfo(): Promise<void> {
    if (!this.employeeId) return;

    this.isLoading = true;
    try {
      const companyId = await this.authService.getCurrentUserCompanyId();
      if (!companyId) {
        throw new Error('会社IDが取得できませんでした。');
      }

      const usersRef = collection(this.firestore, 'users');
      const q = query(
        usersRef,
        where('employeeNumber', '==', this.employeeId),
        where('companyId', '==', companyId)
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        this.uid = userDoc.id;

        const birthDate = new Date(userData['birthDate']);
        const age = this.calculateAge(birthDate);

        let addressPrefecture = userData['addressPrefecture'] || '';
        if (!addressPrefecture && userData['companyId'] && userData['branchNumber']) {
          addressPrefecture = await this.officeService.findOfficeAddressPrefecture(
            userData['companyId'],
            userData['branchNumber']
          );
        }

        this.employeeInfo = {
          uid: this.uid,
          name: `${userData['lastName'] || ''} ${userData['firstName'] || ''}`.trim(),
          employeeNumber: userData['employeeNumber'] || '',
          birthDate: birthDate.toISOString().split('T')[0],
          age: age,
          companyId: userData['companyId'] || '',
          branchNumber: userData['branchNumber'] || '',
          addressPrefecture: addressPrefecture,
        };
        await this.loadEmployeeInsurancePeriods();
      } else {
        this.errorMessage = `従業員番号: ${this.employeeId} の情報が見つかりません`;
      }
    } catch (error) {
      console.error('従業員情報取得エラー:', error);
      this.errorMessage = `従業員情報の取得に失敗しました: ${error}`;
    } finally {
      this.isLoading = false;
    }
  }

  private calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  goBack(): void {
    if (this.employeeId) {
      this.router.navigate(['/insurance-calculation', this.employeeId]);
    }
  }

  formatFiscalYear(year: number): string {
    return `${year}年度`;
  }

  previousYear(): void {
    if (this.targetYear) {
      this.updateYear(this.targetYear - 1);
    }
  }

  nextYear(): void {
    if (this.targetYear) {
      this.updateYear(this.targetYear + 1);
    }
  }

  currentYear(): void {
    const currentFiscalYear = this.getCurrentFiscalYear();
    this.updateYear(currentFiscalYear);
  }

  private async updateYear(year: number): Promise<void> {
    this.targetYear = year;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { year: this.targetYear },
      queryParamsHandling: 'merge',
    });
    await this.calculateAllMonths();
  }

  private getCurrentFiscalYear(): number {
    const today = new Date();
    // JSの月は0-11なので+1
    const month = today.getMonth() + 1;
    // 日本の年度（4月始まり）で計算
    return month >= 4 ? today.getFullYear() : today.getFullYear() - 1;
  }

  private async calculateAllMonths(): Promise<void> {
    const months = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

    // 年月表示を維持しつつ、計算中であることを示す
    this.monthlyResults = months.map((m) => {
      const year = this.targetYear
        ? m >= 4
          ? this.targetYear
          : this.targetYear + 1
        : new Date().getFullYear();
      return {
        month: m,
        year: year,
        healthInsuranceGrade: this.targetYear ? '判定中...' : '年度未選択',
        pensionInsuranceGrade: this.targetYear ? '判定中...' : '年度未選択',
        healthInsuranceFeeEmployee: null,
        healthInsuranceFeeCompany: null,
        careInsuranceFeeEmployee: null,
        careInsuranceFeeCompany: null,
        pensionInsuranceFeeEmployee: null,
        pensionInsuranceFeeCompany: null,
      };
    });

    if (!this.targetYear || !this.employeeInfo) {
      return;
    }

    // タイムゾーン問題を回避するため、日付をYYYY-MM-DD形式の文字列に変換するヘルパー関数
    const toISODateString = (date: Date): string => {
      return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .split('T')[0];
    };

    this.isLoading = true;
    this.errorMessage = '';
    try {
      // 等級履歴と保険料率テーブルの両方を取得
      const [gradeHistory, rateData] = await Promise.all([
        this.fetchGradeHistory(),
        this.fetchInsuranceRateData(),
      ]);

      if (!rateData) {
        this.errorMessage = `${this
          .targetYear!}年度の保険料率データ（${this.employeeInfo!.addressPrefecture}）が見つかりません。`;
        // エラー表示を更新
        this.monthlyResults.forEach((r) => {
          r.healthInsuranceGrade = '料率エラー';
          r.pensionInsuranceGrade = '料率エラー';
        });
        return;
      }

      const finalResults: MonthlyCalculationResult[] = [];
      for (const month of months) {
        const year = month >= 4 ? this.targetYear! : this.targetYear! + 1;
        const firstDayOfMonth = new Date(year, month - 1, 1);
        const lastDayOfMonth = new Date(year, month, 0);

        const firstDayStr = toISODateString(firstDayOfMonth);
        const lastDayStr = toISODateString(lastDayOfMonth);

        const applicableRecords = gradeHistory.filter((record) => {
          const effectiveDateStr = toISODateString(record.effectiveDate);
          const endDateStr = record.endDate ? toISODateString(record.endDate) : null;

          // 適用期間 [effectiveDate, endDate] が
          // 対象月 [firstDayOfMonth, lastDayOfMonth] と重なるかを判定
          // 条件: effectiveDate <= lastDayOfMonth AND firstDayOfMonth <= endDate
          const isStarted = effectiveDateStr <= lastDayStr;
          const isNotEnded = !endDateStr || endDateStr >= firstDayStr;

          return isStarted && isNotEnded;
        });

        let applicableGrade: GradeJudgmentRecord | undefined;
        if (applicableRecords.length > 0) {
          applicableGrade = applicableRecords.sort(
            (a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime()
          )[0];
        }

        const result: MonthlyCalculationResult = {
          month,
          year,
          healthInsuranceGrade: '-',
          pensionInsuranceGrade: '-',
          healthInsuranceFeeEmployee: null,
          healthInsuranceFeeCompany: null,
          careInsuranceFeeEmployee: null,
          careInsuranceFeeCompany: null,
          pensionInsuranceFeeEmployee: null,
          pensionInsuranceFeeCompany: null,
        };

        if (applicableGrade) {
          // 産休・育休の判定
          if (applicableGrade.judgmentReason === 'maternity_leave') {
            result.healthInsuranceGrade = '産休';
            result.pensionInsuranceGrade = '産休';
          } else if (applicableGrade.judgmentReason === 'childcare_leave') {
            result.healthInsuranceGrade = '育休';
            result.pensionInsuranceGrade = '育休';
          } else {
            // 通常の等級を設定
            result.healthInsuranceGrade = applicableGrade.healthInsuranceGrade;
            result.pensionInsuranceGrade = applicableGrade.pensionInsuranceGrade;

            if (this.employeeInfo) {
              // 介護保険適用判定：40歳の誕生日の前日が属する月から適用
              const careInsurancePeriod = this.getCareInsurancePeriod(this.employeeInfo.birthDate);
              const isCareInsuranceApplicable = this.isInPeriod(year, month, careInsurancePeriod);

              // 健康保険料
              const healthGradeInfo = rateData.insuranceTable.find(
                (g) => parseInt(g.grade.split(' ')[0], 10) == applicableGrade!.healthInsuranceGrade
              );
              if (healthGradeInfo) {
                const nonNursingHalf = healthGradeInfo.nonNursingHalf;
                const nursingHalf = healthGradeInfo.nursingHalf;
                const nonNursingTotal = healthGradeInfo.nonNursingTotal;
                const nursingTotal = healthGradeInfo.nursingTotal;

                if (isCareInsuranceApplicable) {
                  // 介護保険対象者：介護保険料の欄にnursingHalfをセット、健康保険料は空
                  result.healthInsuranceFeeEmployee = null;
                  result.healthInsuranceFeeCompany = null;
                  result.careInsuranceFeeEmployee = nursingHalf;
                  result.careInsuranceFeeCompany = nursingTotal; // 全額を保険料マスタから取得
                } else {
                  // 非対象者：健康保険料の欄にnonNursingHalfをセット、介護保険料は空
                  result.healthInsuranceFeeEmployee = nonNursingHalf;
                  result.healthInsuranceFeeCompany = nonNursingTotal; // 全額を保険料マスタから取得
                  result.careInsuranceFeeEmployee = null;
                  result.careInsuranceFeeCompany = null;
                }
              }

              // 厚生年金保険料
              const pensionGradeInfo = rateData.pensionTable.find(
                (g) => g.grade == applicableGrade!.pensionInsuranceGrade
              );
              if (pensionGradeInfo) {
                const pensionHalf = pensionGradeInfo.pensionHalf;
                const pensionTotal = pensionGradeInfo.pensionTotal;
                result.pensionInsuranceFeeEmployee = pensionHalf;
                result.pensionInsuranceFeeCompany = pensionTotal; // 全額を保険料マスタから取得
              }
            }
          }
        } else {
          // 適用される等級がない場合
          result.healthInsuranceGrade = '履歴なし';
          result.pensionInsuranceGrade = '履歴なし';
        }

        // 厚生年金の適用期間外の月は必ず'-'をセット
        const pensionPeriod = this.employeeInsurancePeriods.pensionInsurancePeriod ?? null;
        const isPensionPeriod = this.isInPeriod(year, month, pensionPeriod);
        if (!isPensionPeriod) {
          result.pensionInsuranceGrade = '-';
          result.pensionInsuranceFeeEmployee = '-';
          result.pensionInsuranceFeeCompany = '-';
        }

        finalResults.push(result);
      }
      this.monthlyResults = finalResults;
      // 計算結果を自動保存
      await this.saveMonthlyResults(false);
    } catch (error) {
      console.error('等級の判定中にエラーが発生しました:', error);
      this.errorMessage = '等級の判定処理でエラーが発生しました。';
    } finally {
      this.isLoading = false;
    }
  }

  private async fetchGradeHistory(): Promise<GradeJudgmentRecord[]> {
    if (!this.employeeInfo || !this.uid) return [];

    const { companyId } = this.employeeInfo;

    const history: GradeJudgmentRecord[] = [];
    const judgmentsRef = collection(
      this.firestore,
      `companies/${companyId}/employees/${this.uid}/gradeHistory`
    );
    const q = query(judgmentsRef);
    const querySnapshot = await getDocs(q);

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      history.push({
        effectiveDate: (data['effectiveDate'] as Timestamp).toDate(),
        endDate: data['endDate'] ? (data['endDate'] as Timestamp).toDate() : undefined,
        healthInsuranceGrade: data['healthInsuranceGrade'],
        pensionInsuranceGrade: data['pensionInsuranceGrade'],
        judgmentReason: data['judgmentReason'] as string,
      });
    });
    return history;
  }

  private async fetchInsuranceRateData(): Promise<InsuranceRateData | null> {
    if (!this.targetYear || !this.employeeInfo?.addressPrefecture) return null;

    // 「都」「府」「県」を削除してFirestoreのキーと一致させる
    const prefectureKey = this.employeeInfo.addressPrefecture.replace(/[都府県]$/, '');

    const docRef = doc(
      this.firestore,
      `insurance_rates/${this.targetYear}/prefectures/${prefectureKey}/rate_table/main`
    );
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as InsuranceRateData;
    } else {
      console.warn(`保険料率データが見つかりません: ${this.targetYear}年度 / ${prefectureKey}`);
      return null;
    }
  }

  private calculateAgeAtDate(birthDate: Date, specificDate: Date): number {
    let age = specificDate.getFullYear() - birthDate.getFullYear();
    const m = specificDate.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && specificDate.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  private formatCurrency(value: string | number | null): string {
    if (value === null || value === undefined || value === '' || value === '-') return '-';
    // SocialInsuranceCalculatorを使用してフォーマット
    return SocialInsuranceCalculator.formatCurrency(String(value));
  }

  private parseGrade(value: string | number | null): number | null {
    if (value === null) {
      return null;
    }
    if (typeof value === 'number') {
      return value;
    }
    // 文字列の場合、数値に変換を試みる
    const num = parseInt(String(value), 10);
    // 変換できない場合（"産休"など）はnullを返す
    return isNaN(num) ? null : num;
  }

  async saveMonthlyResults(showAlert = false): Promise<void> {
    if (!this.employeeInfo || !this.targetYear || this.monthlyResults.length === 0 || !this.uid) {
      console.error('保存に必要な情報が不足しています。');
      return;
    }
    this.isLoading = true;
    const { companyId, employeeNumber } = this.employeeInfo;
    const docPath = `companies/${companyId}/employees/${this.uid}/salary_calculation_results/${this.targetYear}`;
    const docRef = doc(this.firestore, docPath);

    // Firestoreに保存するためにデータを整形
    const resultsForDb = {
      companyId: companyId,
      uid: this.uid,
      employeeNumber: employeeNumber,
      year: this.targetYear,
      months: this.monthlyResults.reduce(
        (acc, r) => {
          const normalize = (v: string | number | null | undefined) =>
            v === null || v === undefined || v === '' || v === '0' || v === '-' ? '-' : String(v);

          const healthGrade = normalize(r.healthInsuranceGrade);
          const healthEmp = normalize(r.healthInsuranceFeeEmployee);
          const healthCom = normalize(r.healthInsuranceFeeCompany);

          const pensionGrade = normalize(r.pensionInsuranceGrade);
          const pensionEmp = normalize(r.pensionInsuranceFeeEmployee);
          const pensionCom = normalize(r.pensionInsuranceFeeCompany);

          // 健康保険も厚生年金も全て'-'なら保存しない
          if (
            healthGrade === '-' &&
            healthEmp === '-' &&
            healthCom === '-' &&
            pensionGrade === '-' &&
            pensionEmp === '-' &&
            pensionCom === '-'
          ) {
            return acc;
          }

          acc[r.month] = {
            year: normalize(r.year),
            month: normalize(r.month),
            healthInsuranceGrade: healthGrade,
            healthInsuranceFeeEmployee: healthEmp,
            healthInsuranceFeeCompany: healthCom,
            careInsuranceFeeEmployee: normalize(r.careInsuranceFeeEmployee),
            careInsuranceFeeCompany: normalize(r.careInsuranceFeeCompany),
            pensionInsuranceGrade: pensionGrade,
            pensionInsuranceFeeEmployee: pensionEmp,
            pensionInsuranceFeeCompany: pensionCom,
          };
          return acc;
        },
        {} as Record<number, MonthlyCalculationResultForDb>
      ),
      updatedAt: Timestamp.now(),
    };

    try {
      await setDoc(docRef, resultsForDb); // 完全上書き保存
      if (showAlert) {
        alert(`${this.targetYear}年度の計算結果を保存しました。`);
      }
    } catch (error) {
      console.error('計算結果の保存中にエラーが発生しました:', error);
      if (showAlert) {
        alert('エラーが発生しました。コンソールを確認してください。');
      }
    } finally {
      this.isLoading = false;
    }
  }

  // === period calculation helpers (copied from insurance-judgment.component.ts) ===
  getCareInsurancePeriod(birthDate: string): { start: string; end: string } | null {
    if (!birthDate) return null;
    const bd = new Date(birthDate);
    // 40歳の誕生日の前日
    const startDate = new Date(bd);
    startDate.setFullYear(bd.getFullYear() + 40);
    startDate.setDate(startDate.getDate() - 1);
    // 65歳の誕生日の前日
    const endDate = new Date(bd);
    endDate.setFullYear(bd.getFullYear() + 65);
    endDate.setDate(endDate.getDate() - 1);
    // 開始月（YYYY-MM）
    const start = `${startDate.getFullYear()}-${('0' + (startDate.getMonth() + 1)).slice(-2)}`;
    // 終了月（65歳の誕生日の前日が属する月の前月）
    const endDatePrevMonth = new Date(endDate);
    endDatePrevMonth.setMonth(endDatePrevMonth.getMonth() - 1);
    const end = `${endDatePrevMonth.getFullYear()}-${('0' + (endDatePrevMonth.getMonth() + 1)).slice(-2)}`;
    return { start, end };
  }

  isInPeriod(year: number, month: number, period: { start: string; end: string } | null): boolean {
    if (!period || !period.start) return false;
    const ym = `${year}-${month.toString().padStart(2, '0')}`;
    if (!period.end || period.end === '') {
      // 上限なし
      return ym >= period.start;
    }
    return ym >= period.start && ym <= period.end;
  }

  // FirestoreのinsuranceJudgmentsから保険期間情報を取得
  async loadEmployeeInsurancePeriods() {
    if (!this.uid) return;
    try {
      const db = this.firestore;
      const docRef = doc(db, 'insuranceJudgments', this.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        this.employeeInsurancePeriods = {
          careInsurancePeriod: data['careInsurancePeriod'],
          healthInsurancePeriod: data['healthInsurancePeriod'],
          pensionInsurancePeriod: data['pensionInsurancePeriod'],
        };
      }
    } catch (e) {
      console.error('保険期間情報の取得に失敗:', e);
    }
  }

  // 日付を「YYYY年MM月」形式に変換
  formatJapaneseDate(dateStr?: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 2) {
      dateStr = `${parts[0]}-${parts[1]}-01`;
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
  }

  /**
   * 保険料マスタから取得した全額を小数点まで表示用にフォーマット
   */
  formatAmountWithDecimal(amount: string | null): string {
    if (!amount || amount === '0' || amount === '' || amount === '-') {
      return '';
    }

    try {
      const decimal = new Decimal(amount);
      return decimal.toNumber().toLocaleString('ja-JP', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    } catch (error) {
      console.error('金額フォーマットエラー:', error);
      return String(amount);
    }
  }
}
