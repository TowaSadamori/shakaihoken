import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { UserService, User } from '../services/user.service';
import { AuthService } from '../services/auth.service';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

// 判定結果のインターフェース
interface InsuranceEligibility {
  healthInsurance: { eligible: boolean; reason: string };
  pensionInsurance: { eligible: boolean; reason: string };
  careInsurance?: { eligible: boolean; reason: string };
}

interface SavedJudgmentData {
  uid: string;
  employeeName: string;
  employeeNumber: string;
  birthDate: string;
  age: number;
  answers: Record<string, string>;
  judgmentResult: InsuranceEligibility | null;
  savedAt: Date;
  officeNumber: string;
  officePrefecture: string;
  specialCases?: unknown[];
  careInsurancePeriod?: { start: string; end: string };
  healthInsurancePeriod?: { start: string; end: string };
  pensionInsurancePeriod?: { start: string; end: string };
}

// ユーザーに判定結果を追加した拡張インターフェース
interface UserWithJudgment extends User {
  judgmentResult?: InsuranceEligibility | null;
  careInsurancePeriod?: { start: string; end: string };
  healthInsurancePeriod?: { start: string; end: string };
  pensionInsurancePeriod?: { start: string; end: string };
}

@Component({
  selector: 'app-employee-procedures-placeholder',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './employee-procedures-placeholder.component.html',
  styleUrl: './employee-procedures-placeholder.component.scss',
})
export class EmployeeProceduresPlaceholderComponent implements OnInit {
  users: UserWithJudgment[] = [];
  sortOrder: 'asc' | 'desc' = 'asc';

  constructor(
    private router: Router,
    private userService: UserService,
    private authService: AuthService
  ) {}

  async ngOnInit() {
    const companyId = await this.authService.getCurrentUserCompanyId();
    if (!companyId) return;

    const currentUser = await this.authService.getCurrentUserProfileWithRole();
    if (!currentUser) return;

    if (currentUser.role === 'admin') {
      const allUsers = await this.userService.getAllUsers();
      this.users = allUsers
        .filter((user) => user.companyId === companyId)
        .sort((a, b) =>
          (a.employeeNumber || '').localeCompare(b.employeeNumber || '', undefined, {
            numeric: true,
          })
        );
    } else {
      const user = await this.userService.getUserByUid(currentUser.uid);
      if (user) {
        this.users = [user];
      } else {
        this.users = [];
      }
    }

    this.sortOrder = 'asc';

    // 各ユーザーの判定結果を取得
    await this.loadJudgmentResults();
  }

  // 判定結果を取得するメソッド
  async loadJudgmentResults() {
    const db = getFirestore();
    const currentCompanyId = await this.authService.getCurrentUserCompanyId();

    console.log('=== デバッグ: 判定結果読み込み開始 ===');
    console.log('現在の会社ID:', currentCompanyId);
    console.log('対象ユーザー数:', this.users.length);

    for (const user of this.users) {
      try {
        console.log(
          `\n--- ユーザー ${user.lastName}${user.firstName} (${user.uid}) の判定結果を確認中 ---`
        );
        const docRef = doc(db, 'insuranceJudgments', user.uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const savedData = docSnap.data() as SavedJudgmentData;
          console.log('保存されたデータ:', savedData);
          console.log('マッチング条件:');
          console.log(
            '  従業員番号:',
            savedData.employeeNumber,
            '===',
            user.employeeNumber,
            '→',
            savedData.employeeNumber === user.employeeNumber
          );
          console.log(
            '  事業所番号:',
            savedData.officeNumber,
            '===',
            user.branchNumber?.toString(),
            '→',
            savedData.officeNumber === user.branchNumber?.toString()
          );
          console.log(
            '  会社ID:',
            user.companyId,
            '===',
            currentCompanyId,
            '→',
            user.companyId === currentCompanyId
          );

          // 会社ID、事業所番号、従業員番号が一致するかチェック
          if (
            savedData.employeeNumber === user.employeeNumber &&
            savedData.officeNumber === user.branchNumber?.toString() &&
            user.companyId === currentCompanyId
          ) {
            user.judgmentResult = savedData.judgmentResult;
            user.careInsurancePeriod = savedData.careInsurancePeriod;
            user.healthInsurancePeriod = savedData.healthInsurancePeriod;
            user.pensionInsurancePeriod = savedData.pensionInsurancePeriod;
            console.log('✅ 判定結果をセット:', savedData.judgmentResult);
          } else {
            console.log('❌ マッチング条件が合わないためスキップ');
          }
        } else {
          console.log('保存された判定データなし');
        }
      } catch (error) {
        console.error(`Error loading judgment for user ${user.uid}:`, error);
      }
    }

    console.log('\n=== 判定結果読み込み完了 ===');
    console.log('判定結果を持つユーザー:', this.users.filter((u) => u.judgmentResult).length);
  }

