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
  branchNumber: string;
  addressPrefecture: string;
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
          branchNumber: userData['branchNumber'] || '',
          addressPrefecture: userData['addressPrefecture'] || '',
        };
      } else {
        // Firestoreにデータがない場合はテスト用データを設定
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
      // エラーが発生した場合もテスト用データを設定
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

    try {
      this.judgmentRecords = [];

      // 等級判定履歴コレクションからデータを読み込み
      const q = query(
        collection(this.firestore, 'gradeJudgments', this.employeeId, 'judgments'),
        orderBy('effectiveDate', 'desc')
      );

      const querySnapshot = await getDocs(q);

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        this.judgmentRecords.push({
          id: doc.id,
          employeeId: this.employeeId!,
          judgmentType: data['judgmentType'],
          judgmentDate: data['judgmentDate'].toDate(),
          effectiveDate: data['effectiveDate'].toDate(),
          endDate: data['endDate'] ? data['endDate'].toDate() : undefined,
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

      // 手入力で保存されたデータ（employee_gradesコレクション）も読み込み
      const employeeGradeDocId = `${this.employeeId}_manual`;
      const employeeGradeDocRef = doc(this.firestore, 'employee_grades', employeeGradeDocId);
      const employeeGradeDoc = await getDoc(employeeGradeDocRef);

      if (employeeGradeDoc.exists()) {
        const data = employeeGradeDoc.data();

        // 適用開始日を作成
        const effectiveDate = new Date(data['applicableYear'], data['applicableMonth'] - 1, 1);

        // 適用終了日を作成（ある場合のみ）
        let endDate: Date | undefined;
        if (data['endYear'] && data['endMonth']) {
          endDate = new Date(data['endYear'], data['endMonth'] - 1, 1);
        }

        // 判定結果から等級を取得
        const judgmentResult = data['judgmentResult'];

        const manualRecord: GradeJudgmentRecord = {
          id: employeeGradeDoc.id,
          employeeId: this.employeeId,
          judgmentType: 'manual',
          judgmentDate: data['updatedAt'].toDate(),
          effectiveDate: effectiveDate,
          endDate: endDate,
          healthInsuranceGrade: judgmentResult['healthInsuranceGrade'],
          pensionInsuranceGrade: judgmentResult['pensionInsuranceGrade'],
          careInsuranceGrade: judgmentResult['careInsuranceGrade'],
          standardMonthlyAmount: data['monthlyAmount'],
          reason: '手入力による等級判定',
          inputData: {
            manualAmount: data['monthlyAmount'],
          },
          createdAt: data['createdAt'].toDate(),
          updatedAt: data['updatedAt'].toDate(),
        };

        this.judgmentRecords.push(manualRecord);
      }

      // 効力発生日の降順でソート
      this.judgmentRecords.sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime());

      console.log('等級判定履歴を読み込みました:', this.judgmentRecords);
    } catch (error) {
      console.error('等級判定履歴取得エラー:', error);
      // テスト用のサンプルデータを設定
      this.judgmentRecords = [
        {
          id: 'sample-1',
          employeeId: this.employeeId!,
          judgmentType: 'manual',
          judgmentDate: new Date('2024-01-15'),
          effectiveDate: new Date('2024-02-01'),
          endDate: new Date('2024-12-31'),
          healthInsuranceGrade: 18,
          pensionInsuranceGrade: 18,
          careInsuranceGrade: 18,
          standardMonthlyAmount: 280000,
          reason: '手入力による等級決定',
          inputData: {
            manualAmount: 280000,
          },
          createdAt: new Date('2024-01-15'),
          updatedAt: new Date('2024-01-15'),
        },
        {
          id: 'sample-2',
          employeeId: this.employeeId!,
          judgmentType: 'regular',
          judgmentDate: new Date('2024-04-01'),
          effectiveDate: new Date('2024-04-01'),
          endDate: new Date('2025-03-31'),
          healthInsuranceGrade: 19,
          pensionInsuranceGrade: 19,
          careInsuranceGrade: 19,
          standardMonthlyAmount: 300000,
          reason: '定時決定による等級改定',
          inputData: {
            averageMonthly: 300000,
            totalBonus: 900000,
            annualTotal: 4500000,
          },
          createdAt: new Date('2024-04-01'),
          updatedAt: new Date('2024-04-01'),
        },
      ];
    }
  }

  openJudgmentDialog(judgmentType: 'manual' | 'regular' | 'irregular'): void {
    this.dialogData = {
      ...this.getInitialDialogData(),
      judgmentType: judgmentType,
    };

    // 判定タイプに応じて初期値を設定
    if (judgmentType === 'manual') {
      this.dialogData.reason = '手入力による等級決定';
    } else if (judgmentType === 'regular') {
      this.dialogData.reason = '定時決定による等級改定';
      if (this.salaryData) {
        this.dialogData.inputData = {
          averageMonthly: this.salaryData.averageMonthly,
          totalBonus: this.salaryData.totalBonus,
          annualTotal: this.salaryData.annualTotal,
        };
        this.dialogData.standardMonthlyAmount = this.calculateStandardMonthlyAmount(
          this.salaryData.averageMonthly
        );
      }
    } else if (judgmentType === 'irregular') {
      this.dialogData.reason = '随時改定による等級変更';
    }

    this.calculateGradesFromAmount();
    this.showDialog = true;
  }

  closeDialog(): void {
    this.showDialog = false;
    this.dialogData = this.getInitialDialogData();
  }

  calculateGradesFromAmount(): void {
    const amount = this.dialogData.standardMonthlyAmount;
    if (amount > 0) {
      const grade = this.getGradeFromAmount(amount);
      this.dialogData.healthInsuranceGrade = grade;
      this.dialogData.pensionInsuranceGrade = grade;

      // 40歳以上の場合のみ介護保険料等級を設定
      if (this.employeeInfo && this.employeeInfo.age >= 40) {
        this.dialogData.careInsuranceGrade = grade;
      }
    }
  }

  private getGradeFromAmount(amount: number): number {
    // 簡易的な等級計算（実際は詳細な等級表を使用）
    if (amount <= 88000) return 1;
    if (amount <= 98000) return 2;
    if (amount <= 104000) return 3;
    if (amount <= 110000) return 4;
    if (amount <= 118000) return 5;
    if (amount <= 126000) return 6;
    if (amount <= 134000) return 7;
    if (amount <= 142000) return 8;
    if (amount <= 150000) return 9;
    if (amount <= 160000) return 10;
    if (amount <= 170000) return 11;
    if (amount <= 180000) return 12;
    if (amount <= 190000) return 13;
    if (amount <= 200000) return 14;
    if (amount <= 220000) return 15;
    if (amount <= 240000) return 16;
    if (amount <= 260000) return 17;
    if (amount <= 280000) return 18;
    if (amount <= 300000) return 19;
    if (amount <= 320000) return 20;
    if (amount <= 340000) return 21;
    if (amount <= 360000) return 22;
    if (amount <= 380000) return 23;
    if (amount <= 410000) return 24;
    if (amount <= 440000) return 25;
    if (amount <= 470000) return 26;
    if (amount <= 500000) return 27;
    if (amount <= 530000) return 28;
    if (amount <= 560000) return 29;
    if (amount <= 590000) return 30;
    return 31; // 590000円超
  }

  private calculateStandardMonthlyAmount(averageMonthly: number): number {
    // 標準報酬月額の計算ロジック
    // 実際は詳細な計算が必要ですが、ここでは簡易的に
    return Math.round(averageMonthly / 1000) * 1000;
  }

  async saveJudgment(): Promise<void> {
    if (!this.isDialogValid() || !this.employeeId) {
      return;
    }

    try {
      const judgmentData = {
        employeeId: this.employeeId,
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

      // 新しいドキュメントIDを生成
      const newDocRef = doc(
        collection(this.firestore, 'gradeJudgments', this.employeeId, 'judgments')
      );
      await setDoc(newDocRef, judgmentData);

      console.log('等級判定データを保存しました');

      // 履歴を再読み込み
      await this.loadJudgmentHistory();

      // ダイアログを閉じる
      this.closeDialog();
    } catch (error) {
      console.error('等級判定データ保存エラー:', error);
      this.errorMessage = 'データの保存に失敗しました';
    }
  }

  isDialogValid(): boolean {
    return !!(
      this.dialogData.effectiveDate &&
      this.dialogData.standardMonthlyAmount > 0 &&
      this.dialogData.healthInsuranceGrade > 0 &&
      this.dialogData.pensionInsuranceGrade > 0 &&
      this.dialogData.reason.trim()
    );
  }

  private getInitialDialogData(): JudgmentDialogData {
    return {
      judgmentType: 'manual',
      effectiveDate: '',
      endDate: '',
      standardMonthlyAmount: 0,
      healthInsuranceGrade: 0,
      pensionInsuranceGrade: 0,
      careInsuranceGrade: undefined,
      reason: '',
      inputData: {},
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
    return date.toLocaleDateString('ja-JP');
  }

  formatCurrency(amount: number): string {
    return amount.toLocaleString('ja-JP') + '円';
  }

  goBack(): void {
    this.router.navigate(['/']);
  }

  navigateToManualAdd(): void {
    this.router.navigate(['/manual-grade-add', this.employeeId]);
  }
}
