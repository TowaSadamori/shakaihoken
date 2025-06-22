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
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
  where,
} from 'firebase/firestore';
import { OfficeService } from '../services/office.service';
import { SocialInsuranceCalculator } from '../utils/decimal-calculator';

interface EmployeeInfo {
  name: string;
  employeeNumber: string;
  birthDate: string;
  age: bigint;
  companyId: string;
  branchNumber: string;
  addressPrefecture: string;
}

interface SalaryData {
  averageMonthly: string;
  totalBonus: string;
  annualTotal: string;
}

interface GradeJudgmentRecord {
  id: string;
  employeeId: string;
  judgmentType: 'manual' | 'regular' | 'irregular' | 'revision';
  judgmentDate: Date;
  effectiveDate: Date;
  endDate?: Date;
  healthInsuranceGrade: bigint;
  pensionInsuranceGrade: bigint;
  careInsuranceGrade?: bigint;
  standardMonthlyAmount: string;
  reason: string;
  inputData: {
    averageMonthly?: string;
    totalBonus?: string;
    annualTotal?: string;
    manualAmount?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface JudgmentDialogData {
  judgmentType: 'manual' | 'regular' | 'irregular';
  effectiveDate: string;
  standardMonthlyAmount: string;
  healthInsuranceGrade: bigint;
  pensionInsuranceGrade: bigint;
  careInsuranceGrade?: bigint;
  reason: string;
  inputData: {
    averageMonthly?: string;
    totalBonus?: string;
    annualTotal?: string;
    manualAmount?: string;
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
    private route: ActivatedRoute,
    private officeService: OfficeService
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
    if (!this.employeeId) {
      this.errorMessage = '従業員IDが指定されていません';
      return;
    }

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
    }
  }

  private async loadSalaryData(): Promise<void> {
    if (!this.employeeId) return;

    // 実際の実装では給与データのコレクションから取得
    // 仮のデータを設定
    this.salaryData = {
      averageMonthly: '280000',
      totalBonus: '840000',
      annualTotal: '4200000',
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
          judgmentDate: this.convertToDate(data['judgmentDate']),
          effectiveDate: this.convertToDate(data['effectiveDate']),
          endDate: data['endDate'] ? this.convertToDate(data['endDate']) : undefined,
          healthInsuranceGrade: data['healthInsuranceGrade'],
          pensionInsuranceGrade: data['pensionInsuranceGrade'],
          careInsuranceGrade: data['careInsuranceGrade'],
          standardMonthlyAmount: data['standardMonthlyAmount'],
          reason: data['reason'],
          inputData: data['inputData'],
          createdAt: this.convertToDate(data['createdAt']),
          updatedAt: this.convertToDate(data['updatedAt']),
        });
      });

      // employee_gradesコレクションから手入力と定時決定データを読み込み
      const gradeTypes = [
        { type: 'manual', docId: `${this.employeeId}_manual` },
        { type: 'regular', docId: `${this.employeeId}_regular` },
      ];

      for (const gradeType of gradeTypes) {
        const employeeGradeDocRef = doc(this.firestore, 'employee_grades', gradeType.docId);
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

          // 標準報酬月額を取得（手入力の場合はmonthlyAmount、定時決定の場合はaverageAmount）
          const standardMonthlyAmount =
            gradeType.type === 'manual' ? data['monthlyAmount'] : data['averageAmount'];

          // 判定理由を設定
          const reason =
            gradeType.type === 'manual' ? '手入力による等級判定' : '定時決定による等級判定';

          // 入力データを設定
          const inputData =
            gradeType.type === 'manual'
              ? { manualAmount: data['monthlyAmount'] }
              : {
                  targetYear: data['targetYear'],
                  monthlyPayments: data['monthlyPayments'],
                  averageAmount: data['averageAmount'],
                };

          const gradeRecord: GradeJudgmentRecord = {
            id: employeeGradeDoc.id,
            employeeId: this.employeeId,
            judgmentType: gradeType.type as 'manual' | 'regular',
            judgmentDate: this.convertToDate(data['updatedAt']),
            effectiveDate: effectiveDate,
            endDate: endDate,
            healthInsuranceGrade: judgmentResult['healthInsuranceGrade'],
            pensionInsuranceGrade: judgmentResult['pensionInsuranceGrade'],
            careInsuranceGrade: judgmentResult['careInsuranceGrade'],
            standardMonthlyAmount: standardMonthlyAmount,
            reason: reason,
            inputData: inputData,
            createdAt: this.convertToDate(data['createdAt']),
            updatedAt: this.convertToDate(data['updatedAt']),
          };

          this.judgmentRecords.push(gradeRecord);
        }
      }

      // 効力発生日の降順でソート
      this.judgmentRecords.sort((a, b) => {
        // 安全なソート: effectiveDateがDateオブジェクトでない可能性があるため、チェックを行う
        const timeA = a.effectiveDate instanceof Date ? a.effectiveDate.getTime() : 0;
        const timeB = b.effectiveDate instanceof Date ? b.effectiveDate.getTime() : 0;
        return timeB - timeA;
      });

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
          healthInsuranceGrade: 18n,
          pensionInsuranceGrade: 18n,
          careInsuranceGrade: 18n,
          standardMonthlyAmount: '280000',
          reason: '手入力による等級決定',
          inputData: {
            manualAmount: '280000',
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
          healthInsuranceGrade: 19n,
          pensionInsuranceGrade: 19n,
          careInsuranceGrade: 19n,
          standardMonthlyAmount: '300000',
          reason: '定時決定による等級改定',
          inputData: {
            averageMonthly: '300000',
            totalBonus: '900000',
            annualTotal: '4500000',
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
    if (SocialInsuranceCalculator.compare(amount, '0') > 0) {
      const grade = this.getGradeFromAmount(amount);
      this.dialogData.healthInsuranceGrade = grade;
      this.dialogData.pensionInsuranceGrade = grade;

      // 40歳以上の場合のみ介護保険料等級を設定
      if (this.employeeInfo && this.employeeInfo.age >= 40n) {
        this.dialogData.careInsuranceGrade = grade;
      }
    }
  }

  private getGradeFromAmount(amount: string): bigint {
    // 簡易的な等級計算（実際は詳細な等級表を使用）
    const amountNum = BigInt(amount);
    if (amountNum <= 88000n) return 1n;
    if (amountNum <= 98000n) return 2n;
    if (amountNum <= 104000n) return 3n;
    if (amountNum <= 110000n) return 4n;
    if (amountNum <= 118000n) return 5n;
    if (amountNum <= 126000n) return 6n;
    if (amountNum <= 134000n) return 7n;
    if (amountNum <= 142000n) return 8n;
    if (amountNum <= 150000n) return 9n;
    if (amountNum <= 160000n) return 10n;
    if (amountNum <= 170000n) return 11n;
    if (amountNum <= 180000n) return 12n;
    if (amountNum <= 190000n) return 13n;
    if (amountNum <= 200000n) return 14n;
    if (amountNum <= 220000n) return 15n;
    if (amountNum <= 240000n) return 16n;
    if (amountNum <= 260000n) return 17n;
    if (amountNum <= 280000n) return 18n;
    if (amountNum <= 300000n) return 19n;
    if (amountNum <= 320000n) return 20n;
    if (amountNum <= 340000n) return 21n;
    if (amountNum <= 360000n) return 22n;
    if (amountNum <= 380000n) return 23n;
    if (amountNum <= 410000n) return 24n;
    if (amountNum <= 440000n) return 25n;
    if (amountNum <= 470000n) return 26n;
    if (amountNum <= 500000n) return 27n;
    if (amountNum <= 530000n) return 28n;
    if (amountNum <= 560000n) return 29n;
    if (amountNum <= 590000n) return 30n;
    return 31n; // 590000円超
  }

  private calculateStandardMonthlyAmount(averageMonthly: string): string {
    // 標準報酬月額の計算ロジック（Decimal.jsを使用した正確な計算）
    return SocialInsuranceCalculator.roundToThousand(averageMonthly);
  }

  async saveJudgment(): Promise<void> {
    if (!this.employeeId || !this.isDialogValid()) {
      this.errorMessage = '入力内容に不備があります。';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const judgmentsRef = collection(
        this.firestore,
        'gradeJudgments',
        this.employeeId,
        'judgments'
      );
      const newEffectiveDate = new Date(this.dialogData.effectiveDate);

      // 既存の「継続中」の履歴を探してendDateを設定する
      const q = query(judgmentsRef, where('endDate', '==', null));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        // 複数の「継続中」が見つかった場合は、最も新しいeffectiveDateのものだけを更新対象とする
        const latestRecord = querySnapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }) as { id: string; effectiveDate: Timestamp })
          .sort(
            (a, b) =>
              (b.effectiveDate as Timestamp).toMillis() - (a.effectiveDate as Timestamp).toMillis()
          )[0];

        // 新しい等級の適用開始日の前日を計算
        const newEndDate = new Date(newEffectiveDate.getTime() - 24 * 60 * 60 * 1000);

        // 新しい開始日が既存の開始日より後の場合のみ更新
        if (newEffectiveDate > (latestRecord.effectiveDate as Timestamp).toDate()) {
          const docToUpdateRef = doc(judgmentsRef, latestRecord.id);
          await updateDoc(docToUpdateRef, {
            endDate: Timestamp.fromDate(newEndDate),
            updatedAt: Timestamp.now(),
          });
        }
      }

      // 新しい等級履歴データを作成
      const newJudgmentData = {
        employeeId: this.employeeId,
        judgmentType: this.dialogData.judgmentType,
        judgmentDate: Timestamp.now(), // 仮。本来は判定日が入る
        effectiveDate: Timestamp.fromDate(newEffectiveDate),
        endDate: null, // 常にnullで保存
        healthInsuranceGrade: this.dialogData.healthInsuranceGrade,
        pensionInsuranceGrade: this.dialogData.pensionInsuranceGrade,
        standardMonthlyAmount: this.dialogData.standardMonthlyAmount,
        reason: this.dialogData.reason,
        inputData: this.dialogData.inputData,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      // 新しいドキュメントを 'judgments' サブコレクションに追加
      await addDoc(judgmentsRef, newJudgmentData);

      this.closeDialog();
      await this.loadJudgmentHistory(); // 履歴を再読み込みして表示を更新
    } catch (error) {
      console.error('等級履歴の保存エラー:', error);
      this.errorMessage = '等級履歴の保存に失敗しました。';
    } finally {
      this.isLoading = false;
    }
  }

  async deleteJudgment(recordId: string): Promise<void> {
    if (!this.employeeId) {
      this.errorMessage = '従業員IDが不明です。';
      return;
    }

    const recordToDelete = this.judgmentRecords.find((r) => r.id === recordId);
    if (!recordToDelete) {
      this.errorMessage = '削除対象のレコードが見つかりません。';
      return;
    }

    const confirmed = confirm(
      `この等級履歴（${this.getJudgmentTypeLabel(
        recordToDelete.judgmentType
      )}）を本当に削除しますか？この操作は元に戻せません。`
    );
    if (!confirmed) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      let docRef;
      const judgmentType = recordToDelete.judgmentType;

      if (judgmentType === 'manual' || judgmentType === 'regular') {
        // 'employee_grades'コレクションから削除
        docRef = doc(this.firestore, 'employee_grades', recordId);
      } else {
        // 'gradeJudgments/{employeeId}/judgments' サブコレクションから削除
        docRef = doc(this.firestore, 'gradeJudgments', this.employeeId, 'judgments', recordId);
      }

      await deleteDoc(docRef);

      // 履歴を再読み込みして表示を更新
      await this.loadJudgmentHistory();
      alert('履歴を削除しました。');
    } catch (error) {
      console.error('等級履歴の削除エラー:', error);
      this.errorMessage = '履歴の削除に失敗しました。';
    } finally {
      this.isLoading = false;
    }
  }

  isDialogValid(): boolean {
    return !!(
      this.dialogData.effectiveDate &&
      SocialInsuranceCalculator.compare(this.dialogData.standardMonthlyAmount, '0') > 0 &&
      this.dialogData.healthInsuranceGrade > 0n &&
      this.dialogData.pensionInsuranceGrade > 0n &&
      this.dialogData.reason.trim()
    );
  }

  private getInitialDialogData(): JudgmentDialogData {
    return {
      judgmentType: 'manual',
      effectiveDate: '',
      standardMonthlyAmount: '0',
      healthInsuranceGrade: 0n,
      pensionInsuranceGrade: 0n,
      careInsuranceGrade: undefined,
      reason: '',
      inputData: {},
    };
  }

  private calculateAge(birthDate: Date): bigint {
    const today = new Date();
    let age = BigInt(today.getFullYear()) - BigInt(birthDate.getFullYear());
    const m = BigInt(today.getMonth()) - BigInt(birthDate.getMonth());
    if (
      m < BigInt(0) ||
      (m === BigInt(0) && BigInt(today.getDate()) < BigInt(birthDate.getDate()))
    ) {
      age = age - BigInt(1);
    }
    return age;
  }

  /**
   * FirestoreのTimestampかもしれない値をDateオブジェクトに変換する
   * @param dateValue Timestamp | Date
   * @returns Date
   */
  private convertToDate(dateValue: { toDate: () => Date } | Date): Date {
    if (dateValue && 'toDate' in dateValue && typeof dateValue.toDate === 'function') {
      return dateValue.toDate();
    }
    return dateValue as Date;
  }

  getJudgmentTypeLabel(type: string): string {
    switch (type) {
      case 'manual':
        return '手入力';
      case 'regular':
        return '定時決定';
      case 'revision':
        return '随時改定';
      default:
        return type;
    }
  }

  formatDate(date: Date): string {
    // 安全な日付フォーマット：dateがDateオブジェクトであることを確認
    if (!(date instanceof Date)) {
      return '無効な日付';
    }
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // getMonth()は0から始まるため+1する
    return `${year}年${month}月`;
  }

  formatCurrency(amount: string): string {
    if (!amount || amount === '0') return '';
    return amount + '円';
  }

  goBack(): void {
    // 従業員の給与賞与詳細画面に戻る
    this.router.navigate(['/employee-salary-bonus/detail', this.employeeId]);
  }

  navigateToManualAdd(): void {
    this.router.navigate(['/manual-grade-add', this.employeeId]);
  }

  navigateToRegularDeterminationAdd(): void {
    this.router.navigate(['/regular-determination-add', this.employeeId]);
  }

  navigateToRevisionAdd(): void {
    this.router.navigate(['/revision-add', this.employeeId]);
  }
}
