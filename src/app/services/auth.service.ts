import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  UserCredential,
  updateEmail,
  updatePassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { getFunctions, httpsCallable } from 'firebase/functions';

const app = initializeApp(environment.firebase);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, 'asia-northeast1');

@Injectable({
  providedIn: 'root',
})
export class AuthService {
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
    gender: string
  ): Promise<UserCredential> {
    // Firebase Authでユーザー作成
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    // Firestoreに追加情報を保存する準備
    const user = userCredential.user;
    await setDoc(doc(db, 'users', user.uid), {
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
      createdAt: new Date(),
    });
    return userCredential;
  }

  async updateCurrentUser(email: string, password: string): Promise<void> {
    const user = auth.currentUser;
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
    const updateUser = httpsCallable(functions, 'updateUserByAdmin');
    await updateUser({ uid, email, password, updateFields });
  }

  async login(email: string, password: string): Promise<UserCredential> {
    return signInWithEmailAndPassword(auth, email, password);
  }

  async logout(): Promise<void> {
    await auth.signOut();
  }

  async getCurrentUserProfile(): Promise<{ lastName: string; firstName: string } | null> {
    const user = getAuth().currentUser;
    if (!user) return null;
    const db = getFirestore();
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      return { lastName: data['lastName'], firstName: data['firstName'] };
    }
    return null;
  }

  async registerUserByAdmin(
    email: string,
    password: string,
    name: string,
    role: string,
    lastName: string,
    firstName: string,
    lastNameKana: string,
    firstNameKana: string,
    birthDate: string,
    gender: string
  ): Promise<{ success: boolean; uid?: string }> {
    const createUser = httpsCallable(functions, 'createUserByAdmin');
    const result = await createUser({
      email,
      password,
      name,
      role,
      lastName,
      firstName,
      lastNameKana,
      firstNameKana,
      birthDate,
      gender,
    });
    return result.data as { success: boolean; uid?: string };
  }
}
