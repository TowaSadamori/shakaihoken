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
import { Decimal } from 'decimal.js';
import { SocialInsuranceCalculator } from '../utils/decimal-calculator';
import { BonusAddFormComponent } from '../bonus-add-form/bonus-add-form.component';

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
  header?: string;
};

// 保険期間情報の型
interface InsurancePeriods {
  careInsurancePeriod?: { start: string; end: string };
  healthInsurancePeriod?: { start: string; end: string };
  pensionInsurancePeriod?: { start: string; end: string };
}

// Firestore保存用: bigint→string
function convertBigIntToString(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(convertBigIntToString);
  } else if (obj && typeof obj === 'object') {
    const newObj: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const value = (obj as Record<string, unknown>)[key];
      if (typeof value === 'bigint') {
        newObj[key] = value.toString();
      } else {
        newObj[key] = convertBigIntToString(value);
      }
    }
    return newObj;
  }
  return obj;
}

// Firestore取得用: string→bigint
function convertStringToBigInt(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(convertStringToBigInt);
  } else if (obj && typeof obj === 'object') {
    const newObj: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const value = (obj as Record<string, unknown>)[key];
      if (
        (key === 'month' || key === 'year' || key === 'age') &&
        typeof value === 'string' &&
        /^[0-9]+$/.test(value)
      ) {
        newObj[key] = BigInt(value);
      } else {
        newObj[key] = convertStringToBigInt(value);
      }
    }
    return newObj;
  }
  return obj;
}

