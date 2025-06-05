const admin = require('firebase-admin');
const serviceAccount = require('./kensyu10093-firebase-adminsdk-fbsvc-82c3495e14.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// 管理者にしたいユーザーのUIDをここに入力してください
const uid = 'DYmJKQuhnGdPNv2ypNJFbWiMr6X2';

admin
  .auth()
  .setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log('Admin claim set!');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
