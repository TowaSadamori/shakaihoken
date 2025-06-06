const admin = require('firebase-admin');
const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// 管理者にしたいユーザーのUIDリスト
const adminUids = ['DYmJKQuhnGdPNv2ypNJFbWiMr6X2', 'pMcxq6Q6v4bjkUPJscko4wVMdJx1'];

Promise.all(
  adminUids.map((uid) =>
    admin
      .auth()
      .setCustomUserClaims(uid, { admin: true })
      .then(() => console.log(`Admin claim set for ${uid}`))
      .catch((err) => console.error(`Error for ${uid}:`, err))
  )
).then(() => {
  console.log('All admin claims set!');
  process.exit(0);
});
