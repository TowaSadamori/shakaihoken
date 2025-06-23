import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp,
  collection,
  deleteDoc,
  getDocs,
  query,
  where,
  addDoc,
} from 'firebase/firestore';
import { AuthService } from '../../services/auth.service';
import { OfficeService } from '../../services/office.service';
import { SocialInsuranceCalculator } from '../../utils/decimal-calculator';

// 従業員区分の型定義
type EmployeeType = 'general' | 'part_timer' | 'short_time_worker';

interface EmployeeInfo {
  uid: string; // FirestoreのドキュメントID
  name: string;
  employeeNumber: string;
  birthDate: string;
  age: bigint;
  companyId: string;
  branchNumber: string;
  addressPrefecture: string;
  employeeType: EmployeeType; // 従業員区分を追加
  previousStandardRemuneration?: string; // number → string (Decimal文字列)
}

interface MonthlyPayment {
  month: bigint;
  amount: string | null;
  workingDays: bigint | null;
  totalRemuneration?: string;
  retroactivePay?: string;
  isPartialMonth?: boolean;
  isLowPayment?: boolean;
}

// 賞与情報の追加（将来使用予定）
// interface AnnualBonusInfo {
//   annualBonusTotal: number; // 前年7月1日から当年6月30日までの賞与合計
//   isFourTimesOrMore: boolean; // 年4回以上支給かどうか
// }

interface GradeJudgmentResult {
  healthInsuranceGrade: bigint;
  healthInsuranceStandardSalary: string;
  pensionInsuranceGrade: bigint;
  pensionInsuranceStandardSalary: string;
  careInsuranceGrade?: bigint;
  careInsuranceStandardSalary?: string;
}

interface SavedGradeData {
  id?: string;
  employeeId: string;
  targetYear: bigint;
  monthlyPayments: MonthlyPayment[];
  averageAmount: string;
  applicableYear: bigint;
  applicableMonth: bigint;
  endYear?: bigint;
  endMonth?: bigint;
  judgmentResult: GradeJudgmentResult;
  createdAt: Date;
  updatedAt: Date;
  judgmentType: 'regular';
}

@Component({
  selector: 'app-regular-determination-add',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './regular-determination-add.component.html',
  styleUrl: './regular-determination-add.component.scss',
})
export class RegularDeterminationAddComponent implements OnInit {
  employeeInfo: EmployeeInfo | null = null;
  isLoading = false;
  errorMessage = '';

  // フォーム用プロパティ
  targetYear = BigInt(new Date().getFullYear());
  monthlyPayments: MonthlyPayment[] = [
    { month: BigInt(4), amount: null, workingDays: null },
    { month: BigInt(5), amount: null, workingDays: null },
    { month: BigInt(6), amount: null, workingDays: null },
  ];
  averageAmount = '0';
  applicableYear = BigInt(new Date().getFullYear());
  applicableMonth = BigInt(9); // 定時決定は通常9月から適用
  endYear: bigint | null = null;
  endMonth: bigint | null = null;

  // 判定結果
  judgmentResult: GradeJudgmentResult | null = null;
  isCalculating = false;
  isSaving = false;
  savedGradeData: SavedGradeData | null = null;

  // 選択肢用データ
  availableYears: bigint[] = [];
  availableMonths = [
    { value: BigInt(1), label: '1月' },
    { value: BigInt(2), label: '2月' },
    { value: BigInt(3), label: '3月' },
    { value: BigInt(4), label: '4月' },
    { value: BigInt(5), label: '5月' },
    { value: BigInt(6), label: '6月' },
    { value: BigInt(7), label: '7月' },
    { value: BigInt(8), label: '8月' },
    { value: BigInt(9), label: '9月' },
    { value: BigInt(10), label: '10月' },
    { value: BigInt(11), label: '11月' },
    { value: BigInt(12), label: '12月' },
  ];

