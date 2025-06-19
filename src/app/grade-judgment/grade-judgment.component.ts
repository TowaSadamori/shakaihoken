import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';

interface EmployeeInfo {
  name: string;
  employeeNumber: string;
  birthDate: string;
  age: number;
  companyId: string;
}

interface SalaryData {
  averageMonthly: number;
  totalBonus: number;
  annualTotal: number;
}

interface GradeJudgmentRecord {
  id: string;
  employeeId: string;
  judgmentType: 'manual' | 'regular' | 'irregular';
  judgmentDate: Date;
  effectiveDate: Date;
  endDate?: Date;
  healthInsuranceGrade: number;
  pensionInsuranceGrade: number;
  careInsuranceGrade?: number;
  standardMonthlyAmount: number;
  reason: string;
  inputData: {
    averageMonthly?: number;
    totalBonus?: number;
    annualTotal?: number;
    manualAmount?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface JudgmentDialogData {
  judgmentType: 'manual' | 'regular' | 'irregular';
  effectiveDate: string;
  endDate: string;
  standardMonthlyAmount: number;
  healthInsuranceGrade: number;
  pensionInsuranceGrade: number;
  careInsuranceGrade?: number;
  reason: string;
  inputData: {
    averageMonthly?: number;
    totalBonus?: number;
    annualTotal?: number;
    manualAmount?: number;
  };
}

@Component({
  selector: 'app-grade-judgment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './grade-judgment.component.html',
  styleUrl: './grade-judgment.component.scss',
})
export class GradeJudgmentComponent implements OnInit {
  employeeInfo: EmployeeInfo | null = null;
  salaryData: SalaryData | null = null;
  judgmentRecords: GradeJudgmentRecord[] = [];

  isLoading = false;
  errorMessage = '';

  // ダイアログ関連
  showDialog = false;
  dialogData: JudgmentDialogData = this.getInitialDialogData();

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

    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      await Promise.all([
        this.loadEmployeeInfo(),
        this.loadSalaryData(),
        this.loadJudgmentHistory(),
      ]);
    } catch (error) {
      console.error('データ読み込みエラー:', error);
      this.errorMessage = 'データの読み込みに失敗しました';
    } finally {
      this.isLoading = false;
    }
  }

