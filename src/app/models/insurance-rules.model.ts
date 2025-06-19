// 設定テーブル方式の判定ルール定義
export interface RuleConfiguration {
  id: string;
  name: string;
  version: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// 質問フロー設定テーブル
export interface QuestionFlowConfig extends RuleConfiguration {
  questions: QuestionConfig[];
  initialQuestionId: string;
}

export interface QuestionConfig {
  id: string;
  text: string;
  type: 'yesno' | 'choice' | 'date-range';
  choices?: ChoiceOption[];
  nextQuestions: NextQuestionRule[];
  validationRules?: ValidationRuleSet[];
}

export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
}

export interface NextQuestionRule {
  conditionType: 'equals' | 'contains' | 'range';
  conditionValue: string | string[];
  nextQuestionId: string;
  isEndCondition?: boolean;
}

// 保険判定ルール設定テーブル
export interface InsuranceJudgmentConfig extends RuleConfiguration {
  employmentType: string;
  judgmentRules: InsuranceTypeRule[];
}

export interface InsuranceTypeRule {
  insuranceType: 'healthInsurance' | 'pensionInsurance' | 'careInsurance';
  conditions: JudgmentCondition[];
}

export interface JudgmentCondition {
  id: string;
  priority: number;
  conditions: ConditionExpression[];
  result: JudgmentResult;
  ageRestrictions?: AgeRestriction;
}

export interface ConditionExpression {
  questionId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'and' | 'or';
  value: string | string[];
}

export interface JudgmentResult {
  eligible: boolean;
  reason: string;
  templateId?: string;
  reasonParams?: Record<string, string>;
}

export interface AgeRestriction {
  minAge?: number;
  maxAge?: number;
  inclusiveMin?: boolean;
  inclusiveMax?: boolean;
}

// バリデーションルール設定テーブル
export interface ValidationConfig extends RuleConfiguration {
  targetType: 'maternity-leave' | 'childcare-leave' | 'papa-leave' | 'extended-1-6' | 'extended-2';
  rules: ValidationRuleSet[];
}

export interface ValidationRuleSet {
  ruleType: 'required' | 'date-range' | 'duration' | 'age-based' | 'custom';
  field: string;
  conditions: ValidationCondition[];
  errorMessage: string;
  warningMessage?: string;
}

export interface ValidationCondition {
  type: 'min' | 'max' | 'equals' | 'not_equals' | 'before' | 'after' | 'between';
  value: string | number | Date;
  dependsOn?: string; // 他のフィールドに依存する場合
}

// 計算ルール設定テーブル
export interface CalculationConfig extends RuleConfiguration {
  calculationType: 'maternity-period' | 'childcare-period' | 'exemption-period';
  formula: CalculationFormula;
  parameters: CalculationParameter[];
}

export interface CalculationFormula {
  id: string;
  name: string;
  expression: string; // 計算式（JSONpath形式など）
  resultFormat: string;
}

export interface CalculationParameter {
  name: string;
  type: 'date' | 'number' | 'string' | 'boolean';
  defaultValue?: string | number | boolean | Date;
  required: boolean;
}

// 理由テンプレート設定テーブル
export interface ReasonTemplate {
  id: string;
  templateText: string;
  parameters: string[];
  category: 'eligible' | 'not-eligible' | 'warning';
}

// マスタデータ設定テーブル
export interface MasterDataConfig {
  type: 'employment-types' | 'extension-reasons' | 'childcare-types';
  items: MasterDataItem[];
  version: string;
  updatedAt: Date;
}

export interface MasterDataItem {
  value: string;
  label: string;
  description?: string;
  validFrom?: Date;
  validTo?: Date;
  metadata?: Record<string, string | number | boolean>;
}
