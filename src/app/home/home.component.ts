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
import { AuthService } from '../services/auth.service';
import { UserService, User } from '../services/user.service';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import {
  InsuranceCalculationService,
  MonthlyInsuranceFee,
} from '../services/insurance-calculation.service';
import { SocialInsuranceCalculator } from '../utils/decimal-calculator';

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
  currentUser: UserProfileWithRole | null = null;
  isAdmin = false;
  private firestore = getFirestore();

  // 事業所選択
  offices: { branchNumber: string; name: string }[] = [];
  selectedOffice: string = 'all';

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
    'employeeName',
    'leaveStatus',
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
    'totalEmployee',
    'totalCompany',
  ];

  constructor(
    private authService: AuthService,
    private userService: UserService,
    private insuranceCalculationService: InsuranceCalculationService
  ) {}

  async ngOnInit() {
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
    } catch (error) {
      console.error('An error occurred during ngOnInit:', error);
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
          const savedData = docSnap.data() as any;

          // 会社ID、事業所番号、従業員番号が一致するかチェック
          if (
            savedData.employeeNumber === user.employeeNumber &&
            savedData.officeNumber === user.branchNumber?.toString() &&
            user.companyId === currentCompanyId
          ) {
            user.judgmentResult = savedData.judgmentResult;
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
    let paymentAmount: string | undefined;
    let standardBonusAmount: string | undefined;
    let healthInsuranceRate: string | undefined;
    let careInsuranceRate: string | undefined;
    let pensionInsuranceRate: string | undefined;
    let leaveStatus: string | undefined;

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
        leaveStatus: 'none',
        paymentAmount: paymentAmount,
        standardBonusAmount: standardBonusAmount,
        healthInsuranceRate: healthInsuranceRate,
        careInsuranceRate: careInsuranceRate,
        pensionInsuranceRate: pensionInsuranceRate,
      };
    }

    const companyId = await this.authService.getCurrentUserCompanyId();
    if (companyId && user.uid) {
      // 月次データか賞与データかでパスを切り替え
      const collectionName =
        this.selectedMonth >= 13 ? 'bonus_calculation_results' : 'salary_calculation_results';
      const docPath = `companies/${companyId}/employees/${user.uid}/${collectionName}/${this.selectedYear}`;
      const docRef = doc(this.firestore, docPath);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const yearData = docSnap.data();

        // 月次データか賞与データかを判定
        if (this.selectedMonth >= 1 && this.selectedMonth <= 12) {
          // 月次データの処理
          const monthCalculation = yearData['months']?.[this.selectedMonth];
          if (monthCalculation) {
            healthInsuranceGrade = monthCalculation.healthInsuranceGrade;
            pensionInsuranceGrade = monthCalculation.pensionInsuranceGrade;

            const healthFeeEmployee = this.safeGetAmount(
              monthCalculation.healthInsuranceFeeEmployee
            );
            const pensionFeeEmployee = this.safeGetAmount(
              monthCalculation.pensionInsuranceFeeEmployee
            );
            const careFeeEmployee = this.safeGetAmount(monthCalculation.careInsuranceFeeEmployee);
            const healthFeeCompany = this.safeGetAmount(monthCalculation.healthInsuranceFeeCompany);
            const pensionFeeCompany = this.safeGetAmount(
              monthCalculation.pensionInsuranceFeeCompany
            );
            const careFeeCompany = this.safeGetAmount(monthCalculation.careInsuranceFeeCompany);

            const totalEmployee = SocialInsuranceCalculator.addAmounts(
              healthFeeEmployee,
              SocialInsuranceCalculator.addAmounts(pensionFeeEmployee, careFeeEmployee)
            );
            const totalCompany = SocialInsuranceCalculator.addAmounts(
              healthFeeCompany,
              SocialInsuranceCalculator.addAmounts(pensionFeeCompany, careFeeCompany)
            );

            currentMonthData = {
              healthInsuranceEmployee: healthFeeEmployee,
              healthInsuranceCompany: healthFeeCompany,
              pensionInsuranceEmployee: pensionFeeEmployee,
              pensionInsuranceCompany: pensionFeeCompany,
              careInsuranceEmployee: careFeeEmployee,
              careInsuranceCompany: careFeeCompany,
              totalEmployee: totalEmployee,
              totalCompany: totalCompany,
            };
          }
          leaveStatus = this.getLeaveStatus(user.employeeNumber || '');
        } else if (this.selectedMonth >= 13) {
          // 賞与データの処理
          const bonusIndex = this.selectedMonth - 13; // 13 -> 0, 14 -> 1, ...
          const bonusResults = yearData['bonusResults'];
          if (bonusResults && bonusResults[bonusIndex]) {
            const bonusData = bonusResults[bonusIndex];
            const result = bonusData.calculationResult;
            healthInsuranceGrade = '-'; // 賞与に等級はない
            pensionInsuranceGrade = '-';

            const healthFeeEmployee = this.safeGetAmount(result.healthInsurance.employeeBurden);
            const healthFeeCompany = this.safeGetAmount(result.healthInsurance.companyBurden);
            const pensionFeeEmployee = this.safeGetAmount(result.pensionInsurance.employeeBurden);
            const pensionFeeCompany = this.safeGetAmount(result.pensionInsurance.companyBurden);
            const careFeeEmployee = this.safeGetAmount(result.careInsurance?.employeeBurden);
            const careFeeCompany = this.safeGetAmount(result.careInsurance?.companyBurden);

            const totalEmployee = SocialInsuranceCalculator.addAmounts(
              healthFeeEmployee,
              SocialInsuranceCalculator.addAmounts(pensionFeeEmployee, careFeeEmployee)
            );
            const totalCompany = SocialInsuranceCalculator.addAmounts(
              healthFeeCompany,
              SocialInsuranceCalculator.addAmounts(pensionFeeCompany, careFeeCompany)
            );

            currentMonthData = {
              healthInsuranceEmployee: healthFeeEmployee,
              healthInsuranceCompany: healthFeeCompany,
              pensionInsuranceEmployee: pensionFeeEmployee,
              pensionInsuranceCompany: pensionFeeCompany,
              careInsuranceEmployee: careFeeEmployee,
              careInsuranceCompany: careFeeCompany,
              totalEmployee: totalEmployee,
              totalCompany: totalCompany,
            };

            // 賞与データをセット
            standardBonusAmount = result.standardBonusAmount;
            healthInsuranceRate = result.healthInsuranceRate;
            careInsuranceRate = result.careInsuranceRate;
            pensionInsuranceRate = result.pensionInsuranceRate;
            leaveStatus = bonusData.leaveType;
          }
        }
      } else {
        // ドキュメントが存在しない場合は月次のステータスをデフォルトとする
        leaveStatus = this.getLeaveStatus(user.employeeNumber || '');
      }
    }

    return {
      employeeNumber: user.employeeNumber || '',
      officeNumber: user.branchNumber || '',
      employeeName: `${user.lastName || ''} ${user.firstName || ''}`.trim(),
      attribute: judgmentStatus,
      currentMonth: currentMonthData,
      healthInsuranceGrade,
      pensionInsuranceGrade,
      leaveStatus: leaveStatus,
      paymentAmount: paymentAmount,
      standardBonusAmount: standardBonusAmount,
      healthInsuranceRate: healthInsuranceRate,
      careInsuranceRate: careInsuranceRate,
      pensionInsuranceRate: pensionInsuranceRate,
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
  private safeGetAmount(value: any): string {
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

  calculateInsuranceTotal(healthEmployee: string, pensionEmployee: string): string {
    return SocialInsuranceCalculator.addAmounts(healthEmployee, pensionEmployee);
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
  onYearChange() {
    this.setDisplayedColumns();
    this.refreshData();
  }

  // 月選択変更時の処理
  onMonthChange() {
    this.setDisplayedColumns();
    this.refreshData();
  }

  onOfficeChange() {
    this.filterDataByOffice();
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

      if (this.isAdmin) {
        // 管理者：全従業員のデータを表示
        this.allOriginalEmployeesData = await Promise.all(
          (employees as UserWithJudgment[]).map((employee) =>
            this.convertToEmployeeInsuranceData(employee)
          )
        );
        this.filterDataByOffice();

        // 賞与月の場合、産休育休状態を読み込み
        if (this.selectedMonth >= 13) {
          await this.loadLeaveStatusForAllEmployees(employees, this.selectedYear);
        }

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
    } catch (error) {
      console.error('データ更新エラー:', error);
    }
  }

  // 全従業員の産休育休状態を読み込む
  private async loadLeaveStatusForAllEmployees(employees: User[], year: number): Promise<void> {
    const companyId = await this.authService.getCurrentUserCompanyId();
    if (!companyId) return;

    this.leaveStatusMap.clear();

    for (const employee of employees) {
      if (!employee.employeeNumber) continue;

      try {
        const docPath = `companies/${companyId}/employees/${employee.employeeNumber}/bonus_calculation_results/${year}`;
        const docRef = doc(this.firestore, docPath);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          const results = data['results'] || [];

          // 選択された月に対応する賞与データを検索
          const bonusIndex = this.selectedMonth - 13; // 13=1回目, 14=2回目, 15=3回目
          if (bonusIndex >= 0 && bonusIndex < results.length) {
            const leaveType = results[bonusIndex].leaveType || 'none';
            this.leaveStatusMap.set(employee.employeeNumber, leaveType);
          } else {
            this.leaveStatusMap.set(employee.employeeNumber, 'none');
          }
        } else {
          this.leaveStatusMap.set(employee.employeeNumber, 'none');
        }
      } catch (error) {
        console.error(`産休育休状態の読み込みエラー (従業員: ${employee.employeeNumber}):`, error);
        this.leaveStatusMap.set(employee.employeeNumber, 'none');
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
    if (this.selectedOffice === 'all') {
      this.allEmployeesData = [...this.allOriginalEmployeesData];
    } else {
      this.allEmployeesData = this.allOriginalEmployeesData.filter(
        (employee) => employee.officeNumber === this.selectedOffice
      );
    }
  }
}
