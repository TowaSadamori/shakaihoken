import { Injectable } from '@angular/core';
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateEmail,
  updatePassword,
  signInWithEmailAndPassword,
  UserCredential,
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private auth = getAuth();
  private firestore = getFirestore();
  private functions = getFunctions(undefined, 'asia-northeast1');

  /**
   * 日付文字列をタイムゾーンの影響を受けないように正規化する
   * YYYY-MM-DD形式の文字列をローカル日付として扱う
   */
  private normalizeDateString(dateString: string): string {
    if (!dateString) return '';

    // YYYY-MM-DD形式かチェック
    const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateOnlyRegex.test(dateString)) {
      // ローカル時間として解釈するため、時刻部分を追加
      const localDate = new Date(dateString + 'T00:00:00');
      // ローカル日付をYYYY-MM-DD形式で返す
      const year = localDate.getFullYear();
      const month = String(localDate.getMonth() + 1).padStart(2, '0');
      const day = String(localDate.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // その他の形式の場合は従来通り
    return new Date(dateString).toISOString().slice(0, 10);
  }

  async registerUser(
    email: string,
    password: string,
    name: string,
    role: string,
    lastName: string,
    firstName: string,
    lastNameKana: string,
    firstNameKana: string,
    birthDate: string,
    gender: string,
    companyId: string
  ): Promise<UserCredential> {
    const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
    const user = userCredential.user;
    if (!user.uid || !user.email || !lastName || !firstName || !role) {
      throw new Error('必須項目が未入力です');
    }
    await setDoc(doc(this.firestore, 'users', user.uid), {
      uid: user.uid,
      email: user.email,
      password: password,
      name: name,
      role: role,
      lastName: lastName,
      firstName: firstName,
      lastNameKana: lastNameKana,
      firstNameKana: firstNameKana,
      birthDate: this.normalizeDateString(birthDate),
      gender: gender,
      companyId,
      createdAt: new Date(),
    });
    return userCredential;
  }

  async updateCurrentUser(email: string, password: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('No authenticated user');
    if (user.email !== email) {
      await updateEmail(user, email);
    }
    if (password) {
      await updatePassword(user, password);
    }
  }

  async updateUserByAdmin(
    uid: string,
    email?: string,
    password?: string,
    updateFields?: Record<string, string | number | boolean | null | undefined>
  ): Promise<void> {
    const updateUser = httpsCallable(this.functions, 'updateUserByAdmin');
    await updateUser({ uid, email, password, updateFields });
  }

  async login(email: string, password: string): Promise<UserCredential> {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  async logout(): Promise<void> {
    await this.auth.signOut();
  }

  async getCurrentUserProfile(): Promise<{ lastName: string; firstName: string } | null> {
    const user = this.auth.currentUser;
    if (!user) return null;
    const userDoc = await getDoc(doc(this.firestore, 'users', user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return { lastName: data['lastName'], firstName: data['firstName'] };
    }
    return null;
  }

  async registerUserByAdmin(
    email: string,
    password: string,
    role: string,
    lastName: string,
    firstName: string,
    lastNameKana: string,
    firstNameKana: string,
    birthDate: string,
    gender: string,
    companyId: string,
    employeeNumber?: string | number | null,
    branchNumber?: string | number | null
  ): Promise<{ success: boolean; uid?: string }> {
    const createUser = httpsCallable(this.functions, 'createUserByAdmin');

    const payload: Record<string, string | number | Date | boolean> = {
      email,
      password,
      role,
      lastName,
      firstName,
      lastNameKana,
      firstNameKana,
      birthDate: this.normalizeDateString(birthDate),
      gender,
      companyId,
    };

    if (employeeNumber !== undefined && employeeNumber !== null) {
      payload['employeeNumber'] = employeeNumber;
    }
    if (branchNumber !== undefined && branchNumber !== null) {
      payload['branchNumber'] = branchNumber;
    }

    const result = await createUser(payload);
    return result.data as { success: boolean; uid?: string };
  }

  /**
   * 新規会社（管理者）アカウント作成
   * @param form 管理者＋会社情報
   */
  async registerCompanyAdmin(form: {
    companyName: string;
    lastName: string;
    firstName: string;
    lastNameKana: string;
    firstNameKana: string;
    birthDate: string;
    gender: string;
    email: string;
    password: string;
    role: string;
    isFirstAdmin?: boolean;
  }): Promise<{ uid: string; companyId: string }> {
    const createUser = httpsCallable(this.functions, 'createUserByAdmin');
    const result = await createUser({
      email: form.email,
      password: form.password,
      lastName: form.lastName,
      firstName: form.firstName,
      lastNameKana: form.lastNameKana,
      firstNameKana: form.firstNameKana,
      birthDate: this.normalizeDateString(form.birthDate),
      gender: form.gender,
      role: form.role,
      companyName: form.companyName,
      isFirstAdmin: form.isFirstAdmin === true,
    });
    return result.data as { uid: string; companyId: string };
  }

  async getCurrentUserCompanyName(): Promise<string | null> {
    const user = this.auth.currentUser;
    if (!user) return null;
    const userDoc = await getDoc(doc(this.firestore, 'users', user.uid));
    if (!userDoc.exists()) return null;
    const userData = userDoc.data();
    const companyId = userData['companyId'];
    if (!companyId) return null;
    const companyDoc = await getDoc(doc(this.firestore, 'companies', companyId));
    if (!companyDoc.exists()) return null;
    const companyData = companyDoc.data();
    return companyData['companyName'] || null;
  }

  async getCurrentUserCompanyId(): Promise<string | null> {
    const user = this.auth.currentUser;
    if (!user) return null;
    const userDoc = await getDoc(doc(this.firestore, 'users', user.uid));
    if (!userDoc.exists()) return null;
    const userData = userDoc.data();
    return userData['companyId'] || null;
  }

  getCurrentUserId(): string | null {
    const user = this.auth.currentUser;
    return user ? user.uid : null;
  }

  async getCurrentUserProfileWithRole(): Promise<{
    uid: string;
    lastName: string;
    firstName: string;
    role: string;
  } | null> {
    const user = this.auth.currentUser;
    if (!user) return null;
    const userDoc = await getDoc(doc(this.firestore, 'users', user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return {
        uid: user.uid,
        lastName: data['lastName'],
        firstName: data['firstName'],
        role: data['role'],
      };
    }
    return null;
  }
}
