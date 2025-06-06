/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// import {onRequest} from "firebase-functions/v2/https";
// import * as logger from "firebase-functions/logger";

import { onCall } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

admin.initializeApp();

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// export const helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

// type CallableRequest = { data: { uid: string } };
// type CallableContext = { auth?: { token?: Record<string, unknown> } };

// 型定義
interface DeleteUserRequest {
  uid: string;
}

interface UpdateUserRequest {
  uid: string;
  email?: string;
  password?: string;
  updateFields?: Record<string, string | number | boolean | null | undefined>;
}

interface CreateUserRequest {
  email: string;
  password: string;
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  birthDate: string;
  gender: string;
  role: string;
  companyId: string;
}

export const deleteUserByAdmin = onCall({ region: 'asia-northeast1' }, async (request) => {
  const { uid } = request.data as DeleteUserRequest;
  const token = request.auth?.token as Record<string, unknown> | undefined;
  if (!request.auth || !token?.admin) {
    throw new Error('管理者のみ実行可能');
  }
  try {
    await admin.auth().deleteUser(uid);
    await admin.firestore().collection('users').doc(uid).delete();
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    } else {
      throw new Error('Unknown error');
    }
  }
});

// 管理者によるユーザー情報の更新

export const updateUserByAdmin = onCall({ region: 'asia-northeast1' }, async (request) => {
  const { uid, email, password, updateFields } = request.data as UpdateUserRequest;
  const token = request.auth?.token as Record<string, unknown> | undefined;
  if (!request.auth || !token?.admin) {
    throw new Error('管理者のみ実行可能');
  }
  try {
    const updateAuth: admin.auth.UpdateRequest = {};
    if (email) updateAuth.email = email;
    if (password) updateAuth.password = password;
    if (Object.keys(updateAuth).length > 0) {
      await admin.auth().updateUser(uid, updateAuth);
    }
    if (updateFields && Object.keys(updateFields).length > 0) {
      await admin.firestore().collection('users').doc(uid).update(updateFields);
      // roleが'admin'ならadmin権限を付与、そうでなければadmin権限を外す
      if (updateFields.role === 'admin') {
        await admin.auth().setCustomUserClaims(uid, { admin: true });
      } else if (updateFields.role) {
        await admin.auth().setCustomUserClaims(uid, { admin: false });
      }
    }
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    } else {
      throw new Error('Unknown error');
    }
  }
});

// 管理者によるユーザー作成

export const createUserByAdmin = onCall({ region: 'asia-northeast1' }, async (request) => {
  console.log('createUserByAdmin request.data:', request.data);
  const {
    email,
    password,
    lastName,
    firstName,
    lastNameKana,
    firstNameKana,
    birthDate,
    gender,
    role,
    companyId,
    isFirstAdmin, // 新規会社用管理者作成時のみtrue
  } = request.data as CreateUserRequest & { isFirstAdmin?: boolean };
  const token = request.auth?.token as Record<string, unknown> | undefined;
  // isFirstAdminかつroleがadminならadmin権限なしでもOK
  if (!request.auth || (!token?.admin && !(role === 'admin' && isFirstAdmin))) {
    throw new Error('管理者のみ実行可能');
  }
  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
    });
    // roleが'admin'ならadmin権限を付与、そうでなければadmin権限を外す
    if (role === 'admin') {
      await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
    } else {
      await admin.auth().setCustomUserClaims(userRecord.uid, { admin: false });
    }
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email,
      password,
      lastName,
      firstName,
      lastNameKana,
      firstNameKana,
      birthDate,
      gender,
      role,
      companyId,
      createdAt: new Date(),
    });
    return { success: true, uid: userRecord.uid };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message);
    } else {
      throw new Error('Unknown error');
    }
  }
});
