import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

interface EmployeeInfo {
  name: string;
  employeeNumber: string;
  birthDate: string;
  age: number;
  companyId: string;
  branchNumber: string;
  addressPrefecture: string;
}

interface InsuranceTableItem {
  grade: string;
  standardSalary: string;
  salaryRange: string;
  nonNursingHalf?: string;
  nonNursingRate?: string;
  nonNursingTotal?: string;
  nursingHalf?: string;
  nursingRate?: string;
  nursingTotal?: string;
  pensionHalf?: string;
  pensionRate?: string;
  pensionTotal?: string;
}

interface GradeJudgmentResult {
  healthInsuranceGrade: number;
  healthInsuranceStandardSalary: number;
  pensionInsuranceGrade: number;
  pensionInsuranceStandardSalary: number;
  careInsuranceGrade?: number;
  careInsuranceStandardSalary?: number;
}

@Component({
  selector: 'app-manual-grade-add',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manual-grade-add.component.html',
  styleUrl: './manual-grade-add.component.scss',
})
export class ManualGradeAddComponent implements OnInit {
  employeeInfo: EmployeeInfo | null = null;
  isLoading = false;
  errorMessage = '';

  // フォーム用プロパティ
  monthlyAmount: number | null = null;
  applicableYear: number | null = null;
  applicableMonth: number | null = null;
  endYear: number | null = null;
  endMonth: number | null = null;

  // 判定結果
  judgmentResult: GradeJudgmentResult | null = null;
  isCalculating = false;

  // 選択肢用データ
  availableYears: number[] = [];
  availableMonths = [
    { value: 1, label: '1月' },
    { value: 2, label: '2月' },
    { value: 3, label: '3月' },
    { value: 4, label: '4月' },
    { value: 5, label: '5月' },
    { value: 6, label: '6月' },
    { value: 7, label: '7月' },
    { value: 8, label: '8月' },
    { value: 9, label: '9月' },
    { value: 10, label: '10月' },
    { value: 11, label: '11月' },
    { value: 12, label: '12月' },
  ];

  private employeeId: string | null = null;
  private firestore = getFirestore();

  constructor(
    private router: Router,
    private route: ActivatedRoute
  ) {}

  async ngOnInit(): Promise<void> {
    this.employeeId = this.route.snapshot.paramMap.get('employeeId');
    if (!this.employeeId) {
      this.errorMessage = '従業員IDが見つかりません';
      return;
    }

    this.initializeYears();
    await this.loadEmployeeInfo();
  }

  private initializeYears(): void {
    const currentYear = new Date().getFullYear();
    for (let year = currentYear - 5; year <= currentYear + 10; year++) {
      this.availableYears.push(year);
    }
  }

