import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import {
  getFirestore,
  collection,
  doc,
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
import { AuthService } from '../services/auth.service';
import { DateUtils } from '../utils/date-utils';

interface EmployeeInfo {
  uid: string;
  name: string;
  employeeNumber: string;
  birthDate: string;
  age: number;
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
  judgmentReason?: string;
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
  judgmentReason?: string;
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
  private companyId: string | null = null;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private officeService: OfficeService,
    private authService: AuthService
  ) {}

  async ngOnInit(): Promise<void> {
    this.employeeId = this.route.snapshot.paramMap.get('employeeId');
    if (!this.employeeId) {
      this.errorMessage = '従業員番号がURLに含まれていません';
      return;
    }
    await this.loadData();
  }

  async loadData(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.companyId = await this.authService.getCurrentUserCompanyId();
      if (!this.companyId) {
        throw new Error('会社IDが取得できませんでした。');
      }

      // 従業員情報を先に読み込む
      await this.loadEmployeeInfo();
      // 従業員情報が読み込めたら、給与と履歴を並行して読み込む
      if (this.employeeInfo) {
        await Promise.all([this.loadSalaryData(), this.loadJudgmentHistory()]);
      }
    } catch (error) {
      console.error('データ読み込みエラー:', error);
      if (error instanceof Error) {
        this.errorMessage = error.message;
      } else {
        this.errorMessage = 'データの読み込みに失敗しました';
      }
    } finally {
      this.isLoading = false;
    }
  }

  private async loadEmployeeInfo(): Promise<void> {
    if (!this.employeeId || !this.companyId) {
      this.errorMessage = '従業員IDまたは会社IDが指定されていません';
      return;
    }

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
      const formattedBirthDate = DateUtils.formatToYMD(birthDate);
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
      throw new Error(`従業員番号: ${this.employeeId} の情報が見つかりません`);
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
    if (!this.companyId || !this.employeeInfo?.uid) return;

    try {
      this.judgmentRecords = [];
      const historyCollectionRef = collection(
        this.firestore,
        `companies/${this.companyId}/employees/${this.employeeInfo.uid}/gradeHistory`
      );
      console.log('>>> [LOAD] Loading from path:', historyCollectionRef.path);
      const q = query(historyCollectionRef, orderBy('effectiveDate', 'desc'));

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
          judgmentReason: data['judgmentReason'],
          inputData: data['inputData'],
          createdAt: this.convertToDate(data['createdAt']),
          updatedAt: this.convertToDate(data['updatedAt']),
        });
      });

      // 効力発生日の降順でソート
      this.judgmentRecords.sort((a, b) => {
        const timeA = a.effectiveDate instanceof Date ? a.effectiveDate.getTime() : 0;
        const timeB = b.effectiveDate instanceof Date ? b.effectiveDate.getTime() : 0;
        return timeB - timeA;
      });

      console.log('等級判定履歴を読み込みました:', this.judgmentRecords);
    } catch (error) {
      console.error('等級判定履歴取得エラー:', error);
      this.errorMessage = '履歴の読み込みに失敗しました。';
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
    return SocialInsuranceCalculator.roundToThousand(averageMonthly);
  }

  async saveJudgment(): Promise<void> {
    if (!this.employeeId || !this.companyId || !this.employeeInfo?.uid || !this.isDialogValid()) {
      this.errorMessage = '入力内容に不備があります。';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      const judgmentsRef = collection(this.firestore, 'gradeJudgments');
      const newEffectiveDate = new Date(this.dialogData.effectiveDate);

      const q = query(
        judgmentsRef,
        where('employeeId', '==', this.employeeId),
        where('companyId', '==', this.companyId),
        where('endDate', '==', null)
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const latestRecord = querySnapshot.docs
          .map((d) => ({ id: d.id, ...d.data() }) as { id: string; effectiveDate: Timestamp })
          .sort((a, b) => b.effectiveDate.toMillis() - a.effectiveDate.toMillis())[0];

        const newEndDate = new Date(newEffectiveDate.getTime() - 24 * 60 * 60 * 1000);

        if (newEffectiveDate > latestRecord.effectiveDate.toDate()) {
          const docToUpdateRef = doc(judgmentsRef, latestRecord.id);
          await updateDoc(docToUpdateRef, {
            endDate: Timestamp.fromDate(newEndDate),
            updatedAt: Timestamp.now(),
          });
        }
      }

      const newJudgmentData = {
        uid: this.employeeInfo.uid,
        employeeId: this.employeeId,
        companyId: this.companyId,
        judgmentType: this.dialogData.judgmentType,
        judgmentDate: Timestamp.now(),
        effectiveDate: Timestamp.fromDate(newEffectiveDate),
        endDate: null,
        healthInsuranceGrade: this.dialogData.healthInsuranceGrade,
        pensionInsuranceGrade: this.dialogData.pensionInsuranceGrade,
        standardMonthlyAmount: this.dialogData.standardMonthlyAmount,
        reason: this.dialogData.reason,
        judgmentReason: this.dialogData.judgmentReason,
        inputData: this.dialogData.inputData,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await addDoc(judgmentsRef, newJudgmentData);

      this.closeDialog();
      await this.loadJudgmentHistory();
    } catch (error) {
      console.error('等級履歴の保存エラー:', error);
      this.errorMessage = '等級履歴の保存に失敗しました。';
    } finally {
      this.isLoading = false;
    }
  }

  async deleteJudgment(recordId: string): Promise<void> {
    if (!this.employeeId || !this.companyId || !this.employeeInfo?.uid) {
      this.errorMessage = '従業員ID、会社ID、またはユーザーUIDが不明です。';
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
      console.log('削除開始:', { recordId, judgmentType: recordToDelete.judgmentType });
      // 正しい階層のパスを使用する
      const historyDocRef = doc(
        this.firestore,
        `companies/${this.companyId}/employees/${this.employeeInfo.uid}/gradeHistory`,
        recordId
      );
      console.log('履歴削除:', historyDocRef.path);
      await deleteDoc(historyDocRef);

      this.judgmentRecords = this.judgmentRecords.filter((r) => r.id !== recordId);
      console.log('削除完了');
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
      judgmentReason: undefined,
      inputData: {},
    };
  }

  calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
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
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    const second = date.getSeconds();
    return `${year}年${month}月${day}日 ${hour.toString().padStart(2, '0')}:${minute
      .toString()
      .padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
  }

  // 年月のみを返すフォーマット関数
  formatYearMonth(date: Date): string {
    if (!(date instanceof Date)) {
      return '無効な日付';
    }
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return `${year}年${month}月`;
  }

  formatCurrency(amount: string): string {
    if (!amount || amount === '0') return '';
    return amount + '円';
  }

  goBack(): void {
    console.log('戻るボタンが押されました。期間重複チェックを開始します。');
    console.log('判定レコード数:', this.judgmentRecords.length);
    this.judgmentRecords.forEach((record, index) => {
      console.log(`レコード${index + 1}:`, {
        id: record.id,
        effectiveDate: record.effectiveDate,
        endDate: record.endDate,
        effectiveDateType: typeof record.effectiveDate,
        endDateType: typeof record.endDate,
      });
    });

    // 期間の重複チェックを実行
    if (this.hasOverlappingPeriods()) {
      alert('期間の重複がありますので編集で修正してください。');
      return;
    }

    console.log('重複なし。前の画面に戻ります。');
    // 給与賞与情報従業員一覧画面に戻る
    this.router.navigate(['/employee-salary-bonus']);
  }

  /**
   * 適用期間の重複をチェックする
   * @returns 重複がある場合はtrue、ない場合はfalse
   */
  private hasOverlappingPeriods(): boolean {
    console.log('hasOverlappingPeriods開始');
    if (this.judgmentRecords.length <= 1) {
      console.log('レコード数が1つ以下のため、重複なし');
      return false; // レコードが1つ以下の場合は重複なし
    }

    // 全ての期間の組み合わせをチェック
    for (let i = 0; i < this.judgmentRecords.length; i++) {
      for (let j = i + 1; j < this.judgmentRecords.length; j++) {
        const record1 = this.judgmentRecords[i];
        const record2 = this.judgmentRecords[j];

        console.log(`レコード${i + 1}とレコード${j + 1}の重複チェック:`, {
          record1: {
            id: record1.id,
            effectiveDate: record1.effectiveDate,
            endDate: record1.endDate,
          },
          record2: {
            id: record2.id,
            effectiveDate: record2.effectiveDate,
            endDate: record2.endDate,
          },
        });

        if (this.periodsOverlap(record1, record2)) {
          console.log('期間の重複を検出しました！');
          return true;
        } else {
          console.log('この組み合わせは重複なし');
        }
      }
    }

    console.log('全ての組み合わせをチェックしましたが、重複は見つかりませんでした');
    return false;
  }

  /**
   * 2つの期間が重複しているかチェックする
   * @param record1 期間1
   * @param record2 期間2
   * @returns 重複している場合はtrue
   */
  private periodsOverlap(record1: GradeJudgmentRecord, record2: GradeJudgmentRecord): boolean {
    const start1 = this.convertToDate(record1.effectiveDate);
    const end1 = record1.endDate ? this.convertToDate(record1.endDate) : null;
    const start2 = this.convertToDate(record2.effectiveDate);
    const end2 = record2.endDate ? this.convertToDate(record2.endDate) : null;

    console.log('periodsOverlap詳細:', {
      period1: {
        start: start1,
        end: end1,
        isOngoing: !end1,
      },
      period2: {
        start: start2,
        end: end2,
        isOngoing: !end2,
      },
    });

    // 期間1が継続中（終了日がnull）の場合
    if (!end1) {
      if (!end2) {
        // 両方とも継続中の場合、開始日が同じ日以降なら重複
        const overlap = start1.getTime() === start2.getTime();
        console.log('両方継続中:', { start1, start2, overlap });
        return overlap;
      } else {
        // 期間1が継続中、期間2に終了日がある場合
        // 期間2の終了日が期間1の開始日以降なら重複
        const overlap = end2 >= start1;
        console.log('期間1継続中、期間2終了あり:', { start1, end2, overlap });
        return overlap;
      }
    }

    // 期間2が継続中（終了日がnull）の場合
    if (!end2) {
      // 期間1の終了日が期間2の開始日以降なら重複
      const overlap = end1 >= start2;
      console.log('期間2継続中、期間1終了あり:', { end1, start2, overlap });
      return overlap;
    }

    // 両方の期間に終了日がある場合
    // 期間が重複している条件: start1 <= end2 && start2 <= end1
    const overlap = start1 <= end2 && start2 <= end1;
    console.log('両方に終了日あり:', { start1, end1, start2, end2, overlap });
    return overlap;
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

  editJudgment(record: GradeJudgmentRecord): void {
    if (!this.employeeId) return;

    if (record.judgmentType === 'manual' && record.id) {
      // 手入力の場合は専用画面に遷移
      this.router.navigate(['/manual-grade-add', this.employeeId, record.id], {
        state: { judgmentReason: record.judgmentReason || null },
      });
    } else if (record.judgmentType === 'regular' || record.judgmentType === 'revision') {
      let path = '';
      switch (record.judgmentType) {
        case 'regular':
          path = '/regular-determination-add';
          break;
        case 'revision':
          path = '/revision-add';
          break;
        default:
          console.warn('未対応の判定タイプ:', record.judgmentType);
          return;
      }
      this.router.navigate([path, this.employeeId, record.id]);
    } else {
      console.warn('未対応の判定タイプ:', record.judgmentType);
    }
  }
}
