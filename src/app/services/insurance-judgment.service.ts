import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { RulesConfigService } from './rules-config.service';
import {
  InsuranceJudgmentConfig,
  QuestionFlowConfig,
  QuestionConfig,
  NextQuestionRule,
} from '../models/insurance-rules.model';

export interface InsuranceEligibility {
  healthInsurance: { eligible: boolean; reason: string };
  pensionInsurance: { eligible: boolean; reason: string };
  careInsurance?: { eligible: boolean; reason: string };
}

export interface EmployeeInfo {
  age: number;
  employmentType: string;
  answers: Record<string, string>;
}

export interface QuestionFlowResult {
  currentQuestion: QuestionConfig | null;
  isCompleted: boolean;
  nextQuestionId?: string;
}

@Injectable({
  providedIn: 'root',
})
export class InsuranceJudgmentService {
  constructor(private rulesConfigService: RulesConfigService) {}

  /**
   * 社会保険判定を実行（設定テーブル方式）
   */
  async executeJudgment(employeeInfo: EmployeeInfo): Promise<InsuranceEligibility> {
    try {
      // 1. 該当する判定ルール設定を取得
      const judgmentConfig = await this.rulesConfigService.getJudgmentConfigByEmploymentType(
        employeeInfo.employmentType
      );

      if (!judgmentConfig) {
        throw new Error(
          `No judgment configuration found for employment type: ${employeeInfo.employmentType}`
        );
      }

      // 2. 各保険の判定を実行
      const healthInsurance = await this.evaluateInsurance(
        'healthInsurance',
        judgmentConfig,
        employeeInfo
      );

      const pensionInsurance = await this.evaluateInsurance(
        'pensionInsurance',
        judgmentConfig,
        employeeInfo
      );

      const careInsurance = this.evaluateCareInsurance(employeeInfo.age);

      return {
        healthInsurance,
        pensionInsurance,
        careInsurance,
      };
    } catch (error) {
      console.error('Insurance judgment execution failed:', error);

      // フォールバック処理
      return {
        healthInsurance: { eligible: false, reason: '判定処理中にエラーが発生しました' },
        pensionInsurance: { eligible: false, reason: '判定処理中にエラーが発生しました' },
        careInsurance: { eligible: false, reason: '判定処理中にエラーが発生しました' },
      };
    }
  }

  /**
   * 個別保険の判定評価（設定テーブルベース）
   */
  private async evaluateInsurance(
    insuranceType: 'healthInsurance' | 'pensionInsurance',
    config: InsuranceJudgmentConfig,
    employeeInfo: EmployeeInfo
  ): Promise<{ eligible: boolean; reason: string }> {
    // 該当する保険タイプのルールを取得
    const insuranceRule = config.judgmentRules.find((rule) => rule.insuranceType === insuranceType);

    if (!insuranceRule) {
      return { eligible: false, reason: `${insuranceType}の判定ルールが見つかりません` };
    }

    // 優先度順にソートして条件評価
    const sortedConditions = [...insuranceRule.conditions].sort((a, b) => a.priority - b.priority);

    for (const condition of sortedConditions) {
      // 年齢制限チェック
      const ageCheck = this.rulesConfigService.checkAgeRestriction(condition, employeeInfo.age);
      if (!ageCheck.passed) {
        return { eligible: false, reason: ageCheck.reason || '年齢制限により対象外' };
      }

      // 回答条件の評価
      const conditionsMatch = this.rulesConfigService.evaluateConditions(
        condition.conditions,
        employeeInfo.answers
      );

      if (conditionsMatch) {
        // テンプレートからの理由生成（設定されている場合）
        if (condition.result.templateId) {
          const reason = await this.rulesConfigService.generateReason(
            condition.result.templateId,
            condition.result.reasonParams || {}
          );
          return { eligible: condition.result.eligible, reason };
        }

        return condition.result;
      }
    }

    // どの条件にもマッチしない場合のデフォルト
    return { eligible: false, reason: '判定条件が不明' };
  }

  /**
   * 介護保険の判定（年齢ベース、設定可能に拡張予定）
   */
  private evaluateCareInsurance(age: number): { eligible: boolean; reason: string } {
    // 将来的には設定テーブル化する予定
    const isEligible = age >= 40 && age < 65;
    return {
      eligible: isEligible,
      reason: isEligible
        ? '40歳以上65歳未満のため加入対象'
        : '40歳未満または65歳以上のため加入対象外',
    };
  }

  /**
   * 質問フローの次の質問を取得（設定テーブル方式）
   */
  async getNextQuestion(
    currentQuestionId: string,
    answer: string,
    answers: Record<string, string>
  ): Promise<QuestionFlowResult> {
    try {
      const flowConfig = await this.rulesConfigService.getQuestionFlowConfig();
      const currentQuestion = flowConfig.questions.find((q) => q.id === currentQuestionId);

      if (!currentQuestion) {
        return { currentQuestion: null, isCompleted: true };
      }

      // 回答に基づく次の質問の決定
      const nextQuestionRule = this.findMatchingNextQuestionRule(
        currentQuestion.nextQuestions,
        answer,
        answers
      );

      if (!nextQuestionRule || nextQuestionRule.isEndCondition) {
        return { currentQuestion: null, isCompleted: true };
      }

      const nextQuestion = flowConfig.questions.find(
        (q) => q.id === nextQuestionRule.nextQuestionId
      );

      return {
        currentQuestion: nextQuestion || null,
        isCompleted: !nextQuestion,
        nextQuestionId: nextQuestionRule.nextQuestionId,
      };
    } catch (error) {
      console.error('Error getting next question:', error);
      return { currentQuestion: null, isCompleted: true };
    }
  }

