import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from '../../services/user.service';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  getDoc,
} from 'firebase/firestore';

interface Question {
  id: string;
  text: string;
  type: 'yesno' | 'choice' | 'date-range';
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
  specialCases?: SpecialCase[];
}

interface SpecialCase {
  type: string;
  details: SpecialCaseDetails;
  saveStatus?: 'saved' | 'saving' | 'error';
}

interface SpecialCaseDetails {
  // 産前産後休業関連
  pregnancyType?: string; // 'single' | 'multiple'
  expectedBirthDate?: string;
  actualBirthDate?: string;
  actualStartDate?: string; // 実際の申請開始日
  actualEndDate?: string; // 実際の申請終了日

  // 産前産後期間の詳細入力
  preNatalStartDate?: string; // 産前期間開始日
  preNatalEndDate?: string; // 産前期間終了日
  postNatalStartDate?: string; // 産後期間開始日
  postNatalEndDate?: string; // 産後期間終了日

  // 育休関連
  childcareType?: string; // 育児休業の種類
  childBirthDate?: string; // 子の生年月日
  startDate?: string;
  endDate?: string;
  extensionReason?: string; // 延長理由
  papaSplit?: string; // 産後パパ育休の分割取得

  // 共通
  remarks?: string;
}

interface MaternityPeriodCalculation {
  preNatalPeriod: string;
  postNatalPeriod: string;
  totalPeriod: string;
  startDate: string;
  endDate: string;
  exemptionPeriod: string; // 社会保険料免除期間（年月表示）
}

interface ChildcarePeriodCalculation {
  monthlyPremiumExemption: string;
  bonusNote?: string;
  specialNote?: string;
}

