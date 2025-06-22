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
} from 'firebase/firestore';
import { OfficeService } from '../services/office.service';
import { SocialInsuranceCalculator } from '../utils/decimal-calculator';

interface EmployeeInfo {
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
  }[];
  pensionTable: {
    grade: number;
    standardSalary: string;
    pensionHalf: string;
  }[];
}

// 月別計算結果のインターフェース
interface MonthlyCalculationResult {
  month: number;
  year: number;
  healthInsuranceGrade: number | string;
  healthInsuranceFeeEmployee: number | string;
  healthInsuranceFeeCompany: number | string;
  careInsuranceFeeEmployee: number | string;
  careInsuranceFeeCompany: number | string;
  pensionInsuranceGrade: number | string;
  pensionInsuranceFeeEmployee: number | string;
  pensionInsuranceFeeCompany: number | string;
}

@Component({
  selector: 'app-insurance-calculation-salary',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './insurance-calculation-salary.component.html',
  styleUrls: ['./insurance-calculation-salary.component.scss'],
})
export class InsuranceCalculationSalaryComponent implements OnInit {
  employeeInfo: EmployeeInfo | null = null;
  isLoading = false;
  errorMessage = '';

  targetYear: number | null = null;
  monthlyResults: MonthlyCalculationResult[] = [];

  private employeeId: string | null = null;
  private firestore = getFirestore();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private officeService: OfficeService
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
      const usersRef = collection(this.firestore, 'users');
      const q = query(usersRef, where('employeeNumber', '==', this.employeeId));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data();
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
          name: `${userData['lastName'] || ''} ${userData['firstName'] || ''}`.trim(),
          employeeNumber: userData['employeeNumber'] || '',
          birthDate: birthDate.toISOString().split('T')[0],
          age: age,
          companyId: userData['companyId'] || '',
          branchNumber: userData['branchNumber'] || '',
          addressPrefecture: addressPrefecture,
        };
      } else {
        this.errorMessage = `従業員番号: ${this.employeeId} の情報が見つかりません`;
      }
    } catch (error) {
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
        healthInsuranceFeeEmployee: '-',
        healthInsuranceFeeCompany: '-',
        careInsuranceFeeEmployee: '-',
        careInsuranceFeeCompany: '-',
        pensionInsuranceFeeEmployee: '-',
        pensionInsuranceFeeCompany: '-',
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
          healthInsuranceGrade: applicableGrade ? applicableGrade.healthInsuranceGrade : '履歴なし',
          pensionInsuranceGrade: applicableGrade
            ? applicableGrade.pensionInsuranceGrade
            : '履歴なし',
          healthInsuranceFeeEmployee: '-',
          healthInsuranceFeeCompany: '-',
          careInsuranceFeeEmployee: '-',
          careInsuranceFeeCompany: '-',
          pensionInsuranceFeeEmployee: '-',
          pensionInsuranceFeeCompany: '-',
        };

        if (applicableGrade && this.employeeInfo) {
          // 介護保険の対象か判定
          const ageOnFirstDayOfMonth = this.calculateAgeAtDate(
            new Date(this.employeeInfo.birthDate),
            firstDayOfMonth
          );
          const isCareInsuranceApplicable = ageOnFirstDayOfMonth >= 40 && ageOnFirstDayOfMonth < 65;

          // 健康保険料の計算と設定
          const healthGradeInfo = rateData.insuranceTable.find(
            (g) => parseInt(g.grade.split(' ')[0], 10) == applicableGrade!.healthInsuranceGrade
          );
          if (healthGradeInfo) {
            // 介護保険の有無に関わらず、まず基本的な健康保険料を設定
            result.healthInsuranceFeeEmployee = this.formatCurrency(healthGradeInfo.nonNursingHalf);
            result.healthInsuranceFeeCompany = this.formatCurrency(healthGradeInfo.nonNursingHalf);

            // 介護保険対象者の場合のみ、介護保険料を加算（または健康保険料を上書き）
            if (isCareInsuranceApplicable) {
              // 注意: rateDataのnursingHalfは「介護保険料込みの半額」を意味すると想定
              // そのため、健康保険料＋介護保険料の合計額で健康保険料を上書きする
              result.healthInsuranceFeeEmployee = this.formatCurrency(healthGradeInfo.nursingHalf);
              result.healthInsuranceFeeCompany = this.formatCurrency(healthGradeInfo.nursingHalf);

              // 介護保険料の内訳を計算して設定
              const careFee = SocialInsuranceCalculator.subtract(
                healthGradeInfo.nursingHalf,
                healthGradeInfo.nonNursingHalf
              );
              result.careInsuranceFeeEmployee = this.formatCurrency(careFee);
              result.careInsuranceFeeCompany = this.formatCurrency(careFee);
            }
          }

          // 厚生年金保険料の計算と設定
          const pensionGradeInfo = rateData.pensionTable.find(
            (g) => g.grade == applicableGrade!.pensionInsuranceGrade
          );
          if (pensionGradeInfo) {
            result.pensionInsuranceFeeEmployee = this.formatCurrency(pensionGradeInfo.pensionHalf);
            result.pensionInsuranceFeeCompany = this.formatCurrency(pensionGradeInfo.pensionHalf);
          }
        }
        finalResults.push(result);
      }
      this.monthlyResults = finalResults;
    } catch (error) {
      console.error('等級の判定中にエラーが発生しました:', error);
      this.errorMessage = '等級の判定処理でエラーが発生しました。';
    } finally {
      this.isLoading = false;
    }
  }

  private async fetchGradeHistory(): Promise<GradeJudgmentRecord[]> {
    if (!this.employeeId) return [];

    const history: GradeJudgmentRecord[] = [];
    const q = query(collection(this.firestore, 'gradeJudgments', this.employeeId, 'judgments'));
    const querySnapshot = await getDocs(q);

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      history.push({
        effectiveDate: (data['effectiveDate'] as Timestamp).toDate(),
        endDate: data['endDate'] ? (data['endDate'] as Timestamp).toDate() : undefined,
        healthInsuranceGrade: data['healthInsuranceGrade'],
        pensionInsuranceGrade: data['pensionInsuranceGrade'],
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

  private formatCurrency(value: string | number): string {
    if (typeof value === 'number') {
      value = String(value);
    }
    if (!value || value === '0' || value === '-') return '-';
    return new Intl.NumberFormat('ja-JP').format(Number(value));
  }
}
