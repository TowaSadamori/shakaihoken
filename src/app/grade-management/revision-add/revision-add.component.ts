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
  setDoc,
  deleteDoc,
} from 'firebase/firestore';
import { AuthService } from '../../services/auth.service';
import { OfficeService } from '../../services/office.service';
import { SocialInsuranceCalculator } from '../../utils/decimal-calculator';

interface EmployeeInfo {
  name: string;
  employeeNumber: string;
  birthDate: string;
  age: bigint;
  companyId: string;
  branchNumber: string;
  addressPrefecture: string;
  employeeType?: string;
}

interface RevisionData {
  revisionReason: string;
  beforeAmount: string | null;
  afterAmount: string | null;
  revisionDate: string;
  continuousMonths: bigint;
  isSignificantChange: boolean;
  isFixedSalaryChange: boolean;
}

interface GradeJudgmentResult {
  beforeGrades: {
    healthInsuranceGrade: bigint;
    healthInsuranceStandardSalary: string;
    pensionInsuranceGrade: bigint;
    pensionInsuranceStandardSalary: string;
    careInsuranceGrade?: bigint;
    careInsuranceStandardSalary?: string;
  };
  afterGrades: {
    healthInsuranceGrade: bigint;
    healthInsuranceStandardSalary: string;
    pensionInsuranceGrade: bigint;
    pensionInsuranceStandardSalary: string;
    careInsuranceGrade?: bigint;
    careInsuranceStandardSalary?: string;
  };
  gradeDifference: {
    healthInsurance: string;
    pensionInsurance: string;
    careInsurance?: string;
  };
}

interface RevisionSaveData {
  id?: string;
  employeeId: string;
  revisionData: RevisionData;
  judgmentResult: GradeJudgmentResult;
  applicableYear: bigint;
  applicableMonth: bigint;
  calculationSnapshot: CalculationSnapshot;
  createdAt: Date;
  updatedAt: Date;
  judgmentType: 'revision';
}

interface CalculationSnapshot {
  calculationType: 'revision';
  employeeCategory: string;
  revisionTrigger: {
    reason: string;
    revisionDate: string;
    continuousMonths: bigint;
  };
  beforeAfterComparison: {
    beforeAmount: string;
    afterAmount: string;
    beforeGrades: {
      healthInsuranceGrade: bigint;
      healthInsuranceStandardSalary: string;
      pensionInsuranceGrade: bigint;
      pensionInsuranceStandardSalary: string;
      careInsuranceGrade?: bigint;
      careInsuranceStandardSalary?: string;
    };
    afterGrades: {
      healthInsuranceGrade: bigint;
      healthInsuranceStandardSalary: string;
      pensionInsuranceGrade: bigint;
      pensionInsuranceStandardSalary: string;
      careInsuranceGrade?: bigint;
      careInsuranceStandardSalary?: string;
    };
    gradeDifference: {
      healthInsurance: string;
      pensionInsurance: string;
      careInsurance?: string;
    };
  };
  validationResults: {
    isSignificantChange: boolean;
    hasFixedWageChange: boolean;
    passesContradictionRule: boolean;
  };
  appliedRules: string[];
  timestamp: Date;
}

@Component({
  selector: 'app-revision-add',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './revision-add.component.html',
  styleUrl: './revision-add.component.scss',
})
export class RevisionAddComponent implements OnInit {
  employeeInfo: EmployeeInfo | null = null;
  isLoading = false;
  errorMessage = '';

  revisionData: RevisionData = {
    revisionReason: '',
    beforeAmount: null,
    afterAmount: null,
    revisionDate: '',
    continuousMonths: BigInt(3),
    isSignificantChange: false,
    isFixedSalaryChange: false,
  };

  judgmentResult: GradeJudgmentResult | null = null;
  applicableYear: bigint | null = null;
  applicableMonth: bigint | null = null;

  revisionReasons = [
    { value: 'salary_increase', label: '昇給' },
    { value: 'salary_decrease', label: '降給' },
    { value: 'allowance_change', label: '諸手当の変更' },
    { value: 'job_change', label: '職務内容の変更' },
    { value: 'position_change', label: '役職の変更' },
    { value: 'other', label: 'その他' },
  ];

