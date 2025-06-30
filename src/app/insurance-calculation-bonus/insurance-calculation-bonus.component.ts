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
  BonusHistoryItem,
} from '../services/bonus-calculation.service';
import { OfficeService } from '../services/office.service';
import { doc, setDoc } from 'firebase/firestore';
import { AuthService } from '../services/auth.service';
import { Decimal } from 'decimal.js';
import { BonusAddFormComponent } from '../bonus-add-form/bonus-add-form.component';
import { SocialInsuranceCalculator } from '../utils/decimal-calculator';

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
  dataIndex: number;
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
    // 全体再計算を実行
    this.recalculateAllBonuses();
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
        cumulativeHealthBonus,
        this.employeeInsurancePeriods
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

    // カラム定義
    const columns: PivotColumn[] = [
      { header: '育休産休', isNumeric: false, isSeparator: false },
      { header: '支給額', isNumeric: true, isSeparator: false },
      { header: '標準賞与額', isNumeric: true, isSeparator: false },
      { header: '---', isNumeric: false, isSeparator: true },
      { header: '健康保険料率<br />（介護保険非該当）', isNumeric: true, isSeparator: false },
      { header: '健康保険料(個人)<br />（介護保険非該当）', isNumeric: true, isSeparator: false },
      { header: '健康保険料(全額)<br />（介護保険非該当）', isNumeric: true, isSeparator: false },
      { header: '---', isNumeric: false, isSeparator: true },
      // 介護保険該当の列を常に表示
      { header: '健康保険料率<br />（介護保険該当）', isNumeric: true, isSeparator: false },
      { header: '健康保険料(個人)<br />（介護保険該当）', isNumeric: true, isSeparator: false },
      { header: '健康保険料(全額)<br />（介護保険該当）', isNumeric: true, isSeparator: false },
      { header: '---', isNumeric: false, isSeparator: true },
      { header: '厚生年金保険料率', isNumeric: true, isSeparator: false },
      { header: '厚生年金保険料(個人)', isNumeric: true, isSeparator: false },
      { header: '厚生年金保険料(全額)', isNumeric: true, isSeparator: false },
      { header: '---', isNumeric: false, isSeparator: true },
      { header: '厚生年金<br>上限適用後標準賞与額', isNumeric: true, isSeparator: false },
      { header: '健康保険<br>上限適用後標準賞与額', isNumeric: true, isSeparator: false },
    ];

    // rows生成時に健康保険も厚生年金も全て'-'のデータは除外し、bonusDataListのindexをdataIndexとして保持
    const rows: PivotRow[] = [];
    this.bonusDataList.forEach((item, dataIndex) => {
      const calc = item.calculationResult;
      const isAllExcluded =
        calc.healthInsurance.employeeBurden === '-' &&
        calc.healthInsurance.companyBurden === '-' &&
        calc.pensionInsurance.employeeBurden === '-' &&
        calc.pensionInsurance.companyBurden === '-';
      if (isAllExcluded) return;
      const calcResult = item.calculationResult;
      // 各保険の期間判定
      const isCareApplicable =
        item.paymentDate && this.employeeInsurancePeriods.careInsurancePeriod
          ? this.isInPeriod(item.paymentDate, this.employeeInsurancePeriods.careInsurancePeriod)
          : false;
      const isHealthApplicable =
        item.paymentDate && this.employeeInsurancePeriods.healthInsurancePeriod
          ? this.isInPeriod(item.paymentDate, this.employeeInsurancePeriods.healthInsurancePeriod)
          : false;
      const isPensionApplicable =
        item.paymentDate && this.employeeInsurancePeriods.pensionInsurancePeriod
          ? this.isInPeriod(item.paymentDate, this.employeeInsurancePeriods.pensionInsurancePeriod)
          : false;

      const applicableHealthStandardAmount = calcResult.applicableHealthStandardAmount;
      const healthRateVal = parseFloat(calcResult.healthInsuranceRate.replace('%', '')) / 100;

      // 健康保険料全額計算（介護保険非該当）
      const healthInsuranceTotalCalc =
        isHealthApplicable && !isCareApplicable && healthRateVal
          ? this.formatAmount(
              (parseFloat(applicableHealthStandardAmount) * healthRateVal).toString()
            )
          : '-';

      // 健康保険料全額計算（介護保険該当）
      const careInsuranceTotalCalc =
        isHealthApplicable && isCareApplicable && healthRateVal
          ? this.formatAmount(
              (parseFloat(applicableHealthStandardAmount) * healthRateVal).toString()
            )
          : '-';

      // 厚生年金保険料全額計算
      const pensionInsuranceTotalCalc =
        isPensionApplicable && calcResult.pensionInsurance
          ? this.formatAmount(
              (
                parseFloat(calcResult.pensionInsurance.employeeBurden) +
                parseFloat(calcResult.pensionInsurance.companyBurden)
              ).toString()
            )
          : '-';
      const values: (string | undefined)[] = [
        `checkbox_${dataIndex}`,
        this.formatAmount(item.amount),
        this.formatAmount(calcResult.standardBonusAmount),
        '',
        // 健康保険（介護保険非該当）
        isHealthApplicable && !isCareApplicable
          ? this.formatPercentage(calcResult.healthInsuranceRate)
          : '-',
        isHealthApplicable && !isCareApplicable
          ? this.formatAmount(calcResult.healthInsurance.employeeBurden)
          : '-',
        healthInsuranceTotalCalc,
        '',
        // 健康保険（介護保険該当）
        isHealthApplicable && isCareApplicable
          ? this.formatPercentage(calcResult.healthInsuranceRate)
          : '-',
        isHealthApplicable && isCareApplicable
          ? this.formatAmount(calcResult.healthInsurance.employeeBurden)
          : '-',
        careInsuranceTotalCalc,
        '',
        // 厚生年金保険
        isPensionApplicable ? this.formatPercentage(calcResult.pensionInsuranceRate) : '-',
        isPensionApplicable ? this.formatAmount(calcResult.pensionInsurance.employeeBurden) : '-',
        pensionInsuranceTotalCalc,
        '',
        // 上限適用後標準賞与額
        isPensionApplicable ? this.formatAmount(calcResult.cappedPensionStandardAmount) : '-',
        isHealthApplicable ? this.formatAmount(calcResult.applicableHealthStandardAmount) : '-',
      ];
      rows.push({
        header: `賞与(${rows.length + 1}回目)<br>${this.formatPaymentMonth(item.paymentDate)}`,
        values,
        dataIndex,
      });
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
    try {
      const decimal = new Decimal(amount);
      // 丸め処理適用（50銭以下切り捨て、50銭超切り上げ）
      const roundedAmount = SocialInsuranceCalculator.roundForTotalAmount(decimal);
      const num = Number(roundedAmount);
      if (isNaN(num)) {
        return amount;
      }
      return num.toLocaleString('ja-JP', {
        maximumFractionDigits: 0,
        useGrouping: true,
      });
    } catch (error) {
      console.error('金額フォーマットエラー:', error);
      return amount;
    }
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

    if (!this.employeeInfo || !this.uid) {
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
      const displayResults = this.bonusDataList
        .map((item, idx) => {
          const row = this.pivotedTable!.rows[idx];
          // 介護該当判定: 支給日が介護保険該当期間内かどうか
          const isCareApplicable =
            item.paymentDate && this.employeeInsurancePeriods.careInsurancePeriod
              ? this.isInPeriod(item.paymentDate, this.employeeInsurancePeriods.careInsurancePeriod)
              : false;
          // 健康保険該当判定
          const isHealthApplicable =
            item.paymentDate && this.employeeInsurancePeriods.healthInsurancePeriod
              ? this.isInPeriod(
                  item.paymentDate,
                  this.employeeInsurancePeriods.healthInsurancePeriod
                )
              : false;
          // 厚生年金該当判定
          const isPensionApplicable =
            item.paymentDate && this.employeeInsurancePeriods.pensionInsurancePeriod
              ? this.isInPeriod(
                  item.paymentDate,
                  this.employeeInsurancePeriods.pensionInsurancePeriod
                )
              : false;

          // 健康保険対象外なら'-'に上書き
          if (!isHealthApplicable) {
            item.calculationResult.healthInsurance.employeeBurden = '-';
            item.calculationResult.healthInsurance.companyBurden = '-';
          }
          // 厚生年金対象外なら'-'に上書き
          if (!isPensionApplicable) {
            item.calculationResult.pensionInsurance.employeeBurden = '-';
            item.calculationResult.pensionInsurance.companyBurden = '-';
          }
          // 健康保険も厚生年金も全て'-'なら保存しない
          const isAllExcluded =
            item.calculationResult.healthInsurance.employeeBurden === '-' &&
            item.calculationResult.healthInsurance.companyBurden === '-' &&
            item.calculationResult.pensionInsurance.employeeBurden === '-' &&
            item.calculationResult.pensionInsurance.companyBurden === '-';
          if (isAllExcluded) {
            return null; // 保存対象外
          }
          // 標準賞与額（上限適用後）
          const applicableHealthStandardAmount =
            item.calculationResult.applicableHealthStandardAmount;
          // 保険料率
          const healthRateVal =
            parseFloat(item.calculationResult.healthInsuranceRate.replace('%', '')) / 100;

          // 全額計算（期間判定を考慮）
          const healthInsuranceTotalCalc =
            isHealthApplicable && !isCareApplicable && healthRateVal
              ? (parseFloat(applicableHealthStandardAmount) * healthRateVal).toString()
              : '-';
          const careInsuranceTotalCalc =
            isHealthApplicable && isCareApplicable && healthRateVal
              ? (parseFloat(applicableHealthStandardAmount) * healthRateVal).toString()
              : '-';
          const pensionInsuranceTotalCalc =
            isPensionApplicable && healthRateVal
              ? (
                  (parseFloat(item.calculationResult.cappedPensionStandardAmount) *
                    parseFloat(
                      item.calculationResult.pensionInsuranceRate.replace('%', '').replace('※', '')
                    )) /
                  100
                ).toString()
              : '-';
          return {
            display: [
              row.header,
              ...row.values.map((v) => (v === undefined ? '-' : String(v))),
            ].join(' | '),
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
            healthInsuranceTotal: healthInsuranceTotalCalc,
            careInsuranceTotal: careInsuranceTotalCalc,
            pensionInsuranceTotal: pensionInsuranceTotalCalc,
            applicableHealthStandardAmount,
          };
        })
        .filter((item) => item !== null); // null（保存対象外）は除外

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

    // 開始日の処理
    let start: Date;
    if (period.start.length === 7) {
      // "YYYY-MM" 形式
      const [year, month] = period.start.split('-').map(Number);
      start = new Date(year, month - 1, 1); // 月の1日
    } else {
      start = new Date(period.start);
    }

    // 終了日の処理
    let end: Date;
    if (period.end.length === 7) {
      // "YYYY-MM" 形式
      const [year, month] = period.end.split('-').map(Number);
      end = new Date(year, month, 0, 23, 59, 59, 999); // 月の最終日 23:59:59.999
    } else {
      end = new Date(period.end);
    }

    return d >= start && d <= end;
  }

  /**
   * 全体の賞与リストを一括再計算する
   */
  private async recalculateAllBonuses(): Promise<void> {
    if (!this.employeeInfo || this.bonusDataList.length === 0) return;

    try {
      // 保険料率を取得
      const rates = await this.bonusCalculationService.getInsuranceRates(
        this.targetYear,
        this.employeeInfo.addressPrefecture
      );

      if (!rates) {
        console.error('保険料率が取得できませんでした。');
        this.errorMessage = '保険料率の取得に失敗しました。';
        return;
      }

      // 基本データのみ抽出（計算結果を除去）
      const baseBonusData: BonusHistoryItem[] = this.bonusDataList.map((item) => ({
        type: item.type,
        amount: item.amount,
        month: item.month,
        year: item.year,
        originalKey: item.originalKey,
        fiscalYear: this.targetYear,
        paymentDate: item.paymentDate,
        leaveType: item.leaveType,
      }));

      // 新しいリストを作成
      const updatedBonusDataList: DisplayBonusHistoryItem[] = [];

      for (const baseItem of baseBonusData) {
        // 産休・育休の場合は0計算結果を設定
        if (baseItem.leaveType === 'maternity' || baseItem.leaveType === 'childcare') {
          updatedBonusDataList.push({
            ...baseItem,
            calculationResult: {
              standardBonusAmount: '0',
              cappedPensionStandardAmount: '0',
              isPensionLimitApplied: false,
              applicableHealthStandardAmount: '0',
              isHealthLimitApplied: false,
              healthInsurance: { employeeBurden: '0', companyBurden: '0' },
              careInsurance: { employeeBurden: '0', companyBurden: '0' },
              pensionInsurance: { employeeBurden: '0', companyBurden: '0' },
              healthInsuranceRate: rates.nonNursingRate,
              careInsuranceRate: '',
              combinedHealthAndCareRate: rates.nursingRate,
              pensionInsuranceRate: rates.pensionRate,
            },
            leaveType: baseItem.leaveType || 'excluded',
          });
        } else {
          // 通常の場合は単体計算を実行
          const calculated = await this.bonusCalculationService.calculateSingleBonusPremium(
            baseItem,
            {
              age: this.employeeInfo.age,
              addressPrefecture: this.employeeInfo.addressPrefecture,
              companyId: this.employeeInfo.companyId,
              birthDate: this.employeeInfo.birthDate,
            },
            '0', // 累計は後で正しく計算される
            this.employeeInsurancePeriods
          );

          if (calculated) {
            updatedBonusDataList.push({
              ...calculated,
              leaveType: baseItem.leaveType || 'excluded',
            });
          } else {
            // 計算に失敗した場合は0で設定
            updatedBonusDataList.push({
              ...baseItem,
              calculationResult: {
                standardBonusAmount: '0',
                cappedPensionStandardAmount: '0',
                isPensionLimitApplied: false,
                applicableHealthStandardAmount: '0',
                isHealthLimitApplied: false,
                healthInsurance: { employeeBurden: '0', companyBurden: '0' },
                careInsurance: { employeeBurden: '0', companyBurden: '0' },
                pensionInsurance: { employeeBurden: '0', companyBurden: '0' },
                healthInsuranceRate: rates.nonNursingRate,
                careInsuranceRate: '',
                combinedHealthAndCareRate: rates.nursingRate,
                pensionInsuranceRate: rates.pensionRate,
              },
              leaveType: baseItem.leaveType || 'excluded',
            });
          }
        }
      }

      // 支給日順でソートして累計額を正しく計算
      updatedBonusDataList.sort((a, b) => {
        const dateA = new Date(a.paymentDate || 0).getTime();
        const dateB = new Date(b.paymentDate || 0).getTime();
        return dateA - dateB;
      });

      // 健康保険の累計上限を再計算
      let cumulativeHealthBonus = '0';
      const HEALTH_INSURANCE_YEARLY_CAP = '5730000';

      for (const item of updatedBonusDataList) {
        if (item.leaveType !== 'maternity' && item.leaveType !== 'childcare') {
          const standardBonusAmount = item.calculationResult.standardBonusAmount;

          // 残り上限を計算
          const remainingCap = SocialInsuranceCalculator.subtract(
            HEALTH_INSURANCE_YEARLY_CAP,
            cumulativeHealthBonus
          );
          const positiveRemainingCap =
            SocialInsuranceCalculator.compare(remainingCap, '0') > 0 ? remainingCap : '0';

          // 上限適用判定
          const isHealthLimitApplied =
            SocialInsuranceCalculator.compare(standardBonusAmount, positiveRemainingCap) > 0;

          const applicableHealthStandardAmount = isHealthLimitApplied
            ? positiveRemainingCap
            : standardBonusAmount;

          // 計算結果を更新
          item.calculationResult.applicableHealthStandardAmount = applicableHealthStandardAmount;
          item.calculationResult.isHealthLimitApplied = isHealthLimitApplied;

          // 累計を更新
          cumulativeHealthBonus = SocialInsuranceCalculator.addAmounts(
            cumulativeHealthBonus,
            standardBonusAmount
          );

          // 健康保険料を再計算
          if (
            item.paymentDate &&
            this.employeeInsurancePeriods.healthInsurancePeriod &&
            this.isInPeriod(item.paymentDate, this.employeeInsurancePeriods.healthInsurancePeriod)
          ) {
            const isCareApplicable =
              item.paymentDate && this.employeeInsurancePeriods.careInsurancePeriod
                ? this.isInPeriod(
                    item.paymentDate,
                    this.employeeInsurancePeriods.careInsurancePeriod
                  )
                : false;

            const healthRate = isCareApplicable ? rates.nursingRate : rates.nonNursingRate;
            const healthRateDecimal = parseFloat(healthRate.replace(/[^0-9.]/g, '')) / 100;

            const healthTotalAmount =
              parseFloat(applicableHealthStandardAmount) * healthRateDecimal;
            const healthEmployeeAmount = healthTotalAmount / 2;
            const healthCompanyAmount = healthTotalAmount / 2;

            item.calculationResult.healthInsurance = {
              employeeBurden: SocialInsuranceCalculator.roundForEmployeeBurden(
                new Decimal(healthEmployeeAmount)
              ),
              companyBurden: SocialInsuranceCalculator.roundForTotalAmount(
                new Decimal(healthCompanyAmount)
              ),
            };
            item.calculationResult.healthInsuranceRate = healthRate;
          }
        }
      }

      // データリストを更新
      this.bonusDataList = updatedBonusDataList;
      this.sortBonusList();
      this.createPivotedTable();
      this.updateLimitNotes();
    } catch (error) {
      console.error('全体再計算エラー:', error);
      this.errorMessage = '賞与の再計算中にエラーが発生しました。';
    }
  }

  async addBonus(bonus: { paymentDate: string; amount: number; leaveType: string }) {
    if (!this.employeeInfo) return;

    // 年3回までの制限チェック
    if (this.bonusDataList.length >= 3) {
      this.errorMessage = '年間3回までしか賞与を追加できません。';
      return;
    }

    // 新しい賞与データを追加
    const newBonusItem: DisplayBonusHistoryItem = {
      amount: bonus.amount.toString(),
      paymentDate: bonus.paymentDate,
      month: BigInt(new Date(bonus.paymentDate).getMonth() + 1),
      year: BigInt(new Date(bonus.paymentDate).getFullYear()),
      type: 'bonus',
      originalKey: `bonus_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fiscalYear: this.targetYear,
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

    this.bonusDataList.push(newBonusItem);

    // 全体再計算を実行
    await this.recalculateAllBonuses();
    await this.saveBonusResults();
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

    // データを更新
    this.bonusDataList[idx] = {
      ...this.bonusDataList[idx],
      amount: bonus.amount.toString(),
      paymentDate: bonus.paymentDate,
      month: BigInt(new Date(bonus.paymentDate).getMonth() + 1),
      year: BigInt(new Date(bonus.paymentDate).getFullYear()),
      leaveType: bonus.leaveType || 'excluded',
    };

    // 全体再計算を実行
    await this.recalculateAllBonuses();
    await this.saveBonusResults();

    // フォームを閉じる
    this.showEditBonusForm = false;
    this.editBonusTargetKey = null;
    this.editBonusInitialData = null;
  }

  // 削除ボタン押下時の処理
  async onDeleteBonus(index: number): Promise<void> {
    if (confirm('この賞与情報を削除しますか？')) {
      this.bonusDataList.splice(index, 1);

      // 削除後に全体再計算
      await this.recalculateAllBonuses();
      await this.saveBonusResults();
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

  // 日付を「YYYY年MM月」形式に変換
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
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
  }

  // 日付から月のみを表示するフォーマット関数
  formatPaymentMonth(dateStr?: string): string {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length >= 2) {
      const year = parts[0];
      const month = parseInt(parts[1]);
      return `${year}年${month}月`;
    }
    return dateStr;
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

  onAddBonusClosed() {
    this.showAddBonusForm = false;
    // 賞与制限エラーメッセージをクリア
    if (this.errorMessage === '年間3回までしか賞与を追加できません。') {
      this.errorMessage = '';
    }
  }

  // 計算結果を保存ボタン用
  onSaveBonusResults() {
    this.saveBonusResults();
  }

  // 既存の賞与月リストを取得（YYYY-MM形式）
  getExistingBonusMonths(): string[] {
    return this.bonusDataList
      .filter((item) => item.paymentDate)
      .map((item) => item.paymentDate!.substring(0, 7));
  }

  onEditBonusClosed() {
    this.showEditBonusForm = false;
    this.editBonusTargetKey = null;
    this.editBonusInitialData = null;
  }
}
