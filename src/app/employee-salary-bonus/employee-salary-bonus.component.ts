import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { getFirestore, collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { AuthService } from '../services/auth.service';
import { UserService, User } from '../services/user.service';

interface InsuranceEligibility {
  healthInsurance: { eligible: boolean; reason: string };
  pensionInsurance: { eligible: boolean; reason: string };
  careInsurance?: { eligible: boolean; reason: string };
}

interface SavedJudgmentData {
  uid: string;
  employeeName: string;
  employeeNumber: string;
  birthDate: string;
  age: number;
  answers: Record<string, string>;
  judgmentResult: InsuranceEligibility | null;
  savedAt: Date;
  officeNumber: string;
  officePrefecture: string;
  specialCases?: unknown[];
  careInsurancePeriod?: { start: string; end: string };
  healthInsurancePeriod?: { start: string; end: string };
  pensionInsurancePeriod?: { start: string; end: string };
}

interface EmployeeWithJudgment extends User {
  officeAddress: string;
  judgmentResult?: InsuranceEligibility | null;
  judgmentStatus?: string; // '対象' | '対象外' | '未実施'
}

@Component({
  selector: 'app-employee-salary-bonus',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './employee-salary-bonus.component.html',
  styleUrls: ['./employee-salary-bonus.component.scss'],
})
export class EmployeeSalaryBonusComponent implements OnInit {
  displayedColumns = [
    'employeeNumber',
    'name',
    'officeNumber',
    'officeAddress',
    'gradeJudgment',
    'insuranceCalculation',
    'detail',
  ];

  employees: EmployeeWithJudgment[] = [];

  constructor(
    private router: Router,
    private authService: AuthService,
    private userService: UserService
  ) {}

  async ngOnInit() {
    await this.fetchEmployees();
    await this.loadJudgmentResults();
  }

  async fetchEmployees() {
    const db = getFirestore();
    const currentUser = await this.authService.getCurrentUserProfileWithRole();
    if (!currentUser) {
      this.employees = [];
      return;
    }

    const companyId = await this.authService.getCurrentUserCompanyId();
    if (!companyId) {
      this.employees = [];
      return;
    }

    if (currentUser.role === 'admin') {
      const usersSnapshot = await getDocs(
        query(collection(db, 'users'), where('companyId', '==', companyId))
      );
      const officePromises = usersSnapshot.docs.map(async (userDoc) => {
        const user = userDoc.data() as User;
        let officeAddress = 'N/A';
        if (user.branchNumber) {
          const officeQuery = query(
            collection(db, 'offices'),
            where('companyId', '==', companyId),
            where('branchNumber', '==', user.branchNumber)
          );
          const officeSnap = await getDocs(officeQuery);
          if (!officeSnap.empty) {
            officeAddress = officeSnap.docs[0].data()['addressPrefecture'] || 'N/A';
          }
        }
        return { ...user, officeAddress, judgmentStatus: '未実施' } as EmployeeWithJudgment;
      });
      this.employees = (await Promise.all(officePromises)) as EmployeeWithJudgment[];
      this.employees.sort((a, b) =>
        (a.employeeNumber || '').localeCompare(b.employeeNumber || '', undefined, {
          numeric: true,
        })
      );
    } else {
      const user = await this.userService.getUserByUid(currentUser.uid);
      if (user) {
        let officeAddress = 'N/A';
        if (user.branchNumber) {
          const officeQuery = query(
            collection(db, 'offices'),
            where('companyId', '==', companyId),
            where('branchNumber', '==', user.branchNumber)
          );
          const officeSnap = await getDocs(officeQuery);
          if (!officeSnap.empty) {
            officeAddress = officeSnap.docs[0].data()['addressPrefecture'] || 'N/A';
          }
        }
        this.employees = [
          { ...user, officeAddress, judgmentStatus: '未実施' } as EmployeeWithJudgment,
        ];
      } else {
        this.employees = [];
      }
    }
  }

  // 判定結果を取得するメソッド
  async loadJudgmentResults() {
    const db = getFirestore();
    const currentCompanyId = await this.authService.getCurrentUserCompanyId();

    for (const employee of this.employees) {
      try {
        const docRef = doc(db, 'insuranceJudgments', employee.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const savedData = docSnap.data() as SavedJudgmentData;

          // 会社ID、事業所番号、従業員番号が一致するかチェック
          if (
            savedData.employeeNumber === employee.employeeNumber &&
            savedData.officeNumber === employee.branchNumber?.toString() &&
            employee.companyId === currentCompanyId
          ) {
            employee.judgmentResult = savedData.judgmentResult;
            employee.judgmentStatus = this.getJudgmentStatus(employee);
          }
        }
      } catch (error) {
        console.error(`Error loading judgment for employee ${employee.uid}:`, error);
      }
    }
  }

  // 判定状況を取得（いずれかの保険が対象なら「対象」、全て対象外なら「対象外」、未判定なら「未実施」）
  getJudgmentStatus(employee: EmployeeWithJudgment): string {
    if (!employee.judgmentResult) {
      return '未実施';
    }

    const { healthInsurance, pensionInsurance, careInsurance } = employee.judgmentResult;

    // いずれかが対象なら「対象」
    if (healthInsurance.eligible || pensionInsurance.eligible || careInsurance?.eligible) {
      return '対象';
    }

    // 全て対象外なら「対象外」
    return '対象外';
  }

  goHome() {
    this.router.navigate(['/employee-procedures']);
  }

  navigateToGradeJudgment(employeeNumber: string) {
    this.router.navigate(['/grade-judgment', employeeNumber]);
  }

  navigateToInsuranceCalculation(employeeNumber: string) {
    this.router.navigate(['/insurance-calculation', employeeNumber]);
  }
}
