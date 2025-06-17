import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from '../../services/user.service';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

interface Question {
  id: string;
  text: string;
  type: 'yesno' | 'choice';
  choices?: { value: string; label: string }[];
  nextQuestion?: Record<string, string>; // 分岐用
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

// 判定ルール設定
interface JudgmentRule {
  employmentType: string;
  firstQuestion: string;
  questions: Record<string, Question>;
  judgmentLogic: Record<string, JudgmentCondition[]>;
}

interface JudgmentCondition {
  conditions: Record<string, string>; // 必要な回答条件
  result: { eligible: boolean; reason: string };
  priority: number; // 優先度（小さいほど高い）
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

  // Form data - 質問応答形式
  showQuestionnaire = false; // 初期状態では質問を非表示
  currentQuestionId = 'employmentType'; // 最初の質問
  currentQuestion: Question | null = null;
  answers: Record<string, string> = {};
  judgmentResult: InsuranceEligibility | null = null;
  employeeAttribute = ''; // 従業員属性

  // 質問フロー定義（雇用形態選択から開始）
  private allQuestions: Record<string, Question> = {
    employmentType: {
      id: 'employmentType',
      text: 'あなたの雇用形態を選択してください',
      type: 'choice',
      choices: [
        { value: 'regular', label: '正社員（役員含む）' },
        { value: 'part-time', label: 'パートタイム・アルバイト（短時間労働者）' },
        { value: 'contract', label: '契約社員' },
        { value: 'manual', label: '手入力（管理者判断による操作）' },
      ],
      nextQuestion: {
        regular: 'end',
        'part-time': 'workingHours',
        contract: 'contractWorkingHours',
        manual: 'manualHealthInsurance',
      },
    },
    workingHours: {
      id: 'workingHours',
      text: '週の所定労働時間は20時間以上ですか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'workingDays',
        no: 'end',
      },
    },
    workingDays: {
      id: 'workingDays',
      text: '週の所定労働日数は正社員の3/4以上ですか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'end',
        no: 'monthlyWage',
      },
    },
    monthlyWage: {
      id: 'monthlyWage',
      text: '月額賃金は88,000円以上ですか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'employmentPeriod',
        no: 'end',
      },
    },
    employmentPeriod: {
      id: 'employmentPeriod',
      text: '雇用期間は2ヶ月を超える見込みですか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'end',
        no: 'end',
      },
    },
    contractWorkingHours: {
      id: 'contractWorkingHours',
      text: '週の所定労働時間は正社員の3/4以上ですか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'contractEmploymentPeriod',
        no: 'end',
      },
    },
    contractEmploymentPeriod: {
      id: 'contractEmploymentPeriod',
      text: '雇用期間は2ヶ月を超えますか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'end',
        no: 'end',
      },
    },
    executiveType: {
      id: 'executiveType',
      text: '役員報酬を受けていますか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'workingTime',
        no: 'end',
      },
    },
    workingTime: {
      id: 'workingTime',
      text: '実際に業務に従事する時間はありますか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'end',
        no: 'end',
      },
    },
    workingStatus: {
      id: 'workingStatus',
      text: '継続して勤務していますか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'healthInsuranceOnly',
        no: 'end',
      },
    },
    healthInsuranceOnly: {
      id: 'healthInsuranceOnly',
      text: '健康保険のみの加入希望ですか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'end',
        no: 'end',
      },
    },
    posteriorInsurance: {
      id: 'posteriorInsurance',
      text: '後期高齢者医療制度に加入していますか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'end',
        no: 'end',
      },
    },
    trialDuration: {
      id: 'trialDuration',
      text: '試用期間は3ヶ月以内ですか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'regularEmployment',
        no: 'end',
      },
    },
    regularEmployment: {
      id: 'regularEmployment',
      text: '正規雇用への移行予定はありますか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'end',
        no: 'end',
      },
    },
    manualEmploymentType: {
      id: 'manualEmploymentType',
      text: '具体的な雇用形態を選択してください',
      type: 'choice',
      choices: [
        { value: 'executive-full', label: '常勤役員' },
        { value: 'executive-part', label: '非常勤役員' },
        { value: 'over70', label: '70歳以上被用者' },
        { value: 'over75', label: '75歳以上（後期高齢者）' },
        { value: 'on-leave', label: '休職者' },
        { value: 'secondment', label: '出向者' },
        { value: 'multiple-workplace', label: '二以上事業所勤務者' },
        { value: 'trial-period', label: '試用期間中' },
        { value: 'overseas', label: '海外居住' },
        { value: 'disabled', label: '障害者' },
        { value: 'other', label: 'その他' },
      ],
      nextQuestion: {
        'executive-full': 'end',
        'executive-part': 'executiveType',
        over70: 'workingStatus',
        over75: 'posteriorInsurance',
        'on-leave': 'end',
        secondment: 'end',
        'multiple-workplace': 'end',
        'trial-period': 'trialDuration',
        overseas: 'end',
        disabled: 'end',
        other: 'end',
      },
    },
    manualHealthInsurance: {
      id: 'manualHealthInsurance',
      text: '健康保険の加入判定を選択してください',
      type: 'choice',
      choices: [
        { value: 'eligible', label: '加入対象' },
        { value: 'not-eligible', label: '加入対象外' },
      ],
      nextQuestion: {
        eligible: 'manualPensionInsurance',
        'not-eligible': 'manualPensionInsurance',
      },
    },
    manualPensionInsurance: {
      id: 'manualPensionInsurance',
      text: '厚生年金保険の加入判定を選択してください',
      type: 'choice',
      choices: [
        { value: 'eligible', label: '加入対象' },
        { value: 'not-eligible', label: '加入対象外' },
      ],
      nextQuestion: {
        eligible: 'end',
        'not-eligible': 'end',
      },
    },
  };

  // 判定ルール（簡略化）
  private judgmentRules: Record<string, JudgmentRule> = {
    'part-time': {
      employmentType: 'part-time',
      firstQuestion: 'workingHours',
      questions: {},
      judgmentLogic: {
        healthInsurance: [
          {
            conditions: { workingHours: 'yes', workingDays: 'yes' },
            result: { eligible: true, reason: '労働時間・日数が3/4以上のため加入対象' },
            priority: 1,
          },
          {
            conditions: {
              workingHours: 'yes',
              workingDays: 'no',
              monthlyWage: 'yes',
              employmentPeriod: 'yes',
            },
            result: {
              eligible: true,
              reason: '短時間労働者の特定適用事業所要件を満たすため加入対象',
            },
            priority: 2,
          },
          {
            conditions: { workingHours: 'no' },
            result: { eligible: false, reason: '週20時間未満のため加入対象外' },
            priority: 3,
          },
        ],
        pensionInsurance: [
          {
            conditions: { workingHours: 'yes', workingDays: 'yes' },
            result: { eligible: true, reason: '労働時間・日数が3/4以上のため加入対象' },
            priority: 1,
          },
          {
            conditions: {
              workingHours: 'yes',
              workingDays: 'no',
              monthlyWage: 'yes',
              employmentPeriod: 'yes',
            },
            result: {
              eligible: true,
              reason: '短時間労働者の特定適用事業所要件を満たすため加入対象',
            },
            priority: 2,
          },
          {
            conditions: { workingHours: 'no' },
            result: { eligible: false, reason: '週20時間未満のため加入対象外' },
            priority: 3,
          },
        ],
      },
    },
    regular: {
      employmentType: 'regular',
      firstQuestion: '',
      questions: {},
      judgmentLogic: {
        healthInsurance: [
          {
            conditions: {},
            result: { eligible: true, reason: '正社員のため加入対象' },
            priority: 1,
          },
        ],
        pensionInsurance: [
          {
            conditions: {},
            result: { eligible: true, reason: '正社員のため加入対象' },
            priority: 1,
          },
        ],
      },
    },
    manual: {
      employmentType: 'manual',
      firstQuestion: 'manualHealthInsurance',
      questions: {},
      judgmentLogic: {
        healthInsurance: [
          {
            conditions: { manualHealthInsurance: 'eligible' },
            result: { eligible: true, reason: '手入力により加入対象と判定' },
            priority: 1,
          },
          {
            conditions: { manualHealthInsurance: 'not-eligible' },
            result: { eligible: false, reason: '手入力により加入対象外と判定' },
            priority: 2,
          },
        ],
        pensionInsurance: [
          {
            conditions: { manualPensionInsurance: 'eligible' },
            result: { eligible: true, reason: '手入力により加入対象と判定' },
            priority: 1,
          },
          {
            conditions: { manualPensionInsurance: 'not-eligible' },
            result: { eligible: false, reason: '手入力により加入対象外と判定' },
            priority: 2,
          },
        ],
      },
    },
    // 他の雇用形態も必要に応じて追加
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

    this.initializeQuestionnaire();
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

  private initializeQuestionnaire() {
    this.currentQuestion = this.allQuestions[this.currentQuestionId];
  }

  updateAnswers() {
    this.judgmentResult = null;

    // 手入力を選択した場合、属性を設定
    if (
      this.currentQuestionId === 'employmentType' &&
      this.answers['employmentType'] === 'manual'
    ) {
      // 手入力選択時点で属性を「手入力」に設定
      this.employeeAttribute = '手入力';
      console.log('属性を「手入力」に設定しました');
    }

    this.moveToNextQuestion();
  }

  private moveToNextQuestion() {
    const currentAnswer = this.answers[this.currentQuestionId];
    const nextQuestionId = this.currentQuestion?.nextQuestion?.[currentAnswer];

    const isEnd = !nextQuestionId || nextQuestionId === 'end';

    if (isEnd) {
      this.showQuestionnaire = false;
      this.currentQuestion = null;
      this.currentQuestionId = '';
      // 自動で判定実行
      this.executeJudgment();
    } else {
      this.currentQuestionId = nextQuestionId;
      this.currentQuestion = this.allQuestions[nextQuestionId];
    }
  }

  executeJudgment() {
    const employmentType = this.answers['employmentType'];
    const rule = this.judgmentRules[employmentType];

    if (!rule) {
      // デフォルト判定
      this.judgmentResult = {
        healthInsurance: { eligible: false, reason: '判定条件が設定されていません' },
        pensionInsurance: { eligible: false, reason: '判定条件が設定されていません' },
        careInsurance: this.evaluateCareInsurance(),
      };
      return;
    }

    this.judgmentResult = this.performJudgment(rule);
  }

  private performJudgment(rule: JudgmentRule): InsuranceEligibility {
    return {
      healthInsurance: this.evaluateInsurance('healthInsurance', rule),
      pensionInsurance: this.evaluateInsurance('pensionInsurance', rule),
      careInsurance: this.evaluateCareInsurance(),
    };
  }

  private evaluateInsurance(
    insuranceType: string,
    rule: JudgmentRule
  ): { eligible: boolean; reason: string } {
    const conditions = rule.judgmentLogic[insuranceType] || [];

    // 優先度順にソートして条件評価
    const sortedConditions = conditions.sort((a, b) => a.priority - b.priority);

    const matchedCondition = sortedConditions.find((condition) =>
      this.matchesConditions(condition.conditions)
    );

    return matchedCondition?.result || { eligible: false, reason: '判定条件が不明' };
  }

  private matchesConditions(conditions: Record<string, string>): boolean {
    return Object.entries(conditions).every(
      ([questionId, expectedAnswer]) => this.answers[questionId] === expectedAnswer
    );
  }

  private evaluateCareInsurance(): { eligible: boolean; reason: string } {
    const isEligible = this.age >= 40 && this.age < 65;
    return {
      eligible: isEligible,
      reason: isEligible
        ? '40歳以上65歳未満のため加入対象'
        : '40歳未満または65歳以上のため加入対象外',
    };
  }

  canExecuteJudgment(): boolean {
    return !this.showQuestionnaire && !!this.answers['employmentType'];
  }

  getQuestionNumber(): number {
    return Object.keys(this.answers).length + 1;
  }

  startAttributeEdit() {
    this.showQuestionnaire = true;
    this.initializeQuestionnaire();
  }

  resetQuestionnaire() {
    this.answers = {};
    this.judgmentResult = null;
    this.employeeAttribute = ''; // 属性もリセット
    this.currentQuestionId = 'employmentType';
    this.currentQuestion = this.allQuestions[this.currentQuestionId];
    this.showQuestionnaire = true;
  }

  saveJudgment() {
    const hasResult = !!this.judgmentResult;
    const message = hasResult ? '判定結果を保存しました' : '判定を実行してから保存してください';

    console.log(hasResult ? '判定結果を保存:' : '', this.judgmentResult);
    alert(message);
  }

  goBack() {
    this.router.navigate(['/employee-procedures']);
  }
}
