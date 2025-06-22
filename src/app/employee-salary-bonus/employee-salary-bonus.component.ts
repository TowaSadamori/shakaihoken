import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { AuthService } from '../services/auth.service';
import { UserService, User } from '../services/user.service';

interface Employee extends User {
  officeAddress: string;
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

  employees: Employee[] = [];

  constructor(
    private router: Router,
    private authService: AuthService,
    private userService: UserService
  ) {}

  async ngOnInit() {
    await this.fetchEmployees();
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
        return { ...user, officeAddress };
      });
      this.employees = (await Promise.all(officePromises)) as Employee[];
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
        this.employees = [{ ...user, officeAddress }];
      } else {
        this.employees = [];
      }
    }
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
