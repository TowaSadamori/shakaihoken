import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { MatDialog } from '@angular/material/dialog';
import { CompanyAddFormComponent } from '../company-add-form/company-add-form.component';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

export interface Company {
  id: string;
  name: string;
  address: string;
  addressPrefecture?: string;
  addressDetail?: string;
  branchNumber: number;
  code?: string;
  corporationNumber?: string;
  ownerName?: string;
  phone?: string;
  businessType?: string;
  establishedDate?: string | Date | null;
  employeeCount?: number;
  applyType?: string;
  beforeChange?: string;
  abolishedDate?: string | Date | null;
  abolishedReason?: string;
  bankName?: string;
  bankBranch?: string;
  bankType?: string;
  bankNumber?: string;
  bankHolder?: string;
  companyId?: string;
  createdAt?: Date;
}

@Component({
  selector: 'app-company-register',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './company-register.component.html',
  styleUrl: './company-register.component.scss',
})
export class CompanyRegisterComponent implements OnInit {
  isAdmin = false;
  companies: Company[] = [];

  constructor(
    private router: Router,
    private authService: AuthService,
    private dialog: MatDialog
  ) {}

  async ngOnInit() {
    try {
      const auth = getAuth();
      const db = getFirestore();
      const user = auth.currentUser;
      if (user) {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          this.isAdmin =
            data &&
            (data['role'] === 'admin' ||
              data['role'] === 'administrator' ||
              data['role'] === '管理者');
          const companyId = data['companyId'];
          if (companyId) {
            await this.loadCompanies(companyId);
          }
        }
      }
    } catch {
      this.isAdmin = false;
      this.companies = [];
    }
  }

  async loadCompanies(companyId: string) {
    try {
      const db = getFirestore();
      const companiesSnap = await getDocs(
        query(collection(db, 'offices'), where('companyId', '==', companyId))
      );
      this.companies = companiesSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data['name'] || '',
          address: data['address'] || '',
          addressPrefecture: data['addressPrefecture'] || '',
          addressDetail: data['addressDetail'] || '',
          branchNumber: data['branchNumber'] || 0,
          code: data['code'],
          corporationNumber: data['corporationNumber'],
          ownerName: data['ownerName'],
          phone: data['phone'],
          businessType: data['businessType'],
          establishedDate: data['establishedDate'],
          employeeCount: data['employeeCount'],
          applyType: data['applyType'],
          beforeChange: data['beforeChange'],
          abolishedDate: data['abolishedDate'],
          abolishedReason: data['abolishedReason'],
          bankName: data['bankName'],
          bankBranch: data['bankBranch'],
          bankType: data['bankType'],
          bankNumber: data['bankNumber'],
          bankHolder: data['bankHolder'],
          companyId: data['companyId'],
          createdAt: data['createdAt'],
        };
      });
    } catch (e) {
      this.companies = [];
      console.error('事業所一覧の取得に失敗:', e);
    }
  }

  goHome() {
    this.router.navigate(['/']);
  }

  onAddCompany() {
    const dialogRef = this.dialog.open(CompanyAddFormComponent, {
      width: '600px',
      disableClose: true,
    });
    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        // 直近のcompanyIdで再取得
        const auth = getAuth();
        const db = getFirestore();
        const user = auth.currentUser;
        if (user) {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            const companyId = data['companyId'];
            if (companyId) {
              await this.loadCompanies(companyId);
            }
          }
        }
      }
    });
  }
}
