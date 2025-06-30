import { AuthService } from '../services/auth.service';
import { UserService, User } from '../services/user.service';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import {
  InsuranceCalculationService,
  MonthlyInsuranceFee,
} from '../services/insurance-calculation.service';
import { SocialInsuranceCalculator } from '../utils/decimal-calculator';
import { Decimal } from 'decimal.js';
import { BonusCalculationService, BonusPremiumResult } from '../services/bonus-calculation.service';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';

// ユーザープロフィール型定義
interface UserProfileWithRole {
  uid: string;
  lastName: string;
  firstName: string;
  role: string;
}

// 判定結果のインターフェース
interface InsuranceEligibility {
  healthInsurance: { eligible: boolean; reason: string };
  pensionInsurance: { eligible: boolean; reason: string };
  careInsurance?: { eligible: boolean; reason: string };
}

interface EmployeeInsuranceData {
  employeeNumber: string;
  officeNumber: string;
  employeeName: string;
  attribute: string;
  currentMonth: MonthlyInsuranceFee;
  healthInsuranceGrade?: number | string;
  pensionInsuranceGrade?: number | string;
  leaveStatus?: string;
  // 賞与データ用
  paymentAmount?: string;
  standardBonusAmount?: string;
  healthInsuranceRate?: string;
  careInsuranceRate?: string;
  pensionInsuranceRate?: string;
}

// ユーザーに判定結果を追加した拡張インターフェース
interface UserWithJudgment extends User {
  judgmentResult?: InsuranceEligibility | null;
  careInsurancePeriod?: { start: string; end: string };
}

// 賞与データ表示用の型
export interface EmployeeBonusData {
  employeeNumber: string;
  officeNumber: string;
  employeeName: string;
  paymentInfo: string; // 支給回数・支給日
  paymentNumber: string; // 支給回数
  paymentDate?: string;
  amount: string;
  calculationResult: BonusPremiumResult;
  leaveType: string;
  careInsuranceTotal?: string;
  pensionInsuranceTotal?: string;
  healthInsuranceTotal?: string;
  careInsurancePeriod?: { start: string; end: string };
  companyId: string;
}

// Type for bonusResults item loaded from Firestore
interface BonusResultFirestoreItem {
  amount: string;
  paymentDate?: string;
  month?: string | number;
  year?: string | number;
  leaveType?: string;
  companyId?: string;
  branchNumber?: string;
  addressPrefecture?: string;
  employeeNumber?: string;
  calculationResult: BonusPremiumResult;
  healthInsuranceEmployee?: string;
  healthInsuranceTotal?: string;
  careInsuranceEmployee?: string;
  careInsuranceTotal?: string;
  pensionInsuranceEmployee?: string;
  pensionInsuranceTotal?: string;
  [key: string]: unknown;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatTabsModule,
    MatSelectModule,
    MatFormFieldModule,
    FormsModule,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  public SocialInsuranceCalculator = SocialInsuranceCalculator;
  currentUser: UserProfileWithRole | null = null;
  isAdmin = false;
  private firestore = getFirestore();

  // 事業所選択
  offices: { branchNumber: string; name: string }[] = [];
  selectedOffice = 'all';

  // 年次切り替え用
  selectedYear: number = new Date().getFullYear();
  selectedMonth: number = new Date().getMonth() + 1;
  years: number[] = [];
  months: { value: number; display: string }[] = [
    { value: 1, display: '1月' },
    { value: 2, display: '2月' },
    { value: 3, display: '3月' },
    { value: 4, display: '4月' },
    { value: 5, display: '5月' },
    { value: 6, display: '6月' },
    { value: 7, display: '7月' },
    { value: 8, display: '8月' },
    { value: 9, display: '9月' },
    { value: 10, display: '10月' },
    { value: 11, display: '11月' },
    { value: 12, display: '12月' },
    { value: 13, display: '賞与1回目' },
    { value: 14, display: '賞与2回目' },
    { value: 15, display: '賞与3回目' },
  ];

  // 賞与月を除外した月リスト
  get monthsFiltered() {
    return this.months.filter((m) => m.value < 13);
  }

  // 現在のユーザーの保険料データ
  currentUserInsurance: MonthlyInsuranceFee = {
    healthInsuranceEmployee: '0',
    healthInsuranceCompany: '0',
    pensionInsuranceEmployee: '0',
    pensionInsuranceCompany: '0',
    careInsuranceEmployee: '0',
    careInsuranceCompany: '0',
    totalEmployee: '0',
    totalCompany: '0',
  };

  // 月別データ（過去6ヶ月分）
  monthlyData: MonthlyInsuranceFee[] = [];

  // 全従業員データ
  allEmployeesData: EmployeeInsuranceData[] = [];
  private allOriginalEmployeesData: EmployeeInsuranceData[] = [];

  // 産休育休状態を管理するマップ
  leaveStatusMap = new Map<string, string>();

  // テーブル表示用の列定義
  displayedColumns: string[] = [
    'month',
    'healthInsuranceEmployee',
    'healthInsuranceCompany',
    'pensionInsuranceEmployee',
    'pensionInsuranceCompany',
    'totalEmployee',
    'totalCompany',
  ];

  // グループヘッダー用の列定義
  headerRowDefGroup: string[] = [];

  // テーブル表示用の列定義（動的に設定）
  displayedColumnsAdmin: string[] = [];

  // 月表示用の列定義
  displayedColumnsAdminMonth: string[] = [
    'employeeNumber',
    'officeNumber',
    'employeeName',
    'attribute',
    'healthInsuranceGrade',
    'healthInsuranceEmployee',
    'healthInsuranceCompany',
    'careInsuranceEmployee',
    'careInsuranceCompany',
    'pensionInsuranceGrade',
    'pensionInsuranceEmployee',
    'pensionInsuranceCompany',
    'totalEmployee',
    'totalCompany',
  ];

  // 賞与表示用の列定義
  displayedColumnsAdminBonus: string[] = [
    'employeeNumber',
    'officeNumber',
    'employeeName',
    'leaveType',
    'paymentInfo',
    'amount',
    'standardBonusAmount',
    'healthInsuranceRate',
    'healthInsuranceEmployee',
    'healthInsuranceCompany',
    'careInsuranceRate',
    'careInsuranceEmployee',
    'careInsuranceCompany',
    'pensionInsuranceRate',
    'pensionInsuranceEmployee',
    'pensionInsuranceCompany',
  ];

