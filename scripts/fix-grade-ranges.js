const { initializeApp } = require('firebase/app');
const { getFirestore, doc, updateDoc, getDoc } = require('firebase/firestore');

// Firebase設定
const firebaseConfig = {
  apiKey: 'AIzaSyB1zazw14ps7jBCkQRo2FwEZgXAawvaKto',
  authDomain: 'kensyu10093.firebaseapp.com',
  projectId: 'kensyu10093',
  storageBucket: 'kensyu10093.appspot.com',
  messagingSenderId: '820092389714',
  appId: '1:820092389714:web:86d4777a41e456d7f5128b',
};

// Firebase初期化
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixGradeRanges() {
  try {
    console.log('🔧 健康保険等級の範囲修正開始...');

    // 修正対象のドキュメントパス
    const docPath = `insurance_rates/2025/prefectures/東京/rate_table/main`;
    const docRef = doc(db, docPath);

    // 現在のデータを取得
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.error('❌ ドキュメントが見つかりません:', docPath);
      return;
    }

    const data = docSnap.data();
    const insuranceTable = data.insuranceTable || [];

    console.log('📋 現在の等級データ数:', insuranceTable.length);

    // 修正対象の等級を特定して修正
    let modified = false;

    for (let i = 0; i < insuranceTable.length; i++) {
      const item = insuranceTable[i];

      if (item.grade === '40') {
        console.log('🔧 40級の範囲を修正:', item.salaryRange, '→ "815,000 ～ 855,000"');
        insuranceTable[i].salaryRange = '815,000 ～ 855,000';
        modified = true;
      }

      if (item.grade === '42') {
        console.log('🔧 42級の範囲を修正:', item.salaryRange, '→ "910,000 ～ 955,000"');
        insuranceTable[i].salaryRange = '910,000 ～ 955,000';
        modified = true;
      }
    }

    if (modified) {
      // Firestoreに更新を保存
      await updateDoc(docRef, {
        insuranceTable: insuranceTable,
      });

      console.log('✅ 修正完了！');
      console.log('📝 修正内容:');
      console.log('   - 40級: 815,000 ～ 855,000');
      console.log('   - 42級: 910,000 ～ 955,000');
    } else {
      console.log('ℹ️  修正対象が見つかりませんでした');
    }
  } catch (error) {
    console.error('❌ 修正エラー:', error);
  }
}

// スクリプト実行
fixGradeRanges()
  .then(() => {
    console.log('🏁 スクリプト実行完了');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 スクリプトエラー:', error);
    process.exit(1);
  });