@Component({
  selector: 'app-insurance-judgment',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './insurance-judgment.component.html',
  styleUrl: './insurance-judgment.component.scss',
  encapsulation: ViewEncapsulation.None,
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

  // 日付範囲入力用
  dateRangeAnswers: Record<string, { startDate: string; endDate: string }> = {};

  // 質問履歴管理
  questionHistory: string[] = [];

  // デバッグ情報の表示制御
  showDebugInfo = true;

  // 判定結果の保存状態
  isJudgmentSaved = false;

  // 現在のユーザーUID
  currentUid = '';

  // 特殊事例管理
  selectedSpecialCases: SpecialCase[] = [];

  // カスタムドロップダウン制御
  extensionReasonDropdownOpen: boolean[] = [];

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
        regular: 'regularEmployeeType',
        'part-time': 'workingHours',
        contract: 'contractWorkingHours',
        manual: 'manualHealthInsurance',
      },
    },
    regularEmployeeType: {
      id: 'regularEmployeeType',
      text: 'あなたの職種を選択してください',
      type: 'choice',
      choices: [
        { value: 'general', label: '一般社員' },
        { value: 'executive', label: '役員' },
      ],
      nextQuestion: {
        general: 'finalEnd',
        executive: 'executiveContract',
      },
    },
    executiveContract: {
      id: 'executiveContract',
      text: '社会保険加入の対象となる契約内容になっていますか？（役員報酬を受け、実際に業務に従事する場合など）',
      type: 'yesno',
      nextQuestion: {
        yes: 'finalEnd',
        no: 'finalEnd',
      },
    },
    workingHours: {
      id: 'workingHours',
      text: '週の所定労働時間および月の所定労働日数が、どちらも一般社員の4分の3以上ですか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'employmentPeriodLong',
        no: 'shortTimeWorker',
      },
    },
    shortTimeWorker: {
      id: 'shortTimeWorker',
      text: '短時間労働者の要件（週20時間以上、月額88,000円以上、雇用期間2ヶ月超）をすべて満たしますか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'studentStatus',
        no: 'finalEnd',
      },
    },

    employmentPeriodLong: {
      id: 'employmentPeriodLong',
      text: '雇用期間は2ヶ月を超えますか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'finalEnd',
        no: 'finalEnd',
      },
    },

    studentStatus: {
      id: 'studentStatus',
      text: 'あなたは学生ですか？（以下の場合は「いいえ」を選択：卒業後も引き続き当該事業所に使用される者、休学中の者、定時制課程・通信制課程に在学する者、社会人大学院生等）',
      type: 'yesno',
      nextQuestion: {
        yes: 'finalEnd',
        no: 'finalEnd',
      },
    },
    contractWorkingHours: {
      id: 'contractWorkingHours',
      text: '週の所定労働時間は正社員の3/4以上ですか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'contractEmploymentPeriod',
        no: 'finalEnd',
      },
    },
    contractEmploymentPeriod: {
      id: 'contractEmploymentPeriod',
      text: '雇用期間は2ヶ月を超えますか？',
      type: 'yesno',
      nextQuestion: {
        yes: 'finalEnd',
        no: 'finalEnd',
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
        eligible: 'finalEnd',
        'not-eligible': 'finalEnd',
      },
    },
    leaveStatus: {
      id: 'leaveStatus',
      text: '現在、休職中ですか？',
      type: 'choice',
      choices: [
        { value: 'no', label: '休職していない' },
        { value: 'maternity', label: '産休中' },
        { value: 'childcare', label: '育休中' },
        { value: 'other', label: 'その他の休職' },
      ],
      nextQuestion: {
        no: 'finalEnd',
        maternity: 'maternityPeriod',
        childcare: 'childcarePeriod',
        other: 'manualHealthInsurance',
      },
    },
    maternityPeriod: {
      id: 'maternityPeriod',
      text: '産休の期間を入力してください',
      type: 'date-range',
      nextQuestion: {
        custom: 'finalEnd',
      },
    },
    childcarePeriod: {
      id: 'childcarePeriod',
      text: '育休の期間を入力してください',
      type: 'date-range',
      nextQuestion: {
        custom: 'finalEnd',
      },
    },
    otherLeaveConsultation: {
      id: 'otherLeaveConsultation',
      text: 'その他の休職については人事担当者と相談し、手入力で再判定してください',
      type: 'choice',
      choices: [
        { value: 'consulted', label: '人事担当者と相談済み' },
        { value: 'manual', label: '手入力で再判定する' },
      ],
      nextQuestion: {
        consulted: 'finalEnd',
        manual: 'manualHealthInsurance',
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
          // 一般社員の4分の3以上かつ雇用期間2ヶ月超の場合
          {
            conditions: { workingHours: 'yes', employmentPeriodLong: 'yes' },
            result: {
              eligible: true,
              reason: '労働時間・労働日数が一般社員の4分の3以上かつ雇用期間2ヶ月超のため加入対象',
            },
            priority: 1,
          },
          // 一般社員の4分の3以上だが雇用期間2ヶ月以下の場合
          {
            conditions: { workingHours: 'yes', employmentPeriodLong: 'no' },
            result: {
              eligible: false,
              reason: '雇用期間が2ヶ月以下のため加入対象外',
            },
            priority: 2,
          },
          // 短時間労働者の場合（学生でない）
          {
            conditions: { workingHours: 'no', shortTimeWorker: 'yes', studentStatus: 'no' },
            result: { eligible: true, reason: '短時間労働者の要件を満たすため加入対象' },
            priority: 3,
          },
          // 学生の場合
          {
            conditions: { workingHours: 'no', shortTimeWorker: 'yes', studentStatus: 'yes' },
            result: { eligible: false, reason: '学生のため加入対象外' },
            priority: 4,
          },
          // その他の除外条件
          {
            conditions: { workingHours: 'no', shortTimeWorker: 'no' },
            result: { eligible: false, reason: '短時間労働者の要件を満たさないため加入対象外' },
            priority: 5,
          },
        ],
        pensionInsurance: [
          // 厚生年金も健康保険と同じ条件
          {
            conditions: { workingHours: 'yes', employmentPeriodLong: 'yes' },
            result: {
              eligible: true,
              reason: '労働時間・労働日数が一般社員の4分の3以上かつ雇用期間2ヶ月超のため加入対象',
            },
            priority: 1,
          },
          {
            conditions: { workingHours: 'yes', employmentPeriodLong: 'no' },
            result: {
              eligible: false,
              reason: '雇用期間が2ヶ月以下のため加入対象外',
            },
            priority: 2,
          },
          {
            conditions: { workingHours: 'no', shortTimeWorker: 'yes', studentStatus: 'no' },
            result: { eligible: true, reason: '短時間労働者の要件を満たすため加入対象' },
            priority: 3,
          },
          {
            conditions: { workingHours: 'no', shortTimeWorker: 'yes', studentStatus: 'yes' },
            result: { eligible: false, reason: '学生のため加入対象外' },
            priority: 4,
          },
          {
            conditions: { workingHours: 'no', shortTimeWorker: 'no' },
            result: { eligible: false, reason: '短時間労働者の要件を満たさないため加入対象外' },
            priority: 5,
          },
        ],
      },
    },
    regular: {
      employmentType: 'regular',
      firstQuestion: 'regularEmployeeType',
      questions: {},
      judgmentLogic: {
        healthInsurance: [
          // 一般社員の場合
          {
            conditions: { regularEmployeeType: 'general' },
            result: { eligible: true, reason: '正社員（一般社員）のため加入対象' },
            priority: 1,
          },
          // 役員で契約内容が対象の場合
          {
            conditions: { regularEmployeeType: 'executive', executiveContract: 'yes' },
            result: { eligible: true, reason: '役員で社会保険加入対象契約のため加入対象' },
            priority: 2,
          },
          // 役員で契約内容が対象外の場合
          {
            conditions: { regularEmployeeType: 'executive', executiveContract: 'no' },
            result: { eligible: false, reason: '役員で社会保険加入対象外契約のため加入対象外' },
            priority: 3,
          },
        ],
        pensionInsurance: [
          // 一般社員の場合
          {
            conditions: { regularEmployeeType: 'general' },
            result: { eligible: true, reason: '正社員（一般社員）のため加入対象' },
            priority: 1,
          },
          // 役員で契約内容が対象の場合
          {
            conditions: { regularEmployeeType: 'executive', executiveContract: 'yes' },
            result: { eligible: true, reason: '役員で社会保険加入対象契約のため加入対象' },
            priority: 2,
          },
          // 役員で契約内容が対象外の場合
          {
            conditions: { regularEmployeeType: 'executive', executiveContract: 'no' },
            result: { eligible: false, reason: '役員で社会保険加入対象外契約のため加入対象外' },
            priority: 3,
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
    contract: {
      employmentType: 'contract',
      firstQuestion: 'contractWorkingHours',
      questions: {},
      judgmentLogic: {
        healthInsurance: [
          {
            conditions: { contractWorkingHours: 'yes', contractEmploymentPeriod: 'yes' },
            result: {
              eligible: true,
              reason: '労働時間が正社員の3/4以上かつ雇用期間2ヶ月超のため加入対象',
            },
            priority: 1,
          },
          {
            conditions: { contractWorkingHours: 'yes', contractEmploymentPeriod: 'no' },
            result: { eligible: false, reason: '雇用期間が2ヶ月以下のため加入対象外' },
            priority: 2,
          },
          {
            conditions: { contractWorkingHours: 'no' },
            result: { eligible: false, reason: '労働時間が正社員の3/4未満のため加入対象外' },
            priority: 3,
          },
        ],
        pensionInsurance: [
          {
            conditions: { contractWorkingHours: 'yes', contractEmploymentPeriod: 'yes' },
            result: {
              eligible: true,
              reason: '労働時間が正社員の3/4以上かつ雇用期間2ヶ月超のため加入対象',
            },
            priority: 1,
          },
          {
            conditions: { contractWorkingHours: 'yes', contractEmploymentPeriod: 'no' },
            result: { eligible: false, reason: '雇用期間が2ヶ月以下のため加入対象外' },
            priority: 2,
          },
          {
            conditions: { contractWorkingHours: 'no' },
            result: { eligible: false, reason: '労働時間が正社員の3/4未満のため加入対象外' },
            priority: 3,
          },
        ],
      },
    },
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

    this.currentUid = uid;

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

    // 特殊事例の初期化
    this.initializeSpecialCases();

    // 保存された判定結果があるかチェック
    await this.loadSavedJudgment();
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
    console.log('🚀 === updateAnswers START ===');
    console.log('📝 現在の質問ID:', this.currentQuestionId);
    console.log('📝 選択された回答:', this.answers[this.currentQuestionId]);
    console.log('📝 全回答データ:', { ...this.answers });
    console.log('📝 現在の質問オブジェクト:', this.currentQuestion);

    this.judgmentResult = null;

    // 現在の質問を履歴に追加（回答時）
    if (this.currentQuestionId && !this.questionHistory.includes(this.currentQuestionId)) {
      this.questionHistory.push(this.currentQuestionId);
      console.log('📚 質問履歴に追加:', this.currentQuestionId);
      console.log('📚 更新後の履歴:', [...this.questionHistory]);
    }

    // 手入力を選択した場合、属性を設定
    if (
      this.currentQuestionId === 'employmentType' &&
      this.answers['employmentType'] === 'manual'
    ) {
      this.employeeAttribute = '手入力';
      console.log('⚙️ 属性を「手入力」に設定しました');
    }

    console.log('➡️ moveToNextQuestion() を呼び出します...');
    this.moveToNextQuestion();
    console.log('🏁 === updateAnswers END ===');
  }

  updateDateRange(startDate: string, endDate: string) {
    if (this.currentQuestionId) {
      this.dateRangeAnswers[this.currentQuestionId] = { startDate, endDate };
      // 期間を指定する場合の回答を設定
      this.answers[this.currentQuestionId] = 'custom';

      // 現在の質問を履歴に追加（回答時）
      if (!this.questionHistory.includes(this.currentQuestionId)) {
        this.questionHistory.push(this.currentQuestionId);
      }

      this.moveToNextQuestion();
    }
  }

  private moveToNextQuestion() {
    console.log('🎯 === moveToNextQuestion START ===');

    const currentAnswer = this.answers[this.currentQuestionId];
    const nextQuestionId = this.currentQuestion?.nextQuestion?.[currentAnswer];

    const isEnd = !nextQuestionId || nextQuestionId === 'end';
    const isFinalEnd = nextQuestionId === 'finalEnd';

    console.log('📋 現在の質問ID:', this.currentQuestionId);
    console.log('✅ 選択された回答:', currentAnswer, '(型:', typeof currentAnswer, ')');
    console.log('🔍 nextQuestion設定:', this.currentQuestion?.nextQuestion);
    console.log('➡️ 次の質問ID:', nextQuestionId, '(型:', typeof nextQuestionId, ')');
    console.log('❓ nextQuestionIdがundefined:', nextQuestionId === undefined);
    console.log('❓ nextQuestionIdがnull:', nextQuestionId === null);
    console.log('❓ nextQuestionIdが"end":', nextQuestionId === 'end');
    console.log(
      '🔚 isEnd:',
      isEnd,
      '(計算: !nextQuestionId =',
      !nextQuestionId,
      '|| nextQuestionId === "end" =',
      nextQuestionId === 'end',
      ')'
    );
    console.log('🏁 isFinalEnd:', isFinalEnd);
    console.log('🔍 currentQuestion:', this.currentQuestion);
    console.log('📝 全answers:', this.answers);

    if (isEnd) {
      console.log('🔄 基本判定終了 → leaveStatus質問に移行');
      this.currentQuestionId = 'leaveStatus';
      this.currentQuestion = this.allQuestions['leaveStatus'];
    } else if (isFinalEnd) {
      console.log('🏁 最終終了 → 判定実行');
      this.showQuestionnaire = false;
      this.currentQuestion = null;
      this.currentQuestionId = '';
      this.executeJudgment();
    } else {
      console.log('➡️ 通常の質問遷移');
      console.log('📋 移行前 currentQuestionId:', this.currentQuestionId);
      this.currentQuestionId = nextQuestionId;
      this.currentQuestion = this.allQuestions[nextQuestionId];
      console.log('📋 移行後 currentQuestionId:', this.currentQuestionId);
    }

    console.log('📚 質問履歴:', [...this.questionHistory]);
    console.log('🎯 === moveToNextQuestion END ===');
  }

  executeJudgment() {
    let employmentType = this.answers['employmentType'];

    // その他の休職で手入力判定が実行されている場合は、manualルールを使用
    if (
      this.answers['leaveStatus'] === 'other' &&
      this.answers['manualHealthInsurance'] &&
      this.answers['manualPensionInsurance']
    ) {
      employmentType = 'manual';
    }

    const rule = this.judgmentRules[employmentType];

    let baseResult: InsuranceEligibility;

    if (!rule) {
      // デフォルト判定
      baseResult = {
        healthInsurance: { eligible: false, reason: '判定条件が設定されていません' },
        pensionInsurance: { eligible: false, reason: '判定条件が設定されていません' },
        careInsurance: this.evaluateCareInsurance(),
      };
    } else {
      baseResult = this.performJudgment(rule);
    }

    // 休職状況を考慮した最終判定
    this.judgmentResult = this.applyLeaveStatusModification(baseResult);
  }

  private performJudgment(rule: JudgmentRule): InsuranceEligibility {
    const healthInsurance = this.evaluateInsurance('healthInsurance', rule);
    const pensionInsurance = this.evaluateInsurance('pensionInsurance', rule);
    const careInsurance = this.evaluateCareInsurance();

    return { healthInsurance, pensionInsurance, careInsurance };
  }

  private evaluateInsurance(
    insuranceType: string,
    rule: JudgmentRule
  ): { eligible: boolean; reason: string } {
    // 健康保険の年齢制限チェック（0歳から75歳未満）
    if (insuranceType === 'healthInsurance') {
      if (this.age < 0 || this.age >= 75) {
        return {
          eligible: false,
          reason:
            this.age >= 75
              ? '75歳以上のため健康保険加入対象外（後期高齢者医療制度対象）'
              : '年齢が0歳未満のため健康保険加入対象外',
        };
      }
    }

    // 厚生年金保険の年齢制限チェック（0歳以上70歳未満）
    if (insuranceType === 'pensionInsurance') {
      if (this.age < 0 || this.age >= 70) {
        return {
          eligible: false,
          reason:
            this.age >= 70
              ? '70歳以上のため厚生年金保険加入対象外'
              : '年齢が0歳未満のため厚生年金保険加入対象外',
        };
      }
    }

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

  private applyLeaveStatusModification(result: InsuranceEligibility): InsuranceEligibility {
    const leaveStatus = this.answers['leaveStatus'];

    if (!leaveStatus || leaveStatus === 'no') {
      return result;
    }

    // 産休・育休の場合の処理
    if (leaveStatus === 'maternity') {
      return {
        ...result,
        healthInsurance: {
          ...result.healthInsurance,
          reason: result.healthInsurance.reason + '（産休中：保険料免除対象）',
        },
        pensionInsurance: {
          ...result.pensionInsurance,
          reason: result.pensionInsurance.reason + '（産休中：保険料免除対象）',
        },
      };
    }

    if (leaveStatus === 'childcare') {
      return {
        ...result,
        healthInsurance: {
          ...result.healthInsurance,
          reason: result.healthInsurance.reason + '（育休中：保険料免除対象）',
        },
        pensionInsurance: {
          ...result.pensionInsurance,
          reason: result.pensionInsurance.reason + '（育休中：保険料免除対象）',
        },
      };
    }

    // その他の休職の場合
    if (leaveStatus === 'other') {
      // 手入力判定が既に実行されている場合は、その結果を使用
      if (this.answers['manualHealthInsurance'] && this.answers['manualPensionInsurance']) {
        return {
          ...result,
          healthInsurance: {
            ...result.healthInsurance,
            reason: result.healthInsurance.reason + '（その他休職中：手入力による判定）',
          },
          pensionInsurance: {
            ...result.pensionInsurance,
            reason: result.pensionInsurance.reason + '（その他休職中：手入力による判定）',
          },
        };
      } else {
        // 手入力判定が未実行の場合
        return {
          healthInsurance: { eligible: false, reason: '手入力による個別判定が必要です' },
          pensionInsurance: { eligible: false, reason: '手入力による個別判定が必要です' },
          careInsurance: this.evaluateCareInsurance(),
        };
      }
    }

    return result;
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
    this.dateRangeAnswers = {}; // 日付範囲もリセット
    this.questionHistory = []; // 質問履歴もリセット
    this.judgmentResult = null;
    this.employeeAttribute = ''; // 属性もリセット
    this.isJudgmentSaved = false; // 保存状態もリセット
    this.selectedSpecialCases = []; // 特殊事例もリセット（空のまま）
    this.currentQuestionId = 'employmentType';
    this.currentQuestion = this.allQuestions[this.currentQuestionId];
    this.showQuestionnaire = true;
  }

  async saveJudgment() {
    const hasResult = !!this.judgmentResult;

    if (hasResult && this.currentUid) {
      try {
        const firestore = getFirestore();
        const judgmentData: SavedJudgmentData = {
          uid: this.currentUid,
          employeeName: this.employeeName,
          employeeNumber: this.employeeNumber,
          birthDate: this.birthDate,
          age: this.age,
          answers: this.answers,
          judgmentResult: this.judgmentResult,
          savedAt: new Date(),
          officeNumber: this.officeNumber,
          officePrefecture: this.officePrefecture,
          specialCases: this.selectedSpecialCases,
        };

        const docRef = doc(firestore, 'insuranceJudgments', this.currentUid);
        await setDoc(docRef, judgmentData);

        this.isJudgmentSaved = true;
        console.log('判定結果を保存しました:', judgmentData);
        alert('判定結果を保存しました');
      } catch (error) {
        console.error('判定結果の保存に失敗しました:', error);
        alert('判定結果の保存に失敗しました');
      }
    } else {
      alert('判定を実行してから保存してください');
    }
  }

  async loadSavedJudgment() {
    if (!this.currentUid) return;

    try {
      const firestore = getFirestore();

      // 1. 全体の判定結果を読み込み
      const docRef = doc(firestore, 'insuranceJudgments', this.currentUid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const savedData = docSnap.data() as SavedJudgmentData;

        // 保存されたデータを復元
        this.answers = savedData.answers;
        if (savedData.judgmentResult) {
          this.judgmentResult = savedData.judgmentResult;
        }
        if (savedData.specialCases) {
          this.selectedSpecialCases = savedData.specialCases;
        }
        this.isJudgmentSaved = true;

        console.log('保存済み判定結果を読み込みました:', savedData);
      }

      // 2. 個別保存された特殊事例も読み込み
      await this.loadIndividualSpecialCases();
    } catch (error) {
      console.error('保存済み判定結果の読み込みに失敗しました:', error);
    }
  }

  // 個別保存された特殊事例を読み込む
  private async loadIndividualSpecialCases() {
    if (!this.currentUid) return;

    try {
      const firestore = getFirestore();
      const specialCasesQuery = query(
        collection(firestore, 'specialCases'),
        where('uid', '==', this.currentUid)
      );

      const querySnapshot = await getDocs(specialCasesQuery);
      const individualCases: SpecialCase[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        individualCases.push({
          type: data['caseType'],
          details: data['caseDetails'],
          saveStatus: 'saved', // 保存済みステータスを設定
        });
      });

      if (individualCases.length > 0) {
        // 既存の特殊事例と重複しないようにマージ
        const existingTypes = this.selectedSpecialCases.map((c) => c.type);
        const newCases = individualCases.filter((c) => !existingTypes.includes(c.type));

        this.selectedSpecialCases = [...this.selectedSpecialCases, ...newCases];

        // ドロップダウン状態を新しい配列サイズに合わせて初期化
        while (this.extensionReasonDropdownOpen.length < this.selectedSpecialCases.length) {
          this.extensionReasonDropdownOpen.push(false);
        }

        console.log('個別保存された特殊事例を読み込みました:', individualCases);
      }

      // 特殊事例は手動で追加するまで空のままにする
    } catch (error) {
      console.error('個別特殊事例の読み込みに失敗しました:', error);
    }
  }

  goBack() {
    this.router.navigate(['/employee-procedures']);
  }

  getLeaveInfo(): boolean {
    const leaveStatus = this.answers['leaveStatus'];
    return !!(leaveStatus && leaveStatus !== 'no');
  }

  getLeaveTypeLabel(): string {
    const leaveStatus = this.answers['leaveStatus'];
    switch (leaveStatus) {
      case 'maternity':
        return '産休';
      case 'childcare':
        return '育休';
      case 'other':
        return 'その他の休職';
      default:
        return '';
    }
  }

  getLeavePeriodInfo(): string {
    const leaveStatus = this.answers['leaveStatus'];

    if (leaveStatus === 'maternity') {
      const dateRange = this.dateRangeAnswers['maternityPeriod'];
      if (dateRange && dateRange.startDate && dateRange.endDate) {
        return `${this.formatDate(dateRange.startDate)} ～ ${this.formatDate(dateRange.endDate)}`;
      }
      return '期間指定済み';
    }

    if (leaveStatus === 'childcare') {
      const dateRange = this.dateRangeAnswers['childcarePeriod'];
      if (dateRange && dateRange.startDate && dateRange.endDate) {
        return `${this.formatDate(dateRange.startDate)} ～ ${this.formatDate(dateRange.endDate)}`;
      }
      return '期間指定済み';
    }

    if (leaveStatus === 'other') {
      return '人事担当者と要相談';
    }

    return '';
  }

  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  // 前の質問に戻る機能
  goToPreviousQuestion() {
    console.log('🚨 goToPreviousQuestion メソッドが呼び出されました！');
    console.log('=== goToPreviousQuestion called ===');
    console.log('Current questionHistory:', this.questionHistory);
    console.log('Current questionId:', this.currentQuestionId);

    if (this.questionHistory.length === 0) {
      console.log('No previous questions available');
      return; // 戻る質問がない場合
    }

    // 現在の質問の回答を削除
    delete this.answers[this.currentQuestionId];

    // 日付範囲の回答も削除
    if (this.dateRangeAnswers[this.currentQuestionId]) {
      delete this.dateRangeAnswers[this.currentQuestionId];
    }

    // 履歴から前の質問を取得
    const previousQuestionId = this.questionHistory.pop();
    console.log('Going back to question:', previousQuestionId);

    if (previousQuestionId) {
      this.currentQuestionId = previousQuestionId;
      this.currentQuestion = this.allQuestions[previousQuestionId];
    }

    // 判定結果をクリア
    this.judgmentResult = null;

    console.log('After going back:');
    console.log('- Current questionId:', this.currentQuestionId);
    console.log('- Updated questionHistory:', this.questionHistory);
    console.log('- Current answers:', this.answers);
    console.log('=====================================');
  }

  // 前の質問に戻れるかどうかを判定
  get canGoToPreviousQuestion(): boolean {
    return this.questionHistory.length > 0;
  }

  // デバッグ用：現在の状態を表示
  debugCurrentState() {
    console.log('=== Current State Debug ===');
    console.log('currentQuestionId:', this.currentQuestionId);
    console.log('questionHistory:', this.questionHistory);
    console.log('answers:', this.answers);
    console.log('showQuestionnaire:', this.showQuestionnaire);
    console.log('currentQuestion:', this.currentQuestion);
    console.log('===========================');
  }

  // デバッグ用：ラジオボタンクリックログ
  logRadioClick(value: string, questionId: string) {
    console.log(`🔘 ${value}ラジオボタン クリック:`, questionId);
    console.log('📝 クリック時点での answers:', { ...this.answers });
  }

  // デバッグ用：changeイベントログ
  logChangeEvent(value: string, questionId: string) {
    console.log(`🔄 ${value} changeイベント発火:`, questionId);
    console.log('📝 change時点での answers:', { ...this.answers });
  }

  // ラジオボタンクリック時の処理（changeイベントのフォールバック）
  handleRadioClick(value: string, questionId: string) {
    console.log(`🔧 handleRadioClick: ${value} -> ${questionId}`);

    // 手動で回答を設定
    this.answers[questionId] = value;
    console.log('📝 手動設定後の answers:', { ...this.answers });

    // changeイベントが正常に動作するため、setTimeout処理は不要
    // setTimeout(() => {
    //   console.log('⏰ setTimeout内でupdateAnswers()実行');
    //   this.updateAnswers();
    // }, 0);
  }

  // デバッグ情報を非表示にする
  hideDebugInfo() {
    this.showDebugInfo = false;
  }

  // カスタムドロップダウン制御メソッド
  toggleExtensionReasonDropdown(index: number) {
    // 配列が存在しない場合は初期化
    if (
      !this.extensionReasonDropdownOpen[index] &&
      this.extensionReasonDropdownOpen[index] !== false
    ) {
      // 配列のサイズを特殊事例の数に合わせる
      while (this.extensionReasonDropdownOpen.length <= index) {
        this.extensionReasonDropdownOpen.push(false);
      }
    }

    // 他のドロップダウンを閉じる
    this.extensionReasonDropdownOpen = this.extensionReasonDropdownOpen.map((_, i) =>
      i === index ? !this.extensionReasonDropdownOpen[i] : false
    );
  }

  selectExtensionReason(index: number, value: string) {
    // 配列が存在しない場合は初期化
    if (
      !this.extensionReasonDropdownOpen[index] &&
      this.extensionReasonDropdownOpen[index] !== false
    ) {
      while (this.extensionReasonDropdownOpen.length <= index) {
        this.extensionReasonDropdownOpen.push(false);
      }
    }

    this.selectedSpecialCases[index].details.extensionReason = value;
    this.extensionReasonDropdownOpen[index] = false;
    this.validateExtended16ChildcareInput(index);
    this.validateExtended2ChildcareInput(index);
  }

  getExtensionReasonDisplayText(value: string | undefined): string {
    if (!value) return '選択してください';

    switch (value) {
      case 'nursery-unavailable':
        return '保育所等に入所できない';
      case 'spouse-circumstances':
        return '配偶者の死亡・負傷・疾病等';
      case 'spouse-separation':
        return '配偶者との別居等';
      case 'spouse-work-restart':
        return '配偶者の職場復帰';
      default:
        return '選択してください';
    }
  }

  // 社会保険の加入対象者かどうかを判定
  isInsuranceEligible(): boolean {
    if (!this.judgmentResult) return false;

    return (
      this.judgmentResult.healthInsurance.eligible ||
      this.judgmentResult.pensionInsurance.eligible ||
      this.judgmentResult.careInsurance?.eligible ||
      false
    );
  }

  // 特殊事例管理メソッド
  addSpecialCase() {
    this.selectedSpecialCases.push({
      type: '',
      details: {},
    });
    // ドロップダウン状態も初期化
    this.extensionReasonDropdownOpen.push(false);
  }

  removeSpecialCase(index: number) {
    if (this.selectedSpecialCases.length > 1) {
      this.selectedSpecialCases.splice(index, 1);
      // ドロップダウン状態も削除
      this.extensionReasonDropdownOpen.splice(index, 1);
    }
  }

  onSpecialCaseTypeChange(index: number) {
    // 事例タイプが変更されたら詳細をリセット
    this.selectedSpecialCases[index].details = {};
  }

  getPlaceholderText(caseType: string): string {
    const placeholders: Record<string, string> = {
      'other-leave': '休職期間、無給期間の保険料徴収方法など',
      secondment: '出向先企業名、指揮命令関係、給与支払い実態など',
      'multiple-workplace': '勤務事業所名、各事業所での報酬額など',
      'same-day-acquisition-loss': '同日得喪の理由、特例適用の有無など',
    };
    return placeholders[caseType] || '詳細情報を入力してください';
  }

  // 特殊事例の初期化
  private initializeSpecialCases() {
    // 特殊事例は手動で追加するまで空のままにする
    this.selectedSpecialCases = [];
    this.extensionReasonDropdownOpen = [];
  }

  // 実際の出産日変更時の処理
  onActualBirthDateChange(index: number) {
    const specialCase = this.selectedSpecialCases[index];

    if (!specialCase.details.actualBirthDate) {
      return;
    }

    const birthDate = new Date(specialCase.details.actualBirthDate);

    // 産前期間の終了日と産後期間の開始日を出産日に合わせる
    specialCase.details.preNatalEndDate = specialCase.details.actualBirthDate;
    specialCase.details.postNatalStartDate = specialCase.details.actualBirthDate;

    // 産前期間の開始日は手動で変更されていない場合のみ再計算
    // （保存されたデータがある場合や手動で変更された場合は変更しない）
    if (!this.isPreNatalStartDateManuallySet(index)) {
      if (specialCase.details.pregnancyType) {
        const preNatalDays = specialCase.details.pregnancyType === 'multiple' ? 98 : 42;
        const preNatalStartDate = new Date(birthDate);
        preNatalStartDate.setDate(birthDate.getDate() - preNatalDays);
        specialCase.details.preNatalStartDate = this.formatDateToString(preNatalStartDate);
      }
    }

    // 産後期間の終了日を再計算
    const postNatalEndDate = new Date(birthDate);
    postNatalEndDate.setDate(birthDate.getDate() + 56);
    specialCase.details.postNatalEndDate = this.formatDateToString(postNatalEndDate);
  }

  // 産前産後休業期間の計算
  calculateMaternityPeriod(index: number) {
    const specialCase = this.selectedSpecialCases[index];
    if (
      !specialCase ||
      !specialCase.details.pregnancyType ||
      !specialCase.details.expectedBirthDate
    ) {
      return;
    }

    const expectedDate = new Date(specialCase.details.expectedBirthDate);
    const actualDate = specialCase.details.actualBirthDate
      ? new Date(specialCase.details.actualBirthDate)
      : null;

    // 産前期間の計算は常に出産予定日を基準とする
    const preNatalDays = specialCase.details.pregnancyType === 'multiple' ? 98 : 42;
    const preNatalStartDate = new Date(expectedDate);
    preNatalStartDate.setDate(expectedDate.getDate() - preNatalDays);

    // 産前期間の終了日と産後期間の開始日は実際の出産日（なければ予定日）
    const birthDate = actualDate || expectedDate;

    // 産後期間の計算
    const postNatalEndDate = new Date(birthDate);
    postNatalEndDate.setDate(birthDate.getDate() + 56);

    // 期間の自動設定（産前開始日は手動変更されていない場合のみ更新）
    if (!this.isPreNatalStartDateManuallySet(index)) {
      specialCase.details.preNatalStartDate = this.formatDateToString(preNatalStartDate);
    }
    specialCase.details.preNatalEndDate = this.formatDateToString(birthDate);
    specialCase.details.postNatalStartDate = this.formatDateToString(birthDate);
    specialCase.details.postNatalEndDate = this.formatDateToString(postNatalEndDate);

    // 従来の期間の保存も維持
    specialCase.details.startDate = this.formatDateToString(preNatalStartDate);
    specialCase.details.endDate = this.formatDateToString(postNatalEndDate);
  }

  // 計算された産前産後休業期間の取得
  getCalculatedMaternityPeriod(index: number): MaternityPeriodCalculation | null {
    const specialCase = this.selectedSpecialCases[index];
    if (
      !specialCase ||
      !specialCase.details.pregnancyType ||
      !specialCase.details.expectedBirthDate
    ) {
      return null;
    }

    const expectedDate = new Date(specialCase.details.expectedBirthDate);
    const actualDate = specialCase.details.actualBirthDate
      ? new Date(specialCase.details.actualBirthDate)
      : null;

    // 産前期間の計算
    const preNatalDays = specialCase.details.pregnancyType === 'multiple' ? 98 : 42;
    const preNatalStartDate = new Date(expectedDate);
    preNatalStartDate.setDate(expectedDate.getDate() - preNatalDays);

    // 産後期間の計算
    const birthDate = actualDate || expectedDate;
    const postNatalEndDate = new Date(birthDate);
    postNatalEndDate.setDate(birthDate.getDate() + 56);

    // 社会保険料免除期間の計算（月単位）
    const exemptionStartMonth = `${preNatalStartDate.getFullYear()}年${preNatalStartDate.getMonth() + 1}月`;
    const exemptionEndMonth = `${postNatalEndDate.getFullYear()}年${postNatalEndDate.getMonth() + 1}月`;

    return {
      preNatalPeriod: `${this.formatDateToString(preNatalStartDate)} ～ ${this.formatDateToString(expectedDate)} (${preNatalDays}日間)`,
      postNatalPeriod: `${this.formatDateToString(birthDate)} ～ ${this.formatDateToString(postNatalEndDate)} (56日間)`,
      totalPeriod: `${this.formatDateToString(preNatalStartDate)} ～ ${this.formatDateToString(postNatalEndDate)}`,
      startDate: this.formatDateToString(preNatalStartDate),
      endDate: this.formatDateToString(postNatalEndDate),
      exemptionPeriod: `${exemptionStartMonth} ～ ${exemptionEndMonth}`,
    };
  }

  // 日付をISO文字列に変換するヘルパーメソッド
  private formatDateToString(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  // 最大期間を設定
  setMaxPeriod(index: number) {
    const calculation = this.getCalculatedMaternityPeriod(index);
    if (calculation) {
      this.selectedSpecialCases[index].details.actualStartDate = calculation.startDate;
      this.selectedSpecialCases[index].details.actualEndDate = calculation.endDate;
    }
  }

  // 選択された期間の日数を計算
  getSelectedPeriodDays(index: number): number {
    const specialCase = this.selectedSpecialCases[index];
    if (specialCase.details.actualStartDate && specialCase.details.actualEndDate) {
      const startDate = new Date(specialCase.details.actualStartDate);
      const endDate = new Date(specialCase.details.actualEndDate);
      const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // 開始日も含むため+1
      return diffDays;
    }
    return 0;
  }

  // 産前期間の日付範囲を取得
  getPreNatalDateRange(index: number): string {
    const calculation = this.getCalculatedMaternityPeriod(index);
    const specialCase = this.selectedSpecialCases[index];

    if (!calculation || !specialCase.details.expectedBirthDate) {
      return '';
    }

    const expectedDate = new Date(specialCase.details.expectedBirthDate);
    const preNatalDays = specialCase.details.pregnancyType === 'multiple' ? 98 : 42;
    const preNatalStartDate = new Date(expectedDate);
    preNatalStartDate.setDate(expectedDate.getDate() - preNatalDays);

    return `${this.formatDateToString(preNatalStartDate)} ～ ${this.formatDateToString(expectedDate)}`;
  }

  // 産後期間の日付範囲を取得
  getPostNatalDateRange(index: number): string {
    const calculation = this.getCalculatedMaternityPeriod(index);
    const specialCase = this.selectedSpecialCases[index];

    if (!calculation || !specialCase.details.expectedBirthDate) {
      return '';
    }

    const expectedDate = new Date(specialCase.details.expectedBirthDate);
    const actualDate = specialCase.details.actualBirthDate
      ? new Date(specialCase.details.actualBirthDate)
      : null;

    const birthDate = actualDate || expectedDate;
    const postNatalEndDate = new Date(birthDate);
    postNatalEndDate.setDate(birthDate.getDate() + 56);

    return `${this.formatDateToString(birthDate)} ～ ${this.formatDateToString(postNatalEndDate)}`;
  }

  // 産前期間の開始日を取得
  getPreNatalStartDate(index: number): string {
    const specialCase = this.selectedSpecialCases[index];

    if (!specialCase.details.expectedBirthDate || !specialCase.details.pregnancyType) {
      return '';
    }

    const expectedDate = new Date(specialCase.details.expectedBirthDate);
    const preNatalDays = specialCase.details.pregnancyType === 'multiple' ? 98 : 42;
    const preNatalStartDate = new Date(expectedDate);
    preNatalStartDate.setDate(expectedDate.getDate() - preNatalDays);

    return this.formatDateToString(preNatalStartDate);
  }

  // 産前期間の終了日を取得
  getPreNatalEndDate(index: number): string {
    const specialCase = this.selectedSpecialCases[index];

    if (!specialCase.details.expectedBirthDate) {
      return '';
    }

    return specialCase.details.expectedBirthDate;
  }

  // 産後期間の開始日を取得
  getPostNatalStartDate(index: number): string {
    const specialCase = this.selectedSpecialCases[index];

    if (!specialCase.details.expectedBirthDate) {
      return '';
    }

    const actualDate = specialCase.details.actualBirthDate
      ? new Date(specialCase.details.actualBirthDate)
      : new Date(specialCase.details.expectedBirthDate);

    return this.formatDateToString(actualDate);
  }

  // 産後期間の終了日を取得
  getPostNatalEndDate(index: number): string {
    const specialCase = this.selectedSpecialCases[index];

    if (!specialCase.details.expectedBirthDate) {
      return '';
    }

    const expectedDate = new Date(specialCase.details.expectedBirthDate);
    const actualDate = specialCase.details.actualBirthDate
      ? new Date(specialCase.details.actualBirthDate)
      : null;

    const birthDate = actualDate || expectedDate;
    const postNatalEndDate = new Date(birthDate);
    postNatalEndDate.setDate(birthDate.getDate() + 56);

    return this.formatDateToString(postNatalEndDate);
  }

  // 産後期間の最大終了日を取得（出産日から56日後）
  getPostNatalMaxDate(index: number): string {
    return this.getPostNatalEndDate(index);
  }

  // 産前開始日が手動で変更されたかどうかを判定
  private isPreNatalStartDateManuallySet(index: number): boolean {
    const specialCase = this.selectedSpecialCases[index];

    // 保存されたデータがある場合は手動設定済みとみなす
    if (specialCase.saveStatus === 'saved') {
      return true;
    }

    // 計算値と異なる場合は手動設定済みとみなす
    if (specialCase.details.pregnancyType && specialCase.details.expectedBirthDate) {
      const expectedDate = new Date(specialCase.details.expectedBirthDate);
      const actualDate = specialCase.details.actualBirthDate
        ? new Date(specialCase.details.actualBirthDate)
        : null;
      const birthDate = actualDate || expectedDate;

      const preNatalDays = specialCase.details.pregnancyType === 'multiple' ? 98 : 42;
      const calculatedStartDate = new Date(birthDate);
      calculatedStartDate.setDate(birthDate.getDate() - preNatalDays);

      const calculatedStartDateString = this.formatDateToString(calculatedStartDate);

      return specialCase.details.preNatalStartDate !== calculatedStartDateString;
    }

    return false;
  }

  // 産前期間の日付変更イベントハンドラー
  onPreNatalStartDateChange(index: number, value: string) {
    this.selectedSpecialCases[index].details.preNatalStartDate = value;
    this.updateExemptionPeriod(index);
  }

  onPreNatalEndDateChange(index: number, value: string) {
    const specialCase = this.selectedSpecialCases[index];
    specialCase.details.preNatalEndDate = value;

    // 産前期間の終了日が変更されたら、産後期間の開始日も同じ日付に設定
    specialCase.details.postNatalStartDate = value;

    // 実際の出産日も更新
    if (value) {
      specialCase.details.actualBirthDate = value;
    }

    this.updateExemptionPeriod(index);
  }

  onPostNatalStartDateChange(index: number, value: string) {
    const specialCase = this.selectedSpecialCases[index];
    specialCase.details.postNatalStartDate = value;

    // 産後期間の開始日が変更されたら、産前期間の終了日も同じ日付に設定
    specialCase.details.preNatalEndDate = value;

    // 実際の出産日も更新
    if (value) {
      specialCase.details.actualBirthDate = value;
    }

    this.updateExemptionPeriod(index);
  }

  onPostNatalEndDateChange(index: number, value: string) {
    this.selectedSpecialCases[index].details.postNatalEndDate = value;
    this.updateExemptionPeriod(index);
  }

  // 免除期間の更新（必要に応じて追加処理）
  private updateExemptionPeriod(index: number) {
    // 現在は表示のみなので、特別な処理は不要
    // 将来的に保存や他の処理が必要な場合はここに追加
    console.log(`免除期間が更新されました (インデックス: ${index})`);
  }

  // 実際の社会保険料免除期間を計算
  getActualExemptionPeriod(index: number): string {
    const specialCase = this.selectedSpecialCases[index];

    if (!specialCase.details.preNatalStartDate || !specialCase.details.postNatalEndDate) {
      return '';
    }

    const startDate = new Date(specialCase.details.preNatalStartDate);
    const endDate = new Date(specialCase.details.postNatalEndDate);

    // 開始月と終了月を取得
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth() + 1;

    // 同じ月の場合
    if (startYear === endYear && startMonth === endMonth) {
      return `${startYear}年${startMonth}月`;
    }

    // 異なる月の場合
    return `${startYear}年${startMonth}月 ～ ${endYear}年${endMonth}月`;
  }

  // 特殊事例の個別保存
  async saveSpecialCase(index: number) {
    const specialCase = this.selectedSpecialCases[index];
    if (!specialCase || !this.currentUid) return;

    // 保存中状態に設定
    specialCase.saveStatus = 'saving';

    try {
      const firestore = getFirestore();
      const specialCaseData = {
        uid: this.currentUid,
        employeeName: this.employeeName,
        employeeNumber: this.employeeNumber,
        caseIndex: index,
        caseType: specialCase.type,
        caseDetails: specialCase.details,
        savedAt: new Date(),
      };

      // 特殊事例専用のコレクションに保存
      const docRef = doc(firestore, 'specialCases', `${this.currentUid}_${index}`);
      await setDoc(docRef, specialCaseData);

      // 保存成功
      specialCase.saveStatus = 'saved';
      console.log(`特殊事例 ${index} を保存しました:`, specialCaseData);

      // 成功メッセージを表示（3秒後に消去）
      setTimeout(() => {
        if (specialCase.saveStatus === 'saved') {
          specialCase.saveStatus = undefined;
        }
      }, 3000);
    } catch (error) {
      console.error(`特殊事例 ${index} の保存に失敗しました:`, error);
      specialCase.saveStatus = 'error';

      // エラーメッセージを表示（5秒後に消去）
      setTimeout(() => {
        if (specialCase.saveStatus === 'error') {
          specialCase.saveStatus = undefined;
        }
      }, 5000);
    }
  }

  // 産前産後休業の保存可能性チェック
  canSaveMaternityCase(index: number): boolean {
    const specialCase = this.selectedSpecialCases[index];
    return !!(
      specialCase &&
      specialCase.type === 'maternity-leave' &&
      specialCase.details.pregnancyType &&
      specialCase.details.expectedBirthDate
    );
  }

  // 育休の保存可能性チェック
  canSaveChildcareCase(index: number): boolean {
    const specialCase = this.selectedSpecialCases[index];
    return !!(
      specialCase &&
      specialCase.type === 'childcare-leave' &&
      specialCase.details.childcareType &&
      specialCase.details.childBirthDate &&
      specialCase.details.startDate &&
      specialCase.details.endDate
    );
  }

  // その他の事例の保存可能性チェック
  canSaveOtherCase(index: number): boolean {
    const specialCase = this.selectedSpecialCases[index];
    return !!(
      specialCase &&
      specialCase.type &&
      specialCase.type !== 'maternity-leave' &&
      specialCase.type !== 'childcare-leave' &&
      specialCase.details.remarks
    );
  }

  // 保存ステータステキスト取得
  getSpecialCaseSaveStatusText(status: string): string {
    switch (status) {
      case 'saved':
        return '保存済み';
      case 'saving':
        return '保存中...';
      case 'error':
        return '保存に失敗しました';
      default:
        return '';
    }
  }

  // 育児休業期間の計算
  calculateChildcarePeriod(index: number) {
    const specialCase = this.selectedSpecialCases[index];
    if (
      !specialCase ||
      !specialCase.details.childcareType ||
      !specialCase.details.startDate ||
      !specialCase.details.endDate
    ) {
      return;
    }

    // 計算ロジックは実装済み（getCalculatedChildcarePeriodで処理）
    console.log('育児休業期間を計算:', specialCase);
  }

  // 育児休業の社会保険料免除期間を取得（産休と同様の表示形式）
  getChildcareExemptionPeriod(index: number): string {
    const calculation = this.getCalculatedChildcarePeriod(index);
    if (!calculation || !calculation.monthlyPremiumExemption) {
      return '';
    }

    // 月額保険料免除期間から年月形式を抽出
    const exemptionText = calculation.monthlyPremiumExemption;

    // "YYYY年MM月"の形式を抽出
    const yearMonthPattern = /(\d{4}年\d{1,2}月)/g;
    const matches = exemptionText.match(yearMonthPattern);

    if (!matches || matches.length === 0) {
      return '免除期間なし';
    }

    if (matches.length === 1) {
      return matches[0];
    }

    // 複数の月がある場合は範囲表示
    return `${matches[0]} ～ ${matches[matches.length - 1]}`;
  }

  // 計算された育児休業期間の取得
  getCalculatedChildcarePeriod(index: number): ChildcarePeriodCalculation | null {
    const specialCase = this.selectedSpecialCases[index];
    if (
      !specialCase ||
      !specialCase.details.childcareType ||
      !specialCase.details.startDate ||
      !specialCase.details.endDate
    ) {
      return null;
    }

    const startDate = new Date(specialCase.details.startDate);
    const endDate = new Date(specialCase.details.endDate);

    // 開始月の計算
    const startMonth = `${startDate.getFullYear()}年${startDate.getMonth() + 1}月`;

    // 14日ルールの判定
    const startDay = startDate.getDate();
    const endDay = endDate.getDate();
    const isSameMonth =
      startDate.getFullYear() === endDate.getFullYear() &&
      startDate.getMonth() === endDate.getMonth();

    let monthlyExemption = '';
    let bonusNote = '';
    let specialNote = '';

    if (isSameMonth) {
      // 同一月の場合は14日ルールを適用
      const daysInMonth = endDay - startDay + 1;
      if (daysInMonth >= 14) {
        monthlyExemption = `${startMonth}（14日以上取得のため免除）`;
        specialNote = '令和4年10月1日以降開始の育児休業に適用される14日ルールにより免除';
      } else {
        monthlyExemption = `${startMonth}（14日未満のため免除対象外）`;
        specialNote = '同一月内で14日未満のため月額保険料は免除されません';
      }
    } else {
      // 複数月にまたがる場合
      const exemptionEndDate = new Date(endDate);
      exemptionEndDate.setDate(exemptionEndDate.getDate() + 1); // 終了日の翌日
      const exemptionEndMonth = `${exemptionEndDate.getFullYear()}年${exemptionEndDate.getMonth() + 1}月`;

      if (startMonth === exemptionEndMonth) {
        monthlyExemption = '免除対象月なし';
      } else {
        monthlyExemption = `${startMonth} ～ ${exemptionEndMonth}の前月まで`;
      }
    }

    // 賞与免除の判定
    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (diffDays > 30) {
      bonusNote = '育児休業期間に月末が含まれる月の賞与は免除対象（1カ月超の場合）';
    } else {
      bonusNote = '1カ月以下のため賞与免除は月末を含む連続1カ月超の条件を確認';
    }

    // 育児休業種類別の特記事項
    switch (specialCase.details.childcareType) {
      case 'papa-leave':
        specialNote =
          (specialNote ? specialNote + '。' : '') +
          '産後パパ育休は出生後8週間以内に4週間まで取得可能';
        break;
      case 'extended-1-6':
      case 'extended-2':
        specialNote =
          (specialNote ? specialNote + '。' : '') + '延長育児休業は特別な事情がある場合のみ適用';
        break;
    }

    return {
      monthlyPremiumExemption: monthlyExemption,
      bonusNote: bonusNote,
      specialNote: specialNote || undefined,
    };
  }

  // 延長育児休業かどうかの判定
  isExtendedChildcare(index: number): boolean {
    const specialCase = this.selectedSpecialCases[index];
    return !!(
      specialCase &&
      (specialCase.details.childcareType === 'extended-1-6' ||
        specialCase.details.childcareType === 'extended-2')
    );
  }

  // === 産後パパ育休のバリデーション機能 ===

  // 産後パパ育休のバリデーション
  validatePapaLeaveInput(caseIndex: number): void {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (specialCase.details.childcareType === 'papa-leave') {
      this.calculateChildcarePeriod(caseIndex);
    }
  }

  // 産後パパ育休の最大開始日を取得（出生後8週間以内）
  getPapaLeaveMaxStartDate(caseIndex: number): string | null {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (!specialCase.details.childBirthDate) {
      return null;
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate);
    const maxStartDate = new Date(childBirthDate);
    maxStartDate.setDate(maxStartDate.getDate() + 56); // 8週間 = 56日

    return this.formatDateToString(maxStartDate);
  }

  // 産後パパ育休の最大終了日を取得（開始日から4週間以内）
  getPapaLeaveMaxEndDate(caseIndex: number): string | null {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (!specialCase.details.startDate) {
      return null;
    }

    const startDate = new Date(specialCase.details.startDate);
    const maxEndDate = new Date(startDate);
    maxEndDate.setDate(maxEndDate.getDate() + 27); // 4週間 = 28日間なので27日後

    return this.formatDateToString(maxEndDate);
  }

  // 産後パパ育休の開始日が無効かチェック
  isPapaLeaveStartDateInvalid(caseIndex: number): boolean {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (!specialCase.details.childBirthDate || !specialCase.details.startDate) {
      return false;
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate);
    const startDate = new Date(specialCase.details.startDate);
    const eightWeeksAfter = new Date(childBirthDate);
    eightWeeksAfter.setDate(eightWeeksAfter.getDate() + 56);

    return startDate > eightWeeksAfter;
  }

  // 産後パパ育休の終了日が無効かチェック
  isPapaLeaveEndDateInvalid(caseIndex: number): boolean {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (!specialCase.details.startDate || !specialCase.details.endDate) {
      return false;
    }

    const startDate = new Date(specialCase.details.startDate);
    const endDate = new Date(specialCase.details.endDate);
    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    return diffDays > 28; // 4週間 = 28日を超える場合は無効
  }

  // 産後パパ育休のバリデーション結果を取得
  getPapaLeaveValidation(caseIndex: number): { isValid: boolean; errors: string[] } | null {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (specialCase.details.childcareType !== 'papa-leave') {
      return null;
    }

    const errors: string[] = [];

    if (!specialCase.details.childBirthDate) {
      errors.push('子の生年月日を入力してください');
    }

    if (!specialCase.details.startDate) {
      errors.push('育児休業開始日を入力してください');
    }

    if (!specialCase.details.endDate) {
      errors.push('育児休業終了予定日を入力してください');
    }

    // 基本入力がない場合は早期リターン
    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate!);
    const startDate = new Date(specialCase.details.startDate!);
    const endDate = new Date(specialCase.details.endDate!);

    // 1. 出生後8週間以内の開始日チェック
    const eightWeeksAfter = new Date(childBirthDate);
    eightWeeksAfter.setDate(eightWeeksAfter.getDate() + 56);

    if (startDate > eightWeeksAfter) {
      errors.push('産後パパ育休は出生後8週間以内に開始する必要があります');
    }

    // 2. 最大4週間（28日）の期間制限チェック
    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (diffDays > 28) {
      errors.push(`産後パパ育休は最大4週間（28日）まで取得可能です（現在: ${diffDays}日）`);
    }

    // 3. 開始日が終了日より後でないかチェック
    if (startDate >= endDate) {
      errors.push('開始日は終了日より前の日付を入力してください');
    }

    // 4. 出生日より前の開始日チェック
    if (startDate < childBirthDate) {
      errors.push('産後パパ育休は子の出生日以降に開始してください');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // 産後パパ育休の期間計算結果を取得
  getPapaLeaveCalculation(caseIndex: number): {
    requestedDays: number;
    maxAllowedDays: number;
    isWithinLimit: boolean;
  } | null {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (
      specialCase.details.childcareType !== 'papa-leave' ||
      !specialCase.details.startDate ||
      !specialCase.details.endDate
    ) {
      return null;
    }

    const startDate = new Date(specialCase.details.startDate);
    const endDate = new Date(specialCase.details.endDate);
    const diffTime = endDate.getTime() - startDate.getTime();
    const requestedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    const maxAllowedDays = 28; // 4週間

    return {
      requestedDays,
      maxAllowedDays,
      isWithinLimit: requestedDays <= maxAllowedDays,
    };
  }

  // === 基本の育児休業のバリデーション機能 ===

  // 基本育児休業のバリデーション
  validateBasicChildcareInput(caseIndex: number): void {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (specialCase.details.childcareType === 'basic') {
      this.calculateChildcarePeriod(caseIndex);
    }
  }

  // 基本育児休業の最大終了日を取得（子が1歳になる日まで）
  getBasicChildcareMaxEndDate(caseIndex: number): string | null {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (!specialCase.details.childBirthDate) {
      return null;
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate);
    const maxEndDate = new Date(childBirthDate);
    maxEndDate.setFullYear(maxEndDate.getFullYear() + 1); // 1歳の誕生日
    maxEndDate.setDate(maxEndDate.getDate() - 1); // 1歳の誕生日の前日まで

    return this.formatDateToString(maxEndDate);
  }

  // 基本育児休業の開始日が無効かチェック
  isBasicChildcareStartDateInvalid(caseIndex: number): boolean {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (!specialCase.details.childBirthDate || !specialCase.details.startDate) {
      return false;
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate);
    const startDate = new Date(specialCase.details.startDate);

    // 産後8週間経過後から開始可能（産後パパ育休との区別）
    const eightWeeksAfter = new Date(childBirthDate);
    eightWeeksAfter.setDate(eightWeeksAfter.getDate() + 56);

    // 一般的には産後8週間後から開始だが、例外もあるため警告レベル
    return startDate < childBirthDate;
  }

  // 基本育児休業の終了日が無効かチェック
  isBasicChildcareEndDateInvalid(caseIndex: number): boolean {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (!specialCase.details.childBirthDate || !specialCase.details.endDate) {
      return false;
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate);
    const endDate = new Date(specialCase.details.endDate);
    const maxEndDate = new Date(childBirthDate);
    maxEndDate.setFullYear(maxEndDate.getFullYear() + 1);
    maxEndDate.setDate(maxEndDate.getDate() - 1);

    return endDate > maxEndDate;
  }

  // 基本育児休業のバリデーション結果を取得
  getBasicChildcareValidation(
    caseIndex: number
  ): { isValid: boolean; errors: string[]; warnings: string[] } | null {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (specialCase.details.childcareType !== 'basic') {
      return null;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!specialCase.details.childBirthDate) {
      errors.push('子の生年月日を入力してください');
    }

    if (!specialCase.details.startDate) {
      errors.push('育児休業開始日を入力してください');
    }

    if (!specialCase.details.endDate) {
      errors.push('育児休業終了予定日を入力してください');
    }

    // 基本入力がない場合は早期リターン
    if (errors.length > 0) {
      return { isValid: false, errors, warnings };
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate!);
    const startDate = new Date(specialCase.details.startDate!);
    const endDate = new Date(specialCase.details.endDate!);

    // 1. 出生日以降の開始日チェック
    if (startDate < childBirthDate) {
      errors.push('育児休業は子の出生日以降に開始してください');
    }

    // 2. 1歳までの期間制限チェック
    const maxEndDate = new Date(childBirthDate);
    maxEndDate.setFullYear(maxEndDate.getFullYear() + 1);
    maxEndDate.setDate(maxEndDate.getDate() - 1);

    if (endDate > maxEndDate) {
      errors.push(
        `基本の育児休業は子が1歳になる日（${this.formatDateToString(maxEndDate)}）まで取得可能です`
      );
    }

    // 3. 開始日が終了日より後でないかチェック
    if (startDate >= endDate) {
      errors.push('開始日は終了日より前の日付を入力してください');
    }

    // 4. 産後8週間以内の開始日の場合の警告
    const eightWeeksAfter = new Date(childBirthDate);
    eightWeeksAfter.setDate(eightWeeksAfter.getDate() + 56);

    if (startDate <= eightWeeksAfter) {
      warnings.push(
        '産後8週間以内の期間は「産後パパ育休」の対象期間です。制度の使い分けをご確認ください'
      );
    }

    // 5. 期間が短すぎる場合の警告
    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (diffDays < 30) {
      warnings.push('1カ月未満の短期間です。社会保険料免除の条件（14日ルール等）をご確認ください');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // 基本育児休業の期間計算結果を取得
  getBasicChildcareCalculation(caseIndex: number): {
    requestedDays: number;
    maxAllowedDays: number;
    isWithinLimit: boolean;
    childAge: string;
    canExtend: boolean;
  } | null {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (
      specialCase.details.childcareType !== 'basic' ||
      !specialCase.details.childBirthDate ||
      !specialCase.details.startDate ||
      !specialCase.details.endDate
    ) {
      return null;
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate);
    const startDate = new Date(specialCase.details.startDate);
    const endDate = new Date(specialCase.details.endDate);

    // 申請期間の計算
    const diffTime = endDate.getTime() - startDate.getTime();
    const requestedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // 最大許可日数の計算（1歳の誕生日まで）
    const maxEndDate = new Date(childBirthDate);
    maxEndDate.setFullYear(maxEndDate.getFullYear() + 1);
    maxEndDate.setDate(maxEndDate.getDate() - 1);

    const maxDiffTime = maxEndDate.getTime() - startDate.getTime();
    const maxAllowedDays = Math.ceil(maxDiffTime / (1000 * 60 * 60 * 24)) + 1;

    // 子の年齢計算（終了予定日時点）
    const childAgeAtEnd = endDate.getFullYear() - childBirthDate.getFullYear();
    const childAge = childAgeAtEnd < 1 ? '1歳未満' : `${childAgeAtEnd}歳`;

    // 延長可能性の判定
    const canExtend = endDate <= maxEndDate; // 1歳以内で終了する場合は延長可能

    return {
      requestedDays,
      maxAllowedDays: Math.max(maxAllowedDays, 0),
      isWithinLimit: requestedDays <= maxAllowedDays,
      childAge,
      canExtend,
    };
  }

  // === 延長育児休業（1歳～1歳6か月）のバリデーション機能 ===

  // 延長育児休業（1歳～1歳6か月）のバリデーション
  validateExtended16ChildcareInput(caseIndex: number): void {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (specialCase.details.childcareType === 'extended-1-6') {
      this.calculateChildcarePeriod(caseIndex);
    }
  }

  // 延長育児休業（1歳～1歳6か月）の最大開始日を取得（子が1歳になる日）
  getExtended16ChildcareMinStartDate(caseIndex: number): string | null {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (!specialCase.details.childBirthDate) {
      return null;
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate);
    const minStartDate = new Date(childBirthDate);
    minStartDate.setFullYear(minStartDate.getFullYear() + 1); // 1歳の誕生日

    return this.formatDateToString(minStartDate);
  }

  // 延長育児休業（1歳～1歳6か月）の最大終了日を取得（子が1歳6か月になる日まで）
  getExtended16ChildcareMaxEndDate(caseIndex: number): string | null {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (!specialCase.details.childBirthDate) {
      return null;
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate);
    const maxEndDate = new Date(childBirthDate);
    maxEndDate.setMonth(maxEndDate.getMonth() + 18); // 1歳6か月
    maxEndDate.setDate(maxEndDate.getDate() - 1); // 1歳6か月の誕生日の前日まで

    return this.formatDateToString(maxEndDate);
  }

  // 延長育児休業（1歳～1歳6か月）の開始日が無効かチェック
  isExtended16ChildcareStartDateInvalid(caseIndex: number): boolean {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (!specialCase.details.childBirthDate || !specialCase.details.startDate) {
      return false;
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate);
    const startDate = new Date(specialCase.details.startDate);
    const oneYearOld = new Date(childBirthDate);
    oneYearOld.setFullYear(oneYearOld.getFullYear() + 1);

    // 1歳の誕生日より前は無効
    return startDate < oneYearOld;
  }

  // 延長育児休業（1歳～1歳6か月）の終了日が無効かチェック
  isExtended16ChildcareEndDateInvalid(caseIndex: number): boolean {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (!specialCase.details.childBirthDate || !specialCase.details.endDate) {
      return false;
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate);
    const endDate = new Date(specialCase.details.endDate);
    const maxEndDate = new Date(childBirthDate);
    maxEndDate.setMonth(maxEndDate.getMonth() + 18);
    maxEndDate.setDate(maxEndDate.getDate() - 1);

    return endDate > maxEndDate;
  }

  // 延長育児休業（1歳～1歳6か月）のバリデーション結果を取得
  getExtended16ChildcareValidation(
    caseIndex: number
  ): { isValid: boolean; errors: string[]; warnings: string[] } | null {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (specialCase.details.childcareType !== 'extended-1-6') {
      return null;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!specialCase.details.childBirthDate) {
      errors.push('子の生年月日を入力してください');
    }

    if (!specialCase.details.startDate) {
      errors.push('育児休業開始日を入力してください');
    }

    if (!specialCase.details.endDate) {
      errors.push('育児休業終了予定日を入力してください');
    }

    if (!specialCase.details.extensionReason) {
      errors.push('延長理由を選択してください');
    }

    // 基本入力がない場合は早期リターン
    if (errors.length > 0) {
      return { isValid: false, errors, warnings };
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate!);
    const startDate = new Date(specialCase.details.startDate!);
    const endDate = new Date(specialCase.details.endDate!);

    // 1. 1歳の誕生日以降の開始日チェック
    const oneYearOld = new Date(childBirthDate);
    oneYearOld.setFullYear(oneYearOld.getFullYear() + 1);

    if (startDate < oneYearOld) {
      errors.push(
        `延長育児休業は子が1歳になる日（${this.formatDateToString(oneYearOld)}）以降に開始してください`
      );
    }

    // 2. 1歳6か月までの期間制限チェック
    const maxEndDate = new Date(childBirthDate);
    maxEndDate.setMonth(maxEndDate.getMonth() + 18);
    maxEndDate.setDate(maxEndDate.getDate() - 1);

    if (endDate > maxEndDate) {
      errors.push(
        `延長育児休業（1歳～1歳6か月）は子が1歳6か月になる日（${this.formatDateToString(maxEndDate)}）まで取得可能です`
      );
    }

    // 3. 開始日が終了日より後でないかチェック
    if (startDate >= endDate) {
      errors.push('開始日は終了日より前の日付を入力してください');
    }

    // 4. 延長理由の妥当性チェック
    if (specialCase.details.extensionReason) {
      switch (specialCase.details.extensionReason) {
        case 'nursery-unavailable':
          warnings.push(
            '保育所等への入所申込みを行っているが入所できない場合の延長です。関連書類の準備をご確認ください'
          );
          break;
        case 'spouse-circumstances':
          warnings.push('配偶者の死亡・負傷・疾病等による延長です。証明書類が必要な場合があります');
          break;
        case 'spouse-separation':
          warnings.push(
            '配偶者との別居等による延長です。状況に応じて証明書類が必要な場合があります'
          );
          break;
        case 'spouse-work-restart':
          warnings.push(
            '配偶者の職場復帰による延長です。配偶者の就労証明書等が必要な場合があります'
          );
          break;
      }
    }

    // 5. 期間が短すぎる場合の警告
    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (diffDays < 30) {
      warnings.push('1カ月未満の短期間です。延長の必要性と社会保険料免除の条件をご確認ください');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // 延長育児休業（1歳～1歳6か月）の期間計算結果を取得
  getExtended16ChildcareCalculation(caseIndex: number): {
    requestedDays: number;
    maxAllowedDays: number;
    isWithinLimit: boolean;
    childAge: string;
    canExtendFurther: boolean;
    extensionReason: string;
  } | null {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (
      specialCase.details.childcareType !== 'extended-1-6' ||
      !specialCase.details.childBirthDate ||
      !specialCase.details.startDate ||
      !specialCase.details.endDate
    ) {
      return null;
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate);
    const startDate = new Date(specialCase.details.startDate);
    const endDate = new Date(specialCase.details.endDate);

    // 申請期間の計算
    const diffTime = endDate.getTime() - startDate.getTime();
    const requestedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // 最大許可日数の計算（1歳6か月まで）
    const maxEndDate = new Date(childBirthDate);
    maxEndDate.setMonth(maxEndDate.getMonth() + 18);
    maxEndDate.setDate(maxEndDate.getDate() - 1);

    const maxDiffTime = maxEndDate.getTime() - startDate.getTime();
    const maxAllowedDays = Math.ceil(maxDiffTime / (1000 * 60 * 60 * 24)) + 1;

    // 子の年齢計算（終了予定日時点）
    const childAgeAtEnd = this.calculateChildAgeAtDate(childBirthDate, endDate);
    const childAge = childAgeAtEnd;

    // さらなる延長可能性の判定（1歳6か月以内で終了する場合）
    const canExtendFurther = endDate <= maxEndDate;

    // 延長理由の表示テキスト
    const extensionReasonText = this.getExtensionReasonText(
      specialCase.details.extensionReason || ''
    );

    return {
      requestedDays,
      maxAllowedDays: Math.max(maxAllowedDays, 0),
      isWithinLimit: requestedDays <= maxAllowedDays,
      childAge,
      canExtendFurther,
      extensionReason: extensionReasonText,
    };
  }

  // 子の年齢を指定日時点で計算
  private calculateChildAgeAtDate(birthDate: Date, targetDate: Date): string {
    const years = targetDate.getFullYear() - birthDate.getFullYear();
    const months = targetDate.getMonth() - birthDate.getMonth();
    const days = targetDate.getDate() - birthDate.getDate();

    let totalMonths = years * 12 + months;
    if (days < 0) {
      totalMonths--;
    }

    if (totalMonths < 12) {
      return `${totalMonths}か月`;
    } else {
      const ageYears = Math.floor(totalMonths / 12);
      const ageMonths = totalMonths % 12;
      return ageMonths === 0 ? `${ageYears}歳` : `${ageYears}歳${ageMonths}か月`;
    }
  }

  // 延長理由の表示テキストを取得
  private getExtensionReasonText(reason: string): string {
    switch (reason) {
      case 'nursery-unavailable':
        return '保育所等に入所できない';
      case 'spouse-circumstances':
        return '配偶者の死亡・負傷・疾病等';
      case 'spouse-separation':
        return '配偶者との別居等';
      case 'spouse-work-restart':
        return '配偶者の職場復帰';
      default:
        return '延長理由未選択';
    }
  }

  // === 延長育児休業（1歳6か月～2歳）のバリデーション機能 ===

  // 延長育児休業（1歳6か月～2歳）のバリデーション
  validateExtended2ChildcareInput(caseIndex: number): void {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (specialCase.details.childcareType === 'extended-2') {
      this.calculateChildcarePeriod(caseIndex);
    }
  }

  // 延長育児休業（1歳6か月～2歳）の最小開始日を取得（子が1歳6か月になる日）
  getExtended2ChildcareMinStartDate(caseIndex: number): string | null {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (!specialCase.details.childBirthDate) {
      return null;
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate);
    const minStartDate = new Date(childBirthDate);
    minStartDate.setMonth(minStartDate.getMonth() + 18); // 1歳6か月

    return this.formatDateToString(minStartDate);
  }

  // 延長育児休業（1歳6か月～2歳）の最大終了日を取得（子が2歳になる日まで）
  getExtended2ChildcareMaxEndDate(caseIndex: number): string | null {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (!specialCase.details.childBirthDate) {
      return null;
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate);
    const maxEndDate = new Date(childBirthDate);
    maxEndDate.setFullYear(maxEndDate.getFullYear() + 2); // 2歳の誕生日
    maxEndDate.setDate(maxEndDate.getDate() - 1); // 2歳の誕生日の前日まで

    return this.formatDateToString(maxEndDate);
  }

  // 延長育児休業（1歳6か月～2歳）の開始日が無効かチェック
  isExtended2ChildcareStartDateInvalid(caseIndex: number): boolean {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (!specialCase.details.childBirthDate || !specialCase.details.startDate) {
      return false;
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate);
    const startDate = new Date(specialCase.details.startDate);
    const oneYearSixMonths = new Date(childBirthDate);
    oneYearSixMonths.setMonth(oneYearSixMonths.getMonth() + 18);

    // 1歳6か月より前は無効
    return startDate < oneYearSixMonths;
  }

  // 延長育児休業（1歳6か月～2歳）の終了日が無効かチェック
  isExtended2ChildcareEndDateInvalid(caseIndex: number): boolean {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (!specialCase.details.childBirthDate || !specialCase.details.endDate) {
      return false;
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate);
    const endDate = new Date(specialCase.details.endDate);
    const maxEndDate = new Date(childBirthDate);
    maxEndDate.setFullYear(maxEndDate.getFullYear() + 2);
    maxEndDate.setDate(maxEndDate.getDate() - 1);

    return endDate > maxEndDate;
  }

  // 延長育児休業（1歳6か月～2歳）のバリデーション結果を取得
  getExtended2ChildcareValidation(
    caseIndex: number
  ): { isValid: boolean; errors: string[]; warnings: string[] } | null {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (specialCase.details.childcareType !== 'extended-2') {
      return null;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!specialCase.details.childBirthDate) {
      errors.push('子の生年月日を入力してください');
    }

    if (!specialCase.details.startDate) {
      errors.push('育児休業開始日を入力してください');
    }

    if (!specialCase.details.endDate) {
      errors.push('育児休業終了予定日を入力してください');
    }

    if (!specialCase.details.extensionReason) {
      errors.push('延長理由を選択してください');
    }

    // 基本入力がない場合は早期リターン
    if (errors.length > 0) {
      return { isValid: false, errors, warnings };
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate!);
    const startDate = new Date(specialCase.details.startDate!);
    const endDate = new Date(specialCase.details.endDate!);

    // 1. 1歳6か月以降の開始日チェック
    const oneYearSixMonths = new Date(childBirthDate);
    oneYearSixMonths.setMonth(oneYearSixMonths.getMonth() + 18);

    if (startDate < oneYearSixMonths) {
      errors.push(
        `延長育児休業（2歳まで）は子が1歳6か月になる日（${this.formatDateToString(oneYearSixMonths)}）以降に開始してください`
      );
    }

    // 2. 2歳までの期間制限チェック
    const maxEndDate = new Date(childBirthDate);
    maxEndDate.setFullYear(maxEndDate.getFullYear() + 2);
    maxEndDate.setDate(maxEndDate.getDate() - 1);

    if (endDate > maxEndDate) {
      errors.push(
        `延長育児休業（1歳6か月～2歳）は子が2歳になる日（${this.formatDateToString(maxEndDate)}）まで取得可能です`
      );
    }

    // 3. 開始日が終了日より後でないかチェック
    if (startDate >= endDate) {
      errors.push('開始日は終了日より前の日付を入力してください');
    }

    // 4. 延長理由の妥当性チェック（2歳までの延長は特に厳格）
    if (specialCase.details.extensionReason) {
      switch (specialCase.details.extensionReason) {
        case 'nursery-unavailable':
          warnings.push(
            '1歳6か月時点でも保育所等への入所ができない場合の延長です。継続的な入所申込みの証明が必要です'
          );
          break;
        case 'spouse-circumstances':
          warnings.push(
            '配偶者の死亡・負傷・疾病等が1歳6か月時点でも継続している場合の延長です。最新の証明書類が必要です'
          );
          break;
        case 'spouse-separation':
          warnings.push(
            '配偶者との別居等が1歳6か月時点でも継続している場合の延長です。状況の継続を示す書類が必要な場合があります'
          );
          break;
        case 'spouse-work-restart':
          warnings.push(
            '配偶者の職場復帰等の状況が1歳6か月時点でも継続している場合の延長です。最新の就労証明書等が必要です'
          );
          break;
      }
    }

    // 5. 2歳までの延長の特別な注意事項
    warnings.push(
      '2歳までの延長育児休業は、1歳6か月時点での特別な事情の継続が前提となります。申請時に詳細な状況説明が必要です'
    );

    // 6. 期間が短すぎる場合の警告
    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (diffDays < 30) {
      warnings.push(
        '1カ月未満の短期間です。2歳までの延長の必要性と社会保険料免除の条件をご確認ください'
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // 延長育児休業（1歳6か月～2歳）の期間計算結果を取得
  getExtended2ChildcareCalculation(caseIndex: number): {
    requestedDays: number;
    maxAllowedDays: number;
    isWithinLimit: boolean;
    childAge: string;
    extensionReason: string;
    isMaxExtension: boolean;
  } | null {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (
      specialCase.details.childcareType !== 'extended-2' ||
      !specialCase.details.childBirthDate ||
      !specialCase.details.startDate ||
      !specialCase.details.endDate
    ) {
      return null;
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate);
    const startDate = new Date(specialCase.details.startDate);
    const endDate = new Date(specialCase.details.endDate);

    // 申請期間の計算
    const diffTime = endDate.getTime() - startDate.getTime();
    const requestedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // 最大許可日数の計算（2歳まで）
    const maxEndDate = new Date(childBirthDate);
    maxEndDate.setFullYear(maxEndDate.getFullYear() + 2);
    maxEndDate.setDate(maxEndDate.getDate() - 1);

    const maxDiffTime = maxEndDate.getTime() - startDate.getTime();
    const maxAllowedDays = Math.ceil(maxDiffTime / (1000 * 60 * 60 * 24)) + 1;

    // 子の年齢計算（終了予定日時点）
    const childAgeAtEnd = this.calculateChildAgeAtDate(childBirthDate, endDate);
    const childAge = childAgeAtEnd;

    // 延長理由の表示テキスト
    const extensionReasonText = this.getExtensionReasonText(
      specialCase.details.extensionReason || ''
    );

    // 最大延長かどうかの判定（2歳までの延長は法定最大）
    const isMaxExtension = true;

    return {
      requestedDays,
      maxAllowedDays: Math.max(maxAllowedDays, 0),
      isWithinLimit: requestedDays <= maxAllowedDays,
      childAge,
      extensionReason: extensionReasonText,
      isMaxExtension,
    };
  }

  // === 育児休業に準ずる措置のバリデーション機能 ===

  // 育児休業に準ずる措置のバリデーション
  validateSimilarMeasuresInput(caseIndex: number): void {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (specialCase.details.childcareType === 'similar-measures') {
      this.calculateChildcarePeriod(caseIndex);
    }
  }

  // 育児休業に準ずる措置のバリデーション結果を取得
  getSimilarMeasuresValidation(
    caseIndex: number
  ): { isValid: boolean; errors: string[]; warnings: string[] } | null {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (specialCase.details.childcareType !== 'similar-measures') {
      return null;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!specialCase.details.childBirthDate) {
      errors.push('子の生年月日を入力してください');
    }

    if (!specialCase.details.startDate) {
      errors.push('措置開始日を入力してください');
    }

    if (!specialCase.details.endDate) {
      errors.push('措置終了予定日を入力してください');
    }

    // 基本入力がない場合は早期リターン
    if (errors.length > 0) {
      return { isValid: false, errors, warnings };
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate!);
    const startDate = new Date(specialCase.details.startDate!);
    const endDate = new Date(specialCase.details.endDate!);

    // 1. 開始日が終了日より後でないかチェック
    if (startDate >= endDate) {
      errors.push('開始日は終了日より前の日付を入力してください');
    }

    // 2. 3歳までの期間制限チェック（育児休業に準ずる措置の一般的な上限）
    const maxEndDate = new Date(childBirthDate);
    maxEndDate.setFullYear(maxEndDate.getFullYear() + 3);
    maxEndDate.setDate(maxEndDate.getDate() - 1);

    if (endDate > maxEndDate) {
      warnings.push(
        `育児休業に準ずる措置は一般的に子が3歳になる日（${this.formatDateToString(maxEndDate)}）まで取得可能です。詳細は就業規則をご確認ください`
      );
    }

    // 3. 育児休業に準ずる措置の特別な注意事項
    warnings.push(
      '育児休業に準ずる措置の社会保険料免除は、育児休業等と同等の制度であることが必要です。就業規則や労働協約の内容をご確認ください'
    );

    // 4. 期間が長すぎる場合の警告
    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (diffDays > 365 * 2) {
      warnings.push(
        '2年を超える長期間です。育児休業に準ずる措置の適用条件と社会保険料免除の要件をご確認ください'
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // 育児休業に準ずる措置の期間計算結果を取得
  getSimilarMeasuresCalculation(caseIndex: number): {
    requestedDays: number;
    childAge: string;
    measureType: string;
  } | null {
    const specialCase = this.selectedSpecialCases[caseIndex];
    if (
      specialCase.details.childcareType !== 'similar-measures' ||
      !specialCase.details.childBirthDate ||
      !specialCase.details.startDate ||
      !specialCase.details.endDate
    ) {
      return null;
    }

    const childBirthDate = new Date(specialCase.details.childBirthDate);
    const startDate = new Date(specialCase.details.startDate);
    const endDate = new Date(specialCase.details.endDate);

    // 申請期間の計算
    const diffTime = endDate.getTime() - startDate.getTime();
    const requestedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // 子の年齢計算（終了予定日時点）
    const childAgeAtEnd = this.calculateChildAgeAtDate(childBirthDate, endDate);
    const childAge = childAgeAtEnd;

    // 措置の種類
    const measureType = '育児休業に準ずる措置';

    return {
      requestedDays,
      childAge,
      measureType,
    };
  }
}
