import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  Timestamp,
  collection,
  deleteDoc,
} from 'firebase/firestore';

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

interface SavedGradeData {
  id?: string;
  employeeId: string;
  monthlyAmount: number;
  applicableYear: number;
  applicableMonth: number;
  endYear?: number;
  endMonth?: number;
  judgmentResult: GradeJudgmentResult;
  createdAt: Date;
  updatedAt: Date;
  judgmentType: 'manual';
}

interface FirestoreGradeData {
  employeeId: string;
  monthlyAmount: number;
  applicableYear: number;
  applicableMonth: number;
  endYear?: number;
  endMonth?: number;
  judgmentResult: GradeJudgmentResult;
  createdAt: Date;
  updatedAt: Date;
  judgmentType: 'manual';
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
  isSaving = false;
  savedGradeData: SavedGradeData | null = null;

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
    this.route.paramMap.subscribe((params) => {
      this.employeeId = params.get('employeeId');
      if (this.employeeId) {
        this.loadEmployeeInfo();
        this.loadExistingGradeData();
      }
    });
    this.initializeYears();
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

      // 保険料表を取得
      const tables = await this.getInsuranceTable(targetYear, prefecture);

      if (!tables || !tables.insuranceTable || tables.insuranceTable.length === 0) {
        throw new Error('保険料表が見つかりません');
      }

      // 報酬月額から等級を判定
      const result = this.findGradeByAmount(tables, this.monthlyAmount!);

      if (!result) {
        throw new Error('該当する等級が見つかりません');
      }

