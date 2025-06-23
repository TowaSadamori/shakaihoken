import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  deleteDoc,
} from 'firebase/firestore';
import { FormsModule } from '@angular/forms';
import { CommonModule, Location } from '@angular/common';
import {
  BonusCalculationService,
  CalculatedBonusHistoryItem,
  BonusPremiumResult,
} from '../services/bonus-calculation.service';
import { OfficeService } from '../services/office.service';
import { doc, setDoc } from 'firebase/firestore';
import { AuthService } from '../services/auth.service';

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

// ピボットテーブル用のデータ構造
interface PivotColumn {
  header: string;
  isNumeric: boolean;
  isSeparator: boolean;
}

interface PivotRow {
  header: string;
  values: (string | undefined)[];
}

interface PivotedTable {
  columns: PivotColumn[];
  rows: PivotRow[];
}

// このコンポーネント内での表示用データ型
type DisplayBonusHistoryItem = CalculatedBonusHistoryItem & {
  leaveType: string;
  originalCalculationResult?: BonusPremiumResult;
};

@Component({
  selector: 'app-insurance-calculation-bonus',
  templateUrl: './insurance-calculation-bonus.component.html',
  styleUrls: ['./insurance-calculation-bonus.component.scss'],
  standalone: true,
  imports: [FormsModule, CommonModule],
})
export class InsuranceCalculationBonusComponent implements OnInit {
  // 従業員情報
  employeeInfo: EmployeeInfo | null = null;
  employeeId = '';
  targetYear = BigInt(new Date().getFullYear());

  // 賞与データリスト
  bonusDataList: DisplayBonusHistoryItem[] = [];

  // ピボットテーブル用データ
  pivotedTable: PivotedTable | null = null;

  // UI状態
  isLoading = false;
  errorMessage = '';
  importStatusMessage = '';

  // 注記関連
  hasLimitApplied = false;
  limitNotes: string[] = [];

  private firestore = getFirestore();
  private uid: string | null = null;

  // 育休産休プルダウンの状態を管理
  updateLeaveStatus(index: number, leaveType: string): void {
    if (this.bonusDataList && this.bonusDataList[index]) {
      this.bonusDataList[index].leaveType = leaveType;
      // プルダウンの変更に応じて計算結果を更新
      this.updateCalculationForLeave(index);
      this.createPivotedTable();
    }
  }

  onLeaveStatusChange(event: Event, index: number): void {
    const target = event.target as HTMLSelectElement;
    this.updateLeaveStatus(index, target.value);
  }

  // 安全に休業タイプを取得するヘルパーメソッド
  getLeaveType(index: number): string {
    return this.bonusDataList && this.bonusDataList[index]
      ? this.bonusDataList[index].leaveType || 'none'
      : 'none';
  }

  private updateCalculationForLeave(index: number): void {
    const item = this.bonusDataList && this.bonusDataList[index];
    if (!item) return;

    console.log(`🔄 保険料計算更新: index=${index}, leaveType=${item.leaveType}`);

    if (item.leaveType === 'maternity' || item.leaveType === 'childcare') {
      // 産休・育休の場合は保険料を0にする
      console.log(`💤 休業適用: ${item.leaveType} - 保険料を0に設定`);
      // 元の計算結果をバックアップ
      if (!item.originalCalculationResult) {
        item.originalCalculationResult = { ...item.calculationResult };
      }
      item.calculationResult.healthInsurance = { employeeBurden: '0', companyBurden: '0' };
      item.calculationResult.pensionInsurance = { employeeBurden: '0', companyBurden: '0' };
      if (item.calculationResult.careInsurance) {
        item.calculationResult.careInsurance = { employeeBurden: '0', companyBurden: '0' };
      }
    } else {
      // 通常の計算に戻す
      console.log(`💼 通常勤務: 保険料をバックアップから復元`);
      this.recalculateItemPremiums(index);
    }
  }

  private async recalculateItemPremiums(index: number): Promise<void> {
    const item = this.bonusDataList && this.bonusDataList[index];
    if (item && item.originalCalculationResult) {
      // バックアップから元の計算結果を復元
      item.calculationResult = { ...item.originalCalculationResult };
      // バックアップをクリアし、プロパティを削除
      delete item.originalCalculationResult;
    }
  }

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private officeService: OfficeService,
    private bonusCalculationService: BonusCalculationService,
    private location: Location,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    this.isLoading = true;
    const employeeId = this.route.snapshot.paramMap.get('employeeId');
    const yearQueryParam = this.route.snapshot.queryParamMap.get('year');
    this.targetYear = yearQueryParam ? BigInt(yearQueryParam) : this.getFiscalYear(new Date());

