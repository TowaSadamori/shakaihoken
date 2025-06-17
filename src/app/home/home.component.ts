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

// ユーザープロフィール型定義
interface UserProfileWithRole {
  uid: string;
  lastName: string;
  firstName: string;
  role: string;
}

// 社会保険料データの型定義
interface InsuranceFeeData {
  year: number;
  month: number;
  monthDisplay: string;
  healthInsuranceEmployee: string;
  healthInsuranceCompany: string;
  pensionInsuranceEmployee: string;
  pensionInsuranceCompany: string;
  employmentInsuranceEmployee: string;
  employmentInsuranceCompany: string;
  totalEmployee: string;
  totalCompany: string;
}

interface EmployeeInsuranceData {
  employeeNumber: string;
  officeNumber: string;
  employeeName: string;
  attribute: string;
  currentMonth: InsuranceFeeData;
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
  ];

  // 現在のユーザーの保険料データ
  currentUserInsurance: InsuranceFeeData = {
    year: 0,
    month: 0,
    monthDisplay: '',
    healthInsuranceEmployee: '0',
    healthInsuranceCompany: '0',
    pensionInsuranceEmployee: '0',
    pensionInsuranceCompany: '0',
    employmentInsuranceEmployee: '0',
    employmentInsuranceCompany: '0',
    totalEmployee: '0',
    totalCompany: '0',
  };

  // 月別データ（過去6ヶ月分）
  monthlyData: InsuranceFeeData[] = [];

  // 全従業員データ
  allEmployeesData: EmployeeInsuranceData[] = [];

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

  displayedColumnsAdmin: string[] = [
    'employeeNumber',
    'officeNumber',
    'employeeName',
    'attribute',
    'healthInsuranceEmployee',
    'healthInsuranceCompany',
    'pensionInsuranceEmployee',
    'pensionInsuranceCompany',
    'totalEmployee',
    'totalCompany',
  ];

  constructor(
    private authService: AuthService,
    private userService: UserService
  ) {}

  async ngOnInit() {
    try {
      // 現在のユーザー情報を取得
      this.currentUser = await this.authService.getCurrentUserProfileWithRole();
      if (!this.currentUser) return;

      this.isAdmin = this.currentUser.role === 'admin';

      // 会社IDを取得
      const companyId = await this.authService.getCurrentUserCompanyId();
      if (!companyId) return;

      // 同じ会社の従業員データを取得
      const employees = await this.userService.getUsersByCompanyId(companyId);

      if (this.isAdmin) {
        // 管理者：全従業員のデータを表示
        this.allEmployeesData = employees.map((employee) =>
          this.convertToEmployeeInsuranceData(employee)
        );
      } else {
        // 従業員：自分のデータのみ表示
        const currentUserData = employees.find((emp) => emp.uid === this.currentUser?.uid);
        if (currentUserData) {
          this.allEmployeesData = [this.convertToEmployeeInsuranceData(currentUserData)];
          // 個人保険料データも設定
          this.currentUserInsurance = this.createInsuranceFeeData(currentUserData);
          // 月別データを生成
          this.monthlyData = this.generateMonthlyData(currentUserData);
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
      console.error('データ取得エラー:', error);
    }
  }

  // User型からEmployeeInsuranceData型への変換
  private convertToEmployeeInsuranceData(user: User): EmployeeInsuranceData {
    return {
      employeeNumber: user.employeeNumber || '-',
      officeNumber: user.branchNumber || '-',
      employeeName: `${user.lastName || ''} ${user.firstName || ''}`.trim(),
      attribute: '-', // TODO: 実際の属性データを設定
      currentMonth: this.createInsuranceFeeData(user),
    };
  }

  // 個人用の月別データ生成（過去6ヶ月分）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private generateMonthlyData(_user: User): InsuranceFeeData[] {
    const monthlyData: InsuranceFeeData[] = [];
    const currentDate = new Date();

    for (let i = 0; i < 6; i++) {
      const targetDate = new Date(this.selectedYear, currentDate.getMonth() - i, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1;

      monthlyData.push({
        year: year,
        month: month,
        monthDisplay: `${year}年${month}月`,
        healthInsuranceEmployee: '0', // TODO: 実際の計算ロジック実装
        healthInsuranceCompany: '0',
        pensionInsuranceEmployee: '0',
        pensionInsuranceCompany: '0',
        employmentInsuranceEmployee: '0',
        employmentInsuranceCompany: '0',
        totalEmployee: '0',
        totalCompany: '0',
      });
    }

    return monthlyData;
  }

  // 管理者用の月別データ生成（全従業員の合計）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private generateMonthlyDataForAdmin(_employees: User[]): InsuranceFeeData[] {
    const monthlyData: InsuranceFeeData[] = [];
    const currentDate = new Date();

    for (let i = 0; i < 6; i++) {
      const targetDate = new Date(this.selectedYear, currentDate.getMonth() - i, 1);
      const year = targetDate.getFullYear();
      const month = targetDate.getMonth() + 1;

      // TODO: 各従業員の保険料を計算して合計
      monthlyData.push({
        year: year,
        month: month,
        monthDisplay: `${year}年${month}月`,
        healthInsuranceEmployee: '0', // TODO: 全従業員の合計計算
        healthInsuranceCompany: '0',
        pensionInsuranceEmployee: '0',
        pensionInsuranceCompany: '0',
        employmentInsuranceEmployee: '0',
        employmentInsuranceCompany: '0',
        totalEmployee: '0',
        totalCompany: '0',
      });
    }

    return monthlyData;
  }

  // 保険料データの作成（現在は0、後で計算ロジック実装）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private createInsuranceFeeData(_user: User): InsuranceFeeData {
    // TODO: 実際の保険料計算ロジックをここに実装
    const year = this.selectedYear;
    const month = this.selectedMonth;

    return {
      year: year,
      month: month,
      monthDisplay: `${year}年${month}月`,
      healthInsuranceEmployee: '0', // 後で計算ロジック実装
      healthInsuranceCompany: '0', // 後で計算ロジック実装
      pensionInsuranceEmployee: '0', // 後で計算ロジック実装
      pensionInsuranceCompany: '0', // 後で計算ロジック実装
      employmentInsuranceEmployee: '0',
      employmentInsuranceCompany: '0',
      totalEmployee: '0', // 後で計算ロジック実装
      totalCompany: '0', // 後で計算ロジック実装
    };
  }

  // 数値をカンマ区切りで表示
  formatNumber(num: string): string {
    return Number(num).toLocaleString();
  }

  // 保険料合計を計算（文字列計算）
  calculateInsuranceTotal(healthEmployee: string, pensionEmployee: string): string {
    return (BigInt(healthEmployee) + BigInt(pensionEmployee)).toString();
  }

  // 会社全体の合計を計算
  getTotalCompanyExpense(): string {
    let total = 0n;
    this.allEmployeesData.forEach((employee) => {
      total += BigInt(employee.currentMonth.totalCompany);
    });
    return total.toString();
  }

  // 従業員全体の合計を計算
  getTotalEmployeeDeduction(): string {
    let total = 0n;
    this.allEmployeesData.forEach((employee) => {
      total += BigInt(employee.currentMonth.totalEmployee);
    });
    return total.toString();
  }

  // 年次切り替え時の処理
  async onYearChange() {
    await this.refreshData();
  }

  // 月選択変更時の処理
  async onMonthChange() {
    await this.refreshData();
  }

  // データ更新処理（年月変更時共通）
  private async refreshData() {
    try {
      // 会社IDを取得
      const companyId = await this.authService.getCurrentUserCompanyId();
      if (!companyId) return;

      // 同じ会社の従業員データを取得
      const employees = await this.userService.getUsersByCompanyId(companyId);

      if (this.isAdmin) {
        // 管理者：全従業員のデータを表示
        this.allEmployeesData = employees.map((employee) =>
          this.convertToEmployeeInsuranceData(employee)
        );
        // 管理者の月別データを再生成
        this.monthlyData = this.generateMonthlyDataForAdmin(employees);
      } else {
        // 従業員：自分のデータのみ表示
        const currentUserData = employees.find((emp) => emp.uid === this.currentUser?.uid);
        if (currentUserData) {
          this.allEmployeesData = [this.convertToEmployeeInsuranceData(currentUserData)];
          // 個人保険料データも更新
          this.currentUserInsurance = this.createInsuranceFeeData(currentUserData);
          // 月別データを再生成
          this.monthlyData = this.generateMonthlyData(currentUserData);
        }
      }
    } catch (error) {
      console.error('データ更新エラー:', error);
    }
  }
}
