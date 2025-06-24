import { Injectable } from '@angular/core';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  doc,
  serverTimestamp,
  setDoc,
  getDoc,
} from 'firebase/firestore';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class OfficeService {
  private firestore = getFirestore();

  // 選択中の事業所IDを管理
  private _selectedOfficeId: string | null = null;
  get selectedOfficeId(): string | null {
    return this._selectedOfficeId;
  }
  set selectedOfficeId(id: string | null) {
    this._selectedOfficeId = id;
  }

  constructor(private authService: AuthService) {}

  async getOfficesForCurrentUser(): Promise<{ id: string; [key: string]: unknown }[]> {
    const userProfile = await this.authService.getCurrentUserProfileWithRole();
    if (!userProfile) return [];

    // 管理者・一般ユーザー問わず、必ずcompanyIdでフィルタ
    const companyId = await this.authService.getCurrentUserCompanyId();
    if (!companyId) return [];
    const q = query(collection(this.firestore, 'offices'), where('companyId', '==', companyId));
    const officesSnapshot = await getDocs(q);
    return officesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  async getOfficeById(officeId: string): Promise<{ id: string; [key: string]: unknown } | null> {
    const docRef = collection(this.firestore, 'offices');
    const docs = await getDocs(query(docRef, where('__name__', '==', officeId)));
    if (!docs.empty) {
      const doc = docs.docs[0];
      return { id: doc.id, ...doc.data() };
    }
    return null;
  }

  /**
   * 動的にFirestore構造を調査して事業所の所在地を取得
   * 複数のパターンでFirestore構造を検索し、事業所の addressPrefecture を取得
   */
  async findOfficeAddressPrefecture(companyId: string, branchNumber: string): Promise<string> {
    console.log('🔍 Firestore構造の動的調査開始');

    // パターン1: companies/{companyId}/offices サブコレクション
    try {
      console.log('パターン1: companies サブコレクション検索');
      const officesRef = collection(this.firestore, 'companies', companyId, 'offices');
      const officesQuery = query(officesRef, where('branchNumber', '==', branchNumber));
      const officesSnapshot = await getDocs(officesQuery);

      if (!officesSnapshot.empty) {
        const officeData = officesSnapshot.docs[0].data();
        const addressPrefecture = officeData['addressPrefecture'] || '';
        if (addressPrefecture) {
          console.log('✅ パターン1で発見:', addressPrefecture);
          return addressPrefecture;
        }
      }
    } catch (error) {
      console.log('パターン1エラー:', error);
    }

    // パターン2: offices コレクション直接検索
    try {
      console.log('パターン2: offices コレクション直接検索');
      const directOfficesRef = collection(this.firestore, 'offices');
      const directQuery = query(
        directOfficesRef,
        where('companyId', '==', companyId),
        where('branchNumber', '==', branchNumber)
      );
      const directSnapshot = await getDocs(directQuery);

      if (!directSnapshot.empty) {
        const officeData = directSnapshot.docs[0].data();
        const addressPrefecture = officeData['addressPrefecture'] || '';
        if (addressPrefecture) {
          console.log('✅ パターン2で発見:', addressPrefecture);
          return addressPrefecture;
        }
      }
    } catch (error) {
      console.log('パターン2エラー:', error);
    }

    // パターン3: offices/{officeId} 直接アクセス（IDパターン推測）
    try {
      console.log('パターン3: offices ドキュメント直接アクセス');
      const possibleOfficeIds = [
        companyId, // companyIdがofficeIdと同じ場合
        `${companyId}_${branchNumber}`, // 結合パターン
        `${companyId}-${branchNumber}`, // ハイフン結合
        `office_${branchNumber}`, // プレフィックス付き
      ];

      for (const officeId of possibleOfficeIds) {
        try {
          const officeDocRef = doc(this.firestore, 'offices', officeId);
          const officeDoc = await getDoc(officeDocRef);

          if (officeDoc.exists()) {
            const officeData = officeDoc.data();
            // 会社IDとブランチ番号が一致するかチェック
            if (
              officeData['companyId'] === companyId &&
              officeData['branchNumber']?.toString() === branchNumber.toString()
            ) {
              const addressPrefecture = officeData['addressPrefecture'] || '';
              if (addressPrefecture) {
                console.log('✅ パターン3で発見:', addressPrefecture, 'officeId:', officeId);
                return addressPrefecture;
              }
            }
          }
        } catch (innerError) {
          console.log(`officeId ${officeId} 検索エラー:`, innerError);
        }
      }
    } catch (error) {
      console.log('パターン3エラー:', error);
    }

    // パターン4: 全offices走査（最後の手段）
    try {
      console.log('パターン4: 全offices走査');
      const allOfficesRef = collection(this.firestore, 'offices');
      const allOfficesSnapshot = await getDocs(allOfficesRef);

      for (const officeDoc of allOfficesSnapshot.docs) {
        const officeData = officeDoc.data();
        if (
          officeData['companyId'] === companyId &&
          officeData['branchNumber']?.toString() === branchNumber.toString()
        ) {
          const addressPrefecture = officeData['addressPrefecture'] || '';
          if (addressPrefecture) {
            console.log('✅ パターン4で発見:', addressPrefecture, 'officeId:', officeDoc.id);
            return addressPrefecture;
          }
        }
      }
    } catch (error) {
      console.log('パターン4エラー:', error);
    }

    console.log('❌ すべてのパターンで事業所が見つかりませんでした');
    return '';
  }

  /**
   * 事業所ごとのapplicationsサブコレクションに帳票データをformNameをドキュメントIDとして上書き保存
   */
  async saveApplicationForOffice(
    officeId: string,
    formName: string,
    formData: Record<string, unknown>,
    userId: string
  ): Promise<void> {
    const applicationDocRef = doc(this.firestore, 'offices', officeId, 'applications', formName);
    await setDoc(
      applicationDocRef,
      {
        formName,
        formData,
        updatedAt: serverTimestamp(),
        createdBy: userId,
      },
      { merge: true }
    );
  }
}
