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

import * as functions from 'firebase-functions';
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const deleteUserByAdmin = functions.https.onCall(async (request: any, context: any) => {
  const { uid } = request.data as { uid: string };
  const token = context.auth?.token as Record<string, unknown> | undefined;
  // 管理者チェック（adminカスタムクレームが必要）
  if (!context.auth || !token?.admin) {
    throw new functions.https.HttpsError('permission-denied', '管理者のみ実行可能');
  }
  try {
    await admin.auth().deleteUser(uid);
    await admin.firestore().collection('users').doc(uid).delete();
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      throw new functions.https.HttpsError('internal', error.message);
    } else {
      throw new functions.https.HttpsError('internal', 'Unknown error');
    }
  }
});

// 管理者によるユーザー情報の更新
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const updateUserByAdmin = functions.https.onCall(async (request: any, context: any) => {
  const { uid, email, password, updateFields } = request.data as {
    uid: string;
    email?: string;
    password?: string;
    updateFields?: Record<string, string | number | boolean | null | undefined>; // Firestoreに反映したいフィールド
  };
  const token = context.auth?.token as Record<string, unknown> | undefined;
  // 管理者チェック
  if (!context.auth || !token?.admin) {
    throw new functions.https.HttpsError('permission-denied', '管理者のみ実行可能');
  }
  try {
    // Auth情報の更新
    const updateAuth: admin.auth.UpdateRequest = {};
    if (email) updateAuth.email = email;
    if (password) updateAuth.password = password;
    if (Object.keys(updateAuth).length > 0) {
      await admin.auth().updateUser(uid, updateAuth);
    }
    // Firestoreのusersドキュメントも更新
    if (updateFields && Object.keys(updateFields).length > 0) {
      await admin.firestore().collection('users').doc(uid).update(updateFields);
    }
    return { success: true };
  } catch (error) {
    if (error instanceof Error) {
      throw new functions.https.HttpsError('internal', error.message);
    } else {
      throw new functions.https.HttpsError('internal', 'Unknown error');
    }
  }
});
