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
  query,
  where,
  getDocs,
} from 'firebase/firestore';
import { AuthService } from '../../services/auth.service';
import { OfficeService } from '../../services/office.service';
import { SocialInsuranceCalculator } from '../../utils/decimal-calculator';

interface EmployeeInfo {
  uid: string;
  name: string;
  employeeNumber: string;
  birthDate: string;
  age: bigint;
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
  healthInsuranceGrade?: bigint;
  healthInsuranceStandardSalary?: string;
  pensionInsuranceGrade?: bigint;
  pensionInsuranceStandardSalary?: string;
  careInsuranceGrade?: bigint;
  careInsuranceStandardSalary?: string;
  isMaternityLeave?: boolean;
  isChildcareLeave?: boolean;
}

interface SavedGradeData {
  id?: string;
  employeeId: string;
  monthlyAmount: string;
  applicableYear: bigint;
  applicableMonth: bigint;
  endYear?: bigint;
  endMonth?: bigint;
  judgmentResult: GradeJudgmentResult;
  createdAt: Date;
  updatedAt: Date;
  judgmentType: 'manual';
}

// Firestoreから読み込む際の生のデータ型。BigIntは文字列、DateはTimestampとして扱われる。
interface FirestoreRawData {
  employeeId: string;
  monthlyAmount: string;
  applicableYear: string;
  applicableMonth: string;
  endYear?: string;
  endMonth?: string;
  judgmentResult: {
    healthInsuranceGrade: string;
    healthInsuranceStandardSalary: string;
    pensionInsuranceGrade: string;
    pensionInsuranceStandardSalary: string;
    careInsuranceGrade?: string;
    careInsuranceStandardSalary?: string;
  };
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
  judgmentReason = '';
  monthlyAmount: string | null = null;
  applicableYear: bigint | null = null;
  applicableMonth: bigint | null = null;
  endYear: bigint | null = null;
  endMonth: bigint | null = null;

  // 判定結果
  judgmentResult: GradeJudgmentResult | null = null;
  isCalculating = false;
  isSaving = false;
  savedGradeData: SavedGradeData | null = null;

  // 選択肢用データ
  availableYears: bigint[] = [];
  availableMonths = [
    { value: BigInt(1), label: '1月' },
    { value: BigInt(2), label: '2月' },
    { value: BigInt(3), label: '3月' },
    { value: BigInt(4), label: '4月' },
    { value: BigInt(5), label: '5月' },
    { value: BigInt(6), label: '6月' },
    { value: BigInt(7), label: '7月' },
    { value: BigInt(8), label: '8月' },
    { value: BigInt(9), label: '9月' },
    { value: BigInt(10), label: '10月' },
    { value: BigInt(11), label: '11月' },
    { value: BigInt(12), label: '12月' },
  ];

  private employeeId: string | null = null;
  private recordId: string | null = null;
  isEditMode = false;
  private firestore = getFirestore();
  private companyId: string | null = null;

