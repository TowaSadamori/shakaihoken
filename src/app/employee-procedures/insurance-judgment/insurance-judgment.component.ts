import { Component, OnInit } from '@angular/core';
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
}

interface SpecialCaseDetails {
  // 社会保障協定関連
  agreementType?: string;
  partnerCountry?: string;
  hasCertificate?: string;
  certificateNumber?: string;
  certificateStartDate?: string;
  certificateEndDate?: string;
  foreignSocialSecurityNumber?: string;
  pensionExemption?: boolean;
  healthInsuranceExemption?: boolean;

  // 共通
  remarks?: string;
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
    this.selectedSpecialCases = []; // 特殊事例もリセット
    this.initializeSpecialCases(); // 初期状態に戻す
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
    } catch (error) {
      console.error('保存済み判定結果の読み込みに失敗しました:', error);
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
  }

  removeSpecialCase(index: number) {
    if (this.selectedSpecialCases.length > 1) {
      this.selectedSpecialCases.splice(index, 1);
    }
  }

  onSpecialCaseTypeChange(index: number) {
    // 事例タイプが変更されたら詳細をリセット
    this.selectedSpecialCases[index].details = {};
  }

  getPlaceholderText(caseType: string): string {
    const placeholders: Record<string, string> = {
      'leave-without-pay': '休職期間、無給期間の保険料徴収方法など',
      secondment: '出向先企業名、指揮命令関係、給与支払い実態など',
      'multiple-workplace': '勤務事業所名、各事業所での報酬額など',
      'same-day-acquisition-loss': '同日得喪の理由、特例適用の有無など',
      'childcare-end-salary-change': '育児休業終了日、子の年齢、報酬変更の詳細など',
      'maternity-end-salary-change': '産前産後休業終了日、報酬変更の詳細など',
      'overseas-dependent': '被扶養者の居住国、認定に必要な添付書類など',
      'trial-period': '試用期間の長さ、正規雇用への移行予定など',
    };
    return placeholders[caseType] || '詳細情報を入力してください';
  }

  // 特殊事例の初期化
  private initializeSpecialCases() {
    if (this.selectedSpecialCases.length === 0) {
      this.selectedSpecialCases.push({
        type: '',
        details: {},
      });
    }
  }
}