  private async loadEmployeeInfo(): Promise<void> {
    if (!this.employeeId) return;

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
        };
      } else {
        // Firestoreにデータがない場合はテスト用データを設定
        this.employeeInfo = {
          name: '定森 統和',
          employeeNumber: '1',
          birthDate: '1999-08-21',
          age: 25,
          companyId: 'test-company',
        };
      }
    } catch (error) {
      console.error('従業員情報取得エラー:', error);
      // エラーが発生した場合もテスト用データを設定
      this.employeeInfo = {
        name: '定森 統和',
        employeeNumber: '1',
        birthDate: '1999-08-21',
        age: 25,
        companyId: 'test-company',
      };
    }
  }

  private async loadSalaryData(): Promise<void> {
    if (!this.employeeId) return;

    // 実際の実装では給与データのコレクションから取得
    // 仮のデータを設定
    this.salaryData = {
      averageMonthly: 280000,
      totalBonus: 840000,
      annualTotal: 4200000,
    };
  }

  private async loadJudgmentHistory(): Promise<void> {
    if (!this.employeeId) return;

    const q = query(
      collection(this.firestore, 'gradeJudgments', this.employeeId, 'judgments'),
      orderBy('effectiveDate', 'desc')
    );

    const querySnapshot = await getDocs(q);
    this.judgmentRecords = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      this.judgmentRecords.push({
        id: doc.id,
        employeeId: this.employeeId!,
        judgmentType: data['judgmentType'],
        judgmentDate: data['judgmentDate'].toDate(),
        effectiveDate: data['effectiveDate'].toDate(),
        endDate: data['endDate']?.toDate(),
        healthInsuranceGrade: data['healthInsuranceGrade'],
        pensionInsuranceGrade: data['pensionInsuranceGrade'],
        careInsuranceGrade: data['careInsuranceGrade'],
        standardMonthlyAmount: data['standardMonthlyAmount'],
        reason: data['reason'],
        inputData: data['inputData'],
        createdAt: data['createdAt'].toDate(),
        updatedAt: data['updatedAt'].toDate(),
      });
    });
  }

  openJudgmentDialog(judgmentType: 'manual' | 'regular' | 'irregular'): void {
    this.dialogData = this.getInitialDialogData();
    this.dialogData.judgmentType = judgmentType;

    // 判定方法に応じた初期データ設定
    if (judgmentType === 'regular' || judgmentType === 'irregular') {
      if (this.salaryData) {
        this.dialogData.inputData.averageMonthly = this.salaryData.averageMonthly;
        this.dialogData.inputData.totalBonus = this.salaryData.totalBonus;
        this.dialogData.inputData.annualTotal = this.salaryData.annualTotal;

        // 標準報酬月額を自動計算
        this.dialogData.standardMonthlyAmount = this.calculateStandardMonthlyAmount(
          this.salaryData.averageMonthly
        );
        this.calculateGradesFromAmount();
      }
    }

    // デフォルトの適用開始日を設定（来月の1日）
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(1);
    this.dialogData.effectiveDate = nextMonth.toISOString().split('T')[0];

    this.showDialog = true;
  }

  closeDialog(): void {
    this.showDialog = false;
    this.dialogData = this.getInitialDialogData();
  }

  calculateGradesFromAmount(): void {
    const amount =
      this.dialogData.judgmentType === 'manual'
        ? this.dialogData.inputData.manualAmount || 0
        : this.dialogData.standardMonthlyAmount;

    if (amount === 0) return;

    // 簡略化した等級計算（実際の等級表に基づく）
    this.dialogData.healthInsuranceGrade = this.getGradeFromAmount(amount);
    this.dialogData.pensionInsuranceGrade = this.getGradeFromAmount(amount);

    if (this.employeeInfo && this.employeeInfo.age >= 40) {
      this.dialogData.careInsuranceGrade = this.getGradeFromAmount(amount);
    }

    // 手入力の場合は標準報酬月額も更新
    if (this.dialogData.judgmentType === 'manual') {
      this.dialogData.standardMonthlyAmount = amount;
    }
  }

  private getGradeFromAmount(amount: number): number {
    // 簡略化した等級計算（実際の等級表を使用）
    const gradeTable = [
      { min: 0, max: 93000, grade: 1 },
      { min: 93000, max: 101000, grade: 2 },
      { min: 101000, max: 107000, grade: 3 },
      { min: 107000, max: 114000, grade: 4 },
      { min: 114000, max: 122000, grade: 5 },
      { min: 122000, max: 130000, grade: 6 },
      { min: 130000, max: 138000, grade: 7 },
      { min: 138000, max: 146000, grade: 8 },
      { min: 146000, max: 155000, grade: 9 },
      { min: 155000, max: 165000, grade: 10 },
      { min: 165000, max: 175000, grade: 11 },
      { min: 175000, max: 185000, grade: 12 },
      { min: 185000, max: 195000, grade: 13 },
      { min: 195000, max: 210000, grade: 14 },
      { min: 210000, max: 230000, grade: 15 },
      { min: 230000, max: 250000, grade: 16 },
      { min: 250000, max: 270000, grade: 17 },
      { min: 270000, max: 290000, grade: 18 },
      { min: 290000, max: 310000, grade: 19 },
      { min: 310000, max: 330000, grade: 20 },
    ];

    for (const grade of gradeTable) {
      if (amount >= grade.min && amount < grade.max) {
        return grade.grade;
      }
    }

    return gradeTable[gradeTable.length - 1].grade;
  }

  private calculateStandardMonthlyAmount(averageMonthly: number): number {
    // 標準報酬月額の計算（等級表に基づく）
    const gradeTable = [
      { min: 93000, max: 101000, standard: 98000 },
      { min: 101000, max: 107000, standard: 104000 },
      { min: 107000, max: 114000, standard: 110000 },
      { min: 114000, max: 122000, standard: 118000 },
      { min: 122000, max: 130000, standard: 126000 },
      { min: 130000, max: 138000, standard: 134000 },
      { min: 138000, max: 146000, standard: 142000 },
      { min: 146000, max: 155000, standard: 150000 },
      { min: 155000, max: 165000, standard: 160000 },
      { min: 165000, max: 175000, standard: 170000 },
      { min: 175000, max: 185000, standard: 180000 },
      { min: 185000, max: 195000, standard: 190000 },
      { min: 195000, max: 210000, standard: 200000 },
      { min: 210000, max: 230000, standard: 220000 },
      { min: 230000, max: 250000, standard: 240000 },
      { min: 250000, max: 270000, standard: 260000 },
      { min: 270000, max: 290000, standard: 280000 },
      { min: 290000, max: 310000, standard: 300000 },
      { min: 310000, max: 330000, standard: 320000 },
    ];

    for (const grade of gradeTable) {
      if (averageMonthly >= grade.min && averageMonthly < grade.max) {
        return grade.standard;
      }
    }

    return gradeTable[gradeTable.length - 1].standard;
  }

  async saveJudgment(): Promise<void> {
    if (!this.employeeId || !this.isDialogValid()) return;

    try {
      const judgmentId = Date.now().toString();
      const docRef = doc(
        this.firestore,
        'gradeJudgments',
        this.employeeId,
        'judgments',
        judgmentId
      );

      const judgmentData = {
        judgmentType: this.dialogData.judgmentType,
        judgmentDate: Timestamp.now(),
        effectiveDate: Timestamp.fromDate(new Date(this.dialogData.effectiveDate)),
        endDate: this.dialogData.endDate
          ? Timestamp.fromDate(new Date(this.dialogData.endDate))
          : null,
        healthInsuranceGrade: this.dialogData.healthInsuranceGrade,
        pensionInsuranceGrade: this.dialogData.pensionInsuranceGrade,
        careInsuranceGrade: this.dialogData.careInsuranceGrade,
        standardMonthlyAmount: this.dialogData.standardMonthlyAmount,
        reason: this.dialogData.reason,
        inputData: this.dialogData.inputData,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await setDoc(docRef, judgmentData);

      this.closeDialog();
      await this.loadJudgmentHistory(); // 履歴を再読み込み
    } catch (error) {
      console.error('保存エラー:', error);
      this.errorMessage = '保存に失敗しました';
    }
  }

  isDialogValid(): boolean {
    return !!(
      this.dialogData.effectiveDate &&
      this.dialogData.standardMonthlyAmount > 0 &&
      (this.dialogData.judgmentType !== 'manual' || this.dialogData.inputData.manualAmount)
    );
  }

  private getInitialDialogData(): JudgmentDialogData {
    return {
      judgmentType: 'manual',
      effectiveDate: '',
      endDate: '',
      standardMonthlyAmount: 0,
      healthInsuranceGrade: 1,
      pensionInsuranceGrade: 1,
      careInsuranceGrade: undefined,
      reason: '',
      inputData: {
        averageMonthly: undefined,
        totalBonus: undefined,
        annualTotal: undefined,
        manualAmount: undefined,
      },
    };
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

  getJudgmentTypeLabel(type: string): string {
    switch (type) {
      case 'manual':
        return '手入力';
      case 'regular':
        return '定時決定';
      case 'irregular':
        return '随時改定';
      default:
        return type;
    }
  }

  formatDate(date: Date): string {
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: 'JPY',
      minimumFractionDigits: 0,
    }).format(amount);
  }

  goBack(): void {
    this.router.navigate(['/salary-bonus-detail', this.employeeId]);
  }
}
