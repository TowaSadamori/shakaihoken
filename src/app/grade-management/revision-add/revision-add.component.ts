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
  updateDoc,
  Timestamp,
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

interface GradeData {
  healthInsuranceGrade: string | number;
  healthInsuranceStandardSalary: string;
  pensionInsuranceGrade: string | number;
  pensionInsuranceStandardSalary: string;
  careInsuranceGrade?: string | number;
  careInsuranceStandardSalary?: string;
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
  endYear: bigint | null = null;
  endMonth: bigint | null = null;

  revisionReasons = [
    { value: 'salary_increase', label: '昇給' },
    { value: 'salary_decrease', label: '降給' },
    { value: 'allowance_change', label: '諸手当の変更' },
    { value: 'job_change', label: '職務内容の変更' },
    { value: 'position_change', label: '役職の変更' },
    { value: 'other', label: 'その他' },
  ];

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
  private uid: string | null = null;

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
    this.recordId = this.route.snapshot.paramMap.get('recordId');
    this.isEditMode = !!this.recordId;

    if (this.employeeId) {
      await this.loadCompanyId();
      await this.loadEmployeeInfo();
      if (this.isEditMode && this.recordId) {
        await this.loadExistingRevisionData(this.recordId);
      }
    }
    if (!this.isEditMode) {
      this.initializeDefaultDates();
    }
    this.initializeYears();
  }

  private initializeYears(): void {
    const currentYear = new Date().getFullYear();
    for (let i = -5; i <= 10; i++) {
      this.availableYears.push(BigInt(currentYear + i));
    }
  }

  private initializeDefaultDates(): void {
    if (this.revisionData.revisionDate) return;
    const today = new Date();
    this.revisionData.revisionDate = today.toISOString().split('T')[0];
  }

  private async loadCompanyId(): Promise<void> {
    try {
      const userId = await this.authService.getCurrentUserId();
      if (userId) {
        const userDoc = await getDoc(doc(this.firestore, 'users', userId));
        if (userDoc.exists()) {
          this.companyId = userDoc.data()['companyId'];
        }
      }
      if (!this.companyId) {
        console.error('Company ID could not be retrieved.');
        this.errorMessage = '会社情報を取得できませんでした。';
      }
    } catch (error) {
      console.error('Error fetching company ID:', error);
      this.errorMessage = '会社情報の取得中にエラーが発生しました。';
    }
  }

  private async loadEmployeeInfo(): Promise<void> {
    if (!this.employeeId || !this.companyId) return;

    this.isLoading = true;
    try {
      console.log('従業員情報を読み込み中 (employeeNumber):', this.employeeId);

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
        this.uid = userDoc.id;
        console.log('Firestoreから取得した従業員データ:', userData);

        const birthDate = new Date(userData['birthDate']);
        const age = this.calculateAge(birthDate);

        const formattedBirthDate = birthDate.toISOString().split('T')[0];

        let addressPrefecture = userData['addressPrefecture'] || '';

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
          uid: this.uid,
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

  private async loadExistingRevisionData(recordId: string): Promise<void> {
    if (!this.employeeId) return;
    this.isLoading = true;
    try {
      const docRef = doc(this.firestore, `gradeJudgments/${this.employeeId}/judgments`, recordId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();

        if (data['inputData']) {
          this.revisionData = {
            revisionReason: data['inputData'].revisionReason || '',
            beforeAmount: data['inputData'].beforeAmount || null,
            afterAmount: data['inputData'].afterAmount || null,
            revisionDate: data['inputData'].revisionDate || '',
            continuousMonths: data['calculationSnapshot']?.revisionTrigger?.continuousMonths
              ? BigInt(data['calculationSnapshot'].revisionTrigger.continuousMonths)
              : BigInt(3),
            isSignificantChange:
              data['calculationSnapshot']?.validationResults?.isSignificantChange || false,
            isFixedSalaryChange:
              data['calculationSnapshot']?.validationResults?.hasFixedWageChange || false,
          };
        }

        const effectiveDate = (data['effectiveDate'] as Timestamp).toDate();
        this.applicableYear = BigInt(effectiveDate.getFullYear());
        this.applicableMonth = BigInt(effectiveDate.getMonth() + 1);

        // 終了日がある場合は読み込み
        if (data['endDate']) {
          const endDate = (data['endDate'] as Timestamp).toDate();
          this.endYear = BigInt(endDate.getFullYear());
          this.endMonth = BigInt(endDate.getMonth() + 1);
        }

        if (data['calculationSnapshot']?.beforeAfterComparison) {
          const loadedJudgment = data['calculationSnapshot'].beforeAfterComparison;
          const convertGrades = (grades: GradeData) => ({
            healthInsuranceGrade: BigInt(grades.healthInsuranceGrade),
            healthInsuranceStandardSalary: grades.healthInsuranceStandardSalary,
            pensionInsuranceGrade: BigInt(grades.pensionInsuranceGrade),
            pensionInsuranceStandardSalary: grades.pensionInsuranceStandardSalary,
            careInsuranceGrade: grades.careInsuranceGrade
              ? BigInt(grades.careInsuranceGrade)
              : undefined,
            careInsuranceStandardSalary: grades.careInsuranceStandardSalary,
          });

          this.judgmentResult = {
            beforeGrades: convertGrades(loadedJudgment.beforeGrades),
            afterGrades: convertGrades(loadedJudgment.afterGrades),
            gradeDifference: loadedJudgment.gradeDifference,
          };
        }

        console.log('読み込んだ随時改定データ:', this.revisionData);
      } else {
        this.errorMessage = '指定された随時改定データが見つかりません。';
      }
    } catch (error) {
      console.error('既存随時改定データ読み込みエラー:', error);
      this.errorMessage = 'データの読み込み中にエラーが発生しました。';
    } finally {
      this.isLoading = false;
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

    const historyData = this.createHistoryData(calculationSnapshot);

    try {
      if (this.isEditMode && this.recordId) {
        const historyDocRef = doc(
          this.firestore,
          `gradeJudgments/${this.employeeId}/judgments`,
          this.recordId
        );
        const dataToUpdate = this.deepConvertBigIntToString(historyData);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await updateDoc(historyDocRef, dataToUpdate as any);
        alert('随時改定データが正常に更新されました。');
      } else {
        await this.saveToGradeJudgmentHistory(historyData);
        alert('随時改定データが正常に保存されました。');
      }

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

    if (this.revisionData.isSignificantChange) {
      appliedRules.push('2等級以上差異確認');
    }
    if (this.revisionData.isFixedSalaryChange) {
      appliedRules.push('固定的賃金変動');
    }
    if (this.revisionData.continuousMonths >= BigInt(3)) {
      appliedRules.push('3ヶ月継続性確認');
    }

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

    const hasContradiction =
      (fixedWageIncreased && !totalGradeIncreased) || (!fixedWageIncreased && totalGradeIncreased);

    return !hasContradiction;
  }

  async deleteRevisionData(): Promise<void> {
    if (!this.employeeId || !this.recordId) {
      alert('削除対象のデータが特定できません。');
      return;
    }
    if (!confirm('この随時改定履歴を削除しますか？この操作は元に戻せません。')) {
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    try {
      console.log('削除開始:', { employeeId: this.employeeId, recordId: this.recordId });

      const docRef = doc(
        this.firestore,
        `gradeJudgments/${this.employeeId}/judgments`,
        this.recordId
      );
      console.log('履歴削除:', docRef.path);
      await deleteDoc(docRef);

      console.log('削除処理完了');
      alert('随時改定データを削除しました');
      this.router.navigate(['/grade-judgment', this.employeeId]);
    } catch (error) {
      console.error('削除エラー:', error);
      this.errorMessage = `削除に失敗しました: ${error}`;
      alert(this.errorMessage);
    } finally {
      this.isSaving = false;
    }
  }

  private createHistoryData(snapshot: CalculationSnapshot): Record<string, unknown> {
    const effectiveDate = new Date(
      Number(this.applicableYear!),
      Number(this.applicableMonth!) - 1,
      1
    );

    // 終了日の設定
    let endDate: Date | null = null;
    if (this.endYear && this.endMonth) {
      endDate = new Date(Number(this.endYear), Number(this.endMonth) - 1, 1);
    }

    const gradeJudgmentRecord: Record<string, unknown> = {
      employeeId: this.employeeId,
      judgmentType: 'revision' as const,
      judgmentDate: new Date(),
      effectiveDate: effectiveDate,
      endDate: endDate,
      healthInsuranceGrade: this.judgmentResult!.afterGrades.healthInsuranceGrade,
      pensionInsuranceGrade: this.judgmentResult!.afterGrades.pensionInsuranceGrade,
      standardMonthlyAmount: this.revisionData.afterAmount,
      reason: `随時改定（${this.getRevisionReasonLabel(this.revisionData.revisionReason)}）`,
      inputData: {
        revisionReason: this.revisionData.revisionReason,
        beforeAmount: this.revisionData.beforeAmount,
        afterAmount: this.revisionData.afterAmount,
        revisionDate: this.revisionData.revisionDate,
        gradeDifference: {
          healthInsurance: this.judgmentResult!.gradeDifference.healthInsurance,
          pensionInsurance: this.judgmentResult!.gradeDifference.pensionInsurance,
          ...(this.judgmentResult!.gradeDifference.careInsurance !== undefined && {
            careInsurance: this.judgmentResult!.gradeDifference.careInsurance,
          }),
        },
      },
      calculationSnapshot: snapshot,
      createdAt: this.isEditMode ? this.savedRevisionData?.createdAt || new Date() : new Date(),
      updatedAt: new Date(),
    };

    if (this.judgmentResult!.afterGrades.careInsuranceGrade !== undefined) {
      gradeJudgmentRecord['careInsuranceGrade'] =
        this.judgmentResult!.afterGrades.careInsuranceGrade;
    }
    return gradeJudgmentRecord;
  }

  private async saveToGradeJudgmentHistory(
    gradeJudgmentRecord: Record<string, unknown>
  ): Promise<void> {
    if (!this.employeeId) {
      return;
    }

    try {
      const historyCollectionRef = collection(
        this.firestore,
        'gradeJudgments',
        this.employeeId,
        'judgments'
      );

      const q = query(historyCollectionRef, where('endDate', '==', null));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const activeDoc = querySnapshot.docs[0];
        const newEffectiveDate = gradeJudgmentRecord['effectiveDate'] as Date;
        const newEndDate = new Date(newEffectiveDate.getTime() - 24 * 60 * 60 * 1000);

        await updateDoc(activeDoc.ref, {
          endDate: Timestamp.fromDate(newEndDate),
          updatedAt: Timestamp.now(),
        });
      }

      const newDocRef = doc(historyCollectionRef);
      const convertedRecord = this.deepConvertBigIntToString(gradeJudgmentRecord);
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
    this.endYear = null;
    this.endMonth = null;
    this.initializeDefaultDates();
  }

  isSaveValid(): boolean {
    return this.isFormValid() && this.judgmentResult !== null;
  }

  get hasCareInsurance(): boolean {
    return !!(
      this.judgmentResult?.beforeGrades?.careInsuranceGrade !== undefined &&
      this.judgmentResult?.afterGrades?.careInsuranceGrade !== undefined
    );
  }

  get isNoCareInsurance(): boolean {
    return !!(this.judgmentResult && !this.judgmentResult.beforeGrades.careInsuranceGrade);
  }

  get safeJudgmentResult() {
    return this.judgmentResult!;
  }

  getAvailableYears(): bigint[] {
    const currentYear = BigInt(new Date().getFullYear());
    const years: bigint[] = [];

    // 現在年から10年後まで選択可能
    for (let i = 0; i <= 10; i++) {
      years.push(currentYear + BigInt(i));
    }

    return years;
  }

  private hasToDateMethod(timestamp: unknown): timestamp is { toDate(): Date } {
    return (
      timestamp !== null &&
      typeof timestamp === 'object' &&
      'toDate' in timestamp &&
      typeof (timestamp as Record<string, unknown>)['toDate'] === 'function'
    );
  }

  formatTimestamp(timestamp: Date | { toDate(): Date } | unknown): string {
    if (!timestamp) return '';

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

  private deepConvertBigIntToString(obj: unknown): unknown {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date || obj instanceof Timestamp) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepConvertBigIntToString(item));
    }

    const newObj: Record<string, unknown> = {};
    for (const key in obj as Record<string, unknown>) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = (obj as Record<string, unknown>)[key];
        // undefinedの値は除外する
        if (value === undefined) {
          continue;
        }
        if (typeof value === 'bigint') {
          newObj[key] = String(value);
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
