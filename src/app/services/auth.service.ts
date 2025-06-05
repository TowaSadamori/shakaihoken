import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  UserCredential,
  updateEmail,
  updatePassword,
} from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { getFunctions, httpsCallable } from 'firebase/functions';

const app = initializeApp(environment.firebase);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

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
}
