import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';
import { OfficeService } from '../services/office.service';

interface EmployeeInfo {
  name: string;
  employeeNumber: string;
  birthDate: string;
  age: number;
  companyId: string;
  branchNumber: string;
  addressPrefecture: string;
}

interface InsuranceDetail {
  rate: number;
  employeeBurden: number;
  companyBurden: number;
  total: number;
}

interface CalculationResult {
  standardBonusAmount: number;
  healthInsurance: InsuranceDetail;
  pensionInsurance: InsuranceDetail;
  careInsurance?: InsuranceDetail;
  totalEmployeeBurden: number;
  totalCompanyBurden: number;
  totalInsurance: number;
}

@Component({
  selector: 'app-insurance-calculation-bonus',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './insurance-calculation-bonus.component.html',
  styleUrl: './insurance-calculation-bonus.component.scss',
})
export class InsuranceCalculationBonusComponent implements OnInit {
  employeeInfo: EmployeeInfo | null = null;
  selectedYear: number | null = null;
  isLoading = false;
  errorMessage = '';

  // フォーム入力値
  bonusAmount: number | null = null;
  paymentDate = '';
  bonusType = '';

  // 計算結果
  calculationResult: CalculationResult | null = null;

  private employeeId: string | null = null;
  private firestore = getFirestore();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private officeService: OfficeService
  ) {}

  async ngOnInit(): Promise<void> {
    this.employeeId = this.route.snapshot.paramMap.get('employeeId');
    this.selectedYear =
      Number(this.route.snapshot.queryParamMap.get('year')) || new Date().getFullYear();

    if (this.employeeId) {
      await this.loadEmployeeInfo();
    }

    // デフォルトの支給年月を設定
    const currentDate = new Date();
    this.paymentDate = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
  }

  private async loadEmployeeInfo(): Promise<void> {
    if (!this.employeeId) return;

    this.isLoading = true;
    try {
      console.log('従業員情報を読み込み中 (employeeNumber):', this.employeeId);

      const usersRef = collection(this.firestore, 'users');
      const q = query(usersRef, where('employeeNumber', '==', this.employeeId));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data();
        console.log('Firestoreから取得した従業員データ:', userData);

        const birthDate = new Date(userData['birthDate']);
        const age = this.calculateAge(birthDate);
        const formattedBirthDate = birthDate.toISOString().split('T')[0];

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
        console.error(`従業員番号 ${this.employeeId} のデータがFirestoreに存在しません`);
        this.errorMessage = `従業員番号: ${this.employeeId} の情報が見つかりません`;
        this.employeeInfo = null;
      }
    } catch (error) {
      console.error('従業員情報取得エラー:', error);
      this.errorMessage = `従業員情報の取得に失敗しました: ${error}`;
      this.employeeInfo = null;
    } finally {
      this.isLoading = false;
    }
  }

  private calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  isFormValid(): boolean {
    return !!(this.bonusAmount && this.bonusAmount > 0 && this.paymentDate);
  }

  calculateInsurance(): void {
    if (!this.isFormValid() || !this.employeeInfo) {
      this.errorMessage = '入力内容を確認してください';
      return;
    }

    this.errorMessage = '';

    // 標準賞与額の計算（1,000円未満切り捨て）
    const standardBonusAmount = Math.floor(this.bonusAmount! / 1000) * 1000;

    // 仮の料率（実際にはFirestoreから取得）
    const healthRate = 10.0; // 健康保険料率（%）
    const pensionRate = 18.3; // 厚生年金保険料率（%）
    const careRate = this.employeeInfo.age >= 40 ? 1.6 : 0; // 介護保険料率（%）

    // 健康保険料計算
    const healthTotal = Math.floor(standardBonusAmount * (healthRate / 100));
    const healthEmployeeBurden = Math.floor(healthTotal / 2);
    const healthCompanyBurden = healthTotal - healthEmployeeBurden;

    // 厚生年金保険料計算
    const pensionTotal = Math.floor(standardBonusAmount * (pensionRate / 100));
    const pensionEmployeeBurden = Math.floor(pensionTotal / 2);
    const pensionCompanyBurden = pensionTotal - pensionEmployeeBurden;

    // 介護保険料計算（40歳以上のみ）
    let careInsurance: InsuranceDetail | undefined;
    if (careRate > 0) {
      const careTotal = Math.floor(standardBonusAmount * (careRate / 100));
      const careEmployeeBurden = Math.floor(careTotal / 2);
      const careCompanyBurden = careTotal - careEmployeeBurden;

      careInsurance = {
        rate: careRate,
        employeeBurden: careEmployeeBurden,
        companyBurden: careCompanyBurden,
        total: careTotal,
      };
    }

    const totalEmployeeBurden =
      healthEmployeeBurden + pensionEmployeeBurden + (careInsurance?.employeeBurden || 0);
    const totalCompanyBurden =
      healthCompanyBurden + pensionCompanyBurden + (careInsurance?.companyBurden || 0);
    const totalInsurance = totalEmployeeBurden + totalCompanyBurden;

    this.calculationResult = {
      standardBonusAmount,
      healthInsurance: {
        rate: healthRate,
        employeeBurden: healthEmployeeBurden,
        companyBurden: healthCompanyBurden,
        total: healthTotal,
      },
      pensionInsurance: {
        rate: pensionRate,
        employeeBurden: pensionEmployeeBurden,
        companyBurden: pensionCompanyBurden,
        total: pensionTotal,
      },
      careInsurance,
      totalEmployeeBurden,
      totalCompanyBurden,
      totalInsurance,
    };

    console.log('計算結果:', this.calculationResult);
  }

  goBack(): void {
    this.router.navigate(['/insurance-calculation', this.employeeId]);
  }
}
