import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
} from 'firebase/firestore';

import {
  QuestionFlowConfig,
  InsuranceJudgmentConfig,
  ValidationConfig,
  CalculationConfig,
  ReasonTemplate,
  MasterDataConfig,
  JudgmentCondition,
  ConditionExpression,
} from '../models/insurance-rules.model';

interface CachedConfig<T> {
  data: T;
  timestamp: number;
  version: string;
}

@Injectable({
  providedIn: 'root',
})
export class RulesConfigService {
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5分
  private firestore = getFirestore();

  // キャッシュ管理
  private questionFlowCache$ = new BehaviorSubject<CachedConfig<QuestionFlowConfig> | null>(null);
  private judgmentRulesCache$ = new BehaviorSubject<CachedConfig<InsuranceJudgmentConfig[]> | null>(
    null
  );
  private validationRulesCache$ = new BehaviorSubject<CachedConfig<ValidationConfig[]> | null>(
    null
  );
  private calculationRulesCache$ = new BehaviorSubject<CachedConfig<CalculationConfig[]> | null>(
    null
  );
  private reasonTemplatesCache$ = new BehaviorSubject<CachedConfig<ReasonTemplate[]> | null>(null);
  private masterDataCache$ = new BehaviorSubject<CachedConfig<
    Record<string, MasterDataConfig>
  > | null>(null);

  /**
   * 質問フロー設定を取得
   */
  async getQuestionFlowConfig(): Promise<QuestionFlowConfig> {
    const cached = this.questionFlowCache$.value;
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }

    try {
      const q = query(
        collection(this.firestore, 'questionFlowConfigs'),
        where('active', '==', true),
        orderBy('version', 'desc'),
        limit(1)
      );

      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        throw new Error('No active question flow configuration found');
      }

      const data = snapshot.docs[0].data() as QuestionFlowConfig;

      // キャッシュに保存
      this.questionFlowCache$.next({
        data,
        timestamp: Date.now(),
        version: data.version,
      });