  /**
   * 次の質問ルールのマッチング
   */
  private findMatchingNextQuestionRule(
    rules: NextQuestionRule[],
    answer: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _allAnswers: Record<string, string>
  ): NextQuestionRule | null {
    for (const rule of rules) {
      switch (rule.conditionType) {
        case 'equals':
          if (answer === rule.conditionValue) {
            return rule;
          }
          break;

        case 'contains':
          if (Array.isArray(rule.conditionValue) && rule.conditionValue.includes(answer)) {
            return rule;
          }
          break;

        case 'range':
          // 複合条件や範囲条件（将来拡張）
          // 現在は基本的な equals のみ対応
          break;
      }
    }

    return null;
  }

  /**
   * 初期質問を取得
   */
  async getInitialQuestion(): Promise<QuestionConfig | null> {
    try {
      const flowConfig = await this.rulesConfigService.getQuestionFlowConfig();
      return flowConfig.questions.find((q) => q.id === flowConfig.initialQuestionId) || null;
    } catch (error) {
      console.error('Error getting initial question:', error);
      return null;
    }
  }

  /**
   * 質問フロー全体を取得
   */
  async getQuestionFlow(): Promise<QuestionFlowConfig | null> {
    try {
      return await this.rulesConfigService.getQuestionFlowConfig();
    } catch (error) {
      console.error('Error getting question flow:', error);
      return null;
    }
  }

  /**
   * 利用可能な雇用形態一覧を取得
   */
  async getAvailableEmploymentTypes(): Promise<{ value: string; label: string }[]> {
    try {
      const masterData = await this.rulesConfigService.getMasterData();
      const employmentTypes = masterData['employment-types'];

      if (!employmentTypes) {
        // フォールバック
        return [
          { value: 'regular', label: '正社員（役員含む）' },
          { value: 'part-time', label: 'パートタイム・アルバイト（短時間労働者）' },
          { value: 'contract', label: '契約社員' },
          { value: 'manual', label: '手入力（管理者判断による操作）' },
        ];
      }

      return employmentTypes.items.map((item) => ({
        value: item.value,
        label: item.label,
      }));
    } catch (error) {
      console.error('Error getting employment types:', error);
      // フォールバック
      return [
        { value: 'regular', label: '正社員（役員含む）' },
        { value: 'part-time', label: 'パートタイム・アルバイト（短時間労働者）' },
        { value: 'contract', label: '契約社員' },
        { value: 'manual', label: '手入力（管理者判断による操作）' },
      ];
    }
  }

  /**
   * ルール設定の更新通知を監視
   */
  watchRuleUpdates(): Observable<boolean> {
    return this.rulesConfigService.watchConfigChanges();
  }

  /**
   * 判定結果のサマリー生成
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  generateJudgmentSummary(result: InsuranceEligibility, _employeeInfo: EmployeeInfo): string {
    const eligibleInsurances: string[] = [];

    if (result.healthInsurance.eligible) {
      eligibleInsurances.push('健康保険');
    }

    if (result.pensionInsurance.eligible) {
      eligibleInsurances.push('厚生年金保険');
    }

    if (result.careInsurance?.eligible) {
      eligibleInsurances.push('介護保険');
    }

    if (eligibleInsurances.length === 0) {
      return '社会保険の加入対象外です';
    }

    return `${eligibleInsurances.join('・')}の加入対象です`;
  }

  /**
   * 判定ルールの適用可能性チェック
   */
  async validateRuleApplicability(
    employmentType: string,
    answers: Record<string, string>
  ): Promise<{ isValid: boolean; missingAnswers: string[] }> {
    try {
      const config =
        await this.rulesConfigService.getJudgmentConfigByEmploymentType(employmentType);

      if (!config) {
        return { isValid: false, missingAnswers: ['雇用形態'] };
      }

      // 必要な回答がすべて揃っているかチェック
      const requiredQuestions = new Set<string>();

      config.judgmentRules.forEach((rule) => {
        rule.conditions.forEach((condition) => {
          condition.conditions.forEach((expr) => {
            requiredQuestions.add(expr.questionId);
          });
        });
      });

      const missingAnswers = Array.from(requiredQuestions).filter(
        (questionId) => !answers[questionId]
      );

      return {
        isValid: missingAnswers.length === 0,
        missingAnswers,
      };
    } catch (error) {
      console.error('Error validating rule applicability:', error);
      return { isValid: false, missingAnswers: ['validation-error'] };
    }
  }
}
