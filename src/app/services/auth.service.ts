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
      birthDate: birthDate ? new Date(birthDate).toISOString().slice(0, 10) : '',
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
    companyId: string
  ): Promise<{ success: boolean; uid?: string }> {
    const createUser = httpsCallable(this.functions, 'createUserByAdmin');
    const result = await createUser({
      email,
      password,
      role,
      lastName,
      firstName,
      lastNameKana,
      firstNameKana,
      birthDate,
      gender,
      companyId,
    });
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
      birthDate: form.birthDate,
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