      this.judgmentResult = result;
    } catch (error) {
      console.error('等級判定エラー:', error);
      this.errorMessage = '等級判定に失敗しました: ' + (error as Error).message;
    } finally {
      this.isCalculating = false;
    }
  }

  private convertPrefectureForFirestore(prefecture: string): string {
    // 都道府県名からFirestore用の形式に変換（全都道府県対応）
    const prefectureMap: Record<string, string> = {
      // 都
      東京都: '東京',
      // 府
      大阪府: '大阪',
      京都府: '京都',
      // 道
      北海道: '北海道',
      // 県
      青森県: '青森',
      岩手県: '岩手',
      宮城県: '宮城',
      秋田県: '秋田',
      山形県: '山形',
      福島県: '福島',
      茨城県: '茨城',
      栃木県: '栃木',
      群馬県: '群馬',
      埼玉県: '埼玉',
      千葉県: '千葉',
      神奈川県: '神奈川',
      新潟県: '新潟',
      富山県: '富山',
      石川県: '石川',
      福井県: '福井',
      山梨県: '山梨',
      長野県: '長野',
      岐阜県: '岐阜',
      静岡県: '静岡',
      愛知県: '愛知',
      三重県: '三重',
      滋賀県: '滋賀',
      兵庫県: '兵庫',
      奈良県: '奈良',
      和歌山県: '和歌山',
      鳥取県: '鳥取',
      島根県: '島根',
      岡山県: '岡山',
      広島県: '広島',
      山口県: '山口',
      徳島県: '徳島',
      香川県: '香川',
      愛媛県: '愛媛',
      高知県: '高知',
      福岡県: '福岡',
      佐賀県: '佐賀',
      長崎県: '長崎',
      熊本県: '熊本',
      大分県: '大分',
      宮崎県: '宮崎',
      鹿児島県: '鹿児島',
      沖縄県: '沖縄',
    };

    const converted = prefectureMap[prefecture];
    if (!converted) {
      console.warn(`未対応の都道府県: ${prefecture}`);
      // フォールバック: 都道府県を削除
      return prefecture.replace(/[都道府県]$/, '');
    }

    return converted;
  }

  private async getInsuranceTable(
    year: number,
    prefecture: string
  ): Promise<{ insuranceTable: InsuranceTableItem[]; pensionTable: InsuranceTableItem[] }> {
    try {
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
        return {
          insuranceTable: data['insuranceTable'] || [],
          pensionTable: data['pensionTable'] || [],
        };
      } else {
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

  private async loadExistingGradeData(): Promise<void> {
    if (!this.employeeId) return;

    try {
      // 一時的な回避策: 単純なクエリを使用
      const docId = `${this.employeeId}_manual`;
      const docRef = doc(this.firestore, 'employee_grades', docId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as SavedGradeData;
        this.savedGradeData = { ...data, id: docSnap.id };

        // フォームに既存データを設定
        this.monthlyAmount = data.monthlyAmount;
        this.applicableYear = data.applicableYear;
        this.applicableMonth = data.applicableMonth;
        this.endYear = data.endYear || null;
        this.endMonth = data.endMonth || null;
        this.judgmentResult = data.judgmentResult;
      }
    } catch (error) {
      console.error('既存データ読み込みエラー:', error);
    }
  }

  async saveGradeData(): Promise<void> {
    if (!this.employeeId || !this.judgmentResult || !this.isFormValid()) {
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    try {
      const gradeData: FirestoreGradeData = {
        employeeId: this.employeeId,
        monthlyAmount: this.monthlyAmount!,
        applicableYear: this.applicableYear!,
        applicableMonth: this.applicableMonth!,
        judgmentResult: this.judgmentResult,
        createdAt: this.savedGradeData?.createdAt || new Date(),
        updatedAt: new Date(),
        judgmentType: 'manual',
      };

      // undefinedの場合はフィールドを除外、値がある場合は含める
      if (this.endYear !== null && this.endYear !== undefined) {
        gradeData.endYear = this.endYear;
      }
      if (this.endMonth !== null && this.endMonth !== undefined) {
        gradeData.endMonth = this.endMonth;
      }

      const docId = this.savedGradeData?.id || `${this.employeeId}_manual`;
      const docRef = doc(this.firestore, 'employee_grades', docId);

      await setDoc(docRef, gradeData);

      this.savedGradeData = { ...gradeData, id: docId };

      // 成功メッセージを表示（3秒後に消去）
      this.errorMessage = '等級データが保存されました';
      setTimeout(() => {
        this.errorMessage = '';
      }, 3000);
    } catch (error) {
      console.error('保存エラー:', error);
      this.errorMessage = '保存に失敗しました: ' + (error as Error).message;
    } finally {
      this.isSaving = false;
    }
  }

  private isFirestoreTimestamp(value: unknown): value is Timestamp {
    return value !== null && typeof value === 'object' && 'toDate' in (value as object);
  }

  getFormattedDate(timestamp: Date | Timestamp): string {
    if (!timestamp) return '';

    // FirestoreのTimestampオブジェクトの場合
    if (this.isFirestoreTimestamp(timestamp)) {
      return timestamp.toDate().toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    // 既にDateオブジェクトの場合
    if (timestamp instanceof Date) {
      return timestamp.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    return '';
  }

  async saveToGradeJudgmentHistory(): Promise<void> {
    if (!this.employeeId || !this.judgmentResult || !this.isFormValid()) {
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    try {
      // 適用開始日を作成
      const effectiveDate = new Date(this.applicableYear!, this.applicableMonth! - 1, 1);

      // 適用終了日を作成（ある場合のみ）
      let endDate: Date | undefined;
      if (this.endYear && this.endMonth) {
        endDate = new Date(this.endYear, this.endMonth - 1, 1);
      }

      // 等級判定履歴用のデータを作成
      const gradeJudgmentRecord = {
        employeeId: this.employeeId,
        judgmentType: 'manual' as const,
        judgmentDate: new Date(),
        effectiveDate: effectiveDate,
        endDate: endDate,
        healthInsuranceGrade: this.judgmentResult.healthInsuranceGrade,
        pensionInsuranceGrade: this.judgmentResult.pensionInsuranceGrade,
        careInsuranceGrade: this.judgmentResult.careInsuranceGrade,
        standardMonthlyAmount: this.monthlyAmount!,
        reason: '手入力による等級判定',
        inputData: {
          manualAmount: this.monthlyAmount!,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 等級判定履歴コレクションに保存
      const historyCollectionRef = collection(
        this.firestore,
        'gradeJudgments',
        this.employeeId,
        'judgments'
      );
      await setDoc(doc(historyCollectionRef), gradeJudgmentRecord);

      // 判定結果をクリア
      this.judgmentResult = null;
      this.monthlyAmount = null;
      this.applicableYear = null;
      this.applicableMonth = null;
      this.endYear = null;
      this.endMonth = null;

      // 成功メッセージを表示
      this.errorMessage = '等級判定結果が履歴に保存されました';
      setTimeout(() => {
        this.errorMessage = '';
      }, 3000);
    } catch (error) {
      console.error('履歴保存エラー:', error);
      this.errorMessage = '履歴への保存に失敗しました: ' + (error as Error).message;
    } finally {
      this.isSaving = false;
    }
  }

  async deleteGradeData(): Promise<void> {
    if (!this.savedGradeData?.id) {
      // 保存データがない場合は画面上の表示のみクリア
      this.judgmentResult = null;
      this.monthlyAmount = null;
      this.applicableYear = null;
      this.applicableMonth = null;
      this.endYear = null;
      this.endMonth = null;
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    try {
      // Firestoreからデータを削除
      const docRef = doc(this.firestore, 'employee_grades', this.savedGradeData.id);
      await deleteDoc(docRef);

      // 画面の表示をクリア
      this.judgmentResult = null;
      this.monthlyAmount = null;
      this.applicableYear = null;
      this.applicableMonth = null;
      this.endYear = null;
      this.endMonth = null;
      this.savedGradeData = null;

      // 成功メッセージを表示
      this.errorMessage = 'データが削除されました';
      setTimeout(() => {
        this.errorMessage = '';
      }, 3000);
    } catch (error) {
      console.error('削除エラー:', error);
      this.errorMessage = '削除に失敗しました: ' + (error as Error).message;
    } finally {
      this.isSaving = false;
    }
  }
}
