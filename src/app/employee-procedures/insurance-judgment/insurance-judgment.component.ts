import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from '../../services/user.service';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

interface Question {
  id: string;
  text: string;
  type: string;
}

interface InsuranceEligibility {
  healthInsurance: { eligible: boolean; reason: string };
  pensionInsurance: { eligible: boolean; reason: string };
  careInsurance?: { eligible: boolean; reason: string };
}

interface Office {
  code: string;
  name: string;
  address: string;
  addressPrefecture: string;
  branchNumber: number;
}

@Component({
  selector: 'app-insurance-judgment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './insurance-judgment.component.html',
  styleUrl: './insurance-judgment.component.scss',
})
export class InsuranceJudgmentComponent implements OnInit {
  // Employee info
  employeeName = '';
  employeeNumber = '';
  birthDate = '';
  age = 0;
  officeNumber = '';
  officePrefecture = '';

  // Form data
  selectedEmploymentType = '';
  showQuestionnaire = false;
  currentQuestions: Question[] = [];
  answers: Record<string, string> = {};
  judgmentResult: InsuranceEligibility | null = null;

  // 雇用形態別の質問定義
  private questionSets: Record<string, Question[]> = {
    'part-time': [
      { id: 'workingHours', text: '週の所定労働時間は20時間以上ですか？', type: 'yesno' },
      { id: 'workingDays', text: '週の所定労働日数は正社員の3/4以上ですか？', type: 'yesno' },
      { id: 'monthlyWage', text: '月額賃金は88,000円以上ですか？', type: 'yesno' },
      { id: 'employmentPeriod', text: '雇用期間は2ヶ月を超える見込みですか？', type: 'yesno' },
    ],
    contract: [
      { id: 'workingHours', text: '週の所定労働時間は正社員の3/4以上ですか？', type: 'yesno' },
      { id: 'employmentPeriod', text: '雇用期間は2ヶ月を超えますか？', type: 'yesno' },
    ],
    'executive-part': [
      { id: 'executiveType', text: '役員報酬を受けていますか？', type: 'yesno' },
      { id: 'workingTime', text: '実際に業務に従事する時間はありますか？', type: 'yesno' },
    ],
    over70: [
      { id: 'workingStatus', text: '継続して勤務していますか？', type: 'yesno' },
      { id: 'healthInsuranceOnly', text: '健康保険のみの加入希望ですか？', type: 'yesno' },
    ],
    over75: [
      { id: 'posteriorInsurance', text: '後期高齢者医療制度に加入していますか？', type: 'yesno' },
    ],
    'trial-period': [
      { id: 'trialDuration', text: '試用期間は3ヶ月以内ですか？', type: 'yesno' },
      { id: 'regularEmployment', text: '正規雇用への移行予定はありますか？', type: 'yesno' },
    ],
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService
  ) {}

  async ngOnInit() {
    const uid = this.route.snapshot.paramMap.get('uid');
    if (!uid) {
      console.error('UID not found in route');
      return;
    }

    try {
      // ユーザー情報を取得
      const user = await this.userService.getUserByUid(uid);
      if (!user) {
        console.error('User not found');
        return;
      }

      // ユーザー情報を設定
      this.employeeName = `${user.lastName || ''} ${user.firstName || ''}`.trim();
      this.employeeNumber = user.employeeNumber || '';
      this.birthDate = user.birthDate || '';

      // 年齢計算
      if (user.birthDate) {
        const birthDate = new Date(user.birthDate);
        const today = new Date();
        this.age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          this.age--;
        }
      }

      // 事業所情報を取得
      if (user.branchNumber && user.companyId) {
        const office = await this.getOfficeInfo(user.companyId, user.branchNumber);
        if (office) {
          this.officeNumber = office.code;
          this.officePrefecture = office.addressPrefecture;
        }
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
      // エラー時は空の値を設定
      this.employeeName = '';
      this.employeeNumber = '';
      this.birthDate = '';
      this.age = 0;
      this.officeNumber = '';
      this.officePrefecture = '';
    }
  }

  private async getOfficeInfo(companyId: string, branchNumber: string): Promise<Office | null> {
    try {
      const firestore = getFirestore();
      const officesCol = collection(firestore, 'offices');
      const q = query(
        officesCol,
        where('companyId', '==', companyId),
        where('branchNumber', '==', parseInt(branchNumber))
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return doc.data() as Office;
      }
      return null;
    } catch (error) {
      console.error('事業所情報取得エラー:', error);
      return null;
    }
  }

  onEmploymentTypeChange() {
    this.showQuestionnaire = false;
    this.currentQuestions = [];
    this.answers = {};
    this.judgmentResult = null;

    if (this.selectedEmploymentType && this.questionSets[this.selectedEmploymentType]) {
      this.currentQuestions = this.questionSets[this.selectedEmploymentType];
      this.showQuestionnaire = true;
    } else if (this.selectedEmploymentType === 'regular') {
      // 正社員の場合は質問なしで判定可能
      this.showQuestionnaire = false;
    }
  }

  updateAnswers() {
    // 回答が変更されたら判定結果をクリア
    this.judgmentResult = null;
  }

