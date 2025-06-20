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

// 正しい範囲設定（写真の健康保険料額表に基づく）
const correctRanges = {
  39: '770,000 ～ 810,000',
  40: '810,000 ～ 855,000', // 821,500円が該当
  41: '855,000 ～ 905,000',
  42: '905,000 ～ 955,000', // 926,500円が該当
  43: '955,000 ～ 1,005,000',
  44: '1,005,000 ～ 1,055,000',
  45: '1,055,000 ～ 1,115,000',
  46: '1,115,000 ～ 1,175,000',
  47: '1,175,000 ～ 1,235,000',
  48: '1,235,000 ～ 1,295,000',
  49: '1,295,000 ～ 1,355,000',
  50: '1,355,000 ～',
};

async function fixInsuranceTableRanges() {
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
      const grade = item.grade;

      if (correctRanges[grade]) {
        const oldRange = item.salaryRange;
        const newRange = correctRanges[grade];

        if (oldRange !== newRange) {
          console.log(`🔧 ${grade}級の範囲を修正: "${oldRange}" → "${newRange}"`);
          insuranceTable[i].salaryRange = newRange;
          modified = true;
        }
      }
    }

    if (modified) {
      // Firestoreに更新を保存
      await updateDoc(docRef, {
        insuranceTable: insuranceTable,
      });

      console.log('✅ 修正完了！');
      console.log('📝 修正された等級:');
      Object.entries(correctRanges).forEach(([grade, range]) => {
        console.log(`   - ${grade}級: ${range}`);
      });

      console.log('\n🎯 特に重要な修正:');
      console.log('   - 40級: 810,000 ～ 855,000 (821,500円が該当)');
      console.log('   - 42級: 905,000 ～ 955,000 (926,500円が該当)');
    } else {
      console.log('ℹ️  修正対象が見つかりませんでした');
    }
  } catch (error) {
    console.error('❌ 修正エラー:', error);
  }
}

// スクリプト実行
fixInsuranceTableRanges()
  .then(() => {
    console.log('🏁 スクリプト実行完了');
    console.log('💡 アプリケーションで821,500円と926,500円の等級判定をテストしてください');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 スクリプトエラー:', error);
    process.exit(1);
  });