@Component({
  selector: 'app-insurance-calculation-bonus',
  templateUrl: './insurance-calculation-bonus.component.html',
  styleUrls: ['./insurance-calculation-bonus.component.scss'],
  standalone: true,
  imports: [FormsModule, CommonModule, BonusAddFormComponent],
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

  // leaveTypeを日本語表示に変換
  getLeaveTypeLabel(leaveType: string): string {
    switch (leaveType) {
      case 'maternity':
        return '産休';
      case 'childcare':
        return '育休';
      case 'excluded':
        return '対象外';
      default:
        return '';
    }
  }

  private updateCalculationForLeave(index: number): void {
    const item = this.bonusDataList && this.bonusDataList[index];
    if (!item) return;

    console.log(`🔄 保険料計算更新: index=${index}, leaveType=${item.leaveType}`);

    if (item.leaveType === 'maternity' || item.leaveType === 'childcare') {
      // 産休・育休の場合は保険料を0にする（免除）
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
      // 「なし」の場合は通常の計算を行う
      console.log(`💼 通常勤務: 保険料をバックアップから復元`);
      this.recalculateItemPremiums(index);
    }
  }

  private async recalculateItemPremiums(index: number): Promise<void> {
    const item = this.bonusDataList && this.bonusDataList[index];
    if (!item || !this.employeeInfo) return;

    try {
      // バックアップから復元を試行
      if (item.originalCalculationResult) {
        item.calculationResult = { ...item.originalCalculationResult };
        delete item.originalCalculationResult;
        return;
      }

      // バックアップがない場合は実際に計算サービスを呼び出して再計算
      console.log(`🔄 実際の計算サービスを呼び出して再計算: index=${index}`);

      // このアイテム以前の健康保険累計額を計算
      const cumulativeHealthBonus = this.bonusDataList
        .slice(0, index)
        .reduce(
          (acc, current) =>
            acc.add(new Decimal(current.calculationResult.applicableHealthStandardAmount)),
          new Decimal('0')
        )
        .toString();

      const recalculatedItem = await this.bonusCalculationService.calculateSingleBonusPremium(
        {
          amount: item.amount,
          paymentDate: item.paymentDate || '',
          month: item.month,
          year: item.year,
          type: item.type || 'bonus',
          fiscalYear: item.fiscalYear,
          originalKey: item.originalKey || '',
        },
        {
          age: this.employeeInfo.age,
          addressPrefecture: this.employeeInfo.addressPrefecture,
          companyId: this.employeeInfo.companyId,
          birthDate: this.employeeInfo.birthDate,
        },
        cumulativeHealthBonus
      );

      if (recalculatedItem) {
        item.calculationResult = recalculatedItem.calculationResult;
        console.log(`✅ 再計算完了:`, item.calculationResult);
      }
    } catch (error) {
      console.error(`❌ 再計算エラー (index=${index}):`, error);
    }
  }

  // 保険期間情報
  employeeInsurancePeriods: InsurancePeriods = {};

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
      // Firestoreから保険期間情報を取得
      if (this.employeeInfo) {
        await this.loadEmployeeInsurancePeriods();
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

  // 支給回数番号を抽出するユーティリティ
  private extractBonusNumber(header: string): number {
    const match = header.match(/\((\d+)回目\)/);
    return match ? parseInt(match[1], 10) : 9999;
  }

  // 賞与データリストを日付・支給回数順でソート
  private sortBonusList() {
    this.bonusDataList.sort((a: DisplayBonusHistoryItem, b: DisplayBonusHistoryItem) => {
      const dateA = a.paymentDate ? new Date(a.paymentDate).getTime() : 0;
      const dateB = b.paymentDate ? new Date(b.paymentDate).getTime() : 0;
      if (dateA !== dateB) return dateA - dateB;
      // 同じ日付の場合は支給回数番号で昇順
      const numA = this.extractBonusNumber(a.header || '');
      const numB = this.extractBonusNumber(b.header || '');
      return numA - numB;
    });
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
          leaveType: item.leaveType || 'excluded',
        }));
        this.sortBonusList();
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
          leaveType: 'excluded', // 初期値
        }));
        this.sortBonusList();
        this.importStatusMessage = '給与情報から賞与データを生成しました。';
      }

      // データロード後、すべてのアイテムに対して産休育休状態に応じた計算を適用
      // ユーザー要件: 産休・育休選択時は社会保険料を計算しない（免除）
      this.bonusDataList.forEach((item, index) => {
        this.updateCalculationForLeave(index);
      });

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

    if (docSnap && docSnap.exists()) {
      const data = docSnap.data();
      if (data && Array.isArray(data['bonusResults'])) {
        const list: DisplayBonusHistoryItem[] = (data['bonusResults'] as unknown[]).map(
          (item: unknown) => {
            const restored = convertStringToBigInt(item) as DisplayBonusHistoryItem;
            return {
              ...restored,
              calculationResult: restored.calculationResult || {
                healthInsurance: { employeeBurden: '0', companyBurden: '0' },
                pensionInsurance: { employeeBurden: '0', companyBurden: '0' },
                careInsurance: undefined,
                healthInsuranceRate: '',
                pensionInsuranceRate: '',
                careInsuranceRate: '',
                combinedHealthAndCareRate: '',
                standardBonusAmount: '0',
                cappedPensionStandardAmount: '0',
                isPensionLimitApplied: false,
                applicableHealthStandardAmount: '0',
                isHealthLimitApplied: false,
              },
              leaveType: restored.leaveType || 'excluded',
            };
          }
        );
        return list;
      }
    }
    return [];
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
      { header: '健康保険料率<br />（介護保険非該当）', isNumeric: true, isSeparator: false },
      { header: '健康保険料(個人)<br />（介護保険非該当）', isNumeric: true, isSeparator: false },
      { header: '健康保険料(全額)<br />（介護保険非該当）', isNumeric: true, isSeparator: false },
      { header: '---', isNumeric: false, isSeparator: true },
      { header: '健康保険料率<br />（介護保険該当）', isNumeric: true, isSeparator: false },
      { header: '健康保険料(個人)<br />（介護保険該当）', isNumeric: true, isSeparator: false },
      { header: '健康保険料(全額)<br />（介護保険該当）', isNumeric: true, isSeparator: false },
      { header: '---', isNumeric: false, isSeparator: true },
      { header: '厚生年金保険料率', isNumeric: true, isSeparator: false },
      { header: '厚生年金保険料(個人)', isNumeric: true, isSeparator: false },
      { header: '厚生年金保険料(全額)', isNumeric: true, isSeparator: false },
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
      const calcResult = item.calculationResult;
      // 介護該当判定: 支給日が介護保険該当期間内かどうか
      const isCareApplicable = this.isInPeriod(
        item.paymentDate || '',
        this.employeeInsurancePeriods.careInsurancePeriod
      );

      // 介護保険対象者か否かで表示内容を切り替える
      const healthRate = isCareApplicable
        ? '-'
        : this.formatPercentage(calcResult.healthInsuranceRate);
      const healthEmployee = isCareApplicable
        ? '-'
        : this.formatAmount(calcResult.healthInsurance.employeeBurden);
      const healthTotal = isCareApplicable
        ? '-'
        : this.formatAmount(
            SocialInsuranceCalculator.addAmounts(
              calcResult.healthInsurance.employeeBurden,
              calcResult.healthInsurance.companyBurden
            )
          );

      const careRate = isCareApplicable
        ? this.formatPercentage(calcResult.healthInsuranceRate)
        : '-';
      let careEmployee = '-';
      let careTotal = '-';

      if (isCareApplicable) {
        careEmployee = this.formatAmount(calcResult.healthInsurance.employeeBurden);
        careTotal = this.formatAmount(
          SocialInsuranceCalculator.addAmounts(
            calcResult.healthInsurance.employeeBurden,
            calcResult.healthInsurance.companyBurden
          )
        );
      }

      const values = [
        `checkbox_${index}`,
        this.formatAmount(item.amount),
        this.formatAmount(calcResult.standardBonusAmount),
        '',
        healthRate,
        healthEmployee,
        healthTotal,
        '',
        careRate,
        careEmployee,
        careTotal,
        '',
        this.formatPercentage(calcResult.pensionInsuranceRate),
        this.formatAmount(calcResult.pensionInsurance.employeeBurden),
        this.formatAmount(
          SocialInsuranceCalculator.addAmounts(
            calcResult.pensionInsurance.employeeBurden,
            calcResult.pensionInsurance.companyBurden
          )
        ),
        '',
        this.formatAmount(calcResult.cappedPensionStandardAmount),
        this.formatAmount(calcResult.applicableHealthStandardAmount),
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

    if (!this.employeeInfo || !this.pivotedTable || !this.pivotedTable.rows.length || !this.uid) {
      this.errorMessage = '保存するデータがありません。';
      console.log('🔧 保存データ不足でリターン');
      return;
    }

    try {
      this.isLoading = true;
      this.errorMessage = '';
      const { companyId, employeeNumber } = this.employeeInfo;

      const docPath = `companies/${companyId}/employees/${this.uid}/bonus_calculation_results/${this.targetYear}`;
      const docRef = doc(this.firestore, docPath);

      // データが空の場合はドキュメント自体を削除
      if (this.bonusDataList.length === 0) {
        await deleteDoc(docRef);
        console.log('🗑️ Firestoreドキュメント自体を削除しました');
        alert('全ての賞与データを削除しました。');
        this.isLoading = false;
        return;
      }

      // 画面表示用のオブジェクトデータを生成
      const displayResults = this.bonusDataList.map((item, idx) => {
        // pivotedTableの行データも参照
        const row = this.pivotedTable!.rows[idx];
        // 介護該当判定: 支給日が介護保険該当期間内かどうか
        const isCareApplicable = this.isInPeriod(
          item.paymentDate || '',
          this.employeeInsurancePeriods.careInsurancePeriod
        );
        // 非該当側
        const healthInsuranceEmployee = !isCareApplicable
          ? this.formatAmount(item.calculationResult.healthInsurance.employeeBurden)
          : '-';
        const healthInsuranceTotal = !isCareApplicable
          ? this.formatAmount(
              SocialInsuranceCalculator.addAmounts(
                item.calculationResult.healthInsurance.employeeBurden,
                item.calculationResult.healthInsurance.companyBurden
              )
            )
          : '-';
        // 該当側
        const careInsuranceEmployee = isCareApplicable
          ? this.formatAmount(item.calculationResult.healthInsurance.employeeBurden)
          : '-';
        const careInsuranceTotal = isCareApplicable
          ? this.formatAmount(
              SocialInsuranceCalculator.addAmounts(
                item.calculationResult.healthInsurance.employeeBurden,
                item.calculationResult.healthInsurance.companyBurden
              )
            )
          : '-';
        const pensionInsuranceEmployee = this.formatAmount(
          item.calculationResult.pensionInsurance.employeeBurden
        );
        const pensionInsuranceTotal = this.formatAmount(
          SocialInsuranceCalculator.addAmounts(
            item.calculationResult.pensionInsurance.employeeBurden,
            item.calculationResult.pensionInsurance.companyBurden
          )
        );
        return {
          display: [row.header, ...row.values.map((v) => (v === undefined ? '-' : String(v)))].join(
            ' | '
          ),
          amount: item.amount,
          paymentDate: item.paymentDate,
          month: item.month,
          year: item.year,
          leaveType: item.leaveType,
          companyId: this.employeeInfo!.companyId,
          branchNumber: this.employeeInfo!.branchNumber,
          addressPrefecture: this.employeeInfo!.addressPrefecture,
          employeeNumber: this.employeeInfo!.employeeNumber,
          calculationResult: item.calculationResult,
          // 追加: 画面表示と同じカンマ区切りの金額
          healthInsuranceEmployee,
          healthInsuranceTotal,
          careInsuranceEmployee,
          careInsuranceTotal,
          pensionInsuranceEmployee,
          pensionInsuranceTotal,
        };
      });

      const saveData = {
        companyId: companyId,
        uid: this.uid,
        employeeId: employeeNumber,
        targetYear: Number(this.targetYear),
        bonusResults: displayResults, // 画面表示用の文字列配列として保存
        insurancePeriods: this.employeeInsurancePeriods,
        updatedAt: new Date(),
        updatedBy: 'system',
      };

      // デバッグ: 保存データをログ出力
      console.log('Firestore保存データ:', saveData);

      // 既存ドキュメントを削除してから新規作成（完全な置き換えを保証）
      try {
        await deleteDoc(docRef);
        console.log('🗑️ 既存ドキュメント削除完了');
      } catch (deleteError) {
        console.log('ℹ️ 削除対象ドキュメントが存在しないか、削除できませんでした:', deleteError);
      }

      // 新規ドキュメントとして作成
      await setDoc(docRef, convertBigIntToString(saveData));

      console.log('✅ Firestore保存完了');

      // 保存確認のため、データを再読み込み
      const verifyDoc = await getDoc(docRef);
      if (verifyDoc.exists()) {
        const savedData = verifyDoc.data();
        console.log('📋 保存確認データ:', savedData);
      } else {
        console.error('❌ 保存確認失敗: ドキュメントが見つかりません');
      }

      alert('賞与計算結果（画面表示内容）を正常に保存しました。');
    } catch (error) {
      console.error('保存エラー:', error);
      this.errorMessage = '保存中にエラーが発生しました。もう一度お試しください。';
    } finally {
      this.isLoading = false;
    }
  }

  showAddBonusForm = false;
  showEditBonusForm = false;
  editBonusTargetKey: { originalKey: string; amount: string; paymentDate: string } | null = null;
  editBonusInitialData: { paymentDate: string; amount: number; leaveType: string } | null = null;

  /**
   * 指定日が期間内かどうか判定
   */
  private isInPeriod(date: string, period?: { start: string; end: string }): boolean {
    if (!date || !period || !period.start || !period.end) return false;
    const d = new Date(date);
    const start = new Date(period.start);
    const end = new Date(period.end);
    // 期間は日付を含む
    return d >= start && d <= end;
  }

  async addBonus(bonus: { paymentDate: string; amount: number; leaveType: string }) {
    if (!this.employeeInfo) return;

    // 年3回までの制限チェック
    if (this.bonusDataList.length >= 3) {
      this.errorMessage = '年間3回までしか賞与を追加できません。';
      return;
    }
    if (bonus.leaveType === 'maternity' || bonus.leaveType === 'childcare') {
      // 産休・育休の場合は計算せず0で登録
      this.bonusDataList.push({
        amount: bonus.amount.toString(),
        paymentDate: bonus.paymentDate,
        month: BigInt(new Date(bonus.paymentDate).getMonth() + 1),
        year: BigInt(new Date(bonus.paymentDate).getFullYear()),
        type: 'bonus',
        originalKey: '',
        calculationResult: {
          standardBonusAmount: '0',
          cappedPensionStandardAmount: '0',
          isPensionLimitApplied: false,
          applicableHealthStandardAmount: '0',
          isHealthLimitApplied: false,
          healthInsurance: { employeeBurden: '0', companyBurden: '0' },
          careInsurance: { employeeBurden: '0', companyBurden: '0' },
          pensionInsurance: { employeeBurden: '0', companyBurden: '0' },
          healthInsuranceRate: '',
          careInsuranceRate: '',
          combinedHealthAndCareRate: '',
          pensionInsuranceRate: '',
        },
        leaveType: bonus.leaveType || 'excluded',
      });
      this.sortBonusList();
      this.createPivotedTable();
      this.saveBonusResults();
      return;
    }

    // 保険料率マスタ取得
    const rates = await this.bonusCalculationService.getInsuranceRates(
      this.targetYear,
      this.employeeInfo.addressPrefecture
    );
    // 期間判定
    const careIn = this.isInPeriod(
      bonus.paymentDate,
      this.employeeInsurancePeriods.careInsurancePeriod
    );
    const healthIn = this.isInPeriod(
      bonus.paymentDate,
      this.employeeInsurancePeriods.healthInsurancePeriod
    );
    const pensionIn = this.isInPeriod(
      bonus.paymentDate,
      this.employeeInsurancePeriods.pensionInsurancePeriod
    );

    // 保険料率セット
    const healthInsuranceRate = healthIn
      ? careIn
        ? rates?.nursingRate || ''
        : rates?.nonNursingRate || ''
      : '';
    const pensionInsuranceRate = pensionIn ? rates?.pensionRate || '' : '';

    // 年間累計標準賞与額を計算
    const cumulativeHealthBonus = this.bonusDataList
      .reduce(
        (acc, item) => acc.add(new Decimal(item.calculationResult.applicableHealthStandardAmount)),
        new Decimal('0')
      )
      .toString();

    // サービスで計算（保険料率は計算ロジックに渡すが、保存・表示は上記で判定した値を使う）
    const calculated = await this.bonusCalculationService.calculateSingleBonusPremium(
      {
        amount: bonus.amount.toString(),
        paymentDate: bonus.paymentDate,
        month: BigInt(new Date(bonus.paymentDate).getMonth() + 1),
        year: BigInt(new Date(bonus.paymentDate).getFullYear()),
        type: 'bonus',
        originalKey: '',
        fiscalYear: this.targetYear,
      },
      {
        age: this.employeeInfo.age,
        addressPrefecture: this.employeeInfo.addressPrefecture,
        companyId: this.employeeInfo.companyId,
        birthDate: this.employeeInfo.birthDate,
      },
      cumulativeHealthBonus
    );

    if (calculated) {
      // 保険料率欄を上書き
      calculated.calculationResult.healthInsuranceRate = healthInsuranceRate || 'ー';
      calculated.calculationResult.pensionInsuranceRate = pensionInsuranceRate || 'ー';
      // careInsuranceRate, combinedHealthAndCareRateは空欄でOK
      this.bonusDataList.push({
        ...calculated,
        leaveType: bonus.leaveType || 'excluded',
      });
      this.sortBonusList();
      this.createPivotedTable();
      this.saveBonusResults();
    }
  }

  // FirestoreのinsuranceJudgmentsから保険期間情報を取得
  async loadEmployeeInsurancePeriods() {
    if (!this.employeeInfo?.uid) return;
    try {
      const db = this.firestore;
      const docRef = doc(db, 'insuranceJudgments', this.employeeInfo.uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        this.employeeInsurancePeriods = {
          careInsurancePeriod: data['careInsurancePeriod'],
          healthInsurancePeriod: data['healthInsurancePeriod'],
          pensionInsurancePeriod: data['pensionInsurancePeriod'],
        };
      }
    } catch (e) {
      console.error('保険期間情報の取得に失敗:', e);
    }
  }

  // 日付を「YYYY年MM月DD日」形式に変換
  formatJapaneseDate(dateStr?: string): string {
    if (!dateStr) return '';
    // YYYY-MM or YYYY-MM-DD
    const parts = dateStr.split('-');
    if (parts.length === 2) {
      // YYYY-MM → YYYY-MM-01
      dateStr = `${parts[0]}-${parts[1]}-01`;
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  // 編集ボタン押下時の処理（今はアラートのみ）
  onEditBonus(index: number): void {
    const item = this.bonusDataList[index];
    this.editBonusTargetKey = {
      originalKey: item.originalKey,
      amount: item.amount,
      paymentDate: item.paymentDate || '',
    };
    this.editBonusInitialData = {
      paymentDate: item.paymentDate || '',
      amount: Number(item.amount),
      leaveType: item.leaveType || 'excluded',
    };
    this.showEditBonusForm = true;
  }

  async onEditBonusSave(bonus: { paymentDate: string; amount: number; leaveType: string }) {
    if (!this.editBonusTargetKey || !this.employeeInfo) return;
    // 一意なキーで該当データを検索
    const idx = this.bonusDataList.findIndex(
      (item) =>
        item.originalKey === this.editBonusTargetKey!.originalKey &&
        item.amount === this.editBonusTargetKey!.amount &&
        item.paymentDate === this.editBonusTargetKey!.paymentDate
    );
    if (idx === -1) return;
    // 以降は従来の編集ロジック
    if (bonus.leaveType === 'maternity' || bonus.leaveType === 'childcare') {
      const newItem: DisplayBonusHistoryItem = {
        amount: bonus.amount.toString(),
        paymentDate: bonus.paymentDate,
        month: BigInt(new Date(bonus.paymentDate).getMonth() + 1),
        year: BigInt(new Date(bonus.paymentDate).getFullYear()),
        type: 'bonus',
        originalKey: this.bonusDataList[idx].originalKey,
        calculationResult: {
          standardBonusAmount: '0',
          cappedPensionStandardAmount: '0',
          isPensionLimitApplied: false,
          applicableHealthStandardAmount: '0',
          isHealthLimitApplied: false,
          healthInsurance: { employeeBurden: '0', companyBurden: '0' },
          careInsurance: { employeeBurden: '0', companyBurden: '0' },
          pensionInsurance: { employeeBurden: '0', companyBurden: '0' },
          healthInsuranceRate: '',
          careInsuranceRate: '',
          combinedHealthAndCareRate: '',
          pensionInsuranceRate: '',
        },
        leaveType: bonus.leaveType || 'excluded',
      };
      this.bonusDataList.splice(idx, 1);
      this.bonusDataList.push(newItem);
      this.sortBonusList();
      this.createPivotedTable();
      this.saveBonusResults();
      this.showEditBonusForm = false;
      this.editBonusTargetKey = null;
      this.editBonusInitialData = null;
      return;
    }
    if (this.bonusDataList[idx].originalCalculationResult) {
      delete this.bonusDataList[idx].originalCalculationResult;
    }
    // 保険料率マスタ取得
    const rates = await this.bonusCalculationService.getInsuranceRates(
      this.targetYear,
      this.employeeInfo.addressPrefecture
    );
    // 期間判定
    const careIn = this.isInPeriod(
      bonus.paymentDate,
      this.employeeInsurancePeriods.careInsurancePeriod
    );
    const healthIn = this.isInPeriod(
      bonus.paymentDate,
      this.employeeInsurancePeriods.healthInsurancePeriod
    );
    const pensionIn = this.isInPeriod(
      bonus.paymentDate,
      this.employeeInsurancePeriods.pensionInsurancePeriod
    );

    // 保険料率セット
    const healthInsuranceRate = healthIn
      ? careIn
        ? rates?.nursingRate || ''
        : rates?.nonNursingRate || ''
      : '';
    const pensionInsuranceRate = pensionIn ? rates?.pensionRate || '' : '';

    const cumulativeHealthBonus = this.bonusDataList
      .filter((_, i) => i !== idx)
      .reduce(
        (acc, item) => acc.add(new Decimal(item.calculationResult.applicableHealthStandardAmount)),
        new Decimal('0')
      )
      .toString();
    const calculated = await this.bonusCalculationService.calculateSingleBonusPremium(
      {
        amount: bonus.amount.toString(),
        paymentDate: bonus.paymentDate,
        month: BigInt(new Date(bonus.paymentDate).getMonth() + 1),
        year: BigInt(new Date(bonus.paymentDate).getFullYear()),
        type: 'bonus',
        originalKey: this.bonusDataList[idx].originalKey,
        fiscalYear: this.targetYear,
      },
      {
        age: this.employeeInfo.age,
        addressPrefecture: this.employeeInfo.addressPrefecture,
        companyId: this.employeeInfo.companyId,
        birthDate: this.employeeInfo.birthDate,
      },
      cumulativeHealthBonus
    );

    if (calculated) {
      // 保険料率欄を上書き
      calculated.calculationResult.healthInsuranceRate = healthInsuranceRate || 'ー';
      calculated.calculationResult.pensionInsuranceRate = pensionInsuranceRate || 'ー';
      this.bonusDataList.splice(idx, 1, {
        ...calculated,
        leaveType: bonus.leaveType || 'excluded',
      });
      this.sortBonusList();
      this.createPivotedTable();
      this.saveBonusResults();
      this.showEditBonusForm = false;
      this.editBonusTargetKey = null;
      this.editBonusInitialData = null;
    }
  }

  onEditBonusClosed() {
    this.showEditBonusForm = false;
    this.editBonusTargetKey = null;
    this.editBonusInitialData = null;
  }

  onAddBonusClosed() {
    this.showAddBonusForm = false;
    // 賞与制限エラーメッセージをクリア
    if (this.errorMessage === '年間3回までしか賞与を追加できません。') {
      this.errorMessage = '';
    }
  }

  // 削除ボタン押下時の処理
  onDeleteBonus(index: number): void {
    if (confirm('この賞与情報を削除しますか？')) {
      this.bonusDataList.splice(index, 1);
      this.createPivotedTable();
      this.saveBonusResults();
    }
  }

  // 計算結果を保存ボタン用
  onSaveBonusResults() {
    this.saveBonusResults();
  }
}