  executeJudgment() {
    if (!this.selectedEmploymentType) {
      alert('雇用形態を選択してください');
      return;
    }

    // 基本的な判定ロジック
    this.judgmentResult = this.performJudgment();
  }

  private performJudgment(): InsuranceEligibility {
    const result: InsuranceEligibility = {
      healthInsurance: { eligible: false, reason: '' },
      pensionInsurance: { eligible: false, reason: '' },
    };

    // 年齢による介護保険判定
    if (this.age >= 40 && this.age < 65) {
      result.careInsurance = { eligible: true, reason: '40歳以上65歳未満のため加入対象' };
    } else {
      result.careInsurance = { eligible: false, reason: '40歳未満または65歳以上のため加入対象外' };
    }

    switch (this.selectedEmploymentType) {
      case 'regular':
        result.healthInsurance = { eligible: true, reason: '正社員のため加入対象' };
        result.pensionInsurance = { eligible: true, reason: '正社員のため加入対象' };
        break;

      case 'part-time':
        result.healthInsurance = this.judgePartTimeHealthInsurance();
        result.pensionInsurance = this.judgePartTimePensionInsurance();
        break;

      case 'contract':
        result.healthInsurance = this.judgeContractHealthInsurance();
        result.pensionInsurance = this.judgeContractPensionInsurance();
        break;

      case 'executive-full':
        result.healthInsurance = { eligible: true, reason: '常勤役員のため加入対象' };
        result.pensionInsurance = { eligible: true, reason: '常勤役員のため加入対象' };
        break;

      case 'executive-part':
        result.healthInsurance = this.judgePartTimeExecutiveInsurance();
        result.pensionInsurance = this.judgePartTimeExecutiveInsurance();
        break;

      case 'over70':
        result.healthInsurance = { eligible: true, reason: '70歳以上でも健康保険は加入対象' };
        result.pensionInsurance = { eligible: false, reason: '70歳以上のため厚生年金は加入対象外' };
        break;

      case 'over75':
        result.healthInsurance = { eligible: false, reason: '75歳以上は後期高齢者医療制度に移行' };
        result.pensionInsurance = { eligible: false, reason: '75歳以上のため厚生年金は加入対象外' };
        break;

      default:
        result.healthInsurance = { eligible: false, reason: '判定条件が不明' };
        result.pensionInsurance = { eligible: false, reason: '判定条件が不明' };
    }

    return result;
  }

  private judgePartTimeHealthInsurance(): { eligible: boolean; reason: string } {
    const workingHours = this.answers['workingHours'] === 'yes';
    const workingDays = this.answers['workingDays'] === 'yes';
    const monthlyWage = this.answers['monthlyWage'] === 'yes';
    const employmentPeriod = this.answers['employmentPeriod'] === 'yes';

    if (workingHours && workingDays) {
      return { eligible: true, reason: '労働時間・日数が3/4以上のため加入対象' };
    } else if (workingHours && monthlyWage && employmentPeriod) {
      return { eligible: true, reason: '短時間労働者の特定適用事業所要件を満たすため加入対象' };
    } else {
      return { eligible: false, reason: '労働時間・日数が基準を満たさないため加入対象外' };
    }
  }

  private judgePartTimePensionInsurance(): { eligible: boolean; reason: string } {
    // 健康保険と同じ判定基準
    return this.judgePartTimeHealthInsurance();
  }

  private judgeContractHealthInsurance(): { eligible: boolean; reason: string } {
    const workingHours = this.answers['workingHours'] === 'yes';
    const employmentPeriod = this.answers['employmentPeriod'] === 'yes';

    if (workingHours && employmentPeriod) {
      return { eligible: true, reason: '労働時間が3/4以上かつ雇用期間2ヶ月超のため加入対象' };
    } else {
      return { eligible: false, reason: '労働時間または雇用期間が基準を満たさないため加入対象外' };
    }
  }

  private judgeContractPensionInsurance(): { eligible: boolean; reason: string } {
    // 健康保険と同じ判定基準
    return this.judgeContractHealthInsurance();
  }

  private judgePartTimeExecutiveInsurance(): { eligible: boolean; reason: string } {
    const executiveType = this.answers['executiveType'] === 'yes';
    const workingTime = this.answers['workingTime'] === 'yes';

    if (executiveType && workingTime) {
      return { eligible: true, reason: '役員報酬を受け実際に業務従事するため加入対象' };
    } else {
      return { eligible: false, reason: '非常勤役員の要件を満たさないため加入対象外' };
    }
  }

  canExecuteJudgment(): boolean {
    if (!this.selectedEmploymentType) return false;

    // 質問がある場合は全て回答済みかチェック
    if (this.showQuestionnaire && this.currentQuestions.length > 0) {
      return this.currentQuestions.every((q) => this.answers[q.id]);
    }

    return true;
  }

  saveJudgment() {
    if (!this.judgmentResult) {
      alert('判定を実行してから保存してください');
      return;
    }

    // TODO: Firestore等に判定結果を保存
    console.log('判定結果を保存:', this.judgmentResult);
    alert('判定結果を保存しました');
  }

  goBack() {
    this.router.navigate(['/employee-procedures']);
  }
}
