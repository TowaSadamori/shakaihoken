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