  private employeeId: string | null = null;
  private recordId: string | null = null;
  isEditMode = false;
  private firestore = getFirestore();
  private companyId: string | null = null;
  private uid: string | null = null; // 従業員のFirestore UID

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService,
    private officeService: OfficeService
  ) {}

  async ngOnInit(): Promise<void> {
    this.employeeId = this.route.snapshot.paramMap.get('employeeId');
    this.recordId = this.route.snapshot.paramMap.get('recordId');
    this.isEditMode = !!this.recordId;

    if (this.employeeId) {
      await this.loadCompanyId();
      await this.loadEmployeeInfo();
      if (this.isEditMode && this.recordId) {
        await this.loadExistingRegularGradeData(this.recordId);
      } else {
        await this.loadSalaryData();
      }
    }
    this.initializeYears();
  }

  private initializeYears(): void {
    const currentYear = BigInt(new Date().getFullYear());
    for (let year = currentYear - BigInt(5); year <= currentYear + BigInt(10); year++) {
      this.availableYears.push(year);
    }
  }

  private async loadEmployeeInfo(): Promise<void> {
    if (!this.employeeId || !this.companyId) return;

    this.isLoading = true;
    try {
      console.log(
        '従業員情報を読み込み中 (employeeNumber, companyId):',
        this.employeeId,
        this.companyId
      );

      // employeeNumberとcompanyIdで検索
      const usersRef = collection(this.firestore, 'users');
      const q = query(
        usersRef,
        where('employeeNumber', '==', this.employeeId),
        where('companyId', '==', this.companyId)
      );
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const userData = userDoc.data();
        this.uid = userDoc.id; // UIDをクラスプロパティに保存
        console.log('Firestoreから取得した従業員データ:', userData, 'UID:', this.uid);

        const birthDate = new Date(userData['birthDate']);
        const age = this.calculateAge(birthDate);

        // 生年月日を日付のみの形式（YYYY-MM-DD）に変換
        const formattedBirthDate = birthDate.toISOString().split('T')[0];

        // 事業所情報から addressPrefecture を取得
        let addressPrefecture = userData['addressPrefecture'] || '';

        // ユーザーデータに addressPrefecture がない場合、事業所データから取得
        if (!addressPrefecture && userData['companyId'] && userData['branchNumber']) {
          try {
            console.log('=== 事業所データ取得開始 ===');
            console.log('対象companyId:', userData['companyId']);
            console.log('対象branchNumber:', userData['branchNumber']);

            addressPrefecture = await this.officeService.findOfficeAddressPrefecture(
              userData['companyId'],
              userData['branchNumber']
            );

            if (addressPrefecture) {
              console.log('✅ 事業所所在地取得成功:', addressPrefecture);
            } else {
              console.warn('⚠️ 事業所所在地が見つかりませんでした');
            }
          } catch (officeError) {
            console.error('❌ 事業所データ取得エラー:', officeError);
          }
        }

        this.employeeInfo = {
          uid: this.uid,
          name: `${userData['lastName'] || ''} ${userData['firstName'] || ''}`.trim(),
          employeeNumber: userData['employeeNumber'] || '',
          birthDate: formattedBirthDate,
          age: age,
          companyId: userData['companyId'] || '',
          branchNumber: userData['branchNumber'] || '',
          addressPrefecture: addressPrefecture,
          employeeType: userData['employeeType'] || 'general', // デフォルトは一般
          previousStandardRemuneration: userData['previousStandardRemuneration']?.toString(),
        };

        console.log('設定された従業員情報:', this.employeeInfo);
      } else {
        console.error(`従業員番号 ${this.employeeId} のデータがFirestoreに存在しません`);
        this.errorMessage = `従業員番号: ${this.employeeId} の情報が見つかりません`;
        this.employeeInfo = null;
      }
    } catch (error) {
      console.error('従業員情報取得エラー:', error);
      this.errorMessage = `従業員情報の取得に失敗しました: ${error}`;
      this.employeeInfo = null;
    } finally {
      this.isLoading = false;
    }
  }

  private async loadCompanyId(): Promise<void> {
    try {
      console.log('🔍 CompanyID取得開始');

      // 給与賞与詳細画面と同じ方法でcompanyIdを取得
      const userDoc = await this.authService['auth'].currentUser;
      if (userDoc) {
        const userSnap = await getDoc(doc(this.firestore, 'users', userDoc.uid));
        if (userSnap.exists()) {
          this.companyId = userSnap.data()['companyId'] || null;
          console.log('✅ AuthServiceからCompanyID取得:', this.companyId);
        } else {
          console.log('❌ ユーザードキュメントが存在しません');
          this.companyId = null;
        }
      } else {
        console.log('❌ 認証ユーザーが存在しません');
        this.companyId = null;
      }

      console.log('🎯 最終CompanyID:', this.companyId);
    } catch (error) {
      console.error('❌ CompanyID取得エラー:', error);
      this.companyId = null;
    }
  }

  private calculateAge(birthDate: Date): bigint {
    const today = new Date();
    let age = BigInt(today.getFullYear()) - BigInt(birthDate.getFullYear());
    const monthDiff = BigInt(today.getMonth()) - BigInt(birthDate.getMonth());
    if (
      monthDiff < BigInt(0) ||
      (monthDiff === BigInt(0) && BigInt(today.getDate()) < BigInt(birthDate.getDate()))
    ) {
      age = age - BigInt(1);
    }
    return age;
  }

  goBack(): void {
    this.router.navigate(['/grade-judgment', this.employeeId]);
  }

  isFormValid(): boolean {
    const validPayments = this.monthlyPayments.filter(
      (payment) =>
        payment.amount !== null && SocialInsuranceCalculator.compare(payment.amount, '0') > 0
    );
    return (
      validPayments.length >= 2 &&
      this.applicableYear > BigInt(0) &&
      this.applicableMonth > BigInt(0)
    );
  }

  isSaveValid(): boolean {
    return this.isFormValid() && !!this.judgmentResult;
  }

  onPaymentChange(): void {
    this.calculateAverage();
  }

  async onTargetYearChange(): Promise<void> {
    await this.loadSalaryData();
  }

  async loadSalaryDataFromFirestore(): Promise<void> {
    await this.loadSalaryData();
  }

  async createTestSalaryData(): Promise<void> {
    if (!this.companyId || !this.employeeId) {
      console.error('CompanyIDまたはEmployeeIDが不足しています');
      return;
    }

    try {
      console.log('🔧 テスト用給与データを作成中...');

      const testSalaryTable = {
        基本給: {
          '4月': '280000',
          '5月': '290000',
          '6月': '290000',
        },
        諸手当: {
          '4月': '256000',
          '5月': '303000',
          '6月': '289800',
        },
        役職手当: {
          '4月': '50000',
          '5月': '50000',
          '6月': '50000',
        },
        職務手当: {
          '4月': '20000',
          '5月': '20000',
          '6月': '20000',
        },
        資格手当: {
          '4月': '10000',
          '5月': '10000',
          '6月': '10000',
        },
        合計: {
          '4月': '616000',
          '5月': '673000',
          '6月': '659800',
        },
        出勤日数: {
          '4月': '22',
          '5月': '20',
          '6月': '21',
        },
      };

      const docPath = `employee-salary-bonus/${this.companyId}/employees/${this.employeeId}/years/${this.targetYear}`;
      const docRef = doc(this.firestore, docPath);

      await setDoc(docRef, {
        salaryTable: testSalaryTable,
      });

      console.log('✅ テスト用給与データを作成しました');
      console.log('パス:', docPath);

      // データ作成後、再度読み込み
      await this.loadSalaryData();
    } catch (error) {
      console.error('❌ テストデータ作成エラー:', error);
    }
  }

  private async loadSalaryData(): Promise<void> {
    if (!this.employeeId || !this.targetYear) {
      console.log('必要なパラメータが不足しています:', {
        employeeId: this.employeeId,
        targetYear: this.targetYear,
        companyId: this.companyId,
      });
      return;
    }

    try {
      console.log('=== 給与データ取得デバッグ開始 ===');
      console.log('パラメータ:', {
        employeeId: this.employeeId,
        targetYear: this.targetYear,
        companyId: this.companyId,
      });

      // 段階的にFirestore構造を確認
      console.log('\n🔍 Firestore構造の段階的確認');

      try {
        // Step 1: employee-salary-bonusコレクション
        console.log('Step 1: employee-salary-bonusコレクション確認');
        const rootRef = collection(this.firestore, 'employee-salary-bonus');
        const rootSnapshot = await getDocs(rootRef);
        if (rootSnapshot.empty) {
          console.log('❌ employee-salary-bonusコレクションが空です');
        } else {
          console.log('✅ employee-salary-bonusコレクション内容:');
          rootSnapshot.forEach((docSnapshot) => {
            console.log(`  - ドキュメントID: ${docSnapshot.id}`);
          });
        }

        // Step 2: 特定companyIdドキュメント確認
        console.log('\nStep 2: companyIdドキュメント確認');
        const companyDocRef = doc(this.firestore, 'employee-salary-bonus', this.companyId!);
        const companyDocSnap = await getDoc(companyDocRef);
        if (companyDocSnap.exists()) {
          console.log('✅ companyIdドキュメント存在:', companyDocSnap.data());
        } else {
          console.log('❌ companyIdドキュメントが存在しません');
        }

        // Step 3: employeesサブコレクション確認
        console.log('\nStep 3: employeesサブコレクション確認');
        const employeesRef = collection(
          this.firestore,
          'employee-salary-bonus',
          this.companyId!,
          'employees'
        );
        const employeesSnapshot = await getDocs(employeesRef);
        if (employeesSnapshot.empty) {
          console.log('❌ employeesサブコレクションが空です');
        } else {
          console.log('✅ employeesサブコレクション内容:');
          employeesSnapshot.forEach((docSnapshot) => {
            console.log(`  - 従業員ID: ${docSnapshot.id}`);
          });
        }

        // Step 4: 特定従業員ドキュメント確認
        console.log('\nStep 4: 特定従業員ドキュメント確認');
        const employeeDocRef = doc(
          this.firestore,
          'employee-salary-bonus',
          this.companyId!,
          'employees',
          this.employeeId!
        );
        const employeeDocSnap = await getDoc(employeeDocRef);
        if (employeeDocSnap.exists()) {
          console.log('✅ 従業員ドキュメント存在:', employeeDocSnap.data());
        } else {
          console.log('❌ 従業員ドキュメントが存在しません');
        }

        // Step 5: yearsサブコレクション確認
        console.log('\nStep 5: yearsサブコレクション確認');
        const yearsRef = collection(
          this.firestore,
          'employee-salary-bonus',
          this.companyId!,
          'employees',
          this.employeeId!,
          'years'
        );
        const yearsSnapshot = await getDocs(yearsRef);
        if (yearsSnapshot.empty) {
          console.log('❌ yearsサブコレクションが空です');
        } else {
          console.log('✅ yearsサブコレクション内容:');
          yearsSnapshot.forEach((docSnapshot) => {
            console.log(`  - 年度: ${docSnapshot.id}`);
          });
        }
      } catch (debugError) {
        console.error('Firestore構造確認エラー:', debugError);
      }

      // 複数のパターンでデータを探す
      const possiblePaths = [
        // パターン1: companyIdを使用
        this.companyId
          ? `employee-salary-bonus/${this.companyId}/employees/${this.employeeId}/years/${this.targetYear}`
          : null,
        // パターン2: 直接employeeIdを使用
        `employee-salary-bonus/${this.employeeId}/years/${this.targetYear}`,
      ].filter((path): path is string => path !== null);

      console.log('試行するパス:', possiblePaths);

      let salaryData = null;
      let successPath = '';

      // 各パスを順番に試す
      for (const path of possiblePaths) {
        try {
          console.log(`\n--- パス試行: ${path} ---`);
          const docRef = doc(this.firestore, path);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            salaryData = docSnap.data();
            successPath = path;
            console.log(`✅ データ発見!`);
            console.log(`パス: ${path}`);
            console.log(`データ:`, salaryData);
            break;
          } else {
            console.log(`❌ データなし`);
          }
        } catch (pathError) {
          console.error(`❌ パスエラー:`, pathError);
        }
      }

      if (salaryData) {
        const salaryTable = salaryData['salaryTable'] || {};
        console.log('\n=== 給与テーブル解析 ===');
        console.log('salaryTable:', salaryTable);

        // salaryTableの構造を詳しく確認
        console.log('salaryTableのキー:', Object.keys(salaryTable));

        // 各行データの確認（実際に存在する項目を確認）
        console.log('利用可能な項目:', Object.keys(salaryTable));

        // 画像で確認できる項目をチェック
        const availableItems = [
          '基本給',
          '諸手当',
          '役職手当',
          '職務手当',
          '資格手当',
          '出勤日数',
          'その他（金銭支給）',
          'その他（現物支給）',
        ];
        availableItems.forEach((rowName) => {
          if (salaryTable[rowName]) {
            console.log(`${rowName}:`, salaryTable[rowName]);
            // 4月〜6月のデータがあるかチェック
            const monthData = salaryTable[rowName];
            ['4月', '5月', '6月'].forEach((month) => {
              if (monthData[month]) {
                console.log(`  ${month}: ${monthData[month]}`);
              }
            });
          }
        });

        // 4月〜6月のデータを取得
        const months = ['4月', '5月', '6月'];
        let hasAnyData = false;

        months.forEach((monthName, index) => {
          console.log(`\n--- ${monthName}のデータ処理 ---`);

          // 合計金額を直接取得（最優先）
          let totalAmount = Number(salaryTable['合計']?.[monthName]) || 0;

          // 合計がない場合は個別項目から計算
          if (totalAmount === 0) {
            const basicSalary = Number(salaryTable['基本給']?.[monthName]) || 0;
            const allowances = Number(salaryTable['諸手当']?.[monthName]) || 0;
            const positionAllowance = Number(salaryTable['役職手当']?.[monthName]) || 0;
            const jobAllowance = Number(salaryTable['職務手当']?.[monthName]) || 0;
            const qualificationAllowance = Number(salaryTable['資格手当']?.[monthName]) || 0;

            totalAmount =
              basicSalary + allowances + positionAllowance + jobAllowance + qualificationAllowance;

            console.log(`個別計算:`, {
              基本給: basicSalary,
              諸手当: allowances,
              役職手当: positionAllowance,
              職務手当: jobAllowance,
              資格手当: qualificationAllowance,
              計算合計: totalAmount,
            });
          } else {
            console.log(`合計金額を直接取得: ${totalAmount}円`);
          }

          // 出勤日数を取得
          const workingDays = Number(salaryTable['出勤日数']?.[monthName]) || null;

          console.log(`${monthName}の最終データ:`, {
            報酬月額: totalAmount,
            出勤日数: workingDays,
          });

          if (totalAmount > 0 || workingDays !== null) {
            hasAnyData = true;
          }

          // フォームに設定
          this.monthlyPayments[index] = {
            month: BigInt(index + 4), // 4, 5, 6月
            amount: totalAmount > 0 ? totalAmount.toString() : null,
            workingDays: workingDays ? BigInt(workingDays) : null,
          };
        });

        if (!hasAnyData) {
          console.log('\n⚠️ 4月〜6月のデータが見つかりません');
          console.log('給与賞与情報詳細画面で該当月のデータを入力してください');
        }

        // 平均を再計算
        this.calculateAverage();

        console.log('\n=== 最終結果 ===');
        console.log('設定後のmonthlyPayments:', this.monthlyPayments);
        console.log(`給与データ取得成功: ${successPath}`);
      } else {
        console.log('\n❌ すべてのパスで給与データが見つかりませんでした');
        console.log('Firestoreの構造を確認してください');
      }

      console.log('=== 給与データ取得デバッグ終了 ===\n');
    } catch (error) {
      console.error('給与データ取得エラー:', error);
    }
  }

  private calculateAverage(): void {
    if (!this.employeeInfo) {
      this.averageAmount = '0';
      this.judgmentResult = null;
      return;
    }

    // Step 1: 算定対象月の特定（支払基礎日数による厳密な判定）
    const targetMonths = this.filterTargetMonths(
      this.employeeInfo.employeeType,
      this.monthlyPayments
    );

    if (targetMonths.length === 0) {
      console.log('算定対象月が0ヶ月のため、従前の標準報酬月額を使用');
      // 従前の標準報酬月額がある場合はそれを使用、なければ0
      this.averageAmount = this.employeeInfo.previousStandardRemuneration || '0';
      this.judgmentResult = null;
      return;
    }

    // Step 2: 各月の報酬額を調整
    let totalRemuneration = '0';

    for (const month of targetMonths) {
      let adjustedAmount = month.amount || '0';

      // 遡及払いがある場合は減算（Decimal.js使用）
      if (
        month.retroactivePay &&
        SocialInsuranceCalculator.compare(month.retroactivePay, '0') > 0
      ) {
        adjustedAmount = SocialInsuranceCalculator.adjustForRetroactivePay(
          adjustedAmount,
          month.retroactivePay
        );
        console.log(`${month.month}月: 遡及払い ${month.retroactivePay}円を減算`);
      }

      // 将来実装: 年4回以上の賞与加算
      // if (annualBonusTotal > 0) {
      //   const monthlyBonusAdjustment = SocialInsuranceCalculator.calculateMonthlyBonusAdjustment(annualBonusTotal);
      //   adjustedAmount += monthlyBonusAdjustment;
      // }

      totalRemuneration = SocialInsuranceCalculator.addAmounts(totalRemuneration, adjustedAmount);
    }

    // Step 3: 平均報酬月額の計算（1円未満切り捨て）
    const amounts = targetMonths.map((month) => month.amount || '0');
    this.averageAmount = SocialInsuranceCalculator.calculateAverageRemuneration(amounts);

    console.log('算定結果:', {
      targetMonths: targetMonths.map((m) => `${m.month}`),
      totalRemuneration,
      monthCount: targetMonths.length,
      averageAmount: this.averageAmount,
    });
  }

  /**
   * 従業員区分に応じた算定対象月の厳密な判定
   */
  private filterTargetMonths(
    employeeType: EmployeeType,
    monthlyPayments: MonthlyPayment[]
  ): MonthlyPayment[] {
    const validPayments = monthlyPayments.filter(
      (payment) =>
        payment.amount !== null &&
        SocialInsuranceCalculator.compare(payment.amount, '0') > 0 &&
        payment.workingDays !== null &&
        !payment.isPartialMonth && // 途中入社等の月は除外
        !payment.isLowPayment // 休職給等の月は除外
    );

    switch (employeeType) {
      case 'general':
        // 一般の被保険者: 支払基礎日数が17日以上
        return validPayments.filter((payment) => (payment.workingDays || 0) >= 17);

      case 'part_timer': {
        // 短時間就労者: まず17日以上を探し、なければ15日以上17日未満
        const seventeenDaysOrMore = validPayments.filter(
          (payment) => (payment.workingDays || 0) >= 17
        );
        if (seventeenDaysOrMore.length > 0) {
          return seventeenDaysOrMore;
        }
        // 17日以上がない場合のみ15日以上17日未満を対象
        return validPayments.filter((payment) => {
          const days = payment.workingDays || 0;
          return days >= 15 && days < 17;
        });
      }

      case 'short_time_worker':
        // 短時間労働者: 支払基礎日数が11日以上
        return validPayments.filter((payment) => (payment.workingDays || 0) >= 11);

      default:
        console.warn('未知の従業員区分:', employeeType);
        return validPayments.filter((payment) => (payment.workingDays || 0) >= 17);
    }
  }

  async calculateGrade(): Promise<void> {
    if (!this.isFormValid() || this.averageAmount === '0') {
      return;
    }

    try {
      const result = this.findGradeByAmountFromStandardTable(this.averageAmount);
      this.judgmentResult = result;
      this.errorMessage = '';
    } catch (error) {
      console.error('等級判定エラー:', error);
      this.errorMessage = '等級判定に失敗しました';
      this.judgmentResult = null;
    }
  }

  async judgeAndSave(): Promise<void> {
    // まず等級を計算
    await this.calculateGrade();

    if (!this.judgmentResult) {
      return;
    }

    // 保存処理を実行（ページ遷移なし）
    if (!this.employeeId || !this.isFormValid()) {
      this.errorMessage = '保存に必要な情報が不足しています。';
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    try {
      if (this.isEditMode && this.recordId) {
        // 編集モードの場合は履歴を更新
        await this.updateGradeJudgmentHistory();
        alert('定時決定データが正常に更新されました。');
        this.router.navigate(['/grade-judgment', this.employeeId]);
      } else {
        // 新規作成の場合
        const gradeData: Omit<SavedGradeData, 'id'> = {
          employeeId: this.employeeId,
          targetYear: this.targetYear,
          monthlyPayments: this.monthlyPayments,
          averageAmount: this.averageAmount,
          applicableYear: this.applicableYear,
          applicableMonth: this.applicableMonth,
          judgmentResult: this.judgmentResult,
          createdAt: this.savedGradeData?.createdAt || new Date(),
          updatedAt: new Date(),
          judgmentType: 'regular',
        };

        if (this.endYear && this.endMonth) {
          gradeData.endYear = this.endYear;
          gradeData.endMonth = this.endMonth;
        }

        const newRecordId = await this.saveToGradeJudgmentHistory(gradeData);

        if (newRecordId) {
          alert('定時決定データが正常に保存されました。');
          // 保存後、新しいrecordIdをURLに追加して編集モードに移行
          this.router.navigate([newRecordId], { relativeTo: this.route });
        } else {
          this.errorMessage = 'データの保存中にエラーが発生しました。';
        }
      }
    } catch (error) {
      console.error('保存エラー:', error);
      this.errorMessage = `データの保存中にエラーが発生しました: ${error}`;
    } finally {
      this.isSaving = false;
    }
  }

  private findGradeByAmountFromStandardTable(amount: string): GradeJudgmentResult {
    // 健康保険の等級を決定
    const healthGrade = this.findGradeFromHealthInsuranceTable(amount);

    // 厚生年金保険の等級を決定
    const pensionGrade = this.findGradeFromPensionInsuranceTable(amount);

    const result: GradeJudgmentResult = {
      healthInsuranceGrade: healthGrade.grade,
      healthInsuranceStandardSalary: healthGrade.standardSalary,
      pensionInsuranceGrade: pensionGrade.grade,
      pensionInsuranceStandardSalary: pensionGrade.standardSalary,
    };

    // 40歳以上の場合は介護保険も設定（健康保険と同じ等級）
    if (this.employeeInfo && this.employeeInfo.age >= 40) {
      result.careInsuranceGrade = healthGrade.grade;
      result.careInsuranceStandardSalary = healthGrade.standardSalary;
    }

    return result;
  }

  /**
   * 健康保険の等級表（令和6年度 - 全50等級）
   */
  private findGradeFromHealthInsuranceTable(amount: string): {
    grade: bigint;
    standardSalary: string;
  } {
    const healthInsuranceTable = [
      { grade: BigInt(1), standardSalary: '58000', min: '0', max: '63000' },
      { grade: BigInt(2), standardSalary: '68000', min: '63000', max: '73000' },
      { grade: BigInt(3), standardSalary: '78000', min: '73000', max: '83000' },
      { grade: BigInt(4), standardSalary: '88000', min: '83000', max: '93000' },
      { grade: BigInt(5), standardSalary: '98000', min: '93000', max: '101000' },
      { grade: BigInt(6), standardSalary: '104000', min: '101000', max: '107000' },
      { grade: BigInt(7), standardSalary: '110000', min: '107000', max: '114000' },
      { grade: BigInt(8), standardSalary: '118000', min: '114000', max: '122000' },
      { grade: BigInt(9), standardSalary: '126000', min: '122000', max: '130000' },
      { grade: BigInt(10), standardSalary: '134000', min: '130000', max: '138000' },
      { grade: BigInt(11), standardSalary: '142000', min: '138000', max: '146000' },
      { grade: BigInt(12), standardSalary: '150000', min: '146000', max: '155000' },
      { grade: BigInt(13), standardSalary: '160000', min: '155000', max: '165000' },
      { grade: BigInt(14), standardSalary: '170000', min: '165000', max: '175000' },
      { grade: BigInt(15), standardSalary: '180000', min: '175000', max: '185000' },
      { grade: BigInt(16), standardSalary: '190000', min: '185000', max: '195000' },
      { grade: BigInt(17), standardSalary: '200000', min: '195000', max: '210000' },
      { grade: BigInt(18), standardSalary: '220000', min: '210000', max: '230000' },
      { grade: BigInt(19), standardSalary: '240000', min: '230000', max: '250000' },
      { grade: BigInt(20), standardSalary: '260000', min: '250000', max: '270000' },
      { grade: BigInt(21), standardSalary: '280000', min: '270000', max: '290000' },
      { grade: BigInt(22), standardSalary: '300000', min: '290000', max: '310000' },
      { grade: BigInt(23), standardSalary: '320000', min: '310000', max: '330000' },
      { grade: BigInt(24), standardSalary: '340000', min: '330000', max: '350000' },
      { grade: BigInt(25), standardSalary: '360000', min: '350000', max: '370000' },
      { grade: BigInt(26), standardSalary: '380000', min: '370000', max: '395000' },
      { grade: BigInt(27), standardSalary: '410000', min: '395000', max: '425000' },
      { grade: BigInt(28), standardSalary: '440000', min: '425000', max: '455000' },
      { grade: BigInt(29), standardSalary: '470000', min: '455000', max: '485000' },
      { grade: BigInt(30), standardSalary: '500000', min: '485000', max: '515000' },
      { grade: BigInt(31), standardSalary: '530000', min: '515000', max: '545000' },
      { grade: BigInt(32), standardSalary: '560000', min: '545000', max: '575000' },
      { grade: BigInt(33), standardSalary: '590000', min: '575000', max: '605000' },
      { grade: BigInt(34), standardSalary: '620000', min: '605000', max: '635000' },
      { grade: BigInt(35), standardSalary: '650000', min: '635000', max: '665000' },
      { grade: BigInt(36), standardSalary: '680000', min: '665000', max: '695000' },
      { grade: BigInt(37), standardSalary: '710000', min: '695000', max: '730000' },
      { grade: BigInt(38), standardSalary: '750000', min: '730000', max: '770000' },
      { grade: BigInt(39), standardSalary: '790000', min: '770000', max: '810000' },
      { grade: BigInt(40), standardSalary: '830000', min: '810000', max: '855000' },
      { grade: BigInt(41), standardSalary: '880000', min: '855000', max: '905000' },
      { grade: BigInt(42), standardSalary: '930000', min: '905000', max: '955000' },
      { grade: BigInt(43), standardSalary: '980000', min: '955000', max: '1005000' },
      { grade: BigInt(44), standardSalary: '1030000', min: '1005000', max: '1055000' },
      { grade: BigInt(45), standardSalary: '1090000', min: '1055000', max: '1115000' },
      { grade: BigInt(46), standardSalary: '1150000', min: '1115000', max: '1175000' },
      { grade: BigInt(47), standardSalary: '1210000', min: '1175000', max: '1235000' },
      { grade: BigInt(48), standardSalary: '1270000', min: '1235000', max: '1295000' },
      { grade: BigInt(49), standardSalary: '1330000', min: '1295000', max: '1355000' },
      { grade: BigInt(50), standardSalary: '1390000', min: '1355000', max: 'Infinity' },
    ];

    // Decimal.jsを使用した正確な範囲判定
    const targetGrade = healthInsuranceTable.find((grade) =>
      SocialInsuranceCalculator.isInGradeRange(amount, grade.min, grade.max)
    );
    return targetGrade || healthInsuranceTable[healthInsuranceTable.length - 1];
  }

  /**
   * 厚生年金保険の等級表（令和6年度 - 全32等級）
   */
  private findGradeFromPensionInsuranceTable(amount: string): {
    grade: bigint;
    standardSalary: string;
  } {
    const pensionInsuranceTable = [
      { grade: BigInt(1), standardSalary: '88000', min: '0', max: '93000' },
      { grade: BigInt(2), standardSalary: '98000', min: '93000', max: '101000' },
      { grade: BigInt(3), standardSalary: '104000', min: '101000', max: '107000' },
      { grade: BigInt(4), standardSalary: '110000', min: '107000', max: '114000' },
      { grade: BigInt(5), standardSalary: '118000', min: '114000', max: '122000' },
      { grade: BigInt(6), standardSalary: '126000', min: '122000', max: '130000' },
      { grade: BigInt(7), standardSalary: '134000', min: '130000', max: '138000' },
      { grade: BigInt(8), standardSalary: '142000', min: '138000', max: '146000' },
      { grade: BigInt(9), standardSalary: '150000', min: '146000', max: '155000' },
      { grade: BigInt(10), standardSalary: '160000', min: '155000', max: '165000' },
      { grade: BigInt(11), standardSalary: '170000', min: '165000', max: '175000' },
      { grade: BigInt(12), standardSalary: '180000', min: '175000', max: '185000' },
      { grade: BigInt(13), standardSalary: '190000', min: '185000', max: '195000' },
      { grade: BigInt(14), standardSalary: '200000', min: '195000', max: '210000' },
      { grade: BigInt(15), standardSalary: '220000', min: '210000', max: '230000' },
      { grade: BigInt(16), standardSalary: '240000', min: '230000', max: '250000' },
      { grade: BigInt(17), standardSalary: '260000', min: '250000', max: '270000' },
      { grade: BigInt(18), standardSalary: '280000', min: '270000', max: '290000' },
      { grade: BigInt(19), standardSalary: '300000', min: '290000', max: '310000' },
      { grade: BigInt(20), standardSalary: '320000', min: '310000', max: '330000' },
      { grade: BigInt(21), standardSalary: '340000', min: '330000', max: '350000' },
      { grade: BigInt(22), standardSalary: '360000', min: '350000', max: '370000' },
      { grade: BigInt(23), standardSalary: '380000', min: '370000', max: '395000' },
      { grade: BigInt(24), standardSalary: '410000', min: '395000', max: '425000' },
      { grade: BigInt(25), standardSalary: '440000', min: '425000', max: '455000' },
      { grade: BigInt(26), standardSalary: '470000', min: '455000', max: '485000' },
      { grade: BigInt(27), standardSalary: '500000', min: '485000', max: '515000' },
      { grade: BigInt(28), standardSalary: '530000', min: '515000', max: '545000' },
      { grade: BigInt(29), standardSalary: '560000', min: '545000', max: '575000' },
      { grade: BigInt(30), standardSalary: '590000', min: '575000', max: '605000' },
      { grade: BigInt(31), standardSalary: '620000', min: '605000', max: '635000' },
      { grade: BigInt(32), standardSalary: '650000', min: '635000', max: 'Infinity' },
    ];

    // Decimal.jsを使用した正確な範囲判定
    const targetGrade = pensionInsuranceTable.find((grade) =>
      SocialInsuranceCalculator.isInGradeRange(amount, grade.min, grade.max)
    );
    return targetGrade || pensionInsuranceTable[pensionInsuranceTable.length - 1];
  }

  private getStandardSalaryByGrade(insuranceType: 'health' | 'pension', grade: number): string {
    if (insuranceType === 'health') {
      const healthInsuranceTable = [
        { grade: 1, standardSalary: '58000' },
        { grade: 2, standardSalary: '68000' },
        { grade: 3, standardSalary: '78000' },
        { grade: 4, standardSalary: '88000' },
        { grade: 5, standardSalary: '98000' },
        { grade: 6, standardSalary: '104000' },
        { grade: 7, standardSalary: '110000' },
        { grade: 8, standardSalary: '118000' },
        { grade: 9, standardSalary: '126000' },
        { grade: 10, standardSalary: '134000' },
        { grade: 11, standardSalary: '142000' },
        { grade: 12, standardSalary: '150000' },
        { grade: 13, standardSalary: '160000' },
        { grade: 14, standardSalary: '170000' },
        { grade: 15, standardSalary: '180000' },
        { grade: 16, standardSalary: '190000' },
        { grade: 17, standardSalary: '200000' },
        { grade: 18, standardSalary: '220000' },
        { grade: 19, standardSalary: '240000' },
        { grade: 20, standardSalary: '260000' },
        { grade: 21, standardSalary: '280000' },
        { grade: 22, standardSalary: '300000' },
        { grade: 23, standardSalary: '320000' },
        { grade: 24, standardSalary: '340000' },
        { grade: 25, standardSalary: '360000' },
        { grade: 26, standardSalary: '380000' },
        { grade: 27, standardSalary: '410000' },
        { grade: 28, standardSalary: '440000' },
        { grade: 29, standardSalary: '470000' },
        { grade: 30, standardSalary: '500000' },
        { grade: 31, standardSalary: '530000' },
        { grade: 32, standardSalary: '560000' },
        { grade: 33, standardSalary: '590000' },
        { grade: 34, standardSalary: '620000' },
        { grade: 35, standardSalary: '650000' },
        { grade: 36, standardSalary: '680000' },
        { grade: 37, standardSalary: '710000' },
        { grade: 38, standardSalary: '750000' },
        { grade: 39, standardSalary: '790000' },
        { grade: 40, standardSalary: '830000' },
        { grade: 41, standardSalary: '880000' },
        { grade: 42, standardSalary: '930000' },
        { grade: 43, standardSalary: '980000' },
        { grade: 44, standardSalary: '1030000' },
        { grade: 45, standardSalary: '1090000' },
        { grade: 46, standardSalary: '1150000' },
        { grade: 47, standardSalary: '1210000' },
        { grade: 48, standardSalary: '1270000' },
        { grade: 49, standardSalary: '1330000' },
        { grade: 50, standardSalary: '1390000' },
      ];
      const found = healthInsuranceTable.find((item) => item.grade === grade);
      return found ? found.standardSalary : '0';
    } else {
      const pensionInsuranceTable = [
        { grade: 1, standardSalary: '88000' },
        { grade: 2, standardSalary: '98000' },
        { grade: 3, standardSalary: '104000' },
        { grade: 4, standardSalary: '110000' },
        { grade: 5, standardSalary: '118000' },
        { grade: 6, standardSalary: '126000' },
        { grade: 7, standardSalary: '134000' },
        { grade: 8, standardSalary: '142000' },
        { grade: 9, standardSalary: '150000' },
        { grade: 10, standardSalary: '160000' },
        { grade: 11, standardSalary: '170000' },
        { grade: 12, standardSalary: '180000' },
        { grade: 13, standardSalary: '190000' },
        { grade: 14, standardSalary: '200000' },
        { grade: 15, standardSalary: '220000' },
        { grade: 16, standardSalary: '240000' },
        { grade: 17, standardSalary: '260000' },
        { grade: 18, standardSalary: '280000' },
        { grade: 19, standardSalary: '300000' },
        { grade: 20, standardSalary: '320000' },
        { grade: 21, standardSalary: '340000' },
        { grade: 22, standardSalary: '360000' },
        { grade: 23, standardSalary: '380000' },
        { grade: 24, standardSalary: '410000' },
        { grade: 25, standardSalary: '440000' },
        { grade: 26, standardSalary: '470000' },
        { grade: 27, standardSalary: '500000' },
        { grade: 28, standardSalary: '530000' },
        { grade: 29, standardSalary: '560000' },
        { grade: 30, standardSalary: '590000' },
        { grade: 31, standardSalary: '620000' },
        { grade: 32, standardSalary: '650000' },
      ];
      const found = pensionInsuranceTable.find((item) => item.grade === grade);
      return found ? found.standardSalary : '0';
    }
  }

  private async loadExistingGradeData(): Promise<void> {
    if (!this.employeeId) return;
    try {
      const docId = `${this.employeeId}_regular`;
      const docRef = doc(this.firestore, 'employee_grades', docId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as SavedGradeData;
        this.savedGradeData = { ...data, id: docSnap.id };
        // 既存のデータをフォームにロード
        this.targetYear = BigInt(data.targetYear);
        this.monthlyPayments = data.monthlyPayments.map((p) => ({
          ...p,
          month: BigInt(p.month),
          workingDays: p.workingDays ? BigInt(p.workingDays) : null,
        }));
        this.averageAmount = data.averageAmount;
        this.applicableYear = BigInt(data.applicableYear);
        this.applicableMonth = BigInt(data.applicableMonth);
        this.endYear = data.endYear ? BigInt(data.endYear) : null;
        this.endMonth = data.endMonth ? BigInt(data.endMonth) : null;
        this.judgmentResult = {
          ...data.judgmentResult,
          healthInsuranceGrade: BigInt(data.judgmentResult.healthInsuranceGrade),
          pensionInsuranceGrade: BigInt(data.judgmentResult.pensionInsuranceGrade),
          careInsuranceGrade: data.judgmentResult.careInsuranceGrade
            ? BigInt(data.judgmentResult.careInsuranceGrade)
            : undefined,
        };
      }
    } catch (error) {
      console.error('既存の定時決定データ読み込みエラー:', error);
      this.errorMessage = '既存の定時決定データの読み込みに失敗しました。';
    }
  }

  private async loadExistingRegularGradeData(recordId: string): Promise<void> {
    if (!this.uid || !this.companyId || !this.employeeId) {
      console.warn('必要なIDが不足しているため、既存のデータを読み込めません。');
      return;
    }
    this.isLoading = true;
    try {
      const docRef = doc(
        this.firestore,
        `companies/${this.companyId}/employees/${this.uid}/gradeHistory`,
        recordId
      );
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();

        // 定時決定データの場合、inputDataから元の入力値を取得
        if (data['inputData']) {
          this.targetYear = data['inputData'].targetYear
            ? typeof data['inputData'].targetYear === 'string'
              ? BigInt(data['inputData'].targetYear)
              : BigInt(data['inputData'].targetYear)
            : BigInt(new Date().getFullYear());

          // 月別支払データを復元
          if (
            data['inputData'].monthlyPayments &&
            Array.isArray(data['inputData'].monthlyPayments)
          ) {
            this.monthlyPayments = data['inputData'].monthlyPayments.map((p: MonthlyPayment) => ({
              month: typeof p.month === 'string' ? BigInt(p.month) : BigInt(p.month),
              amount: p.amount,
              workingDays: p.workingDays
                ? typeof p.workingDays === 'string'
                  ? BigInt(p.workingDays)
                  : BigInt(p.workingDays)
                : null,
              totalRemuneration: p.totalRemuneration,
              retroactivePay: p.retroactivePay,
              isPartialMonth: p.isPartialMonth,
              isLowPayment: p.isLowPayment,
            }));
          } else {
            // デフォルトの月別データ
            this.monthlyPayments = [
              { month: BigInt(4), amount: null, workingDays: null },
              { month: BigInt(5), amount: null, workingDays: null },
              { month: BigInt(6), amount: null, workingDays: null },
            ];
          }

          this.averageAmount = data['inputData'].averageAmount || '0';
        } else {
          // inputDataがない場合は、standardMonthlyAmountを使用
          this.averageAmount = data['standardMonthlyAmount'] || '0';
        }

        // 適用期間を読み込み
        const effectiveDate = (data['effectiveDate'] as Timestamp).toDate();
        this.applicableYear = BigInt(effectiveDate.getFullYear());
        this.applicableMonth = BigInt(effectiveDate.getMonth() + 1);

        // 終了日がある場合は読み込み
        if (data['endDate']) {
          const endDate = (data['endDate'] as Timestamp).toDate();
          this.endYear = BigInt(endDate.getFullYear());
          this.endMonth = BigInt(endDate.getMonth() + 1);
        } else {
          this.endYear = null;
          this.endMonth = null;
        }

        // 等級情報を読み込み
        this.judgmentResult = {
          healthInsuranceGrade:
            typeof data['healthInsuranceGrade'] === 'string'
              ? BigInt(data['healthInsuranceGrade'])
              : BigInt(data['healthInsuranceGrade']),
          healthInsuranceStandardSalary: this.getStandardSalaryByGrade(
            'health',
            Number(data['healthInsuranceGrade'])
          ),
          pensionInsuranceGrade:
            typeof data['pensionInsuranceGrade'] === 'string'
              ? BigInt(data['pensionInsuranceGrade'])
              : BigInt(data['pensionInsuranceGrade']),
          pensionInsuranceStandardSalary: this.getStandardSalaryByGrade(
            'pension',
            Number(data['pensionInsuranceGrade'])
          ),
          careInsuranceGrade: data['careInsuranceGrade']
            ? typeof data['careInsuranceGrade'] === 'string'
              ? BigInt(data['careInsuranceGrade'])
              : BigInt(data['careInsuranceGrade'])
            : undefined,
          careInsuranceStandardSalary: data['careInsuranceGrade']
            ? this.getStandardSalaryByGrade('health', Number(data['careInsuranceGrade']))
            : undefined,
        };

        console.log('読み込んだ定時決定データ:', {
          targetYear: this.targetYear,
          monthlyPayments: this.monthlyPayments,
          averageAmount: this.averageAmount,
          applicableYear: this.applicableYear,
          applicableMonth: this.applicableMonth,
          endYear: this.endYear,
          endMonth: this.endMonth,
          judgmentResult: this.judgmentResult,
        });
      } else {
        this.errorMessage = '指定された定時決定データが見つかりません。';
      }
    } catch (error) {
      console.error('既存定時決定データ読み込みエラー:', error);
      this.errorMessage = 'データの読み込み中にエラーが発生しました。';
    } finally {
      this.isLoading = false;
    }
  }

  async saveToGradeJudgmentHistory(gradeData: Omit<SavedGradeData, 'id'>): Promise<string | null> {
    if (!this.companyId || !this.employeeId) {
      this.errorMessage = '従業員情報が読み込めていないため、保存できません。';
      return null;
    }

    try {
      const effectiveDate = new Date(
        Number(this.applicableYear),
        Number(this.applicableMonth) - 1,
        1
      );

      const historyRecord: Record<string, unknown> = {
        employeeId: this.employeeId,
        judgmentType: 'regular' as const,
        judgmentDate: new Date(),
        effectiveDate: effectiveDate,
        healthInsuranceGrade: gradeData.judgmentResult.healthInsuranceGrade,
        pensionInsuranceGrade: gradeData.judgmentResult.pensionInsuranceGrade,
        standardMonthlyAmount: gradeData.averageAmount,
        reason: '定時決定による等級判定',
        inputData: {
          targetYear: this.targetYear,
          monthlyPayments: this.monthlyPayments,
          averageAmount: this.averageAmount,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // careInsuranceGradeは値がある場合のみ設定
      if (gradeData.judgmentResult.careInsuranceGrade !== undefined) {
        historyRecord['careInsuranceGrade'] = gradeData.judgmentResult.careInsuranceGrade;
      }

      // endDateは値がある場合のみ設定
      if (gradeData.endYear && gradeData.endMonth) {
        historyRecord['endDate'] = new Date(
          Number(gradeData.endYear),
          Number(gradeData.endMonth) - 1,
          1
        );
      } else {
        historyRecord['endDate'] = null;
      }

      const historyRef = collection(
        this.firestore,
        `companies/${this.companyId}/employees/${this.employeeId}/gradeHistory`
      );
      console.log('>>> [SAVE] Saving to path:', historyRef.path);
      const newDocRef = await addDoc(historyRef, this.deepConvertBigIntToString(historyRecord));

      console.log('✅ 等級履歴保存成功、ドキュメントID:', newDocRef.id);
      return newDocRef.id;
    } catch (error) {
      console.error('履歴保存エラー:', error);
      return null;
    }
  }

  async updateGradeJudgmentHistory(): Promise<void> {
    if (
      !this.uid ||
      !this.companyId ||
      !this.employeeId ||
      !this.recordId ||
      !this.judgmentResult
    ) {
      this.errorMessage = '更新に必要な情報が不足しています。';
      return;
    }

    try {
      const effectiveDate = new Date(
        Number(this.applicableYear),
        Number(this.applicableMonth) - 1,
        1
      );

      const historyRecord: Record<string, unknown> = {
        employeeId: this.employeeId,
        judgmentType: 'regular' as const,
        judgmentDate: new Date(),
        effectiveDate: effectiveDate,
        healthInsuranceGrade: this.judgmentResult.healthInsuranceGrade,
        pensionInsuranceGrade: this.judgmentResult.pensionInsuranceGrade,
        standardMonthlyAmount: this.averageAmount,
        reason: '定時決定による等級判定',
        inputData: {
          targetYear: this.targetYear,
          monthlyPayments: this.monthlyPayments,
          averageAmount: this.averageAmount,
        },
        updatedAt: new Date(),
      };

      // careInsuranceGradeは値がある場合のみ設定
      if (this.judgmentResult.careInsuranceGrade !== undefined) {
        historyRecord['careInsuranceGrade'] = this.judgmentResult.careInsuranceGrade;
      }

      // endDateは値がある場合のみ設定
      if (this.endYear && this.endMonth) {
        historyRecord['endDate'] = new Date(Number(this.endYear), Number(this.endMonth) - 1, 1);
      } else {
        historyRecord['endDate'] = null;
      }

      const historyDocRef = doc(
        this.firestore,
        `companies/${this.companyId}/employees/${this.uid}/gradeHistory`,
        this.recordId
      );
      const convertedRecord = this.deepConvertBigIntToString(historyRecord);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateDoc(historyDocRef, convertedRecord as any);
    } catch (error) {
      console.error('履歴更新エラー:', error);
      throw error;
    }
  }

  async deleteGradeData(): Promise<void> {
    if (this.isEditMode && this.recordId) {
      // 編集モードの場合は履歴から削除
      await this.deleteRegularGradeRecord();
    } else {
      // 新規作成モードでクリアボタンとして機能
      this.clearForm();
      this.judgmentResult = null;
      this.errorMessage = '入力内容をクリアしました。';
      setTimeout(() => {
        this.errorMessage = '';
      }, 3000);
    }
  }

  async deleteRegularGradeRecord(): Promise<void> {
    if (!this.companyId || !this.employeeId || !this.recordId) {
      alert('削除対象のデータが特定できません。');
      return;
    }

    if (!confirm('この定時決定履歴を削除しますか？この操作は元に戻せません。')) {
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    try {
      console.log('削除開始:', { employeeId: this.employeeId, recordId: this.recordId });

      const historyDocRef = doc(
        this.firestore,
        `companies/${this.companyId}/employees/${this.employeeId}/gradeHistory`,
        this.recordId
      );
      console.log('履歴削除:', historyDocRef.path);
      await deleteDoc(historyDocRef);

      console.log('削除処理完了');
      alert('定時決定データを削除しました');
      this.router.navigate(['/grade-judgment', this.employeeId]);
    } catch (error) {
      console.error('削除エラー:', error);
      this.errorMessage = `削除に失敗しました: ${error}`;
      alert(this.errorMessage);
    } finally {
      this.isSaving = false;
    }
  }

  private clearForm(): void {
    this.monthlyPayments = [
      { month: BigInt(4), amount: null, workingDays: null },
      { month: BigInt(5), amount: null, workingDays: null },
      { month: BigInt(6), amount: null, workingDays: null },
    ];
    this.averageAmount = '0';
    this.judgmentResult = null;
    this.applicableYear = BigInt(new Date().getFullYear());
    this.applicableMonth = BigInt(9);
    this.endYear = null;
    this.endMonth = null;
  }

  private isFirestoreTimestamp(value: unknown): value is Timestamp {
    return value !== null && typeof value === 'object' && 'toDate' in (value as object);
  }

  getFormattedDate(timestamp: Date | Timestamp): string {
    if (!timestamp) return '';

    if (this.isFirestoreTimestamp(timestamp)) {
      return timestamp.toDate().toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    if (timestamp instanceof Date) {
      return timestamp.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }

    return '';
  }

  getMonthName(month: bigint): string {
    const monthNames = [
      '',
      '1月',
      '2月',
      '3月',
      '4月',
      '5月',
      '6月',
      '7月',
      '8月',
      '9月',
      '10月',
      '11月',
      '12月',
    ];
    return monthNames[Number(month)] || '';
  }

  hasAverageAmount(): boolean {
    return SocialInsuranceCalculator.compare(this.averageAmount, '0') > 0;
  }

  formatAmount(amount: string): string {
    return new Intl.NumberFormat('ja-JP').format(Number(amount)) + '円';
  }

  /**
   * オブジェクト内のBigIntをすべて文字列に再帰的に変換します。
   * FirestoreはBigIntをサポートしていないため、保存前にこの関数を使用します。
   * @param obj 変換するオブジェクト
   * @returns BigIntが文字列に変換された新しいオブジェクト
   */
  private deepConvertBigIntToString(obj: unknown): unknown {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.deepConvertBigIntToString(item));
    }

    const newObj: Record<string, unknown> = {};
    for (const key in obj as Record<string, unknown>) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = (obj as Record<string, unknown>)[key];
        // undefinedの値は除外する
        if (value === undefined) {
          continue;
        }
        if (typeof value === 'bigint') {
          newObj[key] = value.toString();
        } else if (typeof value === 'object') {
          newObj[key] = this.deepConvertBigIntToString(value);
        } else {
          newObj[key] = value;
        }
      }
    }
    return newObj;
  }
}
