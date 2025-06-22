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
} from '../services/bonus-calculation.service';
import { OfficeService } from '../services/office.service';
import { doc, setDoc } from 'firebase/firestore';

interface EmployeeInfo {
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
  bonusDataList: CalculatedBonusHistoryItem[] = [];

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
      item.calculationResult.healthInsurance = { employeeBurden: '0', companyBurden: '0' };
      item.calculationResult.pensionInsurance = { employeeBurden: '0', companyBurden: '0' };
      if (item.calculationResult.careInsurance) {
        item.calculationResult.careInsurance = { employeeBurden: '0', companyBurden: '0' };
      }
    } else {
      // 通常の計算に戻す（再計算が必要）
      console.log(`💼 通常勤務: 保険料を再計算`);
      this.recalculateItemPremiums(index);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async recalculateItemPremiums(_index: number): Promise<void> {
    // 必要に応じて保険料の再計算を実装
    // 現在は簡略化のため、データを再読み込み
    await this.loadBonusData();
  }

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private officeService: OfficeService,
    private bonusCalculationService: BonusCalculationService,
    private location: Location
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
      const usersRef = collection(this.firestore, 'users');
      const q = query(usersRef, where('employeeNumber', '==', this.employeeId));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data();
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
    this.errorMessage = '';
    this.importStatusMessage = '';
    this.bonusDataList = [];

    try {
      // 1. 賞与データを取得・計算
      const results = await this.bonusCalculationService.getCalculatedBonusHistory(
        this.employeeId,
        this.targetYear,
        this.employeeInfo
      );

      // 2. 保存された育休産休データを読み込み
      const savedData = await this.loadSavedBonusData();

      // 3. leaveTypeを初期化（保存されたデータがあれば復元）
      this.bonusDataList = results.map((item, index) => {
        // 型を明示的にキャストしてleaveTypeプロパティを確実に追加
        const bonusItem = item as CalculatedBonusHistoryItem & { leaveType: string };

        bonusItem.leaveType =
          savedData &&
          typeof savedData === 'object' &&
          savedData !== null &&
          'bonusResults' in savedData &&
          Array.isArray(savedData.bonusResults) &&
          savedData.bonusResults[index] &&
          typeof savedData.bonusResults[index] === 'object' &&
          savedData.bonusResults[index] !== null &&
          'leaveType' in savedData.bonusResults[index]
            ? String(savedData.bonusResults[index].leaveType) || 'none'
            : 'none';

        return bonusItem;
      });

      // 4. 保存されたleaveTypeに基づいて保険料を再計算
      this.bonusDataList.forEach((item, index) => {
        if (item.leaveType === 'maternity' || item.leaveType === 'childcare') {
          console.log(`📋 読み込み時休業適用: index=${index}, leaveType=${item.leaveType}`);
          item.calculationResult.healthInsurance = { employeeBurden: '0', companyBurden: '0' };
          item.calculationResult.pensionInsurance = { employeeBurden: '0', companyBurden: '0' };
          if (item.calculationResult.careInsurance) {
            item.calculationResult.careInsurance = { employeeBurden: '0', companyBurden: '0' };
          }
        }
      });

      // 5. 計算結果をFirestoreに保存
      if (results.length > 0) {
        await this.bonusCalculationService.saveBonusCalculationResults(
          results,
          this.employeeId,
          this.targetYear,
          this.employeeInfo.companyId
        );
        this.importStatusMessage = `✅ ${results.length}件の賞与データを取得・計算し、保存しました。`;
      } else {
        this.importStatusMessage = '対象年度の賞与データはありません。';
      }

      // 6. 画面表示を更新
      this.updateLimitNotes();
      this.createPivotedTable();
    } catch (error) {
      console.error('賞与データの取得・計算・保存エラー:', error);
      this.errorMessage = '賞与データの処理中にエラーが発生しました。';
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * 保存された賞与データを読み込み
   */
  private async loadSavedBonusData(): Promise<unknown> {
    try {
      if (!this.employeeInfo) return null;

      const docRef = doc(
        this.firestore,
        'bonusCalculationResults',
        `${this.employeeInfo.employeeNumber}_${this.targetYear}`
      );
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return docSnap.data();
      }
      return null;
    } catch (error) {
      console.warn('保存されたデータの読み込みに失敗:', error);
      return null;
    }
  }

  /**
   * 賞与データ取り込みボタンの処理
   */
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
    if (!this.employeeInfo || !this.bonusDataList.length) {
      this.errorMessage = '保存するデータがありません。';
      return;
    }

    try {
      this.isLoading = true;
      this.errorMessage = '';

      // デバッグ: 保存前のleaveTypeをログ出力
      console.log(
        '保存前のleaveType状態:',
        this.bonusDataList.map((item, index) => ({
          index,
          leaveType: item.leaveType,
          paymentDate: item.paymentDate,
          hasLeaveTypeProperty: 'leaveType' in item,
          itemKeys: Object.keys(item),
        }))
      );

      const saveData = {
        employeeId: this.employeeInfo.employeeNumber,
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

      const docRef = doc(
        this.firestore,
        'bonusCalculationResults',
        `${this.employeeInfo.employeeNumber}_${this.targetYear}`
      );

      console.log(
        '保存先パス:',
        `bonusCalculationResults/${this.employeeInfo.employeeNumber}_${this.targetYear}`
      );
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