  private async loadEmployeeInfo(): Promise<void> {
    if (!this.employeeId) return;

    this.isLoading = true;
    try {
      const docRef = doc(this.firestore, 'users', this.employeeId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const userData = docSnap.data();
        const birthDate = new Date(userData['birthDate']);
        const age = this.calculateAge(birthDate);

        this.employeeInfo = {
          name: `${userData['lastName'] || ''} ${userData['firstName'] || ''}`.trim(),
          employeeNumber: userData['employeeNumber'] || '',
          birthDate: userData['birthDate'] || '',
          age: age,
          companyId: userData['companyId'] || '',
          branchNumber: userData['branchNumber'] || '',
          addressPrefecture: userData['addressPrefecture'] || '',
        };
      } else {
        // テスト用データを設定
        this.employeeInfo = {
          name: '定森 統和',
          employeeNumber: '1',
          birthDate: '1999-08-21',
          age: 25,
          companyId: 'test-company',
          branchNumber: '001',
          addressPrefecture: '東京都',
        };
      }
    } catch (error) {
      console.error('従業員情報取得エラー:', error);
      // エラー時もテスト用データを設定
      this.employeeInfo = {
        name: '定森 統和',
        employeeNumber: '1',
        birthDate: '1999-08-21',
        age: 25,
        companyId: 'test-company',
        branchNumber: '001',
        addressPrefecture: '東京都',
      };
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
    this.router.navigate(['/grade-judgment', this.employeeId]);
  }

  isFormValid(): boolean {
    return !!(
      this.monthlyAmount &&
      this.monthlyAmount > 0 &&
      this.applicableYear &&
      this.applicableMonth
    );
  }

  async calculateGrade(): Promise<void> {
    if (!this.isFormValid() || !this.employeeInfo) {
      return;
    }

    this.isCalculating = true;
    this.judgmentResult = null;

    try {
      // 年度を判定（3月以降は当年度）
      const targetYear =
        this.applicableMonth! >= 3 ? this.applicableYear! : this.applicableYear! - 1;

      // 都道府県を取得（Firestore用に変換）
      const prefecture = this.convertPrefectureForFirestore(this.employeeInfo.addressPrefecture);

      console.log('判定パラメータ:', {
        monthlyAmount: this.monthlyAmount,
        applicableYear: this.applicableYear,
        applicableMonth: this.applicableMonth,
        targetYear: targetYear,
        originalPrefecture: this.employeeInfo.addressPrefecture,
        convertedPrefecture: prefecture,
      });

      // 保険料表を取得
      const tables = await this.getInsuranceTable(targetYear, prefecture);

      if (!tables || !tables.insuranceTable || tables.insuranceTable.length === 0) {
        throw new Error('保険料表が見つかりません');
      }

      console.log('取得したテーブル数:', {
        insuranceTableLength: tables.insuranceTable.length,
        pensionTableLength: tables.pensionTable.length,
      });

      // 報酬月額から等級を判定
      const result = this.findGradeByAmount(tables, this.monthlyAmount!);

      if (!result) {
        throw new Error('該当する等級が見つかりません');
      }

      console.log('判定結果:', result);
      this.judgmentResult = result;
    } catch (error) {
      console.error('等級判定エラー:', error);
      this.errorMessage = '等級判定に失敗しました: ' + (error as Error).message;
    } finally {
      this.isCalculating = false;
    }
  }

  private convertPrefectureForFirestore(prefecture: string): string {
    // 都道府県名からFirestore用の形式に変換
    const prefectureMap: Record<string, string> = {
      東京都: '東京',
      大阪府: '大阪',
      京都府: '京都',
      // 他の都道府県も必要に応じて追加
    };

    return prefectureMap[prefecture] || prefecture.replace(/[都道府県]$/, '');
  }

  private async getInsuranceTable(
    year: number,
    prefecture: string
  ): Promise<{ insuranceTable: InsuranceTableItem[]; pensionTable: InsuranceTableItem[] }> {
    try {
      console.log(
        'Firestore参照パス:',
        `insurance_rates/${year}/prefectures/${prefecture}/rate_table/main`
      );

      const docRef = doc(
        this.firestore,
        'insurance_rates',
        year.toString(),
        'prefectures',
        prefecture,
        'rate_table',
        'main'
      );
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log('Firestoreから取得した全データ:', data);
        console.log('insuranceTableの内容:', data['insuranceTable']);
        console.log('pensionTableの内容:', data['pensionTable']);

        return {
          insuranceTable: data['insuranceTable'] || [],
          pensionTable: data['pensionTable'] || [],
        };
      } else {
        console.error('ドキュメントが存在しません');
        throw new Error(`${year}年度の${prefecture}の保険料表が見つかりません`);
      }
    } catch (error) {
      console.error('保険料表取得エラー:', error);
      throw error;
    }
  }

  private findGradeByAmount(
    tables: { insuranceTable: InsuranceTableItem[]; pensionTable: InsuranceTableItem[] },
    amount: number
  ): GradeJudgmentResult | null {
    // 健康保険・介護保険の等級を検索
    const healthItem = tables.insuranceTable.find((item) => {
      const range = item.salaryRange;
      if (range.includes('～')) {
        const [min, max] = range.split('～').map((s) => parseInt(s.replace(/,/g, '')));
        return amount >= min && amount <= max;
      } else if (range.includes('以上')) {
        const min = parseInt(range.replace(/[^\d]/g, ''));
        return amount >= min;
      }
      return false;
    });

    if (!healthItem) {
      return null;
    }

    const healthGrade = parseInt(healthItem.grade);
    const healthStandardSalary = parseInt(healthItem.standardSalary.replace(/,/g, ''));

    // 厚生年金保険の等級を検索
    const pensionItem = tables.pensionTable.find((item) => {
      const range = item.salaryRange;
      if (range.includes('～')) {
        const [min, max] = range.split('～').map((s) => parseInt(s.replace(/,/g, '')));
        return amount >= min && amount <= max;
      } else if (range.includes('以上')) {
        const min = parseInt(range.replace(/[^\d]/g, ''));
        return amount >= min;
      }
      return false;
    });

    // 厚生年金保険のデフォルト値（見つからない場合は最低等級）
    let pensionGrade = 1;
    let pensionStandardSalary = 88000;

    if (pensionItem) {
      pensionGrade = parseInt(pensionItem.grade);
      pensionStandardSalary = parseInt(pensionItem.standardSalary.replace(/,/g, ''));
    }

    const result: GradeJudgmentResult = {
      healthInsuranceGrade: healthGrade,
      healthInsuranceStandardSalary: healthStandardSalary,
      pensionInsuranceGrade: pensionGrade,
      pensionInsuranceStandardSalary: pensionStandardSalary,
    };

    // 40歳以上の場合は介護保険も設定
    if (this.employeeInfo && this.employeeInfo.age >= 40) {
      result.careInsuranceGrade = healthGrade;
      result.careInsuranceStandardSalary = healthStandardSalary;
    }

    return result;
  }
}
