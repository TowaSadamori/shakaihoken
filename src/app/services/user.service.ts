import { Injectable } from '@angular/core';
import {
  collection,
  getDocs,
  getFirestore,
  query,
  where,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
} from 'firebase/firestore';

export interface User {
  uid: string;
  employeeNumber?: string;
  branchNumber?: string;
  lastName: string;
  firstName: string;
  companyId?: string;
  lastNameKana?: string;
  firstNameKana?: string;
  birthDate?: string;
  gender?: string;
  myNumber?: string;
  pensionNumber?: string;
  insuranceSymbolNumber?: string;
  zipCode?: string;
  prefectureCity?: string;
  addressDetail?: string;
  phone?: string;
  // 他に必要なフィールドがあれば追加
}

// 被扶養者型
export interface Dependent {
  id?: string; // FirestoreのドキュメントID
  companyId: string;
  employeeNumber: string;
  lastName: string;
  firstName: string;
  lastNameKana?: string;
  firstNameKana?: string;
  birthDate?: string;
  gender?: string;
  myNumber?: string;
  relationship?: string;
  relationshipOther?: string;
  removalDate?: string;
  removalReason?: string;
  address?: string;
  occupationIncome?: string;
  livingType?: string;
  remittance?: string;
  nenkin3gou?: string;
  certificationDate?: string;
  certificationReason?: string;
  zipCode?: string;
  prefectureCity?: string;
  addressDetail?: string;
  occupation?: string;
  income?: string;
  incomeAmount?: string;
  incomeType?: string;
  incomeTypeOther?: string;
  nenkin3gouStatus?: string;
  nenkin3gouReason?: string;
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

  async saveUser(user: User): Promise<void> {
    if (!user.uid) throw new Error('uid is required');
    await setDoc(doc(this.firestore, 'users', user.uid), user, { merge: true });
  }

  // 被扶養者一覧取得
  async getDependents(uid: string): Promise<Dependent[]> {
    const dependentsCol = collection(this.firestore, `users/${uid}/dependents`);
    const snapshot = await getDocs(dependentsCol);
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Dependent);
  }

  // 被扶養者保存（新規・更新）
  async saveDependent(uid: string, dependent: Dependent): Promise<void> {
    const depId = dependent.id || undefined;
    const depRef = depId
      ? doc(this.firestore, `users/${uid}/dependents`, depId)
      : doc(collection(this.firestore, `users/${uid}/dependents`));
    const depData = { ...dependent };
    delete depData.id;
    await setDoc(depRef, depData, { merge: true });
  }

  // 被扶養者削除
  async deleteDependent(uid: string, depId: string): Promise<void> {
    const depRef = doc(this.firestore, `users/${uid}/dependents`, depId);
    await deleteDoc(depRef);
  }
}
