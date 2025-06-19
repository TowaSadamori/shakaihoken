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
  age: number;
  companyId: string;
  branchNumber: string;
  addressPrefecture: string;
  employeeType?: string;
}

interface RevisionData {
  revisionReason: string;
  beforeAmount: number | null;
  afterAmount: number | null;
  revisionDate: string;
  continuousMonths: number;
  isSignificantChange: boolean;
  isFixedSalaryChange: boolean;
}

interface GradeJudgmentResult {
  beforeGrades: {
    healthInsuranceGrade: number;
    healthInsuranceStandardSalary: number;
    pensionInsuranceGrade: number;
    pensionInsuranceStandardSalary: number;
    careInsuranceGrade?: number;
    careInsuranceStandardSalary?: number;
  };
  afterGrades: {
    healthInsuranceGrade: number;
    healthInsuranceStandardSalary: number;
    pensionInsuranceGrade: number;
    pensionInsuranceStandardSalary: number;
    careInsuranceGrade?: number;
    careInsuranceStandardSalary?: number;
  };
  gradeDifference: {
    healthInsurance: number;
    pensionInsurance: number;
    careInsurance?: number;
  };
}

interface RevisionSaveData {
  id?: string;
  employeeId: string;
  revisionData: RevisionData;
  judgmentResult: GradeJudgmentResult;
  applicableYear: number;
  applicableMonth: number;
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
    continuousMonths: number;
  };
  beforeAfterComparison: {
    beforeAmount: number;
    afterAmount: number;
    beforeGrades: {
      healthInsuranceGrade: number;
      healthInsuranceStandardSalary: number;
      pensionInsuranceGrade: number;
      pensionInsuranceStandardSalary: number;
      careInsuranceGrade?: number;
      careInsuranceStandardSalary?: number;
    };
    afterGrades: {
      healthInsuranceGrade: number;
      healthInsuranceStandardSalary: number;
      pensionInsuranceGrade: number;
      pensionInsuranceStandardSalary: number;
      careInsuranceGrade?: number;
      careInsuranceStandardSalary?: number;
    };
    gradeDifference: {
      healthInsurance: number;
      pensionInsurance: number;
      careInsurance?: number;
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
    continuousMonths: 3,
    isSignificantChange: false,
    isFixedSalaryChange: true,
  };

  judgmentResult: GradeJudgmentResult | null = null;
  applicableYear: number | null = null;
  applicableMonth: number | null = null;

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

    const applicableDate = new Date(today);
    applicableDate.setMonth(applicableDate.getMonth() + 4);
    applicableDate.setDate(1);

    this.applicableYear = applicableDate.getFullYear();
    this.applicableMonth = applicableDate.getMonth() + 1;
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

  private calculateAge(birthDate: Date): number {
    // 年齢計算は整数の年月日計算なので通常計算で問題なし
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
    const gradeDifference = Math.abs(
      SocialInsuranceCalculator.calculateGradeDifference(beforeGrade.grade, afterGrade.grade)
    );
    this.revisionData.isSignificantChange = gradeDifference >= 2;
  }

  async calculateGrade(): Promise<void> {
    if (!this.isFormValid()) {
      return;
    }

    const beforeGrades = this.calculateGradesFromAmount(this.revisionData.beforeAmount!);
    const afterGrades = this.calculateGradesFromAmount(this.revisionData.afterAmount!);

    // Decimal.jsを使用した正確な等級差計算
    this.judgmentResult = {
      beforeGrades,
      afterGrades,
      gradeDifference: {
        healthInsurance: SocialInsuranceCalculator.calculateGradeDifference(
          beforeGrades.healthInsuranceGrade,
          afterGrades.healthInsuranceGrade
        ),
        pensionInsurance: SocialInsuranceCalculator.calculateGradeDifference(
          beforeGrades.pensionInsuranceGrade,
          afterGrades.pensionInsuranceGrade
        ),
        careInsurance:
          'careInsuranceGrade' in afterGrades && 'careInsuranceGrade' in beforeGrades
            ? SocialInsuranceCalculator.calculateGradeDifference(
                beforeGrades.careInsuranceGrade!,
                afterGrades.careInsuranceGrade!
              )
            : undefined,
      },
    };
  }

  private calculateGradesFromAmount(amount: number) {
    const healthGrade = this.findGradeFromHealthInsuranceTable(amount);
    const pensionGrade = this.findGradeFromPensionInsuranceTable(amount);

    const grades = {
      healthInsuranceGrade: healthGrade.grade,
      healthInsuranceStandardSalary: healthGrade.standardSalary,
      pensionInsuranceGrade: pensionGrade.grade,
      pensionInsuranceStandardSalary: pensionGrade.standardSalary,
    };

    if (this.employeeInfo && this.employeeInfo.age >= 40) {
      return {
        ...grades,
        careInsuranceGrade: healthGrade.grade,
        careInsuranceStandardSalary: healthGrade.standardSalary,
      };
    }

    return grades;
  }

  private findGradeFromHealthInsuranceTable(amount: number): {
    grade: number;
    standardSalary: number;
  } {
    const healthInsuranceTable = [
      { grade: 1, standardSalary: 58000, min: 0, max: 63000 },
      { grade: 2, standardSalary: 68000, min: 63000, max: 73000 },
      { grade: 3, standardSalary: 78000, min: 73000, max: 83000 },
      { grade: 4, standardSalary: 88000, min: 83000, max: 93000 },
      { grade: 5, standardSalary: 98000, min: 93000, max: 101000 },
      { grade: 6, standardSalary: 104000, min: 101000, max: 107000 },
      { grade: 7, standardSalary: 110000, min: 107000, max: 114000 },
      { grade: 8, standardSalary: 118000, min: 114000, max: 122000 },
      { grade: 9, standardSalary: 126000, min: 122000, max: 130000 },
      { grade: 10, standardSalary: 134000, min: 130000, max: 138000 },
      { grade: 11, standardSalary: 142000, min: 138000, max: 146000 },
      { grade: 12, standardSalary: 150000, min: 146000, max: 155000 },
      { grade: 13, standardSalary: 160000, min: 155000, max: 165000 },
      { grade: 14, standardSalary: 170000, min: 165000, max: 175000 },
      { grade: 15, standardSalary: 180000, min: 175000, max: 185000 },
      { grade: 16, standardSalary: 190000, min: 185000, max: 195000 },
      { grade: 17, standardSalary: 200000, min: 195000, max: 210000 },
      { grade: 18, standardSalary: 220000, min: 210000, max: 230000 },
      { grade: 19, standardSalary: 240000, min: 230000, max: 250000 },
      { grade: 20, standardSalary: 260000, min: 250000, max: 270000 },
      { grade: 21, standardSalary: 280000, min: 270000, max: 290000 },
      { grade: 22, standardSalary: 300000, min: 290000, max: 310000 },
      { grade: 23, standardSalary: 320000, min: 310000, max: 330000 },
      { grade: 24, standardSalary: 340000, min: 330000, max: 350000 },
      { grade: 25, standardSalary: 360000, min: 350000, max: 370000 },
      { grade: 26, standardSalary: 380000, min: 370000, max: 395000 },
      { grade: 27, standardSalary: 410000, min: 395000, max: 425000 },
      { grade: 28, standardSalary: 440000, min: 425000, max: 455000 },
      { grade: 29, standardSalary: 470000, min: 455000, max: 485000 },
      { grade: 30, standardSalary: 500000, min: 485000, max: 515000 },
      { grade: 31, standardSalary: 530000, min: 515000, max: 545000 },
      { grade: 32, standardSalary: 560000, min: 545000, max: 575000 },
      { grade: 33, standardSalary: 590000, min: 575000, max: 605000 },
      { grade: 34, standardSalary: 620000, min: 605000, max: 635000 },
      { grade: 35, standardSalary: 650000, min: 635000, max: 665000 },
      { grade: 36, standardSalary: 680000, min: 665000, max: 695000 },
      { grade: 37, standardSalary: 710000, min: 695000, max: 730000 },
      { grade: 38, standardSalary: 750000, min: 730000, max: 770000 },
      { grade: 39, standardSalary: 790000, min: 770000, max: 810000 },
      { grade: 40, standardSalary: 830000, min: 810000, max: 855000 },
      { grade: 41, standardSalary: 880000, min: 855000, max: 905000 },
      { grade: 42, standardSalary: 930000, min: 905000, max: 955000 },
      { grade: 43, standardSalary: 980000, min: 955000, max: 1005000 },
      { grade: 44, standardSalary: 1030000, min: 1005000, max: 1055000 },
      { grade: 45, standardSalary: 1090000, min: 1055000, max: 1115000 },
      { grade: 46, standardSalary: 1150000, min: 1115000, max: 1175000 },
      { grade: 47, standardSalary: 1210000, min: 1175000, max: 1235000 },
      { grade: 48, standardSalary: 1270000, min: 1235000, max: 1295000 },
      { grade: 49, standardSalary: 1330000, min: 1295000, max: 1355000 },
      { grade: 50, standardSalary: 1390000, min: 1355000, max: Number.MAX_SAFE_INTEGER },
    ];

    // Decimal.jsを使用した正確な範囲判定
    const targetGrade = healthInsuranceTable.find((grade) =>
      SocialInsuranceCalculator.isInGradeRange(amount, grade.min, grade.max)
    );
    return targetGrade || healthInsuranceTable[healthInsuranceTable.length - 1];
  }

  private findGradeFromPensionInsuranceTable(amount: number): {
    grade: number;
    standardSalary: number;
  } {
    const pensionInsuranceTable = [
      { grade: 1, standardSalary: 88000, min: 0, max: 93000 },
      { grade: 2, standardSalary: 98000, min: 93000, max: 101000 },
      { grade: 3, standardSalary: 104000, min: 101000, max: 107000 },
      { grade: 4, standardSalary: 110000, min: 107000, max: 114000 },
      { grade: 5, standardSalary: 118000, min: 114000, max: 122000 },
      { grade: 6, standardSalary: 126000, min: 122000, max: 130000 },
      { grade: 7, standardSalary: 134000, min: 130000, max: 138000 },
      { grade: 8, standardSalary: 142000, min: 138000, max: 146000 },
      { grade: 9, standardSalary: 150000, min: 146000, max: 155000 },
      { grade: 10, standardSalary: 160000, min: 155000, max: 165000 },
      { grade: 11, standardSalary: 170000, min: 165000, max: 175000 },
      { grade: 12, standardSalary: 180000, min: 175000, max: 185000 },
      { grade: 13, standardSalary: 190000, min: 185000, max: 195000 },
      { grade: 14, standardSalary: 200000, min: 195000, max: 210000 },
      { grade: 15, standardSalary: 220000, min: 210000, max: 230000 },
      { grade: 16, standardSalary: 240000, min: 230000, max: 250000 },
      { grade: 17, standardSalary: 260000, min: 250000, max: 270000 },
      { grade: 18, standardSalary: 280000, min: 270000, max: 290000 },
      { grade: 19, standardSalary: 300000, min: 290000, max: 310000 },
      { grade: 20, standardSalary: 320000, min: 310000, max: 330000 },
      { grade: 21, standardSalary: 340000, min: 330000, max: 350000 },
      { grade: 22, standardSalary: 360000, min: 350000, max: 370000 },
      { grade: 23, standardSalary: 380000, min: 370000, max: 395000 },
      { grade: 24, standardSalary: 410000, min: 395000, max: 425000 },
      { grade: 25, standardSalary: 440000, min: 425000, max: 455000 },
      { grade: 26, standardSalary: 470000, min: 455000, max: 485000 },
      { grade: 27, standardSalary: 500000, min: 485000, max: 515000 },
      { grade: 28, standardSalary: 530000, min: 515000, max: 545000 },
      { grade: 29, standardSalary: 560000, min: 545000, max: 575000 },
      { grade: 30, standardSalary: 590000, min: 575000, max: 605000 },
      { grade: 31, standardSalary: 620000, min: 605000, max: 635000 },
      { grade: 32, standardSalary: 650000, min: 635000, max: Number.MAX_SAFE_INTEGER },
    ];

    // Decimal.jsを使用した正確な範囲判定
    const targetGrade = pensionInsuranceTable.find((grade) =>
      SocialInsuranceCalculator.isInGradeRange(amount, grade.min, grade.max)
    );
    return targetGrade || pensionInsuranceTable[pensionInsuranceTable.length - 1];
  }

  getRevisionReasonLabel(reason: string): string {
    const reasonOption = this.revisionReasons.find((r) => r.value === reason);
    return reasonOption ? reasonOption.label : reason;
  }

  getGradeDifferenceText(difference: number): string {
    if (difference > 0) {
      return `+${difference}等級`;
    } else if (difference < 0) {
      return `${difference}等級`;
    } else {
      return '変更なし';
    }
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
    if (!this.employeeId || !this.judgmentResult || !this.isFormValid()) {
      this.errorMessage = '保存に必要な情報が不足しています';
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    try {
      // Create calculation snapshot for audit trail
      const calculationSnapshot = this.createCalculationSnapshot();

      // undefinedフィールドを除外したjudgmentResultを作成
      const cleanedJudgmentResult: GradeJudgmentResult = {
        beforeGrades: {
          healthInsuranceGrade: this.judgmentResult.beforeGrades.healthInsuranceGrade,
          healthInsuranceStandardSalary:
            this.judgmentResult.beforeGrades.healthInsuranceStandardSalary,
          pensionInsuranceGrade: this.judgmentResult.beforeGrades.pensionInsuranceGrade,
          pensionInsuranceStandardSalary:
            this.judgmentResult.beforeGrades.pensionInsuranceStandardSalary,
          ...(this.judgmentResult.beforeGrades.careInsuranceGrade !== undefined && {
            careInsuranceGrade: this.judgmentResult.beforeGrades.careInsuranceGrade,
            careInsuranceStandardSalary:
              this.judgmentResult.beforeGrades.careInsuranceStandardSalary,
          }),
        },
        afterGrades: {
          healthInsuranceGrade: this.judgmentResult.afterGrades.healthInsuranceGrade,
          healthInsuranceStandardSalary:
            this.judgmentResult.afterGrades.healthInsuranceStandardSalary,
          pensionInsuranceGrade: this.judgmentResult.afterGrades.pensionInsuranceGrade,
          pensionInsuranceStandardSalary:
            this.judgmentResult.afterGrades.pensionInsuranceStandardSalary,
          ...(this.judgmentResult.afterGrades.careInsuranceGrade !== undefined && {
            careInsuranceGrade: this.judgmentResult.afterGrades.careInsuranceGrade,
            careInsuranceStandardSalary:
              this.judgmentResult.afterGrades.careInsuranceStandardSalary,
          }),
        },
        gradeDifference: {
          healthInsurance: this.judgmentResult.gradeDifference.healthInsurance,
          pensionInsurance: this.judgmentResult.gradeDifference.pensionInsurance,
          ...(this.judgmentResult.gradeDifference.careInsurance !== undefined && {
            careInsurance: this.judgmentResult.gradeDifference.careInsurance,
          }),
        },
      };

      const revisionData: RevisionSaveData = {
        employeeId: this.employeeId,
        revisionData: this.revisionData,
        judgmentResult: cleanedJudgmentResult,
        applicableYear: this.applicableYear!,
        applicableMonth: this.applicableMonth!,
        calculationSnapshot: calculationSnapshot,
        createdAt: this.savedRevisionData?.createdAt || new Date(),
        updatedAt: new Date(),
        judgmentType: 'revision',
      };

      const docId = this.savedRevisionData?.id || `${this.employeeId}_revision`;
      const docRef = doc(this.firestore, 'employee_grades', docId);

      await setDoc(docRef, revisionData);

      this.savedRevisionData = { ...revisionData, id: docId };

      // Save to grade judgment history
      await this.saveToGradeJudgmentHistory();

      this.errorMessage = '随時改定データが保存されました';
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

  private createCalculationSnapshot(): CalculationSnapshot {
    const appliedRules: string[] = [];

    // Track which rules were applied
    if (this.revisionData.isSignificantChange) {
      appliedRules.push('2等級以上差異確認');
    }
    if (this.revisionData.isFixedSalaryChange) {
      appliedRules.push('固定的賃金変動');
    }
    if (this.revisionData.continuousMonths >= 3) {
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
      const effectiveDate = new Date(this.applicableYear!, this.applicableMonth! - 1, 1);

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
      await setDoc(doc(historyCollectionRef), gradeJudgmentRecord);
    } catch (error) {
      console.error('履歴保存エラー:', error);
    }
  }

  private clearForm(): void {
    this.revisionData = {
      revisionReason: '',
      beforeAmount: null,
      afterAmount: null,
      revisionDate: '',
      continuousMonths: 3,
      isSignificantChange: false,
      isFixedSalaryChange: true,
    };
    this.judgmentResult = null;
    this.initializeDefaultDates();
  }

  isSaveValid(): boolean {
    return this.isFormValid() && !!this.judgmentResult;
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
}
