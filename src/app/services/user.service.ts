import { Injectable } from '@angular/core';
import { collection, getDocs, getFirestore, query, where, doc, getDoc } from 'firebase/firestore';

export interface User {
  uid: string;
  employeeNumber?: string | number;
  branchNumber?: string | number;
  lastName: string;
  firstName: string;
  companyId?: string;
  // 他に必要なフィールドがあれば追加
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private firestore = getFirestore();

  async getAllUsers(): Promise<User[]> {
    const usersCol = collection(this.firestore, 'users');
    const snapshot = await getDocs(usersCol);
    return snapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() }) as User);
  }

  async getUsersByCompanyId(companyId: string): Promise<User[]> {
    const usersCol = collection(this.firestore, 'users');
    const q = query(usersCol, where('companyId', '==', companyId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => ({ uid: doc.id, ...doc.data() }) as User);
  }

  async getUserByUid(uid: string): Promise<User | null> {
    const userDoc = await getDoc(doc(this.firestore, 'users', uid));
    if (!userDoc.exists()) return null;
    return { uid: userDoc.id, ...userDoc.data() } as User;
  }
}
