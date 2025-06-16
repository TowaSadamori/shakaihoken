import { Injectable } from '@angular/core';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class OfficeService {
  private firestore = getFirestore();

  constructor(private authService: AuthService) {}

  async getOfficesForCurrentUser(): Promise<{ id: string; [key: string]: unknown }[]> {
    const userProfile = await this.authService.getCurrentUserProfileWithRole();
    if (!userProfile) return [];

    if (userProfile.role === 'admin') {
      // 管理者は全事業所
      const officesSnapshot = await getDocs(collection(this.firestore, 'offices'));
      return officesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } else {
      // 一般ユーザーは自分の事業所のみ
      const companyId = await this.authService.getCurrentUserCompanyId();
      if (!companyId) return [];
      const q = query(collection(this.firestore, 'offices'), where('companyId', '==', companyId));
      const officesSnapshot = await getDocs(q);
      return officesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    }
  }
}