      return data;
    } catch (error) {
      console.error('Error loading question flow config:', error);
      throw error;
    }
  }

  /**
   * 保険判定ルール設定を取得
   */
  async getInsuranceJudgmentConfigs(): Promise<InsuranceJudgmentConfig[]> {
    const cached = this.judgmentRulesCache$.value;
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }

    try {
      const q = query(
        collection(this.firestore, 'insuranceJudgmentConfigs'),
        where('active', '==', true),
        orderBy('employmentType')
      );

      const snapshot = await getDocs(q);
      const configs = snapshot.docs.map((doc) => doc.data() as InsuranceJudgmentConfig);

      // キャッシュに保存
      this.judgmentRulesCache$.next({
        data: configs,
        timestamp: Date.now(),
        version: configs[0]?.version || '1.0.0',
      });

      return configs;
    } catch (error) {
      console.error('Error loading insurance judgment configs:', error);
      throw error;
    }
  }

  /**
   * 特定の雇用形態の判定ルールを取得
   */
  async getJudgmentConfigByEmploymentType(
    employmentType: string
  ): Promise<InsuranceJudgmentConfig | null> {
    const configs = await this.getInsuranceJudgmentConfigs();
    return configs.find((config) => config.employmentType === employmentType) || null;
  }

  /**
   * バリデーションルール設定を取得
   */
  async getValidationConfigs(): Promise<ValidationConfig[]> {
    const cached = this.validationRulesCache$.value;
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }

    try {
      const q = query(collection(this.firestore, 'validationConfigs'), where('active', '==', true));

      const snapshot = await getDocs(q);
      const configs = snapshot.docs.map((doc) => doc.data() as ValidationConfig);

      // キャッシュに保存
      this.validationRulesCache$.next({
        data: configs,
        timestamp: Date.now(),
        version: configs[0]?.version || '1.0.0',
      });

      return configs;
    } catch (error) {
      console.error('Error loading validation configs:', error);
      throw error;
    }
  }

  /**
   * 特定のタイプのバリデーションルールを取得
   */
  async getValidationConfigByType(targetType: string): Promise<ValidationConfig | null> {
    const configs = await this.getValidationConfigs();
    return configs.find((config) => config.targetType === targetType) || null;
  }

  /**
   * 計算ルール設定を取得
   */
  async getCalculationConfigs(): Promise<CalculationConfig[]> {
    const cached = this.calculationRulesCache$.value;
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }

    try {
      const q = query(
        collection(this.firestore, 'calculationConfigs'),
        where('active', '==', true)
      );

      const snapshot = await getDocs(q);
      const configs = snapshot.docs.map((doc) => doc.data() as CalculationConfig);

      // キャッシュに保存
      this.calculationRulesCache$.next({
        data: configs,
        timestamp: Date.now(),
        version: configs[0]?.version || '1.0.0',
      });

      return configs;
    } catch (error) {
      console.error('Error loading calculation configs:', error);
      throw error;
    }
  }

  /**
   * 理由テンプレートを取得
   */
  async getReasonTemplates(): Promise<ReasonTemplate[]> {
    const cached = this.reasonTemplatesCache$.value;
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }

    try {
      const snapshot = await getDocs(collection(this.firestore, 'reasonTemplates'));
      const templates = snapshot.docs.map((doc) => doc.data() as ReasonTemplate);

      // キャッシュに保存
      this.reasonTemplatesCache$.next({
        data: templates,
        timestamp: Date.now(),
        version: '1.0.0',
      });

      return templates;
    } catch (error) {
      console.error('Error loading reason templates:', error);
      throw error;
    }
  }

  /**
   * 理由テンプレートから理由文を生成
   */
  async generateReason(templateId: string, params: Record<string, string>): Promise<string> {
    const templates = await this.getReasonTemplates();
    const template = templates.find((t) => t.id === templateId);

    if (!template) {
      return '判定理由が見つかりません';
    }

    let reason = template.templateText;
    template.parameters.forEach((param) => {
      const value = params[param] || `{${param}}`;
      reason = reason.replace(new RegExp(`{${param}}`, 'g'), value);
    });

    return reason;
  }

  /**
   * マスタデータを取得
   */
  async getMasterData(): Promise<Record<string, MasterDataConfig>> {
    const cached = this.masterDataCache$.value;
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }

    try {
      const snapshot = await getDocs(collection(this.firestore, 'masterData'));
      const masterData: Record<string, MasterDataConfig> = {};

      snapshot.docs.forEach((doc) => {
        const data = doc.data() as MasterDataConfig;
        masterData[data.type] = data;
      });

      // キャッシュに保存
      this.masterDataCache$.next({
        data: masterData,
        timestamp: Date.now(),
        version: '1.0.0',
      });

      return masterData;
    } catch (error) {
      console.error('Error loading master data:', error);
      throw error;
    }
  }

  /**
   * 判定条件の評価
   */
  evaluateConditions(conditions: ConditionExpression[], answers: Record<string, string>): boolean {
    return conditions.every((condition) => {
      const answerValue = answers[condition.questionId];

      switch (condition.operator) {
        case 'equals':
          return answerValue === condition.value;
        case 'not_equals':
          return answerValue !== condition.value;
        case 'contains':
          if (Array.isArray(condition.value)) {
            return condition.value.includes(answerValue);
          }
          return answerValue?.includes(condition.value as string);
        default:
          return false;
      }
    });
  }

  /**
   * 年齢制限チェック
   */
  checkAgeRestriction(
    condition: JudgmentCondition,
    age: number
  ): { passed: boolean; reason?: string } {
    const restriction = condition.ageRestrictions;
    if (!restriction) {
      return { passed: true };
    }

    const { minAge, maxAge, inclusiveMin = true, inclusiveMax = false } = restriction;

    if (minAge !== undefined) {
      const isValid = inclusiveMin ? age >= minAge : age > minAge;
      if (!isValid) {
        return {
          passed: false,
          reason: `年齢が${minAge}歳${inclusiveMin ? '以上' : '超'}の条件を満たしません`,
        };
      }
    }

    if (maxAge !== undefined) {
      const isValid = inclusiveMax ? age <= maxAge : age < maxAge;
      if (!isValid) {
        return {
          passed: false,
          reason: `年齢が${maxAge}歳${inclusiveMax ? '以下' : '未満'}の条件を満たしません`,
        };
      }
    }

    return { passed: true };
  }

  /**
   * キャッシュの有効性チェック
   */
  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_DURATION;
  }

  /**
   * キャッシュクリア
   */
  clearCache(): void {
    this.questionFlowCache$.next(null);
    this.judgmentRulesCache$.next(null);
    this.validationRulesCache$.next(null);
    this.calculationRulesCache$.next(null);
    this.reasonTemplatesCache$.next(null);
    this.masterDataCache$.next(null);
  }

  /**
   * 設定の変更監視（リアルタイム更新用）
   */
  watchConfigChanges(): Observable<boolean> {
    return combineLatest([
      this.questionFlowCache$,
      this.judgmentRulesCache$,
      this.validationRulesCache$,
    ]).pipe(map(([qf, jr, vr]) => !!(qf && jr && vr)));
  }
}