    if (employeeId) {
      this.employeeId = employeeId;
      await this.loadEmployeeInfo();
      // 従業員情報読み込み後に、賞与データを読み込む
      if (this.employeeInfo) {
        await this.loadBonusData();
      }
    } else {
      this.errorMessage = '従業員IDが見つかりません。';
    }
    this.isLoading = false;
  }

  /**
   * 従業員情報の読み込み
   */
  async loadEmployeeInfo() {
    try {
      const companyId = await this.authService.getCurrentUserCompanyId();
      if (!companyId) {
        throw new Error('会社IDが取得できませんでした。');
      }
      const usersRef = collection(this.firestore, 'users');
      const q = query(
        usersRef,
        where('employeeNumber', '==', this.employeeId),
        where('companyId', '==', companyId)
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        this.uid = userDoc.id; // UIDをクラスプロパティに保存
        const birthDate = new Date(userData['birthDate']);
        let addressPrefecture = userData['addressPrefecture'] || '';

        if (!addressPrefecture && userData['companyId'] && userData['branchNumber']) {
          try {
            addressPrefecture = await this.officeService.findOfficeAddressPrefecture(
              userData['companyId'],
              userData['branchNumber']
            );
          } catch (officeError) {
            console.error('事業所所在地取得エラー:', officeError);
            addressPrefecture = '東京都'; // フォールバック
          }
        }

        this.employeeInfo = {
          uid: this.uid,
          name: `${userData['lastName'] || ''} ${userData['firstName'] || ''}`.trim(),
          employeeNumber: userData['employeeNumber'] || '',
          birthDate: birthDate.toISOString().split('T')[0],
          age: this.calculateAge(birthDate),
          companyId: userData['companyId'] || '',
          branchNumber: userData['branchNumber'] || '',
          addressPrefecture: addressPrefecture,
        };
      } else {
        this.errorMessage = '従業員情報が見つかりません';
      }
    } catch (error) {
      console.error('従業員情報読み込みエラー:', error);
      this.errorMessage = '従業員情報の読み込みに失敗しました';
    }
  }

  /**
   * 年齢計算
   */
  private calculateAge(birthDate: Date): bigint {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return BigInt(age);
  }

  /**
   * 賞与データの取り込みと計算
   */
  async loadBonusData() {
    if (!this.employeeInfo) {
      this.errorMessage = '従業員情報が読み込まれていないため、賞与データを取得できません。';
      return;
    }

    this.isLoading = true;
    this.importStatusMessage = '賞与データを読み込んでいます...';

    try {
      // 既存の賞与データを読み込む
      const savedData = await this.loadSavedBonusData();

      if (savedData && savedData.length > 0) {
        // 保存済みデータがある場合はそれを表示
        this.bonusDataList = savedData.map((item) => ({
          ...item,
          leaveType: item.leaveType || 'none',
        }));
        this.importStatusMessage = '保存済みの賞与データを表示します。';
      } else {
        // 保存済みデータがない場合は、給与情報からデフォルトの賞与データを生成
        const bonusItems = await this.bonusCalculationService.getCalculatedBonusHistory(
          this.employeeInfo.uid,
          this.targetYear,
          {
            age: this.employeeInfo.age,
            addressPrefecture: this.employeeInfo.addressPrefecture,
            companyId: this.employeeInfo.companyId,
            birthDate: this.employeeInfo.birthDate,
          }
        );
        this.bonusDataList = bonusItems.map((item: CalculatedBonusHistoryItem) => ({
          ...item,
          leaveType: 'none', // 初期値
        }));
        this.importStatusMessage = '給与情報から賞与データを生成しました。';
      }
      this.createPivotedTable();
    } catch (error) {
      console.error('賞与データのインポートまたは計算エラー:', error);
      this.errorMessage = `賞与データの処理中にエラーが発生しました: ${error}`;
      this.importStatusMessage = '';
    } finally {
      this.isLoading = false;
      this.updateLimitNotes();
    }
  }

  /**
   * Firestoreから保存済みの賞与データを読み込む
   */
  private async loadSavedBonusData(): Promise<DisplayBonusHistoryItem[]> {
    if (!this.uid || !this.employeeInfo?.companyId) {
      return [];
    }
    const docPath = `companies/${this.employeeInfo.companyId}/employees/${this.uid}/bonus_calculation_results/${this.targetYear}`;
    const docRef = doc(this.firestore, docPath);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      // 'bonusResults' は配列であると仮定
      return (data['bonusResults'] as CalculatedBonusHistoryItem[]).map((item) => ({
        ...item,
        leaveType: item.leaveType || 'none',
      }));
    } else {
      return [];
    }
  }

  async importBonusData() {
    await this.loadBonusData();
  }

  /**
   * ピボット形式のテーブルデータを生成する
   */
  private createPivotedTable() {
    if (!this.bonusDataList || this.bonusDataList.length === 0) {
      this.pivotedTable = null;
      return;
    }

    const columns: PivotColumn[] = [
      { header: '育休産休', isNumeric: false, isSeparator: false },
      { header: '支給額', isNumeric: true, isSeparator: false },
      { header: '標準賞与額', isNumeric: true, isSeparator: false },
      { header: '---', isNumeric: false, isSeparator: true },
      { header: '健康保険料率', isNumeric: true, isSeparator: false },
      { header: '健康保険料(個人)', isNumeric: true, isSeparator: false },
      { header: '健康保険料(会社)', isNumeric: true, isSeparator: false },
      { header: '---', isNumeric: false, isSeparator: true },
      { header: '介護保険料率', isNumeric: true, isSeparator: false },
      { header: '介護保険料(個人)', isNumeric: true, isSeparator: false },
      { header: '介護保険料(会社)', isNumeric: true, isSeparator: false },
      { header: '---', isNumeric: false, isSeparator: true },
      { header: '厚生年金保険料率', isNumeric: true, isSeparator: false },
      { header: '厚生年金保険料(個人)', isNumeric: true, isSeparator: false },
      { header: '厚生年金保険料(会社)', isNumeric: true, isSeparator: false },
      { header: '---', isNumeric: false, isSeparator: true },
      {
        header: '厚生年金<br>上限適用後標準賞与額',
        isNumeric: true,
        isSeparator: false,
      },
      {
        header: '健康保険<br>上限適用後標準賞与額',
        isNumeric: true,
        isSeparator: false,
      },
    ];

    const rows: PivotRow[] = this.bonusDataList.map((item, index) => {
      const values = [
        `checkbox_${index}`, // チェックボックス用のプレースホルダー
        this.formatAmount(item.amount),
        this.formatAmount(item.calculationResult.standardBonusAmount),
        '', // Separator
        this.formatPercentage(item.calculationResult.healthInsuranceRate),
        this.formatAmount(item.calculationResult.healthInsurance.employeeBurden),
        this.formatAmount(item.calculationResult.healthInsurance.companyBurden),
        '', // Separator
        item.calculationResult.careInsuranceRate
          ? this.formatPercentage(item.calculationResult.careInsuranceRate)
          : '-',
        item.calculationResult.careInsurance
          ? this.formatAmount(item.calculationResult.careInsurance.employeeBurden)
          : '-',
        item.calculationResult.careInsurance
          ? this.formatAmount(item.calculationResult.careInsurance.companyBurden)
          : '-',
        '', // Separator
        this.formatPercentage(item.calculationResult.pensionInsuranceRate),
        this.formatAmount(item.calculationResult.pensionInsurance.employeeBurden),
        this.formatAmount(item.calculationResult.pensionInsurance.companyBurden),
        '', // Separator
        this.formatAmount(item.calculationResult.cappedPensionStandardAmount),
        this.formatAmount(item.calculationResult.applicableHealthStandardAmount),
      ];

      return {
        header: `賞与(${index + 1}回目)<br>${item.paymentDate || ''}`,
        values,
      };
    });

    this.pivotedTable = { columns, rows };
  }

  /**
   * 上限適用に関する注記を更新
   */
  private updateLimitNotes() {
    this.limitNotes = [];
    this.hasLimitApplied = this.bonusDataList.some(
      (item) =>
        item.calculationResult.isHealthLimitApplied || item.calculationResult.isPensionLimitApplied
    );

    if (this.hasLimitApplied) {
      this.bonusDataList.forEach((item) => {
        if (item.calculationResult.isHealthLimitApplied) {
          this.limitNotes.push(
            `【${item.paymentDate}】健康保険: 年度累計が上限(573万円)を超えたため標準賞与額が調整されました。`
          );
        }
        if (item.calculationResult.isPensionLimitApplied) {
          this.limitNotes.push(
            `【${item.paymentDate}】厚生年金: 標準賞与額が上限(150万円)を超えたため調整されました。`
          );
        }
      });
    }
  }

  /**
   * 戻るボタン
   */
  goBack() {
    this.location.back();
  }

  formatAmount(amount: string | undefined): string {
    if (amount === null || amount === undefined || amount.trim() === '' || amount === '-') {
      return '-';
    }
    const num = Number(amount);
    if (isNaN(num)) {
      return amount;
    }
    return num.toLocaleString('ja-JP', {
      maximumFractionDigits: 2,
    });
  }

  formatPercentage(rate: string | undefined): string {
    if (!rate) return '-';
    if (rate.includes('%')) {
      return rate;
    }
    const num = parseFloat(rate);
    if (isNaN(num)) {
      return rate;
    }
    return `${num.toFixed(3)}%`;
  }

  formatFiscalYear(fiscalYear: bigint): string {
    return `${fiscalYear.toString()}年度`;
  }

  private getFiscalYear(date: Date): bigint {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return BigInt(month >= 4 ? year : year - 1);
  }

  async changeYear(delta: number) {
    this.targetYear = this.targetYear + BigInt(delta);
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { year: this.targetYear.toString() },
      queryParamsHandling: 'merge',
    });
    await this.loadBonusData();
  }

  async previousYear() {
    await this.changeYear(-1);
  }

  async nextYear() {
    await this.changeYear(1);
  }

  async currentYear() {
    this.targetYear = this.getFiscalYear(new Date());
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { year: this.targetYear.toString() },
      queryParamsHandling: 'merge',
    });
    await this.loadBonusData();
  }

  async saveBonusResults(): Promise<void> {
    console.log('🔧 saveBonusResults() 開始');
    console.log('🔧 employeeInfo:', this.employeeInfo);
    console.log('🔧 bonusDataList.length:', this.bonusDataList?.length);
    console.log('🔧 uid:', this.uid);

    if (!this.employeeInfo || !this.bonusDataList.length || !this.uid) {
      this.errorMessage = '保存するデータがありません。';
      console.log('🔧 保存データ不足でリターン');
      return;
    }

    try {
      this.isLoading = true;
      this.errorMessage = '';
      const { companyId, employeeNumber } = this.employeeInfo;

      const saveData = {
        companyId: companyId,
        uid: this.uid,
        employeeId: employeeNumber,
        targetYear: Number(this.targetYear),
        bonusResults: this.bonusDataList.map((item) => {
          // 育休産休の場合は保険料を0にして保存
          let calculationResult = { ...item.calculationResult };

          if (item.leaveType === 'maternity' || item.leaveType === 'childcare') {
            calculationResult = {
              ...calculationResult,
              healthInsurance: { employeeBurden: '0', companyBurden: '0' },
              pensionInsurance: { employeeBurden: '0', companyBurden: '0' },
              careInsurance: calculationResult.careInsurance
                ? { employeeBurden: '0', companyBurden: '0' }
                : calculationResult.careInsurance,
            };
          }

          return this.cleanDataForFirestore({
            type: item.type,
            amount: item.amount,
            month: Number(item.month),
            year: Number(item.year),
            paymentDate: item.paymentDate || '',
            leaveType: item.leaveType || 'none',
            originalKey: item.originalKey || '',
            fiscalYear: Number(item.fiscalYear || this.targetYear),
            calculationResult: calculationResult,
          });
        }),
        updatedAt: new Date(),
        updatedBy: 'system',
      };

      // デバッグ: 保存データをログ出力
      console.log('Firestore保存データ:', saveData);

      const docPath = `companies/${companyId}/employees/${this.uid}/bonus_calculation_results/${this.targetYear}`;
      const docRef = doc(this.firestore, docPath);

      console.log('保存先パス:', docPath);
      console.log('保存前の詳細データ:', JSON.stringify(saveData, null, 2));

      // 既存ドキュメントを削除してから新規作成（完全な置き換えを保証）
      try {
        await deleteDoc(docRef);
        console.log('🗑️ 既存ドキュメント削除完了');
      } catch (deleteError) {
        console.log('ℹ️ 削除対象ドキュメントが存在しないか、削除できませんでした:', deleteError);
      }

      // 新規ドキュメントとして作成
      await setDoc(docRef, this.cleanDataForFirestore(saveData));

      console.log('✅ Firestore保存完了');

      // 保存確認のため、データを再読み込み
      const verifyDoc = await getDoc(docRef);
      if (verifyDoc.exists()) {
        const savedData = verifyDoc.data();
        console.log('📋 保存確認データ:', savedData);
        console.log(
          '📋 保存されたleaveType:',
          savedData['bonusResults']?.map((item: unknown, index: number) => ({
            index,
            leaveType:
              typeof item === 'object' && item !== null && 'leaveType' in item
                ? item.leaveType
                : 'unknown',
            paymentDate:
              typeof item === 'object' && item !== null && 'paymentDate' in item
                ? item.paymentDate
                : 'unknown',
          }))
        );
      } else {
        console.error('❌ 保存確認失敗: ドキュメントが見つかりません');
      }

      alert('賞与計算結果を正常に保存しました。');
    } catch (error) {
      console.error('保存エラー:', error);
      this.errorMessage = '保存中にエラーが発生しました。もう一度お試しください。';
    } finally {
      this.isLoading = false;
    }
  }

  // Firestore保存用にデータをクリーンアップ（undefined値を除去）
  private cleanDataForFirestore(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return null;
    }

    if (obj instanceof Date) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.cleanDataForFirestore(item));
    }

    if (typeof obj === 'object' && obj !== null) {
      const cleaned: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined) {
          cleaned[key] = this.cleanDataForFirestore(value);
        }
      }
      return cleaned;
    }

    return obj;
  }
}