  private employeeId: string | null = null;
  private firestore = getFirestore();

  savedRevisionData: RevisionSaveData | null = null;
  isSaving = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private officeService: OfficeService
  ) {}

  async ngOnInit(): Promise<void> {
    this.employeeId = this.route.snapshot.paramMap.get('employeeId');
    if (this.employeeId) {
      await this.loadEmployeeInfo();
      await this.loadExistingRevisionData();
    }
    this.initializeDefaultDates();
  }

  private initializeDefaultDates(): void {
    const today = new Date();
    this.revisionData.revisionDate = today.toISOString().split('T')[0];
    this.updateApplicablePeriod();
  }

  updateApplicablePeriod(): void {
    if (this.revisionData.revisionDate) {
      // タイムゾーンの問題を避けるため、UTCとして日付を解析
      const parts = this.revisionData.revisionDate.split('-').map((p) => parseInt(p, 10));
      const revisionDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));

      // 4ヶ月後の1日を計算
      revisionDate.setUTCMonth(revisionDate.getUTCMonth() + 4);
      revisionDate.setUTCDate(1);

      this.applicableYear = BigInt(revisionDate.getUTCFullYear());
      this.applicableMonth = BigInt(revisionDate.getUTCMonth() + 1);
    }
  }

  private async loadEmployeeInfo(): Promise<void> {
    if (!this.employeeId) return;

    this.isLoading = true;
    try {
      console.log('従業員情報を読み込み中 (employeeNumber):', this.employeeId);

      // employeeNumberで検索（等級判定画面と同じ方法）
      const usersRef = collection(this.firestore, 'users');
      const q = query(usersRef, where('employeeNumber', '==', this.employeeId));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data();
        console.log('Firestoreから取得した従業員データ:', userData);

        const birthDate = new Date(userData['birthDate']);
        const age = this.calculateAge(birthDate);

        // 生年月日を日付のみの形式（YYYY-MM-DD）に変換
        const formattedBirthDate = birthDate.toISOString().split('T')[0];

        // 事業所情報から addressPrefecture を取得
        let addressPrefecture = userData['addressPrefecture'] || '';

        // ユーザーデータに addressPrefecture がない場合、事業所データから取得
        if (!addressPrefecture && userData['companyId'] && userData['branchNumber']) {
          try {
            console.log('=== 事業所データ取得開始 ===');
            console.log('対象companyId:', userData['companyId']);
            console.log('対象branchNumber:', userData['branchNumber']);

            addressPrefecture = await this.officeService.findOfficeAddressPrefecture(
              userData['companyId'],
              userData['branchNumber']
            );

            if (addressPrefecture) {
              console.log('✅ 事業所所在地取得成功:', addressPrefecture);
            } else {
              console.warn('⚠️ 事業所所在地が見つかりませんでした');
            }
          } catch (officeError) {
            console.error('❌ 事業所データ取得エラー:', officeError);
          }
        }

        this.employeeInfo = {
          name: `${userData['lastName'] || ''} ${userData['firstName'] || ''}`.trim(),
          employeeNumber: userData['employeeNumber'] || '',
          birthDate: formattedBirthDate,
          age: age,
          companyId: userData['companyId'] || '',
          branchNumber: userData['branchNumber'] || '',
          addressPrefecture: addressPrefecture,
          employeeType: userData['employeeType'] || '',
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
    let age = BigInt(today.getFullYear()) - BigInt(birthDate.getFullYear());
    const monthDiff = BigInt(today.getMonth()) - BigInt(birthDate.getMonth());
    if (
      monthDiff < BigInt(0) ||
      (monthDiff === BigInt(0) && BigInt(today.getDate()) < BigInt(birthDate.getDate()))
    ) {
      age = age - BigInt(1);
    }
    return age;
  }

  goBack(): void {
    this.router.navigate(['/grade-judgment', this.employeeId]);
  }

  isFormValid(): boolean {
    return !!(
      this.revisionData.revisionReason &&
      this.revisionData.beforeAmount &&
      this.revisionData.afterAmount &&
      this.revisionData.revisionDate
    );
  }

  onAmountChange(): void {
    if (this.revisionData.beforeAmount && this.revisionData.afterAmount) {
      this.checkSignificantChange();
      // 報酬月額が入力されたら自動的に等級判定を実行
      this.calculateGrade();
    }
  }

  private checkSignificantChange(): void {
    if (!this.revisionData.beforeAmount || !this.revisionData.afterAmount) {
      this.revisionData.isSignificantChange = false;
      return;
    }

    const beforeGrade = this.findGradeFromHealthInsuranceTable(this.revisionData.beforeAmount);
    const afterGrade = this.findGradeFromHealthInsuranceTable(this.revisionData.afterAmount);

    // Decimal.jsを使用した正確な等級差計算
    const gradeDifference = SocialInsuranceCalculator.abs(
      SocialInsuranceCalculator.calculateGradeDifference(
        beforeGrade.grade.toString(),
        afterGrade.grade.toString()
      )
    );
    this.revisionData.isSignificantChange =
      SocialInsuranceCalculator.compare(gradeDifference, '2') >= 0;
  }

  async calculateGrade(): Promise<void> {
    if (!this.isFormValid()) {
      this.errorMessage = '入力内容に不備があります。';
      return;
    }
    this.errorMessage = '';

    const beforeAmountStr = String(this.revisionData.beforeAmount!);
    const afterAmountStr = String(this.revisionData.afterAmount!);

    const beforeGrades = this.calculateGradesFromAmount(beforeAmountStr);
    const afterGrades = this.calculateGradesFromAmount(afterAmountStr);

    const healthDiff = afterGrades.healthInsuranceGrade - beforeGrades.healthInsuranceGrade;
    const pensionDiff = afterGrades.pensionInsuranceGrade - beforeGrades.pensionInsuranceGrade;

    this.judgmentResult = {
      beforeGrades: beforeGrades,
      afterGrades: afterGrades,
      gradeDifference: {
        healthInsurance: String(healthDiff),
        pensionInsurance: String(pensionDiff),
      },
    };

    // 計算に成功したら、そのまま保存処理を呼び出す
    // await this.saveRevisionData();
  }

  async judgeAndSave(): Promise<void> {
    await this.calculateGrade();
    if (this.judgmentResult) {
      await this.saveRevisionData();
    }
  }

  private calculateGradesFromAmount(amount: string) {
    const healthGrade = this.findGradeFromHealthInsuranceTable(amount);
    const pensionGrade = this.findGradeFromPensionInsuranceTable(amount);

    const grades = {
      healthInsuranceGrade: healthGrade.grade,
      healthInsuranceStandardSalary: healthGrade.standardSalary,
      pensionInsuranceGrade: pensionGrade.grade,
      pensionInsuranceStandardSalary: pensionGrade.standardSalary,
    };

    if (this.employeeInfo && this.employeeInfo.age >= BigInt(40)) {
      return {
        ...grades,
        careInsuranceGrade: healthGrade.grade,
        careInsuranceStandardSalary: healthGrade.standardSalary,
      };
    }

    return grades;
  }

  private findGradeFromHealthInsuranceTable(amount: string): {
    grade: bigint;
    standardSalary: string;
  } {
    const healthInsuranceTable = [
      { grade: BigInt(1), standardSalary: '58000', min: '0', max: '63000' },
      { grade: BigInt(2), standardSalary: '68000', min: '63000', max: '73000' },
      { grade: BigInt(3), standardSalary: '78000', min: '73000', max: '83000' },
      { grade: BigInt(4), standardSalary: '88000', min: '83000', max: '93000' },
      { grade: BigInt(5), standardSalary: '98000', min: '93000', max: '101000' },
      { grade: BigInt(6), standardSalary: '104000', min: '101000', max: '107000' },
      { grade: BigInt(7), standardSalary: '110000', min: '107000', max: '114000' },
      { grade: BigInt(8), standardSalary: '118000', min: '114000', max: '122000' },
      { grade: BigInt(9), standardSalary: '126000', min: '122000', max: '130000' },
      { grade: BigInt(10), standardSalary: '134000', min: '130000', max: '138000' },
      { grade: BigInt(11), standardSalary: '142000', min: '138000', max: '146000' },
      { grade: BigInt(12), standardSalary: '150000', min: '146000', max: '155000' },
      { grade: BigInt(13), standardSalary: '160000', min: '155000', max: '165000' },
      { grade: BigInt(14), standardSalary: '170000', min: '165000', max: '175000' },
      { grade: BigInt(15), standardSalary: '180000', min: '175000', max: '185000' },
      { grade: BigInt(16), standardSalary: '190000', min: '185000', max: '195000' },
      { grade: BigInt(17), standardSalary: '200000', min: '195000', max: '210000' },
      { grade: BigInt(18), standardSalary: '220000', min: '210000', max: '230000' },
      { grade: BigInt(19), standardSalary: '240000', min: '230000', max: '250000' },
      { grade: BigInt(20), standardSalary: '260000', min: '250000', max: '270000' },
      { grade: BigInt(21), standardSalary: '280000', min: '270000', max: '290000' },
      { grade: BigInt(22), standardSalary: '300000', min: '290000', max: '310000' },
      { grade: BigInt(23), standardSalary: '320000', min: '310000', max: '330000' },
      { grade: BigInt(24), standardSalary: '340000', min: '330000', max: '350000' },
      { grade: BigInt(25), standardSalary: '360000', min: '350000', max: '370000' },
      { grade: BigInt(26), standardSalary: '380000', min: '370000', max: '395000' },
      { grade: BigInt(27), standardSalary: '410000', min: '395000', max: '425000' },
      { grade: BigInt(28), standardSalary: '440000', min: '425000', max: '455000' },
      { grade: BigInt(29), standardSalary: '470000', min: '455000', max: '485000' },
      { grade: BigInt(30), standardSalary: '500000', min: '485000', max: '515000' },
      { grade: BigInt(31), standardSalary: '530000', min: '515000', max: '545000' },
      { grade: BigInt(32), standardSalary: '560000', min: '545000', max: '575000' },
      { grade: BigInt(33), standardSalary: '590000', min: '575000', max: '605000' },
      { grade: BigInt(34), standardSalary: '620000', min: '605000', max: '635000' },
      { grade: BigInt(35), standardSalary: '650000', min: '635000', max: '665000' },
      { grade: BigInt(36), standardSalary: '680000', min: '665000', max: '695000' },
      { grade: BigInt(37), standardSalary: '710000', min: '695000', max: '730000' },
      { grade: BigInt(38), standardSalary: '750000', min: '730000', max: '770000' },
      { grade: BigInt(39), standardSalary: '790000', min: '770000', max: '810000' },
      { grade: BigInt(40), standardSalary: '830000', min: '810000', max: '855000' },
      { grade: BigInt(41), standardSalary: '880000', min: '855000', max: '905000' },
      { grade: BigInt(42), standardSalary: '930000', min: '905000', max: '955000' },
      { grade: BigInt(43), standardSalary: '980000', min: '955000', max: '1005000' },
      { grade: BigInt(44), standardSalary: '1030000', min: '1005000', max: '1055000' },
      { grade: BigInt(45), standardSalary: '1090000', min: '1055000', max: '1115000' },
      { grade: BigInt(46), standardSalary: '1150000', min: '1115000', max: '1175000' },
      { grade: BigInt(47), standardSalary: '1210000', min: '1175000', max: '1235000' },
      { grade: BigInt(48), standardSalary: '1270000', min: '1235000', max: '1295000' },
      { grade: BigInt(49), standardSalary: '1330000', min: '1295000', max: '1355000' },
      { grade: BigInt(50), standardSalary: '1390000', min: '1355000', max: '99999999999' },
    ];

    // Decimal.jsを使用した正確な範囲判定
    const targetGrade = healthInsuranceTable.find(
      (grade) =>
        SocialInsuranceCalculator.compare(amount, grade.min) >= 0 &&
        SocialInsuranceCalculator.compare(amount, grade.max) < 0
    );
    return targetGrade || healthInsuranceTable[healthInsuranceTable.length - 1];
  }

  private findGradeFromPensionInsuranceTable(amount: string): {
    grade: bigint;
    standardSalary: string;
  } {
    const pensionInsuranceTable = [
      { grade: BigInt(1), standardSalary: '88000', min: '0', max: '93000' },
      { grade: BigInt(2), standardSalary: '98000', min: '93000', max: '101000' },
      { grade: BigInt(3), standardSalary: '104000', min: '101000', max: '107000' },
      { grade: BigInt(4), standardSalary: '110000', min: '107000', max: '114000' },
      { grade: BigInt(5), standardSalary: '118000', min: '114000', max: '122000' },
      { grade: BigInt(6), standardSalary: '126000', min: '122000', max: '130000' },
      { grade: BigInt(7), standardSalary: '134000', min: '130000', max: '138000' },
      { grade: BigInt(8), standardSalary: '142000', min: '138000', max: '146000' },
      { grade: BigInt(9), standardSalary: '150000', min: '146000', max: '155000' },
      { grade: BigInt(10), standardSalary: '160000', min: '155000', max: '165000' },
      { grade: BigInt(11), standardSalary: '170000', min: '165000', max: '175000' },
      { grade: BigInt(12), standardSalary: '180000', min: '175000', max: '185000' },
      { grade: BigInt(13), standardSalary: '190000', min: '185000', max: '195000' },
      { grade: BigInt(14), standardSalary: '200000', min: '195000', max: '210000' },
      { grade: BigInt(15), standardSalary: '220000', min: '210000', max: '230000' },
      { grade: BigInt(16), standardSalary: '240000', min: '230000', max: '250000' },
      { grade: BigInt(17), standardSalary: '260000', min: '250000', max: '270000' },
      { grade: BigInt(18), standardSalary: '280000', min: '270000', max: '290000' },
      { grade: BigInt(19), standardSalary: '300000', min: '290000', max: '310000' },
      { grade: BigInt(20), standardSalary: '320000', min: '310000', max: '330000' },
      { grade: BigInt(21), standardSalary: '340000', min: '330000', max: '350000' },
      { grade: BigInt(22), standardSalary: '360000', min: '350000', max: '370000' },
      { grade: BigInt(23), standardSalary: '380000', min: '370000', max: '395000' },
      { grade: BigInt(24), standardSalary: '410000', min: '395000', max: '425000' },
      { grade: BigInt(25), standardSalary: '440000', min: '425000', max: '455000' },
      { grade: BigInt(26), standardSalary: '470000', min: '455000', max: '485000' },
      { grade: BigInt(27), standardSalary: '500000', min: '485000', max: '515000' },
      { grade: BigInt(28), standardSalary: '530000', min: '515000', max: '545000' },
      { grade: BigInt(29), standardSalary: '560000', min: '545000', max: '575000' },
      { grade: BigInt(30), standardSalary: '590000', min: '575000', max: '605000' },
      { grade: BigInt(31), standardSalary: '620000', min: '605000', max: '635000' },
      { grade: BigInt(32), standardSalary: '650000', min: '635000', max: '99999999999' },
    ];

    // Decimal.jsを使用した正確な範囲判定
    const targetGrade = pensionInsuranceTable.find(
      (grade) =>
        SocialInsuranceCalculator.compare(amount, grade.min) >= 0 &&
        SocialInsuranceCalculator.compare(amount, grade.max) < 0
    );
    return targetGrade || pensionInsuranceTable[pensionInsuranceTable.length - 1];
  }

  getRevisionReasonLabel(reason: string): string {
    const reasonOption = this.revisionReasons.find((r) => r.value === reason);
    return reasonOption ? reasonOption.label : reason;
  }

  getGradeDifferenceText(difference: string): string {
    if (!difference) return '変更なし';
    const diffStr = String(difference);
    const absDiff = SocialInsuranceCalculator.abs(diffStr);
    if (SocialInsuranceCalculator.compare(diffStr, '0') > 0) {
      return `${absDiff}等級UP`;
    }
    if (SocialInsuranceCalculator.compare(diffStr, '0') < 0) {
      return `${absDiff}等級DOWN`;
    }
    return `変更なし`;
  }

  getGradeDifferenceClass(difference: string): string {
    if (!difference) return 'no-change';
    const diffStr = String(difference);
    if (SocialInsuranceCalculator.compare(diffStr, '0') > 0) {
      return 'increase';
    }
    if (SocialInsuranceCalculator.compare(diffStr, '0') < 0) {
      return 'decrease';
    }
    return 'no-change';
  }

  private async loadExistingRevisionData(): Promise<void> {
    if (!this.employeeId) return;

    try {
      const docId = `${this.employeeId}_revision`;
      const docRef = doc(this.firestore, 'employee_grades', docId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as RevisionSaveData;
        this.savedRevisionData = { ...data, id: docSnap.id };

        // Load existing data into form
        this.revisionData = { ...data.revisionData };
        this.judgmentResult = data.judgmentResult;
        this.applicableYear = data.applicableYear;
        this.applicableMonth = data.applicableMonth;

        // 既存データの場合でも等級判定を再実行（最新の等級表で計算）
        if (this.revisionData.beforeAmount && this.revisionData.afterAmount) {
          this.calculateGrade();
        }
      }
    } catch (error) {
      console.error('既存随時改定データ読み込みエラー:', error);
    }
  }

  async saveRevisionData(): Promise<void> {
    if (!this.employeeId || !this.judgmentResult) {
      this.errorMessage = '保存に必要な情報が不足しています。';
      return;
    }
    this.isSaving = true;
    this.errorMessage = '';

    const calculationSnapshot = this.createCalculationSnapshot();

    const saveData: RevisionSaveData = {
      employeeId: this.employeeId,
      revisionData: this.revisionData,
      judgmentResult: this.judgmentResult,
      applicableYear: this.applicableYear!,
      applicableMonth: this.applicableMonth!,
      calculationSnapshot: calculationSnapshot,
      createdAt: this.savedRevisionData?.createdAt || new Date(),
      updatedAt: new Date(),
      judgmentType: 'revision',
    };

    try {
      const docId = this.savedRevisionData?.id || `${this.employeeId}_${new Date().getTime()}`;
      const docRef = doc(this.firestore, 'employee_revisions', docId);

      // BigIntをNumberに変換
      const convertedData = this.deepConvertBigInts(saveData);
      await setDoc(docRef, convertedData);

      this.savedRevisionData = { ...saveData, id: docId };

      await this.saveToGradeJudgmentHistory();

      alert('随時改定データが正常に保存されました。');
      this.router.navigate(['/grade-judgment', this.employeeId]);
    } catch (error) {
      console.error('保存エラー:', error);
      this.errorMessage = `データの保存中にエラーが発生しました: ${error}`;
    } finally {
      this.isSaving = false;
    }
  }

  private createCalculationSnapshot(): CalculationSnapshot {
    const appliedRules: string[] = [];

    // Track which rules were applied
    if (this.revisionData.isSignificantChange) {
      appliedRules.push('2等級以上差異確認');
    }
    if (this.revisionData.isFixedSalaryChange) {
      appliedRules.push('固定的賃金変動');
    }
    if (this.revisionData.continuousMonths >= BigInt(3)) {
      appliedRules.push('3ヶ月継続性確認');
    }

    // undefinedフィールドを除外したbeforeGrades
    const cleanedBeforeGrades = {
      healthInsuranceGrade: this.judgmentResult!.beforeGrades.healthInsuranceGrade,
      healthInsuranceStandardSalary:
        this.judgmentResult!.beforeGrades.healthInsuranceStandardSalary,
      pensionInsuranceGrade: this.judgmentResult!.beforeGrades.pensionInsuranceGrade,
      pensionInsuranceStandardSalary:
        this.judgmentResult!.beforeGrades.pensionInsuranceStandardSalary,
      ...(this.judgmentResult!.beforeGrades.careInsuranceGrade !== undefined && {
        careInsuranceGrade: this.judgmentResult!.beforeGrades.careInsuranceGrade,
        careInsuranceStandardSalary: this.judgmentResult!.beforeGrades.careInsuranceStandardSalary,
      }),
    };

    // undefinedフィールドを除外したafterGrades
    const cleanedAfterGrades = {
      healthInsuranceGrade: this.judgmentResult!.afterGrades.healthInsuranceGrade,
      healthInsuranceStandardSalary: this.judgmentResult!.afterGrades.healthInsuranceStandardSalary,
      pensionInsuranceGrade: this.judgmentResult!.afterGrades.pensionInsuranceGrade,
      pensionInsuranceStandardSalary:
        this.judgmentResult!.afterGrades.pensionInsuranceStandardSalary,
      ...(this.judgmentResult!.afterGrades.careInsuranceGrade !== undefined && {
        careInsuranceGrade: this.judgmentResult!.afterGrades.careInsuranceGrade,
        careInsuranceStandardSalary: this.judgmentResult!.afterGrades.careInsuranceStandardSalary,
      }),
    };

    // undefinedフィールドを除外したgradeDifference
    const cleanedGradeDifference = {
      healthInsurance: this.judgmentResult!.gradeDifference.healthInsurance,
      pensionInsurance: this.judgmentResult!.gradeDifference.pensionInsurance,
      ...(this.judgmentResult!.gradeDifference.careInsurance !== undefined && {
        careInsurance: this.judgmentResult!.gradeDifference.careInsurance,
      }),
    };

    return {
      calculationType: 'revision',
      employeeCategory: this.employeeInfo?.employeeType || 'general',
      revisionTrigger: {
        reason: this.revisionData.revisionReason,
        revisionDate: this.revisionData.revisionDate,
        continuousMonths: this.revisionData.continuousMonths,
      },
      beforeAfterComparison: {
        beforeAmount: this.revisionData.beforeAmount!,
        afterAmount: this.revisionData.afterAmount!,
        beforeGrades: cleanedBeforeGrades,
        afterGrades: cleanedAfterGrades,
        gradeDifference: cleanedGradeDifference,
      },
      validationResults: {
        isSignificantChange: this.revisionData.isSignificantChange,
        hasFixedWageChange: this.revisionData.isFixedSalaryChange,
        passesContradictionRule: this.validateContradictionRule(),
      },
      appliedRules: appliedRules,
      timestamp: new Date(),
    };
  }

  private validateContradictionRule(): boolean {
    if (!this.judgmentResult || !this.revisionData.beforeAmount || !this.revisionData.afterAmount) {
      return false;
    }

    const fixedWageIncreased = this.revisionData.afterAmount > this.revisionData.beforeAmount;
    const totalGradeIncreased =
      this.judgmentResult.afterGrades.healthInsuranceGrade >
      this.judgmentResult.beforeGrades.healthInsuranceGrade;

    // Check for contradiction (fixed wage direction vs total remuneration direction)
    const hasContradiction =
      (fixedWageIncreased && !totalGradeIncreased) || (!fixedWageIncreased && totalGradeIncreased);

    return !hasContradiction; // Returns true if passes the rule (no contradiction)
  }

  async deleteRevisionData(): Promise<void> {
    if (!this.savedRevisionData?.id) {
      this.clearForm();
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    try {
      const docRef = doc(this.firestore, 'employee_grades', this.savedRevisionData.id);
      await deleteDoc(docRef);

      this.clearForm();
      this.savedRevisionData = null;

      this.errorMessage = '随時改定データを削除しました';
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

  private async saveToGradeJudgmentHistory(): Promise<void> {
    if (!this.employeeId || !this.judgmentResult || !this.isFormValid()) {
      return;
    }

    try {
      const effectiveDate = new Date(
        Number(this.applicableYear!),
        Number(this.applicableMonth!) - 1,
        1
      );

      const gradeJudgmentRecord: Record<string, unknown> = {
        employeeId: this.employeeId,
        judgmentType: 'revision' as const,
        judgmentDate: new Date(),
        effectiveDate: effectiveDate,
        healthInsuranceGrade: this.judgmentResult.afterGrades.healthInsuranceGrade,
        pensionInsuranceGrade: this.judgmentResult.afterGrades.pensionInsuranceGrade,
        standardMonthlyAmount: this.revisionData.afterAmount,
        reason: `随時改定による等級変更（${this.getRevisionReasonLabel(this.revisionData.revisionReason)}）`,
        inputData: {
          revisionReason: this.revisionData.revisionReason,
          beforeAmount: this.revisionData.beforeAmount,
          afterAmount: this.revisionData.afterAmount,
          revisionDate: this.revisionData.revisionDate,
          gradeDifference: {
            healthInsurance: this.judgmentResult.gradeDifference.healthInsurance,
            pensionInsurance: this.judgmentResult.gradeDifference.pensionInsurance,
            ...(this.judgmentResult.gradeDifference.careInsurance !== undefined && {
              careInsurance: this.judgmentResult.gradeDifference.careInsurance,
            }),
          },
        },
        calculationSnapshot: this.createCalculationSnapshot(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 介護保険等級がある場合のみ追加
      if (this.judgmentResult.afterGrades.careInsuranceGrade !== undefined) {
        gradeJudgmentRecord['careInsuranceGrade'] =
          this.judgmentResult.afterGrades.careInsuranceGrade;
      }

      const historyCollectionRef = collection(
        this.firestore,
        'gradeJudgments',
        this.employeeId,
        'judgments'
      );
      const newDocRef = doc(historyCollectionRef);
      // BigIntをNumberに変換
      const convertedRecord = this.deepConvertBigInts(gradeJudgmentRecord);
      await setDoc(newDocRef, convertedRecord);
    } catch (error) {
      console.error('等級履歴への保存エラー:', error);
      throw new Error('等級履歴への保存に失敗しました。');
    }
  }

  private clearForm(): void {
    this.revisionData = {
      revisionReason: '',
      beforeAmount: null,
      afterAmount: null,
      revisionDate: '',
      continuousMonths: BigInt(3),
      isSignificantChange: false,
      isFixedSalaryChange: false,
    };
    this.judgmentResult = null;
    this.initializeDefaultDates();
  }

  isSaveValid(): boolean {
    return this.isFormValid() && this.judgmentResult !== null;
  }

  // テンプレート用のnullチェックを含むgetter
  get hasCareInsurance(): boolean {
    return !!(
      this.judgmentResult?.beforeGrades?.careInsuranceGrade !== undefined &&
      this.judgmentResult?.afterGrades?.careInsuranceGrade !== undefined
    );
  }

  get isNoCareInsurance(): boolean {
    return !!(this.judgmentResult && !this.judgmentResult.beforeGrades.careInsuranceGrade);
  }

  // テンプレート用のsafeアクセスメソッド（*ngIfでjudgmentResultの存在が保証されている場合に使用）
  get safeJudgmentResult() {
    return this.judgmentResult!;
  }

  /**
   * Type guard for Firestore timestamp
   */
  private hasToDateMethod(timestamp: unknown): timestamp is { toDate(): Date } {
    return (
      timestamp !== null &&
      typeof timestamp === 'object' &&
      'toDate' in timestamp &&
      typeof (timestamp as Record<string, unknown>)['toDate'] === 'function'
    );
  }

  /**
   * Firestoreタイムスタンプを日付に変換（テンプレート用）
   */
  formatTimestamp(timestamp: Date | { toDate(): Date } | unknown): string {
    if (!timestamp) return '';

    // Firestoreタイムスタンプの場合
    if (this.hasToDateMethod(timestamp)) {
      return timestamp.toDate().toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }

    // 通常のDateオブジェクトの場合
    if (timestamp instanceof Date) {
      return timestamp.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }

    return '';
  }

  private deepConvertBigInts(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepConvertBigInts(item));
    }

    const newObj: Record<string, unknown> = {};
    for (const key in obj as Record<string, unknown>) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = (obj as Record<string, unknown>)[key];
        if (typeof value === 'bigint') {
          newObj[key] = Number(value);
        } else if (typeof value === 'object') {
          newObj[key] = this.deepConvertBigInts(value);
        } else {
          newObj[key] = value;
        }
      }
    }
    return newObj;
  }
}