  confirmedReason: string | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private officeService: OfficeService
  ) {}

  async ngOnInit(): Promise<void> {
    this.employeeId = this.route.snapshot.paramMap.get('employeeId');
    this.recordId = this.route.snapshot.paramMap.get('recordId');
    const reasonFromState = history.state?.judgmentReason;
    this.isEditMode = !!this.recordId;

    if (this.employeeId) {
      this.companyId = await this.authService.getCurrentUserCompanyId();
      if (!this.companyId) {
        this.errorMessage = '会社IDが取得できませんでした。';
        return;
      }

      await this.loadEmployeeInfo();
      if (this.isEditMode && this.recordId) {
        await this.loadExistingManualGradeData(this.recordId);
        if (reasonFromState) {
          this.judgmentReason = reasonFromState;
        }
      }
    }
    this.initializeYears();
  }

  private initializeYears(): void {
    const currentYear = new Date().getFullYear();
    for (let year = currentYear - 5; year <= currentYear + 10; year++) {
      this.availableYears.push(BigInt(year));
    }
  }

  private async loadEmployeeInfo(): Promise<void> {
    if (!this.employeeId || !this.companyId) return;

    this.isLoading = true;
    try {
      console.log(
        '従業員情報を読み込み中 (employeeNumber, companyId):',
        this.employeeId,
        this.companyId
      );

      const usersRef = collection(this.firestore, 'users');
      const q = query(
        usersRef,
        where('employeeNumber', '==', this.employeeId),
        where('companyId', '==', this.companyId)
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        console.log('Firestoreから取得した従業員データ:', userData);

        const birthDate = new Date(userData['birthDate']);
        const age = this.calculateAge(birthDate);
        const formattedBirthDate = birthDate.toISOString().split('T')[0];
        let addressPrefecture = userData['addressPrefecture'] || '';

        if (!addressPrefecture && userData['companyId'] && userData['branchNumber']) {
          try {
            addressPrefecture = await this.officeService.findOfficeAddressPrefecture(
              userData['companyId'],
              userData['branchNumber']
            );
          } catch (officeError) {
            console.error('事業所データ取得エラー:', officeError);
          }
        }

        this.employeeInfo = {
          uid: userDoc.id,
          name: `${userData['lastName'] || ''} ${userData['firstName'] || ''}`.trim(),
          employeeNumber: userData['employeeNumber'] || '',
          birthDate: formattedBirthDate,
          age: age,
          companyId: userData['companyId'] || '',
          branchNumber: userData['branchNumber'] || '',
          addressPrefecture: addressPrefecture,
        };

        console.log('設定された従業員情報:', this.employeeInfo);
      } else {
        console.error(`従業員番号 ${this.employeeId} のデータがFirestoreに存在しません`);
        this.errorMessage = `従業員番号: ${this.employeeId} の情報が見つかりません`;
        this.employeeInfo = null;
      }
    } catch (error) {
      console.error('従業員情報取得エラー:', error);
      this.errorMessage = `従業員情報の取得に失敗しました: ${error}`;
      this.employeeInfo = null;
    } finally {
      this.isLoading = false;
    }
  }

  private calculateAge(birthDate: Date): bigint {
    // 年齢計算は整数の年月日計算なので通常計算で問題なし
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return BigInt(age);
  }

  goBack(): void {
    this.router.navigate(['/grade-judgment', this.employeeId]);
  }

  isFormValid(): boolean {
    return !!(
      this.monthlyAmount &&
      SocialInsuranceCalculator.compare(String(this.monthlyAmount), '0') > 0 &&
      this.applicableYear &&
      this.applicableMonth
    );
  }

  // 保存専用のバリデーション
  isSaveValid(): boolean {
    return this.isFormValid() && !!this.judgmentResult;
  }

  // 月額報酬の変更時に自動で等級判定を実行
  onMonthlyAmountChange(): void {
    // リアルタイム判定を無効化
    // ユーザーが判定ボタンを押すまで判定結果を表示しない
    // if (this.monthlyAmount && this.monthlyAmount > 0) {
    //   this.calculateGradeFromAmount();
    // } else {
    //   this.judgmentResult = null;
    // }
  }

  // 月額報酬から等級を即座に計算
  private calculateGradeFromAmount(): void {
    if (!this.monthlyAmount || !this.employeeInfo) {
      this.judgmentResult = null;
      return;
    }

    try {
      const result = this.findGradeByAmountFromStandardTable(this.monthlyAmount);
      this.judgmentResult = result;
      this.errorMessage = '';
    } catch (error) {
      console.error('等級判定エラー:', error);
      this.errorMessage = '等級判定に失敗しました';
      this.judgmentResult = null;
    }
  }

  async calculateGrade(): Promise<void> {
    if (
      this.judgmentReason === 'new_employee' ||
      this.judgmentReason === 'other' ||
      !this.judgmentReason
    ) {
      // リアルタイム判定と同じロジックを使用
      this.calculateGradeFromAmount();
    } else if (this.judgmentReason === 'maternity_leave') {
      this.judgmentResult = { isMaternityLeave: true };
    } else if (this.judgmentReason === 'childcare_leave') {
      this.judgmentResult = { isChildcareLeave: true };
    } else {
      // 他の選択肢の場合は一旦リセット
      this.judgmentResult = null;
      console.log(`判定ロジックが未実装の理由: ${this.judgmentReason}`);
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

  // 標準的な等級表を使用した等級判定（一の位まで対応）
  private findGradeByAmountFromStandardTable(amount: string): GradeJudgmentResult {
    // 健康保険の等級を決定
    const healthGrade = this.findGradeFromHealthInsuranceTable(amount);

    // 厚生年金保険の等級を決定
    const pensionGrade = this.findGradeFromPensionInsuranceTable(amount);

    const result: GradeJudgmentResult = {
      healthInsuranceGrade: healthGrade.grade,
      healthInsuranceStandardSalary: healthGrade.standardSalary,
      pensionInsuranceGrade: pensionGrade.grade,
      pensionInsuranceStandardSalary: pensionGrade.standardSalary,
    };

    // 40歳以上の場合は介護保険も設定（健康保険と同じ等級）
    if (this.employeeInfo && this.employeeInfo.age >= 40n) {
      result.careInsuranceGrade = healthGrade.grade;
      result.careInsuranceStandardSalary = healthGrade.standardSalary;
    }

    return result;
  }

  /**
   * 健康保険の等級表（令和6年度 - 全50等級）
   */
  private findGradeFromHealthInsuranceTable(amount: string): {
    grade: bigint;
    standardSalary: string;
  } {
    const healthInsuranceTable = [
      { grade: 1n, standardSalary: '58000', min: '0', max: '63000' },
      { grade: 2n, standardSalary: '68000', min: '63000', max: '73000' },
      { grade: 3n, standardSalary: '78000', min: '73000', max: '83000' },
      { grade: 4n, standardSalary: '88000', min: '83000', max: '93000' },
      { grade: 5n, standardSalary: '98000', min: '93000', max: '101000' },
      { grade: 6n, standardSalary: '104000', min: '101000', max: '107000' },
      { grade: 7n, standardSalary: '110000', min: '107000', max: '114000' },
      { grade: 8n, standardSalary: '118000', min: '114000', max: '122000' },
      { grade: 9n, standardSalary: '126000', min: '122000', max: '130000' },
      { grade: 10n, standardSalary: '134000', min: '130000', max: '138000' },
      { grade: 11n, standardSalary: '142000', min: '138000', max: '146000' },
      { grade: 12n, standardSalary: '150000', min: '146000', max: '155000' },
      { grade: 13n, standardSalary: '160000', min: '155000', max: '165000' },
      { grade: 14n, standardSalary: '170000', min: '165000', max: '175000' },
      { grade: 15n, standardSalary: '180000', min: '175000', max: '185000' },
      { grade: 16n, standardSalary: '190000', min: '185000', max: '195000' },
      { grade: 17n, standardSalary: '200000', min: '195000', max: '210000' },
      { grade: 18n, standardSalary: '220000', min: '210000', max: '230000' },
      { grade: 19n, standardSalary: '240000', min: '230000', max: '250000' },
      { grade: 20n, standardSalary: '260000', min: '250000', max: '270000' },
      { grade: 21n, standardSalary: '280000', min: '270000', max: '290000' },
      { grade: 22n, standardSalary: '300000', min: '290000', max: '310000' },
      { grade: 23n, standardSalary: '320000', min: '310000', max: '330000' },
      { grade: 24n, standardSalary: '340000', min: '330000', max: '350000' },
      { grade: 25n, standardSalary: '360000', min: '350000', max: '370000' },
      { grade: 26n, standardSalary: '380000', min: '370000', max: '395000' },
      { grade: 27n, standardSalary: '410000', min: '395000', max: '425000' },
      { grade: 28n, standardSalary: '440000', min: '425000', max: '455000' },
      { grade: 29n, standardSalary: '470000', min: '455000', max: '485000' },
      { grade: 30n, standardSalary: '500000', min: '485000', max: '515000' },
      { grade: 31n, standardSalary: '530000', min: '515000', max: '545000' },
      { grade: 32n, standardSalary: '560000', min: '545000', max: '575000' },
      { grade: 33n, standardSalary: '590000', min: '575000', max: '605000' },
      { grade: 34n, standardSalary: '620000', min: '605000', max: '635000' },
      { grade: 35n, standardSalary: '650000', min: '635000', max: '665000' },
      { grade: 36n, standardSalary: '680000', min: '665000', max: '695000' },
      { grade: 37n, standardSalary: '710000', min: '695000', max: '730000' },
      { grade: 38n, standardSalary: '750000', min: '730000', max: '770000' },
      { grade: 39n, standardSalary: '790000', min: '770000', max: '810000' },
      { grade: 40n, standardSalary: '830000', min: '810000', max: '855000' },
      { grade: 41n, standardSalary: '880000', min: '855000', max: '905000' },
      { grade: 42n, standardSalary: '930000', min: '905000', max: '955000' },
      { grade: 43n, standardSalary: '980000', min: '955000', max: '1005000' },
      { grade: 44n, standardSalary: '1030000', min: '1005000', max: '1055000' },
      { grade: 45n, standardSalary: '1090000', min: '1055000', max: '1115000' },
      { grade: 46n, standardSalary: '1150000', min: '1115000', max: '1175000' },
      { grade: 47n, standardSalary: '1210000', min: '1175000', max: '1235000' },
      { grade: 48n, standardSalary: '1270000', min: '1235000', max: '1295000' },
      { grade: 49n, standardSalary: '1330000', min: '1295000', max: '1355000' },
      { grade: 50n, standardSalary: '1390000', min: '1355000', max: 'Infinity' },
    ];

    const amountStr = String(amount);
    const targetGrade = healthInsuranceTable.find((grade) =>
      SocialInsuranceCalculator.isInGradeRange(amountStr, grade.min, grade.max)
    );
    return targetGrade || healthInsuranceTable[healthInsuranceTable.length - 1];
  }

  /**
   * 厚生年金保険の等級表（令和6年度 - 全32等級）
   */
  private findGradeFromPensionInsuranceTable(amount: string): {
    grade: bigint;
    standardSalary: string;
  } {
    const pensionInsuranceTable = [
      { grade: 1n, standardSalary: '88000', min: '0', max: '93000' },
      { grade: 2n, standardSalary: '98000', min: '93000', max: '101000' },
      { grade: 3n, standardSalary: '104000', min: '101000', max: '107000' },
      { grade: 4n, standardSalary: '110000', min: '107000', max: '114000' },
      { grade: 5n, standardSalary: '118000', min: '114000', max: '122000' },
      { grade: 6n, standardSalary: '126000', min: '122000', max: '130000' },
      { grade: 7n, standardSalary: '134000', min: '130000', max: '138000' },
      { grade: 8n, standardSalary: '142000', min: '138000', max: '146000' },
      { grade: 9n, standardSalary: '150000', min: '146000', max: '155000' },
      { grade: 10n, standardSalary: '160000', min: '155000', max: '165000' },
      { grade: 11n, standardSalary: '170000', min: '165000', max: '175000' },
      { grade: 12n, standardSalary: '180000', min: '175000', max: '185000' },
      { grade: 13n, standardSalary: '190000', min: '185000', max: '195000' },
      { grade: 14n, standardSalary: '200000', min: '195000', max: '210000' },
      { grade: 15n, standardSalary: '220000', min: '210000', max: '230000' },
      { grade: 16n, standardSalary: '240000', min: '230000', max: '250000' },
      { grade: 17n, standardSalary: '260000', min: '250000', max: '270000' },
      { grade: 18n, standardSalary: '280000', min: '270000', max: '290000' },
      { grade: 19n, standardSalary: '300000', min: '290000', max: '310000' },
      { grade: 20n, standardSalary: '320000', min: '310000', max: '330000' },
      { grade: 21n, standardSalary: '340000', min: '330000', max: '350000' },
      { grade: 22n, standardSalary: '360000', min: '350000', max: '370000' },
      { grade: 23n, standardSalary: '380000', min: '370000', max: '395000' },
      { grade: 24n, standardSalary: '410000', min: '395000', max: '425000' },
      { grade: 25n, standardSalary: '440000', min: '425000', max: '455000' },
      { grade: 26n, standardSalary: '470000', min: '455000', max: '485000' },
      { grade: 27n, standardSalary: '500000', min: '485000', max: '515000' },
      { grade: 28n, standardSalary: '530000', min: '515000', max: '545000' },
      { grade: 29n, standardSalary: '560000', min: '545000', max: '575000' },
      { grade: 30n, standardSalary: '590000', min: '575000', max: '605000' },
      { grade: 31n, standardSalary: '620000', min: '605000', max: '635000' },
      { grade: 32n, standardSalary: '650000', min: '635000', max: 'Infinity' },
    ];

    const amountStr = String(amount);
    const targetGrade = pensionInsuranceTable.find((grade) =>
      SocialInsuranceCalculator.isInGradeRange(amountStr, grade.min, grade.max)
    );
    return targetGrade || pensionInsuranceTable[pensionInsuranceTable.length - 1];
  }

  private findGradeByAmount(
    tables: { insuranceTable: InsuranceTableItem[]; pensionTable: InsuranceTableItem[] },
    amount: string
  ): GradeJudgmentResult | null {
    // 新しい標準的な等級表を使用
    return this.findGradeByAmountFromStandardTable(amount);
  }

  private getStandardSalaryByGrade(insuranceType: 'health' | 'pension', grade: number): string {
    if (insuranceType === 'health') {
      const healthInsuranceTable = [
        { grade: 1, standardSalary: '58000' },
        { grade: 2, standardSalary: '68000' },
        { grade: 3, standardSalary: '78000' },
        { grade: 4, standardSalary: '88000' },
        { grade: 5, standardSalary: '98000' },
        { grade: 6, standardSalary: '104000' },
        { grade: 7, standardSalary: '110000' },
        { grade: 8, standardSalary: '118000' },
        { grade: 9, standardSalary: '126000' },
        { grade: 10, standardSalary: '134000' },
        { grade: 11, standardSalary: '142000' },
        { grade: 12, standardSalary: '150000' },
        { grade: 13, standardSalary: '160000' },
        { grade: 14, standardSalary: '170000' },
        { grade: 15, standardSalary: '180000' },
        { grade: 16, standardSalary: '190000' },
        { grade: 17, standardSalary: '200000' },
        { grade: 18, standardSalary: '220000' },
        { grade: 19, standardSalary: '240000' },
        { grade: 20, standardSalary: '260000' },
        { grade: 21, standardSalary: '280000' },
        { grade: 22, standardSalary: '300000' },
        { grade: 23, standardSalary: '320000' },
        { grade: 24, standardSalary: '340000' },
        { grade: 25, standardSalary: '360000' },
        { grade: 26, standardSalary: '380000' },
        { grade: 27, standardSalary: '410000' },
        { grade: 28, standardSalary: '440000' },
        { grade: 29, standardSalary: '470000' },
        { grade: 30, standardSalary: '500000' },
        { grade: 31, standardSalary: '530000' },
        { grade: 32, standardSalary: '560000' },
        { grade: 33, standardSalary: '590000' },
        { grade: 34, standardSalary: '620000' },
        { grade: 35, standardSalary: '650000' },
        { grade: 36, standardSalary: '680000' },
        { grade: 37, standardSalary: '710000' },
        { grade: 38, standardSalary: '750000' },
        { grade: 39, standardSalary: '790000' },
        { grade: 40, standardSalary: '830000' },
        { grade: 41, standardSalary: '880000' },
        { grade: 42, standardSalary: '930000' },
        { grade: 43, standardSalary: '980000' },
        { grade: 44, standardSalary: '1030000' },
        { grade: 45, standardSalary: '1090000' },
        { grade: 46, standardSalary: '1150000' },
        { grade: 47, standardSalary: '1210000' },
        { grade: 48, standardSalary: '1270000' },
        { grade: 49, standardSalary: '1330000' },
        { grade: 50, standardSalary: '1390000' },
      ];
      const found = healthInsuranceTable.find((item) => item.grade === grade);
      return found ? found.standardSalary : '0';
    } else {
      const pensionInsuranceTable = [
        { grade: 1, standardSalary: '88000' },
        { grade: 2, standardSalary: '98000' },
        { grade: 3, standardSalary: '104000' },
        { grade: 4, standardSalary: '110000' },
        { grade: 5, standardSalary: '118000' },
        { grade: 6, standardSalary: '126000' },
        { grade: 7, standardSalary: '134000' },
        { grade: 8, standardSalary: '142000' },
        { grade: 9, standardSalary: '150000' },
        { grade: 10, standardSalary: '160000' },
        { grade: 11, standardSalary: '170000' },
        { grade: 12, standardSalary: '180000' },
        { grade: 13, standardSalary: '190000' },
        { grade: 14, standardSalary: '200000' },
        { grade: 15, standardSalary: '220000' },
        { grade: 16, standardSalary: '240000' },
        { grade: 17, standardSalary: '260000' },
        { grade: 18, standardSalary: '280000' },
        { grade: 19, standardSalary: '300000' },
        { grade: 20, standardSalary: '320000' },
        { grade: 21, standardSalary: '340000' },
        { grade: 22, standardSalary: '360000' },
        { grade: 23, standardSalary: '380000' },
        { grade: 24, standardSalary: '410000' },
        { grade: 25, standardSalary: '440000' },
        { grade: 26, standardSalary: '470000' },
        { grade: 27, standardSalary: '500000' },
        { grade: 28, standardSalary: '530000' },
        { grade: 29, standardSalary: '560000' },
        { grade: 30, standardSalary: '590000' },
        { grade: 31, standardSalary: '620000' },
        { grade: 32, standardSalary: '650000' },
      ];
      const found = pensionInsuranceTable.find((item) => item.grade === grade);
      return found ? found.standardSalary : '0';
    }
  }

  private async loadExistingGradeData(): Promise<void> {
    if (!this.employeeId) return;
    try {
      // 便宜上、IDを固定
      const docId = `${this.employeeId}_manual`;
      const docRef = doc(this.firestore, 'employee_grades', docId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as FirestoreRawData;

        const judgmentResult: GradeJudgmentResult = {
          healthInsuranceGrade: BigInt(data.judgmentResult.healthInsuranceGrade),
          healthInsuranceStandardSalary: data.judgmentResult.healthInsuranceStandardSalary,
          pensionInsuranceGrade: BigInt(data.judgmentResult.pensionInsuranceGrade),
          pensionInsuranceStandardSalary: data.judgmentResult.pensionInsuranceStandardSalary,
          careInsuranceGrade: data.judgmentResult.careInsuranceGrade
            ? BigInt(data.judgmentResult.careInsuranceGrade)
            : undefined,
          careInsuranceStandardSalary: data.judgmentResult.careInsuranceStandardSalary,
        };

        this.savedGradeData = {
          id: docSnap.id,
          employeeId: data.employeeId,
          monthlyAmount: data.monthlyAmount,
          applicableYear: BigInt(data.applicableYear),
          applicableMonth: BigInt(data.applicableMonth),
          endYear: data.endYear ? BigInt(data.endYear) : undefined,
          endMonth: data.endMonth ? BigInt(data.endMonth) : undefined,
          judgmentResult: judgmentResult,
          createdAt: data.createdAt.toDate(),
          updatedAt: data.updatedAt.toDate(),
          judgmentType: 'manual',
        };

        // 既存のデータをフォームにロード
        this.monthlyAmount = this.savedGradeData.monthlyAmount;
        this.applicableYear = this.savedGradeData.applicableYear;
        this.applicableMonth = this.savedGradeData.applicableMonth;
        this.endYear = this.savedGradeData.endYear ?? null;
        this.endMonth = this.savedGradeData.endMonth ?? null;
        this.judgmentResult = this.savedGradeData.judgmentResult;
      }
    } catch (error) {
      console.error('既存の手入力データ読み込みエラー:', error);
      this.errorMessage = '既存の手入力データの読み込みに失敗しました。';
    }
  }

  private async loadExistingManualGradeData(recordId: string): Promise<void> {
    if (!this.employeeId || !this.companyId) return;
    this.isLoading = true;
    try {
      const judgmentsRef = collection(this.firestore, 'gradeJudgments');
      const q = query(
        judgmentsRef,
        where('companyId', '==', this.companyId),
        where('employeeId', '==', this.employeeId)
      );
      const querySnapshot = await getDocs(q);
      const docSnap = querySnapshot.docs.find((d) => d.id === recordId);

      if (docSnap && docSnap.exists()) {
        const data = docSnap.data();

        if (data['inputData']) {
          this.monthlyAmount = data['inputData'].monthlyAmount || null;
        } else {
          // inputDataがない場合は、standardMonthlyAmountを使用
          this.monthlyAmount = data['standardMonthlyAmount'] || null;
        }

        // 適用期間を読み込み
        const effectiveDate = (data['effectiveDate'] as Timestamp).toDate();
        this.applicableYear = BigInt(effectiveDate.getFullYear());
        this.applicableMonth = BigInt(effectiveDate.getMonth() + 1);

        // 終了日がある場合は読み込み
        if (data['endDate']) {
          const endDate = (data['endDate'] as Timestamp).toDate();
          this.endYear = BigInt(endDate.getFullYear());
          this.endMonth = BigInt(endDate.getMonth() + 1);
        }

        // 等級情報を読み込み（標準報酬月額は等級から再計算）
        const healthGrade =
          typeof data['healthInsuranceGrade'] === 'string'
            ? BigInt(data['healthInsuranceGrade'])
            : BigInt(data['healthInsuranceGrade']);
        const pensionGrade =
          typeof data['pensionInsuranceGrade'] === 'string'
            ? BigInt(data['pensionInsuranceGrade'])
            : BigInt(data['pensionInsuranceGrade']);
        const careGrade = data['careInsuranceGrade']
          ? typeof data['careInsuranceGrade'] === 'string'
            ? BigInt(data['careInsuranceGrade'])
            : BigInt(data['careInsuranceGrade'])
          : undefined;

        this.judgmentResult = {
          healthInsuranceGrade: healthGrade,
          healthInsuranceStandardSalary: this.getStandardSalaryByGrade(
            'health',
            Number(healthGrade)
          ),
          pensionInsuranceGrade: pensionGrade,
          pensionInsuranceStandardSalary: this.getStandardSalaryByGrade(
            'pension',
            Number(pensionGrade)
          ),
          careInsuranceGrade: careGrade,
          careInsuranceStandardSalary: careGrade
            ? this.getStandardSalaryByGrade('health', Number(careGrade))
            : undefined,
        };

        console.log('読み込んだ手入力データ:', {
          monthlyAmount: this.monthlyAmount,
          applicableYear: this.applicableYear,
          applicableMonth: this.applicableMonth,
          endYear: this.endYear,
          endMonth: this.endMonth,
          judgmentResult: this.judgmentResult,
        });
      } else {
        this.errorMessage = '指定された手入力データが見つかりません。';
      }
    } catch (error) {
      console.error('既存手入力データ読み込みエラー:', error);
      this.errorMessage = 'データの読み込み中にエラーが発生しました。';
    } finally {
      this.isLoading = false;
    }
  }

  async saveGradeData(): Promise<void> {
    if (!this.employeeId || !this.judgmentResult || !this.isFormValid()) {
      this.errorMessage = '保存に必要な情報が不足しています。';
      return;
    }
    this.isSaving = true;
    this.errorMessage = '';

    const docId = this.savedGradeData?.id || `${this.employeeId}_manual`;

    const gradeData: SavedGradeData = {
      id: docId,
      employeeId: this.employeeId,
      monthlyAmount: this.monthlyAmount!,
      applicableYear: this.applicableYear!,
      applicableMonth: this.applicableMonth!,
      judgmentResult: this.judgmentResult,
      createdAt: this.savedGradeData?.createdAt || new Date(),
      updatedAt: new Date(),
      judgmentType: 'manual',
    };

    if (this.endYear && this.endMonth) {
      gradeData.endYear = this.endYear;
      gradeData.endMonth = this.endMonth;
    }

    try {
      const docRef = doc(this.firestore, 'employee_grades', docId);
      const dataForFirestore = this.deepConvertBigIntToString(gradeData);
      await setDoc(docRef, dataForFirestore);

      await this.saveToGradeJudgmentHistory();

      // 保存成功後、コンポーネントの状態を更新
      this.savedGradeData = gradeData;
      alert('手入力データが保存されました');
      this.router.navigate(['/grade-judgment', this.employeeId]);
    } catch (error) {
      console.error('保存エラー:', error);
      this.errorMessage = '保存に失敗しました: ' + (error as Error).message;
    } finally {
      this.isSaving = false;
    }
  }

  private isFirestoreTimestamp(value: unknown): value is Timestamp {
    return (
      value !== null &&
      typeof value === 'object' &&
      'toDate' in (value as object) &&
      typeof (value as Record<string, unknown>)['toDate'] === 'function'
    );
  }

  getFormattedDate(timestamp: Date | Timestamp): string {
    if (!timestamp) return '';

    if (this.isFirestoreTimestamp(timestamp)) {
      return timestamp.toDate().toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

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

    // employeeInfoとuidの存在をチェック
    if (!this.employeeInfo?.uid) {
      this.errorMessage = '従業員のユニークIDが取得できませんでした。';
      return;
    }

    try {
      const effectiveDate = new Date(
        Number(this.applicableYear!),
        Number(this.applicableMonth!) - 1,
        1
      );

      const historyRecord: Record<string, unknown> = {
        uid: this.employeeInfo.uid,
        companyId: this.companyId,
        employeeId: this.employeeId,
        judgmentType: 'manual' as const,
        judgmentDate: new Date(),
        effectiveDate: effectiveDate,
        healthInsuranceGrade: this.judgmentResult.healthInsuranceGrade ?? null,
        pensionInsuranceGrade: this.judgmentResult.pensionInsuranceGrade ?? null,
        standardMonthlyAmount: this.monthlyAmount,
        reason: '手入力による等級決定',
        judgmentReason: this.judgmentReason || null,
        inputData: {
          monthlyAmount: this.monthlyAmount,
        },
        updatedAt: new Date(),
      };

      // 終了日がある場合は設定
      if (this.endYear && this.endMonth) {
        historyRecord['endDate'] = new Date(Number(this.endYear), Number(this.endMonth) - 1, 1);
      }

      // 介護保険等級がある場合は設定
      if (this.judgmentResult.careInsuranceGrade !== undefined) {
        historyRecord['careInsuranceGrade'] = this.judgmentResult.careInsuranceGrade;
      } else {
        historyRecord['careInsuranceGrade'] = null;
      }

      const historyCollectionRef = collection(this.firestore, 'gradeJudgments');

      if (this.isEditMode && this.recordId) {
        const existingDocRef = doc(historyCollectionRef, this.recordId);
        const docSnap = await getDoc(existingDocRef);
        if (!docSnap.exists() || docSnap.data()['companyId'] !== this.companyId) {
          throw new Error('更新権限のない、または存在しないドキュメントです。');
        }
        historyRecord['updatedAt'] = new Date();
        const convertedRecord = this.deepConvertBigIntToString(historyRecord);
        await setDoc(existingDocRef, convertedRecord, { merge: true });
      } else {
        historyRecord['createdAt'] = new Date();
        historyRecord['updatedAt'] = new Date();
        const newDocRef = doc(historyCollectionRef);
        const convertedRecord = this.deepConvertBigIntToString(historyRecord);
        await setDoc(newDocRef, convertedRecord);
        this.recordId = newDocRef.id;
        this.isEditMode = true;
      }
    } catch (error) {
      console.error('等級履歴への保存エラー:', error);
      this.errorMessage = '等級履歴への保存に失敗しました。';
    }
  }

  async deleteGradeData(): Promise<void> {
    if (this.isEditMode && this.recordId) {
      // 編集モードの場合は履歴から削除
      if (!confirm('この手入力履歴を削除しますか？この操作は元に戻せません。')) {
        return;
      }

      this.isSaving = true;
      this.errorMessage = '';

      try {
        console.log('削除開始:', { employeeId: this.employeeId, recordId: this.recordId });

        // 1. 履歴コレクションから削除（メイン画面と同じロジック）
        const historyDocRef = doc(this.firestore, `gradeJudgments`, this.recordId);
        const docSnap = await getDoc(historyDocRef);
        if (!docSnap.exists() || docSnap.data()['companyId'] !== this.companyId) {
          throw new Error('削除権限のない、または存在しないドキュメントです。');
        }
        console.log('履歴削除:', historyDocRef.path);
        await deleteDoc(historyDocRef);

        // 2. employee_gradesコレクションからも削除
        const gradeDocId = `${this.employeeId}_manual`;
        const gradeDocRef = doc(this.firestore, 'employee_grades', gradeDocId);
        console.log('employee_grades削除:', gradeDocRef.path);

        try {
          const gradeDocSnap = await getDoc(gradeDocRef);
          if (gradeDocSnap.exists()) {
            await deleteDoc(gradeDocRef);
            console.log('employee_gradesからも削除しました');
          } else {
            console.log('employee_gradesにドキュメントが存在しませんでした');
          }
        } catch (gradeDeleteError) {
          console.warn('employee_gradesからの削除でエラー:', gradeDeleteError);
          // 履歴削除は成功しているので、続行
        }

        console.log('削除処理完了');
        alert('手入力データを削除しました');
        this.router.navigate(['/grade-judgment', this.employeeId]);
      } catch (error) {
        console.error('削除エラー:', error);
        this.errorMessage = `削除に失敗しました: ${error}`;
        alert(this.errorMessage);
      } finally {
        this.isSaving = false;
      }
    } else {
      // 通常モードの場合
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

  /**
   * オブジェクト内のBigIntをすべて文字列に再帰的に変換します。
   * FirestoreはBigIntをサポートしていないため、保存前にこの関数を使用します。
   * @param obj 変換するオブジェクト
   * @returns BigIntが文字列に変換された新しいオブジェクト
   */
  private deepConvertBigIntToString(obj: unknown): Record<string, unknown> {
    if (obj === null || typeof obj !== 'object') {
      return obj as Record<string, unknown>;
    }

    if (obj instanceof Date) {
      return obj as unknown as Record<string, unknown>;
    }

    const newObj: Record<string, unknown> = {};
    for (const key in obj as Record<string, unknown>) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = (obj as Record<string, unknown>)[key];
        if (typeof value === 'bigint') {
          newObj[key] = value.toString();
        } else if (typeof value === 'object') {
          newObj[key] = this.deepConvertBigIntToString(value);
        } else {
          newObj[key] = value;
        }
      }
    }
    return newObj;
  }
}
