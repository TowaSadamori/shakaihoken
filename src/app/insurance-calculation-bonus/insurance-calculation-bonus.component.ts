import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
  BonusCalculationService,
  CalculatedBonusHistoryItem,
} from '../services/bonus-calculation.service';
import { OfficeService } from '../services/office.service';

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

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private officeService: OfficeService,
    private bonusCalculationService: BonusCalculationService
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
      const results = await this.bonusCalculationService.getCalculatedBonusHistory(
        this.employeeId,
        this.targetYear,
        this.employeeInfo
      );

      this.bonusDataList = results;
      this.updateLimitNotes();
      this.createPivotedTable(); // ピボットテーブルを生成

      if (results.length > 0) {
        this.importStatusMessage = `✅ ${results.length}件の賞与データを取得・計算しました。`;
      } else {
        this.importStatusMessage = '対象年度の賞与データはありません。';
      }
    } catch (error) {
      console.error('賞与データの取得・計算エラー:', error);
      this.errorMessage = '賞与データの処理中にエラーが発生しました。';
    } finally {
      this.isLoading = false;
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
    this.router.navigate(['/']);
  }

  formatAmount(amount: string | undefined): string {
    if (amount === null || amount === undefined || amount.trim() === '' || amount === '-') {
      return '-';
    }
    const num = Number(amount);
    if (isNaN(num)) {
      return amount;
    }
    // toLocaleStringは整数と小数をうまく扱います
    return num.toLocaleString('ja-JP', {
      maximumFractionDigits: 2,
    });
  }

  formatPercentage(rate: string | undefined): string {
    if (!rate) return '-';
    // すでに '%' がついている場合はそのまま返す
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

  /**
   * 現在の会計年度を取得
   */
  private getFiscalYear(date: Date): bigint {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return BigInt(month >= 4 ? year : year - 1);
  }

  /**
   * 年度変更
   */
  async changeYear(delta: number) {
    this.targetYear = this.targetYear + BigInt(delta);
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { year: this.targetYear.toString() },
      queryParamsHandling: 'merge',
    });
    await this.loadBonusData();
  }

  /**
   * 前年度へ
   */
  async previousYear() {
    await this.changeYear(-1);
  }

  /**
   * 次年度へ
   */
  async nextYear() {
    await this.changeYear(1);
  }

  /**
   * 現在年度へ
   */
  async currentYear() {
    this.targetYear = this.getFiscalYear(new Date());
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { year: this.targetYear.toString() },
      queryParamsHandling: 'merge',
    });
    await this.loadBonusData();
  }
}
