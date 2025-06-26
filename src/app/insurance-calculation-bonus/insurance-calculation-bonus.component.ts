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
        const list: DisplayBonusHistoryItem[] = (
          data['bonusResults'] as CalculatedBonusHistoryItem[]
        ).map((item: CalculatedBonusHistoryItem) => ({
          ...item,
          leaveType: item.leaveType || 'excluded',
        }));
        list.sort((a: DisplayBonusHistoryItem, b: DisplayBonusHistoryItem) => {
          const dateA = a.paymentDate ? new Date(a.paymentDate).getTime() : 0;
          const dateB = b.paymentDate ? new Date(b.paymentDate).getTime() : 0;
          if (dateA !== dateB) return dateA - dateB;
          const numA = this.extractBonusNumber(a.header || '');
          const numB = this.extractBonusNumber(b.header || '');
          return numA - numB;
        });
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
      { header: '健康保険料(会社)<br />（介護保険非該当）', isNumeric: true, isSeparator: false },
      { header: '---', isNumeric: false, isSeparator: true },
      { header: '健康保険料率<br />（介護保険該当）', isNumeric: true, isSeparator: false },
      { header: '健康保険料(個人)<br />（介護保険該当）', isNumeric: true, isSeparator: false },
      { header: '健康保険料(会社)<br />（介護保険該当）', isNumeric: true, isSeparator: false },
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
      const calcResult = item.calculationResult;
      const isCareApplicable = !!calcResult.careInsurance;

      // 介護保険対象者か否かで表示内容を切り替える
      const healthRate = isCareApplicable
        ? '-'
        : this.formatPercentage(calcResult.healthInsuranceRate);
      const healthEmployee = isCareApplicable
        ? '-'
        : this.formatAmount(calcResult.healthInsurance.employeeBurden);
      const healthCompany = isCareApplicable
        ? '-'
        : this.formatAmount(calcResult.healthInsurance.companyBurden);

      const careRate = isCareApplicable
        ? this.formatPercentage(calcResult.combinedHealthAndCareRate)
        : '-';
      let careEmployee = '-';
      let careCompany = '-';

      if (isCareApplicable && calcResult.careInsurance) {
        // 介護対象者の場合、介護保険料の欄には「健康保険料＋介護保険料」の合算値を表示
        careEmployee = this.formatAmount(
          SocialInsuranceCalculator.addAmounts(
            calcResult.healthInsurance.employeeBurden,
            calcResult.careInsurance.employeeBurden
          )
        );
        careCompany = this.formatAmount(
          SocialInsuranceCalculator.addAmounts(
            calcResult.healthInsurance.companyBurden,
            calcResult.careInsurance.companyBurden
          )
        );
      }

      const values = [
        `checkbox_${index}`, // チェックボックス用のプレースホルダー
        this.formatAmount(item.amount),
        this.formatAmount(calcResult.standardBonusAmount),
        '', // Separator
        healthRate,
        healthEmployee,
        healthCompany,
        '', // Separator
        careRate,
        careEmployee,
        careCompany,
        '', // Separator
        this.formatPercentage(calcResult.pensionInsuranceRate),
        this.formatAmount(calcResult.pensionInsurance.employeeBurden),
        this.formatAmount(calcResult.pensionInsurance.companyBurden),
        '', // Separator
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
          // 産休・育休の場合は保険料を0にして保存（免除）
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
        insurancePeriods: this.employeeInsurancePeriods,
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

  showAddBonusForm = false;
  showEditBonusForm = false;
  editBonusIndex: number | null = null;
  editBonusInitialData: { paymentDate: string; amount: number; leaveType: string } | null = null;

  async addBonus(bonus: { paymentDate: string; amount: number; leaveType: string }) {
    if (!this.employeeInfo) return;
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
    // 年間累計標準賞与額を計算
    const cumulativeHealthBonus = this.bonusDataList
      .reduce(
        (acc, item) => acc.add(new Decimal(item.calculationResult.applicableHealthStandardAmount)),
        new Decimal('0')
      )
      .toString();

    // サービスで計算
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
    this.editBonusIndex = index;
    this.editBonusInitialData = {
      paymentDate: item.paymentDate || '',
      amount: Number(item.amount),
      leaveType: item.leaveType || 'excluded',
    };
    this.showEditBonusForm = true;
  }

  async onEditBonusSave(bonus: { paymentDate: string; amount: number; leaveType: string }) {
    if (
      this.editBonusIndex !== null &&
      this.bonusDataList[this.editBonusIndex] &&
      this.employeeInfo
    ) {
      if (bonus.leaveType === 'maternity' || bonus.leaveType === 'childcare') {
        // 産休・育休の場合は計算せず0で登録
        const newItem: DisplayBonusHistoryItem = {
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
        };
        this.bonusDataList.splice(this.editBonusIndex, 1);
        this.bonusDataList.push(newItem);
        this.sortBonusList();
        this.createPivotedTable();
        this.saveBonusResults();
        this.showEditBonusForm = false;
        this.editBonusIndex = null;
        this.editBonusInitialData = null;
        return;
      }
      // 対象外に戻した場合はoriginalCalculationResultを必ず削除し、再計算で必ず上書き
      if (this.bonusDataList[this.editBonusIndex].originalCalculationResult) {
        delete this.bonusDataList[this.editBonusIndex].originalCalculationResult;
      }
      // 年間累計標準賞与額を再計算（自分以外の分のみ合計）
      const cumulativeHealthBonus = this.bonusDataList
        .filter((_, idx) => idx !== this.editBonusIndex)
        .reduce(
          (acc, item) =>
            acc.add(new Decimal(item.calculationResult.applicableHealthStandardAmount)),
          new Decimal('0')
        )
        .toString();

      // 再計算
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
        const newItem: DisplayBonusHistoryItem = {
          ...calculated,
          leaveType: bonus.leaveType || 'excluded',
        };
        if (newItem.originalCalculationResult) {
          delete newItem.originalCalculationResult;
        }
        this.bonusDataList.splice(this.editBonusIndex, 1);
        this.bonusDataList.push(newItem);
        this.sortBonusList();
        this.createPivotedTable();
        this.saveBonusResults();
      }
    }
    this.showEditBonusForm = false;
    this.editBonusIndex = null;
    this.editBonusInitialData = null;
  }

  onEditBonusClosed() {
    this.showEditBonusForm = false;
    this.editBonusIndex = null;
    this.editBonusInitialData = null;
  }

  // 削除ボタン押下時の処理
  onDeleteBonus(index: number): void {
    if (confirm('この賞与情報を削除しますか？')) {
      this.bonusDataList.splice(index, 1);
      this.createPivotedTable();
      this.saveBonusResults();
    }
  }
}
