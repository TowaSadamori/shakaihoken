import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { getFirestore, collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

interface Employee {
  employeeNumber: string;
  name: string;
  officeNumber: string;
  officeAddress: string;
  grade: string;
  standardMonthlySalary: string;
  monthlySalary: string;
}

@Component({
  selector: 'app-employee-salary-bonus',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './employee-salary-bonus.component.html',
  styleUrl: './employee-salary-bonus.component.scss',
})
export class EmployeeSalaryBonusComponent implements OnInit {
  displayedColumns = [
    'employeeNumber',
    'name',
    'officeNumber',
    'officeAddress',
    'grade',
    'standardMonthlySalary',
    'monthlySalary',
    'detail',
  ];

  employees: Employee[] = [];

  constructor(private router: Router) {}

  async ngOnInit() {
    const db = getFirestore();
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) return;
    const userData = userDoc.data();
    const companyId = userData['companyId'];
    if (!companyId) return;

    // usersコレクションからcompanyIdが一致する従業員を取得
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('companyId', '==', companyId));
    const querySnapshot = await getDocs(q);
    const officeCache: Record<string, string> = {};
    const employees: Employee[] = [];
    for (const docSnap of querySnapshot.docs) {
      const data = docSnap.data();
      const officeNumber = data['branchNumber'] ? String(data['branchNumber']) : '';
      let officeAddress = '';
      if (officeNumber) {
        if (officeCache[officeNumber]) {
          officeAddress = officeCache[officeNumber];
        } else {
          // officesコレクションからaddressを取得
          const officeQuery = query(
            collection(db, 'offices'),
            where('branchNumber', '==', Number(officeNumber)),
            where('companyId', '==', companyId)
          );
          const officeSnapshot = await getDocs(officeQuery);
          if (!officeSnapshot.empty) {
            const officeData = officeSnapshot.docs[0].data();
            officeAddress = officeData['addressPrefecture'] || '';
            officeCache[officeNumber] = officeAddress;
          }
        }
      }
      employees.push({
        employeeNumber: data['employeeNumber'] || '',
        name: (data['lastName'] || '') + ' ' + (data['firstName'] || ''),
        officeNumber: officeNumber,
        officeAddress: officeAddress,
        grade: '',
        standardMonthlySalary: '',
        monthlySalary: '',
      });
    }
    // 従業員番号で昇順ソート
    this.employees = employees.sort((a, b) => (a.employeeNumber > b.employeeNumber ? 1 : -1));
  }

  goHome() {
    this.router.navigate(['/']);
  }
}