  // 賞与データ一覧
  allEmployeesBonusData: EmployeeBonusData[] = [];
  filteredEmployeesBonusData: EmployeeBonusData[] = [];

  private currentCompanyId = '';

  // 月ごとの会社負担額合計をキャッシュするプロパティ
  monthlyCompanyTotals: { month: number; healthInsuranceTotal: number; pensionTotal: number }[] =
    [];

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private insuranceCalculationService: InsuranceCalculationService,
    private bonusCalculationService: BonusCalculationService
  ) {}

  async ngOnInit() {
    this.currentCompanyId = (await this.authService.getCurrentUserCompanyId()) || '';
    this.setDisplayedColumns();
    try {
      // 現在のユーザー情報を取得
      this.currentUser = await this.authService.getCurrentUserProfileWithRole();
      if (!this.currentUser) return;

      this.isAdmin = this.currentUser.role === 'admin';

      // 会社IDを取得
      const companyId = await this.authService.getCurrentUserCompanyId();
      if (!companyId) return;

      // 事業所リストを取得
      await this.loadOffices(companyId);

      // 同じ会社の従業員データを取得
      const employees = await this.userService.getUsersByCompanyId(companyId);

      // 従業員番号でソート
      employees.sort((a, b) =>
        (a.employeeNumber || '').localeCompare(b.employeeNumber || '', undefined, { numeric: true })
      );

      // 各ユーザーの判定結果を取得
      await this.loadJudgmentResults(employees as UserWithJudgment[]);

      if (this.isAdmin) {
        // 管理者：全従業員のデータを表示
        this.allOriginalEmployeesData = await Promise.all(
          (employees as UserWithJudgment[]).map((employee) =>
            this.convertToEmployeeInsuranceData(employee)
          )
        );
        this.filterDataByOffice(); // 初期表示
      } else {
        // 従業員：自分のデータのみをテーブル形式で表示
        const currentUserData = employees.find((emp) => emp.uid === this.currentUser?.uid);
        if (currentUserData) {
          this.allEmployeesData = [
            await this.convertToEmployeeInsuranceData(currentUserData as UserWithJudgment),
          ];
        } else {
          this.allEmployeesData = [];
        }
      }

      // 管理者の場合も月別データを生成（全従業員の合計）
      if (this.isAdmin && employees.length > 0) {
        this.monthlyData = this.generateMonthlyDataForAdmin(employees);
      }

      // 年次切り替え用の年リストを生成
      const currentYear = new Date().getFullYear();
      this.years = Array.from({ length: 10 }, (_, i) => currentYear - i);

      // 賞与データ取得処理の呼び出し（実装は後続で追加）
      await this.loadAllEmployeesBonusData();
      this.filterBonusData();
      // 会社負担額合計を再計算
      this.monthlyCompanyTotals = this.calcMonthlyCompanyTotals();
    } catch (error) {
      console.error('初期化エラー:', error);
    }
  }

  // 事業所リストを読み込む
  private async loadOffices(companyId: string): Promise<void> {
    const officesCol = collection(this.firestore, 'offices');
    const q = query(officesCol, where('companyId', '==', companyId));
    const snapshot = await getDocs(q);
    this.offices = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        branchNumber: data['branchNumber'],
        name: data['name'],
      };
    });
  }

  // 判定結果を読み込むメソッド
  private async loadJudgmentResults(users: UserWithJudgment[]): Promise<void> {
    const db = getFirestore();
    const currentCompanyId = await this.authService.getCurrentUserCompanyId();

    for (const user of users) {
      try {
        const docRef = doc(db, 'insuranceJudgments', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const savedData = docSnap.data() as Record<string, unknown>;

          // 会社ID、事業所番号、従業員番号が一致するかチェック
          if (
            savedData['employeeNumber'] === user.employeeNumber &&
            savedData['officeNumber'] === user.branchNumber?.toString() &&
            user.companyId === currentCompanyId
          ) {
            user.judgmentResult = savedData['judgmentResult'] as InsuranceEligibility;
            user.careInsurancePeriod = savedData['careInsurancePeriod'] as {
              start: string;
              end: string;
            };
          }
        }
      } catch (error) {
        console.error(`Error loading judgment for user ${user.uid}:`, error);
      }
    }
  }

  // User型からEmployeeInsuranceData型への変換
  private async convertToEmployeeInsuranceData(
    user: UserWithJudgment
  ): Promise<EmployeeInsuranceData> {
    let healthInsuranceGrade: number | string = '-';
    let pensionInsuranceGrade: number | string = '-';
    let currentMonthData: MonthlyInsuranceFee = {
      healthInsuranceEmployee: '0',
      healthInsuranceCompany: '0',
      pensionInsuranceEmployee: '0',
      pensionInsuranceCompany: '0',
      careInsuranceEmployee: '0',
      careInsuranceCompany: '0',
      totalEmployee: '0',
      totalCompany: '0',
    };
    // 賞与・休業用の変数を初期化
    let standardBonusAmount: string | undefined;
    let healthInsuranceRate: string | undefined;
    let careInsuranceRate: string | undefined;
    let pensionInsuranceRate: string | undefined;

    // 判定ステータスを先に取得
    const judgmentStatus = this.getJudgmentStatus(user);

    // 「対象」以外の場合はFirestoreからデータを取得しない
    if (judgmentStatus !== '対象') {
      return {
        employeeNumber: user.employeeNumber || '',
        officeNumber: user.branchNumber || '',
        employeeName: `${user.lastName || ''} ${user.firstName || ''}`.trim(),
        attribute: judgmentStatus,
        currentMonth: currentMonthData,
        healthInsuranceGrade,
        pensionInsuranceGrade,
        leaveStatus: this.getLeaveStatus(user.employeeNumber || ''),
      };
    }

    const companyId = await this.authService.getCurrentUserCompanyId();
    if (companyId && user.uid) {
      const fiscalYear = this.selectedMonth < 4 ? this.selectedYear - 1 : this.selectedYear;
      // 月次データか賞与データかでパスを切り替え
      const collectionName =
        this.selectedMonth >= 13 ? 'bonus_calculation_results' : 'salary_calculation_results';
      const docPath = `companies/${companyId}/employees/${user.uid}/${collectionName}/${
        collectionName === 'bonus_calculation_results' ? fiscalYear : this.selectedYear
      }`;

      const docRef = doc(this.firestore, docPath);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const yearData = docSnap.data();

        if (this.selectedMonth >= 1 && this.selectedMonth <= 12) {
          // 月次データの処理 (元のロジックを簡略化して再利用)
          const monthCalculation = yearData['months']?.[this.selectedMonth];
          if (monthCalculation) {
            healthInsuranceGrade = monthCalculation.healthInsuranceGrade;
            pensionInsuranceGrade = monthCalculation.pensionInsuranceGrade;
            currentMonthData = {
              healthInsuranceEmployee: this.safeGetAmount(
                monthCalculation.healthInsuranceFeeEmployee
              ),
              healthInsuranceCompany: this.safeGetAmount(
                monthCalculation.healthInsuranceFeeCompany
              ),
              pensionInsuranceEmployee: this.safeGetAmount(
                monthCalculation.pensionInsuranceFeeEmployee
              ),
              pensionInsuranceCompany: this.safeGetAmount(
                monthCalculation.pensionInsuranceFeeCompany
              ),
              careInsuranceEmployee: this.safeGetAmount(monthCalculation.careInsuranceFeeEmployee),
              careInsuranceCompany: this.safeGetAmount(monthCalculation.careInsuranceFeeCompany),
              totalEmployee: '0', // 合計は後で計算
              totalCompany: '0',
            };
          }
        } else if (this.selectedMonth >= 13) {
          // 賞与データの処理
          const bonusIndex = this.selectedMonth - 13;
          const bonusResults = yearData['bonusResults'];
          if (bonusResults && bonusResults[bonusIndex]) {
            const bonusData = bonusResults[bonusIndex];
            const result = bonusData.calculationResult;
            standardBonusAmount = result.standardBonusAmount;
            healthInsuranceRate = result.healthInsuranceRate;
            careInsuranceRate = result.careInsuranceRate;
            pensionInsuranceRate = result.pensionInsuranceRate;

            const healthFeeEmployee = this.safeGetAmount(result.healthInsurance.employeeBurden);
            const pensionFeeEmployee = this.safeGetAmount(result.pensionInsurance.employeeBurden);
            const careFeeEmployee = this.safeGetAmount(result.careInsurance?.employeeBurden);
            const healthFeeCompany = this.safeGetAmount(result.healthInsurance.companyBurden);
            const pensionFeeCompany = this.safeGetAmount(result.pensionInsurance.companyBurden);
            const careFeeCompany = this.safeGetAmount(result.careInsurance?.companyBurden);

            currentMonthData = {
              healthInsuranceEmployee: healthFeeEmployee,
              healthInsuranceCompany: healthFeeCompany,
              pensionInsuranceEmployee: pensionFeeEmployee,
              pensionInsuranceCompany: pensionFeeCompany,
              careInsuranceEmployee: careFeeEmployee,
              careInsuranceCompany: careFeeCompany,
              totalEmployee: '0', // 合計は後で計算
              totalCompany: '0',
            };
          }
        }
      }
    }

    // 合計の再計算
    currentMonthData.totalEmployee = SocialInsuranceCalculator.addAmounts(
      SocialInsuranceCalculator.addAmounts(
        currentMonthData.healthInsuranceEmployee,
        currentMonthData.careInsuranceEmployee
      ),
      currentMonthData.pensionInsuranceEmployee
    );

    // 会社負担合計（参考値）
    // 健康保険会社負担 = 健康保険全額 - 健康保険本人
    // 介護保険会社負担 = 介護保険全額 - 介護保険本人
    // 厚生年金会社負担 = 厚生年金全額 - 厚生年金本人
    // (健康保険会社負担 + 介護保険会社負担)を合算し1円未満切り捨て、厚生年金会社負担も1円未満切り捨て、その合計
    const healthCompany = SocialInsuranceCalculator.subtractAmounts(
      currentMonthData.healthInsuranceCompany,
      currentMonthData.healthInsuranceEmployee
    );
    const careCompany = SocialInsuranceCalculator.subtractAmounts(
      currentMonthData.careInsuranceCompany,
      currentMonthData.careInsuranceEmployee
    );
    const pensionCompany = SocialInsuranceCalculator.subtractAmounts(
      currentMonthData.pensionInsuranceCompany,
      currentMonthData.pensionInsuranceEmployee
    );
    // 健康＋介護を合算し1円未満切り捨て
    const healthCareSum = new Decimal(healthCompany).add(new Decimal(careCompany)).floor();
    // 厚生年金は単独で1円未満切り捨て
    const pensionFloor = new Decimal(pensionCompany).floor();
    // 合算
    const totalCompanyValue = healthCareSum.add(pensionFloor);
    currentMonthData.totalCompany = totalCompanyValue.isZero() ? '-' : totalCompanyValue.toString();

    return {
      employeeNumber: user.employeeNumber || '',
      officeNumber: user.branchNumber || '',
      employeeName: `${user.lastName || ''} ${user.firstName || ''}`.trim(),
      attribute: judgmentStatus,
      currentMonth: currentMonthData,
      healthInsuranceGrade,
      pensionInsuranceGrade,
      leaveStatus: this.getLeaveStatus(user.employeeNumber || ''),
      standardBonusAmount,
      healthInsuranceRate,
      careInsuranceRate,
      pensionInsuranceRate,
    };
  }

  // 判定状況を取得
  private getJudgmentStatus(user: UserWithJudgment): string {
    const result = user.judgmentResult;
    if (!result) {
      return '未実施';
    }

    const { healthInsurance, pensionInsurance, careInsurance } = result;

    if (healthInsurance.eligible || pensionInsurance.eligible || careInsurance?.eligible) {
      return '対象';
    }

    return '対象外';
  }

  // 金額を安全に取得するヘルパー関数
  public safeGetAmount(value: string | number | null | undefined): string {
    if (value === null || typeof value === 'undefined') {
      return '0';
    }
    const strValue = String(value).replace(/,/g, '').trim();
    // 値が空、ハイフン、または無効な数値の場合は '0' を返す
    if (strValue === '' || strValue === '-' || isNaN(parseFloat(strValue))) {
      // 予期しない値の場合のみ警告
      if (strValue !== '' && strValue !== '-' && !/^\d+(\.\d+)?$/.test(strValue)) {
        console.warn('Unexpected value for amount, treating as 0:', value);
      }
      return '0';
    }
    return strValue;
  }

  // 個人用の月別データ生成（過去6ヶ月分）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private generateMonthlyData(_user: User): MonthlyInsuranceFee[] {
    const monthlyData: MonthlyInsuranceFee[] = [];

    for (let i = 0; i < 6; i++) {
      monthlyData.push({
        healthInsuranceEmployee: '0', // TODO: 実際の計算ロジック実装
        healthInsuranceCompany: '0',
        pensionInsuranceEmployee: '0',
        pensionInsuranceCompany: '0',
        careInsuranceEmployee: '0',
        careInsuranceCompany: '0',
        totalEmployee: '0',
        totalCompany: '0',
      });
    }

    return monthlyData;
  }

  // 管理者用の月別データ生成（全従業員の合計）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private generateMonthlyDataForAdmin(_employees: User[]): MonthlyInsuranceFee[] {
    const monthlyData: MonthlyInsuranceFee[] = [];

    for (let i = 0; i < 6; i++) {
      // TODO: 各従業員の保険料を計算して合計
      monthlyData.push({
        healthInsuranceEmployee: '0', // TODO: 全従業員の合計計算
        healthInsuranceCompany: '0',
        pensionInsuranceEmployee: '0',
        pensionInsuranceCompany: '0',
        careInsuranceEmployee: '0',
        careInsuranceCompany: '0',
        totalEmployee: '0',
        totalCompany: '0',
      });
    }

    return monthlyData;
  }

  // 数値をカンマ区切りで表示
  formatNumber(num: string | number | undefined): string {
    if (num === null || typeof num === 'undefined' || num === '') return '0';
    const strNum = String(num);

    const parts = strNum.split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decimalPart = parts[1];

    return decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
  }

  calculateInsuranceTotal(
    healthEmployee: string,
    careEmployee: string,
    pensionEmployee: string
  ): string {
    // 3つを単純合計（どちらか一方が0円なので二重計上にならない）
    return SocialInsuranceCalculator.addAmounts(
      SocialInsuranceCalculator.addAmounts(healthEmployee, careEmployee),
      pensionEmployee
    );
  }

  getTotalCompanyExpense(): string {
    return this.allEmployeesData.reduce((acc, curr) => {
      return SocialInsuranceCalculator.addAmounts(acc, curr.currentMonth.totalCompany);
    }, '0');
  }

  getTotalEmployeeDeduction(): string {
    return this.allEmployeesData.reduce((acc, curr) => {
      return SocialInsuranceCalculator.addAmounts(acc, curr.currentMonth.totalEmployee);
    }, '0');
  }

  // 年次切り替え時の処理
  async onYearChange() {
    console.log('=== onYearChange START ===');
    this.setDisplayedColumns();
    await this.refreshData();
    console.log(
      'onYearChange: refreshData完了後のallEmployeesData件数:',
      this.allEmployeesData.length
    );
    console.log(
      'onYearChange: refreshData完了後のallEmployeesBonusData件数:',
      this.allEmployeesBonusData.length
    );
    this.monthlyCompanyTotals = this.calcMonthlyCompanyTotals();
    console.log('=== onYearChange END ===');
  }

  // 月選択変更時の処理
  async onMonthChange() {
    console.log('=== onMonthChange START ===');
    this.setDisplayedColumns();
    await this.refreshData();
    console.log(
      'onMonthChange: refreshData完了後のallEmployeesData件数:',
      this.allEmployeesData.length
    );
    console.log(
      'onMonthChange: refreshData完了後のallEmployeesBonusData件数:',
      this.allEmployeesBonusData.length
    );
    this.monthlyCompanyTotals = this.calcMonthlyCompanyTotals();
    console.log('=== onMonthChange END ===');
  }

  async onOfficeChange() {
    console.log('=== onOfficeChange START ===');
    console.log('onOfficeChange: selectedOffice:', this.selectedOffice);
    console.log('onOfficeChange: 実行前のallEmployeesData件数:', this.allEmployeesData.length);
    console.log(
      'onOfficeChange: 実行前のallOriginalEmployeesData件数:',
      this.allOriginalEmployeesData.length
    );
    this.filterDataByOffice();
    this.filterBonusData();
    console.log('onOfficeChange: フィルタ後のallEmployeesData件数:', this.allEmployeesData.length);
    this.monthlyCompanyTotals = this.calcMonthlyCompanyTotals();
    console.log('=== onOfficeChange END ===');
  }

  // 表示する列を動的に設定するメソッド
  private setDisplayedColumns() {
    if (this.selectedMonth >= 13) {
      this.displayedColumnsAdmin = this.displayedColumnsAdminBonus;
      this.headerRowDefGroup = []; // 賞与テーブルにはグループヘッダーなし
    } else {
      this.displayedColumnsAdmin = this.displayedColumnsAdminMonth;
      this.headerRowDefGroup = [
        'employeeInfoGroup',
        'healthInsuranceGroup',
        'careInsuranceGroup',
        'pensionInsuranceGroup',
        'totalsGroup',
      ];
    }
  }

  // データ更新処理（年月変更時共通）
  private async refreshData() {
    this.setDisplayedColumns();
    try {
      const companyId = await this.authService.getCurrentUserCompanyId();
      if (!companyId) return;

      const employees = await this.userService.getUsersByCompanyId(companyId);

      // 従業員番号でソート
      employees.sort((a, b) =>
        (a.employeeNumber || '').localeCompare(b.employeeNumber || '', undefined, { numeric: true })
      );

      // 判定結果を再読み込み
      await this.loadJudgmentResults(employees as UserWithJudgment[]);

      if (this.selectedMonth >= 13) {
        // 賞与データ取得ロジック
        await this.loadLeaveStatusForAllEmployees(employees, this.selectedYear);
        this.allOriginalEmployeesData = await Promise.all(
          employees.map((employee) => this.convertToEmployeeInsuranceData(employee))
        );
      } else {
        // 月次データ取得ロジック
        this.allOriginalEmployeesData = await Promise.all(
          (employees as UserWithJudgment[]).map((employee) =>
            this.convertToEmployeeInsuranceData(employee)
          )
        );
      }

      if (this.isAdmin) {
        // 管理者：全従業員のデータを表示
        this.filterDataByOffice();

        // 管理者の月別データを再生成
        this.monthlyData = this.generateMonthlyDataForAdmin(employees);
      } else {
        // 従業員：自分のデータのみ表示
        const currentUserData = employees.find(
          (emp) => emp.uid === this.currentUser?.uid
        ) as UserWithJudgment;
        if (currentUserData) {
          this.allEmployeesData = [await this.convertToEmployeeInsuranceData(currentUserData)];
          // 個人保険料データも更新
          const employeeData = this.allEmployeesData.find(
            (e) => e.employeeNumber === currentUserData.employeeNumber
          );
          if (employeeData) {
            this.currentUserInsurance = employeeData.currentMonth;
          }
          // 月別データを再生成
          this.monthlyData = this.generateMonthlyData(currentUserData);
        }
      }
      // --- ここで賞与データも更新する ---
      await this.loadAllEmployeesBonusData();
      this.filterBonusData();
    } catch (error) {
      console.error('データ更新エラー:', error);
    }
  }

  // 全従業員の産休育休状態を読み込む
  private async loadLeaveStatusForAllEmployees(employees: User[], year: number): Promise<void> {
    this.leaveStatusMap.clear();
    const companyId = await this.authService.getCurrentUserCompanyId();
    if (!companyId) return;

    // fiscalYearは日本の年度（4月始まり）
    const fiscalYear = this.selectedMonth < 4 ? year - 1 : year;

    for (const employee of employees) {
      if (!employee.uid) continue;

      const docPath = `companies/${companyId}/employees/${employee.uid}/bonus_calculation_results/${fiscalYear}`;
      const docRef = doc(this.firestore, docPath);
      const docSnap = await getDoc(docRef);

      let leaveStatus = '未設定'; // デフォルト値
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data['bonusResults'] && Array.isArray(data['bonusResults'])) {
          // 日付が最新の賞与レコードを探す
          const latestBonus = data['bonusResults'].reduce((latest, current) => {
            if (!latest) return current;
            const latestDate = new Date(latest.paymentDate || 0);
            const currentDate = new Date(current.paymentDate || 0);
            return currentDate > latestDate ? current : latest;
          }, null);

          if (latestBonus && latestBonus.leaveType) {
            leaveStatus = latestBonus.leaveType;
          }
        }
      }
      if (employee.employeeNumber) {
        this.leaveStatusMap.set(employee.employeeNumber, leaveStatus);
      }
    }
  }

  // 従業員の産休育休状態を取得
  getLeaveStatus(employeeNumber: string): string {
    return this.leaveStatusMap.get(employeeNumber) || 'none';
  }

  // 従業員の産休育休状態をラベル形式で取得
  getLeaveStatusLabel(status: string | undefined | null): string {
    if (!status) {
      return '未設定';
    }
    switch (status) {
      case 'none':
        return '未設定';
      case 'maternity':
        return '産休';
      case 'childcare':
        return '育休';
      default:
        return '未設定';
    }
  }

  // 産休育休状態の変更処理
  onLeaveStatusChange(event: Event, employeeNumber: string): void {
    const target = event.target as HTMLSelectElement;
    const newLeaveType = target.value;

    // マップを更新
    this.leaveStatusMap.set(employeeNumber, newLeaveType);

    // TODO: Firestoreに保存する処理を後で実装
    console.log(`産休育休状態変更: ${employeeNumber} -> ${newLeaveType}`);
  }

  // フィルタリングメソッド
  private filterDataByOffice() {
    console.log('filterDataByOffice: selectedOffice =', this.selectedOffice);
    console.log(
      'filterDataByOffice: allOriginalEmployeesData件数 =',
      this.allOriginalEmployeesData.length
    );
    if (this.selectedOffice === 'all') {
      this.allEmployeesData = [...this.allOriginalEmployeesData];
    } else {
      this.allEmployeesData = this.allOriginalEmployeesData.filter(
        (employee) => employee.officeNumber === this.selectedOffice
      );
    }
    console.log(
      'filterDataByOffice: フィルタ後のallEmployeesData件数 =',
      this.allEmployeesData.length
    );
  }

  private filterBonusData() {
    console.log('filterBonusData: allEmployeesBonusData件数 =', this.allEmployeesBonusData.length);
    this.filteredEmployeesBonusData = this.allEmployeesBonusData.filter((bonus) => {
      if (bonus.paymentDate) {
        const date = new Date(bonus.paymentDate);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        if (year !== this.selectedYear || month !== this.selectedMonth) return false;
      }
      if (
        this.selectedOffice !== 'all' &&
        String(bonus.officeNumber) !== String(this.selectedOffice)
      )
        return false;
      if (bonus.companyId && bonus.companyId !== this.currentCompanyId) return false;
      return true;
    });
    console.log(
      'filterBonusData: フィルタ後のfilteredEmployeesBonusData件数 =',
      this.filteredEmployeesBonusData.length
    );
  }

  // 月ごとの会社負担額合計を計算する純粋関数
  private calcMonthlyCompanyTotals(): {
    month: number;
    healthInsuranceTotal: number;
    pensionTotal: number;
  }[] {
    console.log('=== 会社負担額計算開始 ===');
    console.log('allEmployeesData件数:', this.allEmployeesData.length);
    console.log('allEmployeesBonusData件数:', this.allEmployeesBonusData.length);
    console.log('selectedOffice:', this.selectedOffice);

    const results: { month: number; healthInsuranceTotal: number; pensionTotal: number }[] = [];

    for (let m = 4; m <= 15; m++) {
      const displayMonth = m > 12 ? m - 12 : m;
      console.log(`\n--- ${displayMonth}月の計算開始 ---`);

      // 給与分の全従業員合計を先に計算
      console.log('【給与分 - 全従業員合計計算】');

      let totalHealthInsuranceAll = 0; // 健康保険全額合計
      let totalHealthInsuranceEmployee = 0; // 健康保険本人負担合計
      let totalCareInsuranceAll = 0; // 介護保険全額合計
      let totalCareInsuranceEmployee = 0; // 介護保険本人負担合計
      let totalPensionInsuranceAll = 0; // 厚生年金全額合計
      let totalPensionInsuranceEmployee = 0; // 厚生年金本人負担合計

      // 給与データから全従業員分の合計を計算
      for (const emp of this.allEmployeesData) {
        if (this.selectedOffice !== 'all' && emp.officeNumber !== this.selectedOffice) continue;

        // 健康保険
        const healthCompany = Number(emp.currentMonth.healthInsuranceCompany) || 0;
        const healthEmployee = Number(emp.currentMonth.healthInsuranceEmployee) || 0;
        const healthTotal = healthCompany + healthEmployee;

        // 介護保険
        const careCompany = Number(emp.currentMonth.careInsuranceCompany) || 0;
        const careEmployee = Number(emp.currentMonth.careInsuranceEmployee) || 0;
        const careTotal = careCompany + careEmployee;

        // 厚生年金
        const pensionCompany = Number(emp.currentMonth.pensionInsuranceCompany) || 0;
        const pensionEmployee = Number(emp.currentMonth.pensionInsuranceEmployee) || 0;
        const pensionTotal = pensionCompany + pensionEmployee;

        totalHealthInsuranceAll += healthTotal;
        totalHealthInsuranceEmployee += healthEmployee;
        totalCareInsuranceAll += careTotal;
        totalCareInsuranceEmployee += careEmployee;
        totalPensionInsuranceAll += pensionTotal;
        totalPensionInsuranceEmployee += pensionEmployee;
      }

      // 給与分会社負担計算
      const salaryHealthCareCompanyBurden = Math.floor(
        totalHealthInsuranceAll +
          totalCareInsuranceAll -
          totalHealthInsuranceEmployee -
          totalCareInsuranceEmployee
      );
      const salaryPensionCompanyBurden = Math.floor(
        totalPensionInsuranceAll - totalPensionInsuranceEmployee
      );

      console.log(
        `給与分合計: 健康+介護保険[全額${totalHealthInsuranceAll + totalCareInsuranceAll}円-本人${totalHealthInsuranceEmployee + totalCareInsuranceEmployee}円=会社${salaryHealthCareCompanyBurden}円]`
      );
      console.log(
        `給与分合計: 厚生年金[全額${totalPensionInsuranceAll}円-本人${totalPensionInsuranceEmployee}円=会社${salaryPensionCompanyBurden}円]`
      );

      // 賞与分の全従業員合計を計算
      console.log('【賞与分 - 全従業員合計計算】');

      let bonusTotalHealthInsuranceAll = 0;
      let bonusTotalHealthInsuranceEmployee = 0;
      let bonusTotalCareInsuranceAll = 0;
      let bonusTotalCareInsuranceEmployee = 0;
      let bonusTotalPensionInsuranceAll = 0;
      let bonusTotalPensionInsuranceEmployee = 0;
      let bonusCount = 0;

      for (const bonus of this.allEmployeesBonusData || []) {
        if (this.selectedOffice !== 'all' && bonus.officeNumber !== this.selectedOffice) continue;

        // 月フィルタ
        if (bonus.paymentDate) {
          const date = new Date(bonus.paymentDate);
          const month = date.getMonth() + 1;
          if (month !== displayMonth) continue;
        }

        // 健康保険
        const healthTotal = Number(bonus.healthInsuranceTotal) || 0;
        const healthEmployee =
          Number(bonus.calculationResult?.healthInsurance?.employeeBurden) || 0;

        // 介護保険
        const careTotal = Number(bonus.careInsuranceTotal) || 0;
        const careEmployee = Number(bonus.calculationResult?.careInsurance?.employeeBurden) || 0;

        // 厚生年金
        const pensionTotal = Number(bonus.pensionInsuranceTotal) || 0;
        const pensionEmployee =
          Number(bonus.calculationResult?.pensionInsurance?.employeeBurden) || 0;

        bonusTotalHealthInsuranceAll += healthTotal;
        bonusTotalHealthInsuranceEmployee += healthEmployee;
        bonusTotalCareInsuranceAll += careTotal;
        bonusTotalCareInsuranceEmployee += careEmployee;
        bonusTotalPensionInsuranceAll += pensionTotal;
        bonusTotalPensionInsuranceEmployee += pensionEmployee;

        bonusCount++;
      }

      // 賞与分会社負担計算
      const bonusHealthCareCompanyBurden = Math.floor(
        bonusTotalHealthInsuranceAll +
          bonusTotalCareInsuranceAll -
          bonusTotalHealthInsuranceEmployee -
          bonusTotalCareInsuranceEmployee
      );
      const bonusPensionCompanyBurden = Math.floor(
        bonusTotalPensionInsuranceAll - bonusTotalPensionInsuranceEmployee
      );

      console.log(
        `賞与分合計(${bonusCount}件): 健康+介護保険[全額${bonusTotalHealthInsuranceAll + bonusTotalCareInsuranceAll}円-本人${bonusTotalHealthInsuranceEmployee + bonusTotalCareInsuranceEmployee}円=会社${bonusHealthCareCompanyBurden}円]`
      );
      console.log(
        `賞与分合計(${bonusCount}件): 厚生年金[全額${bonusTotalPensionInsuranceAll}円-本人${bonusTotalPensionInsuranceEmployee}円=会社${bonusPensionCompanyBurden}円]`
      );

      // 月合計の計算（給与分 + 賞与分）- 既に端数処理済み
      const monthlyHealthCareCompanyTotal =
        salaryHealthCareCompanyBurden + bonusHealthCareCompanyBurden;
      const monthlyPensionCompanyTotal = salaryPensionCompanyBurden + bonusPensionCompanyBurden;

      // 既に各段階で端数処理済みなので、そのまま使用
      const afterFloorHealthCare = monthlyHealthCareCompanyTotal;
      const afterFloorPension = monthlyPensionCompanyTotal;

      console.log(`【${displayMonth}月 最終計算】`);
      console.log(
        `健康+介護保険: 給与${salaryHealthCareCompanyBurden}円 + 賞与${bonusHealthCareCompanyBurden}円 = ${monthlyHealthCareCompanyTotal}円 → 切り捨て後${afterFloorHealthCare}円`
      );
      console.log(
        `厚生年金: 給与${salaryPensionCompanyBurden}円 + 賞与${bonusPensionCompanyBurden}円 = ${monthlyPensionCompanyTotal}円 → 切り捨て後${afterFloorPension}円`
      );
      console.log(`--- ${displayMonth}月の計算終了 ---`);

      results.push({
        month: displayMonth,
        healthInsuranceTotal: afterFloorHealthCare,
        pensionTotal: afterFloorPension,
      });
    }

    console.log('=== 会社負担額計算終了 ===');
    return results;
  }

  // 選択中の事業所名を返すgetter
  get selectedOfficeName(): string {
    if (this.selectedOffice === 'all') {
      return '全事業所';
    }
    const office = this.offices.find((o) => o.branchNumber === this.selectedOffice);
    return office ? office.name : '';
  }

  /**
   * 従業員負担と会社負担の合計額を計算
   */
  calculateTotalAmount(employeeAmount: string, companyAmount: string): string {
    if (!employeeAmount || !companyAmount || employeeAmount === '0' || companyAmount === '0') {
      return '0';
    }

    try {
      return SocialInsuranceCalculator.addAmounts(employeeAmount, companyAmount);
    } catch (error) {
      console.error('金額計算エラー:', error);
      return '0';
    }
  }

  /**
   * 小数点まで表示用にフォーマット
   */
  formatNumberWithDecimal(amount: string): string {
    if (!amount || amount === '0' || amount === '' || amount === '-') {
      return '0';
    }

    try {
      const num = parseFloat(amount);
      return num.toLocaleString('ja-JP', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    } catch (error) {
      console.error('金額フォーマットエラー:', error);
      return amount;
    }
  }

  /**
   * 等級の表示フォーマット（産休・育休以外で0や空の場合は"-"表示）
   */
  formatGrade(grade: number | string | null | undefined): string {
    if (grade === null || grade === undefined || grade === '') {
      return '-';
    }

    const strGrade = String(grade);

    // 産休・育休の場合はそのまま表示
    if (strGrade === '産休' || strGrade === '育休') {
      return strGrade;
    }

    // 数値の場合、0は"-"表示
    if (strGrade === '0') {
      return '-';
    }

    return strGrade;
  }

  /**
   * 金額セルの表示フォーマット（等級または産休・育休なら0円表示、それ以外で0円は「-」表示）
   */
  formatMoneyCell(
    amount: string | number | null | undefined,
    leaveStatus?: string,
    grade?: string | number | null | undefined
  ): string {
    const gradeStr = grade != null ? String(grade) : '';
    // 等級またはleaveStatusが産休・育休の場合は0円でも0円表示
    if (
      gradeStr === '産休' ||
      gradeStr === '育休' ||
      leaveStatus === '産休' ||
      leaveStatus === '育休'
    ) {
      return this.formatNumberWithDecimal(String(amount)) + '円';
    }
    // 0, null, 空文字, - の場合は「-」
    if (!amount || amount === '0' || amount === '-' || amount === '') {
      return '-';
    }
    // それ以外は通常の金額表示
    return this.formatNumberWithDecimal(String(amount)) + '円';
  }

  // 全従業員分の賞与データを取得してallEmployeesBonusDataに格納する
  private async loadAllEmployeesBonusData() {
    this.allEmployeesBonusData = [];
    try {
      const companyId = await this.authService.getCurrentUserCompanyId();
      if (!companyId) return;
      const employees = await this.userService.getUsersByCompanyId(companyId);
      const usersWithJudgment: UserWithJudgment[] = employees as UserWithJudgment[];
      await this.loadJudgmentResults(usersWithJudgment);
      const targetEmployees = usersWithJudgment.filter((u) => this.getJudgmentStatus(u) === '対象');
      const fiscalYear = this.selectedMonth < 4 ? this.selectedYear - 1 : this.selectedYear;
      const bonusDataList: EmployeeBonusData[] = [];
      for (const user of targetEmployees) {
        const employeeNumber = user.employeeNumber || '';
        const officeNumber = user.branchNumber || '';
        const employeeName = `${user.lastName || ''} ${user.firstName || ''}`.trim();
        // Firestoreのbonus_calculation_resultsから直接取得
        const docPath = `companies/${companyId}/employees/${user.uid}/bonus_calculation_results/${fiscalYear}`;
        const docRef = doc(this.firestore, docPath);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data && Array.isArray(data['bonusResults'])) {
            data['bonusResults'].forEach((bonusItem: BonusResultFirestoreItem, idx: number) => {
              const paymentInfo = `第${idx + 1}回（${bonusItem.paymentDate || '-'}）`;
              bonusDataList.push({
                employeeNumber,
                officeNumber,
                employeeName,
                paymentInfo,
                paymentNumber: `第${idx + 1}回`,
                paymentDate: bonusItem.paymentDate,
                amount: bonusItem.amount || '-',
                calculationResult: bonusItem.calculationResult,
                leaveType: bonusItem.leaveType || 'excluded',
                careInsuranceTotal: bonusItem.careInsuranceTotal ?? '-',
                pensionInsuranceTotal: bonusItem.pensionInsuranceTotal ?? '-',
                healthInsuranceTotal: bonusItem.healthInsuranceTotal ?? '-',
                careInsurancePeriod: user.careInsurancePeriod,
                companyId: companyId,
              });
            });
          }
        }
      }
      this.allEmployeesBonusData = bonusDataList;
      this.filterBonusData();
    } catch (error) {
      console.error('賞与データ取得エラー:', error);
      this.allEmployeesBonusData = [];
    }
  }

  // 賞与テーブル用: 育休産休ラベル
  public getLeaveTypeLabel(leaveType: string): string {
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

  // 賞与テーブル用: 金額フォーマット
  public formatAmount(value: string | number | undefined | null): string {
    if (value === null || typeof value === 'undefined' || value === '') return '-';
    try {
      const decimal = new Decimal(String(value));
      // 丸め処理適用（50銭以下切り捨て、50銭超切り上げ）
      const roundedAmount = SocialInsuranceCalculator.roundForTotalAmount(decimal);
      const num = Number(roundedAmount);
      if (isNaN(num)) return String(value);
      return num.toLocaleString();
    } catch (error) {
      console.error('金額フォーマットエラー:', error);
      return String(value);
    }
  }

  // 賞与テーブル用: 料率フォーマット
  public formatPercentage(rate: string | undefined | null): string {
    if (!rate) return '-';
    if (rate.includes('%')) return rate;
    const num = parseFloat(rate);
    if (isNaN(num)) return rate;
    return num.toFixed(3) + '%';
  }

  // 支給日が介護保険該当期間内かどうか判定
  public isInCareInsurancePeriod(
    paymentDate: string | undefined,
    period: { start: string; end: string } | undefined
  ): boolean {
    if (!paymentDate || !period) return false;
    const date = new Date(paymentDate);
    const start = new Date(period.start);
    const end = new Date(period.end);
    return date >= start && date <= end;
  }

  // 日付から月のみを表示するフォーマット関数
  public formatPaymentMonth(dateStr?: string): string {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length >= 2) {
      const year = parts[0];
      const month = parseInt(parts[1]);
      return `${year}年${month}月`;
    }
    return dateStr;
  }

  /**
   * 賞与の従業員負担合計を計算
   */
  public calculateEmployeeBurdenTotal(bonus: EmployeeBonusData): string {
    if (!bonus.calculationResult) return '0';

    let total = 0;
    const debugInfo: string[] = [];

    // 介護保険該当期間かどうかの判定
    const isCareInsurancePeriod = this.isInCareInsurancePeriod(
      bonus.paymentDate,
      bonus.careInsurancePeriod
    );
    debugInfo.push(`介護保険該当: ${isCareInsurancePeriod ? 'Yes' : 'No'}`);

    // 健康保険料（個人）
    const healthInsuranceEmployee = bonus.calculationResult.healthInsurance?.employeeBurden;
    if (healthInsuranceEmployee && !isNaN(parseFloat(healthInsuranceEmployee))) {
      const healthAmount = parseFloat(healthInsuranceEmployee);
      total += healthAmount;
      debugInfo.push(
        `健康保険料(個人)${isCareInsurancePeriod ? '（介護保険該当）' : '（介護保険非該当）'}: ${healthAmount}円`
      );
    } else {
      debugInfo.push(`健康保険料(個人): 0円（データなし）`);
    }

    // 厚生年金保険料（個人）
    const pensionInsuranceEmployee = bonus.calculationResult.pensionInsurance?.employeeBurden;
    if (pensionInsuranceEmployee && !isNaN(parseFloat(pensionInsuranceEmployee))) {
      const pensionAmount = parseFloat(pensionInsuranceEmployee);
      total += pensionAmount;
      debugInfo.push(`厚生年金保険料(個人): ${pensionAmount}円`);
    } else {
      debugInfo.push(`厚生年金保険料(個人): 0円（データなし）`);
    }

    debugInfo.push(`=== 合計: ${total}円 ===`);

    // デバッグ情報をコンソールに出力（従業員番号も含めて識別しやすくする）
    console.log(`[従業員負担合計計算] 従業員番号: ${bonus.employeeNumber}`);
    debugInfo.forEach((info) => console.log(`  ${info}`));

    return total.toString();
  }

  /**
   * 賞与の会社負担合計（参考値）を計算
   */
  public calculateCompanyBurdenTotal(bonus: EmployeeBonusData): string {
    if (!bonus.calculationResult) return '0';

    const debugInfo: string[] = [];

    // 介護保険該当期間かどうかの判定
    const isCareInsurancePeriod = this.isInCareInsurancePeriod(
      bonus.paymentDate,
      bonus.careInsurancePeriod
    );
    debugInfo.push(`介護保険該当: ${isCareInsurancePeriod ? 'Yes' : 'No'}`);

    // === 正しい計算方法 ===
    debugInfo.push(`=== 正しい計算方法 ===`);

    // 1. 健康保険の会社負担計算
    // 健康保険料(全額)（介護保険非該当）+ 健康保険料(全額)（介護保険該当）
    const healthTotalNonCare =
      bonus.healthInsuranceTotal &&
      bonus.healthInsuranceTotal !== '-' &&
      bonus.healthInsuranceTotal !== ''
        ? parseFloat(bonus.healthInsuranceTotal)
        : 0;
    const healthTotalCare =
      bonus.careInsuranceTotal &&
      bonus.careInsuranceTotal !== '-' &&
      bonus.careInsuranceTotal !== ''
        ? parseFloat(bonus.careInsuranceTotal)
        : 0;
    const healthTotalSum = healthTotalNonCare + healthTotalCare;

    // 健康保険料(個人)（介護保険非該当）+ 健康保険料(個人)（介護保険該当）
    // 個人負担は、該当期間に応じてどちらか一方のみ発生
    let healthEmployeeNonCare = 0;
    let healthEmployeeCare = 0;

    const healthEmployeeAmount =
      bonus.calculationResult.healthInsurance?.employeeBurden &&
      bonus.calculationResult.healthInsurance.employeeBurden !== '-' &&
      bonus.calculationResult.healthInsurance.employeeBurden !== ''
        ? parseFloat(bonus.calculationResult.healthInsurance.employeeBurden)
        : 0;

    if (isCareInsurancePeriod) {
      healthEmployeeCare = healthEmployeeAmount;
    } else {
      healthEmployeeNonCare = healthEmployeeAmount;
    }

    const healthEmployeeSum = healthEmployeeNonCare + healthEmployeeCare;

    // 健康保険会社負担 = (全額非該当 + 全額該当) - (個人非該当 + 個人該当)
    const healthCompanyBurden = healthTotalSum - healthEmployeeSum;
    const healthCompanyBurdenFloored = Math.floor(healthCompanyBurden);

    debugInfo.push(`健康保険料(全額)（非該当）: ${healthTotalNonCare}円`);
    debugInfo.push(`健康保険料(全額)（該当）: ${healthTotalCare}円`);
    debugInfo.push(`健康保険料(個人)（非該当）: ${healthEmployeeNonCare}円`);
    debugInfo.push(`健康保険料(個人)（該当）: ${healthEmployeeCare}円`);
    debugInfo.push(
      `健康保険会社負担 = (${healthTotalNonCare} + ${healthTotalCare}) - (${healthEmployeeNonCare} + ${healthEmployeeCare}) = ${healthCompanyBurden} → ${healthCompanyBurdenFloored}円（切り捨て）`
    );

    // 2. 厚生年金の会社負担計算
    const pensionTotal =
      bonus.pensionInsuranceTotal &&
      bonus.pensionInsuranceTotal !== '-' &&
      bonus.pensionInsuranceTotal !== ''
        ? parseFloat(bonus.pensionInsuranceTotal)
        : 0;
    const pensionEmployeeAmount =
      bonus.calculationResult.pensionInsurance?.employeeBurden &&
      bonus.calculationResult.pensionInsurance.employeeBurden !== '-' &&
      bonus.calculationResult.pensionInsurance.employeeBurden !== ''
        ? parseFloat(bonus.calculationResult.pensionInsurance.employeeBurden)
        : 0;

    const pensionCompanyBurden = pensionTotal - pensionEmployeeAmount;
    const pensionCompanyBurdenFloored = Math.floor(pensionCompanyBurden);

    debugInfo.push(`厚生年金保険料(全額): ${pensionTotal}円`);
    debugInfo.push(`厚生年金保険料(個人): ${pensionEmployeeAmount}円`);
    debugInfo.push(
      `厚生年金会社負担 = ${pensionTotal} - ${pensionEmployeeAmount} = ${pensionCompanyBurden} → ${pensionCompanyBurdenFloored}円（切り捨て）`
    );

    // 3. 合計
    const total = healthCompanyBurdenFloored + pensionCompanyBurdenFloored;
    debugInfo.push(
      `=== 最終合計 = ${healthCompanyBurdenFloored} + ${pensionCompanyBurdenFloored} = ${total}円 ===`
    );

    // デバッグ情報をコンソールに出力
    console.log(`[会社負担合計計算] 従業員番号: ${bonus.employeeNumber}`);
    debugInfo.forEach((info) => console.log(`  ${info}`));

    return total.toString();
  }
}