  // 判定状況を取得（いずれかの保険が対象なら「対象」、全て対象外なら「対象外」、未判定なら「未実施」）
  getJudgmentStatus(user: UserWithJudgment): string {
    if (!user.judgmentResult) {
      return '未実施';
    }

    const { healthInsurance, pensionInsurance, careInsurance } = user.judgmentResult;

    // いずれかが対象なら「対象」
    if (healthInsurance.eligible || pensionInsurance.eligible || careInsurance?.eligible) {
      return '対象';
    }

    // 全て対象外なら「対象外」
    return '対象外';
  }

  // 健康保険の判定結果を取得
  getHealthInsuranceStatus(user: UserWithJudgment): string {
    if (!user.judgmentResult) {
      return '未判定';
    }
    return user.judgmentResult.healthInsurance.eligible ? '対象' : '対象外';
  }

  // 介護保険の判定結果を取得
  getCareInsuranceStatus(user: UserWithJudgment): string {
    if (!user.judgmentResult || !user.judgmentResult.careInsurance) {
      return '未判定';
    }
    return user.judgmentResult.careInsurance.eligible ? '対象' : '対象外';
  }

  // 厚生年金保険の判定結果を取得
  getPensionInsuranceStatus(user: UserWithJudgment): string {
    if (!user.judgmentResult) {
      return '未判定';
    }
    return user.judgmentResult.pensionInsurance.eligible ? '対象' : '対象外';
  }

  sortByEmployeeNumber() {
    if (this.sortOrder === 'asc') {
      this.users.sort((a, b) =>
        (a.employeeNumber || '').localeCompare(b.employeeNumber || '', undefined, { numeric: true })
      );
      this.sortOrder = 'desc';
    } else {
      this.users.sort((a, b) =>
        (b.employeeNumber || '').localeCompare(a.employeeNumber || '', undefined, { numeric: true })
      );
      this.sortOrder = 'asc';
    }
  }

  goToSalaryBonus() {
    this.router.navigate(['/employee-salary-bonus']);
  }

  async goToApplication() {
    const currentUser = await this.authService.getCurrentUserProfileWithRole();
    if (currentUser) {
      this.router.navigate(['/employee-procedures/application-form', currentUser.uid]);
    }
  }

  // YYYY-MM → YYYY年M月 形式に変換
  formatJapaneseYearMonth(ym: string): string {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    return `${y}年${parseInt(m, 10)}月`;
  }

  // 期間テキストを返す
  getHealthInsurancePeriodText(user: UserWithJudgment): string {
    if (user.healthInsurancePeriod)
      return `${this.formatJapaneseYearMonth(user.healthInsurancePeriod.start)}～${this.formatJapaneseYearMonth(user.healthInsurancePeriod.end)}`;
    return '';
  }

  getCareInsurancePeriodText(user: UserWithJudgment): string {
    if (user.careInsurancePeriod)
      return `${this.formatJapaneseYearMonth(user.careInsurancePeriod.start)}～${this.formatJapaneseYearMonth(user.careInsurancePeriod.end)}`;
    return '';
  }

  getPensionInsurancePeriodText(user: UserWithJudgment): string {
    if (user.pensionInsurancePeriod)
      return `${this.formatJapaneseYearMonth(user.pensionInsurancePeriod.start)}～${this.formatJapaneseYearMonth(user.pensionInsurancePeriod.end)}`;
    return '';
  }
}
