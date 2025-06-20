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

@Component({
  selector: 'app-insurance-calculation-salary',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './insurance-calculation-salary.component.html',
  styleUrls: ['./insurance-calculation-salary.component.scss'],
})
export class InsuranceCalculationSalaryComponent implements OnInit {
  employeeInfo: EmployeeInfo | null = null;
  isLoading = false;
  errorMessage = '';

  targetYear: number | null = null;

  private employeeId: string | null = null;
  private firestore = getFirestore();

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private officeService: OfficeService
  ) {}

  async ngOnInit(): Promise<void> {
    this.employeeId = this.route.snapshot.paramMap.get('employeeId');
    const yearParam = this.route.snapshot.queryParamMap.get('year');
    if (yearParam) {
      this.targetYear = +yearParam;
    }

    if (this.employeeId) {
      await this.loadEmployeeInfo();
    }
  }

  private async loadEmployeeInfo(): Promise<void> {
    if (!this.employeeId) return;

    this.isLoading = true;
    try {
      const usersRef = collection(this.firestore, 'users');
      const q = query(usersRef, where('employeeNumber', '==', this.employeeId));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userData = querySnapshot.docs[0].data();
        const birthDate = new Date(userData['birthDate']);
        const age = this.calculateAge(birthDate);

        let addressPrefecture = userData['addressPrefecture'] || '';
        if (!addressPrefecture && userData['companyId'] && userData['branchNumber']) {
          addressPrefecture = await this.officeService.findOfficeAddressPrefecture(
            userData['companyId'],
            userData['branchNumber']
          );
        }

        this.employeeInfo = {
          name: `${userData['lastName'] || ''} ${userData['firstName'] || ''}`.trim(),
          employeeNumber: userData['employeeNumber'] || '',
          birthDate: birthDate.toISOString().split('T')[0],
          age: age,
          companyId: userData['companyId'] || '',
          branchNumber: userData['branchNumber'] || '',
          addressPrefecture: addressPrefecture,
        };
      } else {
        this.errorMessage = `従業員番号: ${this.employeeId} の情報が見つかりません`;
      }
    } catch (error) {
      this.errorMessage = `従業員情報の取得に失敗しました: ${error}`;
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

  goBack(): void {
    if (this.employeeId) {
      this.router.navigate(['/insurance-calculation', this.employeeId]);
    }
  }

  formatFiscalYear(year: number): string {
    return `${year}年度`;
  }

  previousYear(): void {
    if (this.targetYear) {
      this.updateYear(this.targetYear - 1);
    }
  }

  nextYear(): void {
    if (this.targetYear) {
      this.updateYear(this.targetYear + 1);
    }
  }

  currentYear(): void {
    const currentFiscalYear = this.getCurrentFiscalYear();
    this.updateYear(currentFiscalYear);
  }

  private updateYear(year: number): void {
    this.targetYear = year;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { year: this.targetYear },
      queryParamsHandling: 'merge',
    });
    // ここで必要に応じてデータを再読み込みするロジックを後で追加
  }

  private getCurrentFiscalYear(): number {
    const today = new Date();
    // JSの月は0-11なので+1
    const month = today.getMonth() + 1;
    // 日本の年度（4月始まり）で計算
    return month >= 4 ? today.getFullYear() : today.getFullYear() - 1;
  }
}
