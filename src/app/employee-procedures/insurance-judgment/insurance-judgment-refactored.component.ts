import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { UserService } from '../../services/user.service';
import {
  InsuranceJudgmentService,
  InsuranceEligibility,
  EmployeeInfo,
} from '../../services/insurance-judgment.service';
import { RulesConfigService } from '../../services/rules-config.service';
import { QuestionConfig } from '../../models/insurance-rules.model';
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

interface Office {
  code: string;
  name: string;
  address: string;
  addressPrefecture: string;
  branchNumber: number;
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
}

@Component({
  selector: 'app-insurance-judgment-refactored',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="insurance-judgment-container">
      <!-- ヘッダー情報 -->
      <div class="employee-info-section">
        <h2>社会保険加入判定</h2>
        <div class="employee-details">
          <div class="info-item">
            <span class="info-label">従業員名:</span>
            <span>{{ employeeName }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">従業員番号:</span>
            <span>{{ employeeNumber }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">生年月日:</span>
            <span>{{ birthDate }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">年齢:</span>
            <span>{{ age }}歳</span>
          </div>
          <div class="info-item">
            <span class="info-label">事業所番号:</span>
            <span>{{ officeNumber }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">事業所所在地:</span>
            <span>{{ officePrefecture }}</span>
          </div>
        </div>
      </div>

      <!-- 質問セクション -->
      <div class="questionnaire-section" *ngIf="showQuestionnaire && currentQuestion">
        <div class="question-card">
          <div class="question-header">
            <h3>質問 {{ getQuestionNumber() }}</h3>
            <button
              type="button"
              class="btn-secondary btn-sm"
              *ngIf="canGoToPreviousQuestion"
              (click)="goToPreviousQuestion()"
            >
              ← 前の質問に戻る
            </button>
          </div>

          <div class="question-content">
            <p class="question-text">{{ currentQuestion.text }}</p>

            <!-- Yes/No質問 -->
            <div class="answer-options" *ngIf="currentQuestion.type === 'yesno'">
              <label class="radio-option">
                <input
                  type="radio"
                  [name]="'question_' + currentQuestion.id"
                  value="yes"
                  [(ngModel)]="answers[currentQuestion.id]"
                  (change)="onAnswerChange()"
                />
                <span>はい</span>
              </label>
              <label class="radio-option">
                <input
                  type="radio"
                  [name]="'question_' + currentQuestion.id"
                  value="no"
                  [(ngModel)]="answers[currentQuestion.id]"
                  (change)="onAnswerChange()"
                />
                <span>いいえ</span>
              </label>
            </div>

            <!-- 選択肢質問 -->
            <div class="answer-options" *ngIf="currentQuestion.type === 'choice'">
              <label class="radio-option" *ngFor="let choice of currentQuestion.choices">
                <input
                  type="radio"
                  [name]="'question_' + currentQuestion.id"
                  [value]="choice.value"
                  [(ngModel)]="answers[currentQuestion.id]"
                  (change)="onAnswerChange()"
                />
                <span>{{ choice.label }}</span>
                <small *ngIf="choice.description" class="choice-description">
                  {{ choice.description }}
                </small>
              </label>
            </div>

            <!-- 日付範囲質問 -->
            <div class="date-range-inputs" *ngIf="currentQuestion.type === 'date-range'">
              <div class="date-input-group">
                <label for="startDate">開始日:</label>
                <input
                  type="date"
                  id="startDate"
                  [ngModel]="dateRangeAnswers[currentQuestion.id]?.startDate"
                  (ngModelChange)="updateDateRange('startDate', $event)"
                  (change)="onDateRangeChange()"
                />
              </div>
              <div class="date-input-group">
                <label for="endDate">終了日:</label>
                <input
                  type="date"
                  id="endDate"
                  [ngModel]="dateRangeAnswers[currentQuestion.id]?.endDate"
                  (ngModelChange)="updateDateRange('endDate', $event)"
                  (change)="onDateRangeChange()"
                />
              </div>
            </div>
          </div>

          <div class="question-actions">
            <button
              type="button"
              class="btn-primary"
              [disabled]="!isAnswerComplete()"
              (click)="proceedToNext()"
            >
              次へ進む
            </button>
          </div>
        </div>
      </div>

      <!-- 判定結果セクション -->
      <div class="judgment-result-section" *ngIf="!showQuestionnaire && judgmentResult">
        <h3>判定結果</h3>

        <div class="result-summary">
          <div class="summary-text">
            {{ getJudgmentSummary() }}
          </div>
        </div>

        <div class="insurance-details">
          <!-- 健康保険 -->
          <div class="insurance-item" [class.eligible]="judgmentResult.healthInsurance.eligible">
            <div class="insurance-header">
              <h4>健康保険</h4>
              <span class="status-badge" [class.eligible]="judgmentResult.healthInsurance.eligible">
                {{ judgmentResult.healthInsurance.eligible ? '加入対象' : '加入対象外' }}
              </span>
            </div>
            <p class="reason">{{ judgmentResult.healthInsurance.reason }}</p>
          </div>

          <!-- 厚生年金保険 -->
          <div class="insurance-item" [class.eligible]="judgmentResult.pensionInsurance.eligible">
            <div class="insurance-header">
              <h4>厚生年金保険</h4>
              <span
                class="status-badge"
                [class.eligible]="judgmentResult.pensionInsurance.eligible"
              >
                {{ judgmentResult.pensionInsurance.eligible ? '加入対象' : '加入対象外' }}
              </span>
            </div>
            <p class="reason">{{ judgmentResult.pensionInsurance.reason }}</p>
          </div>

          <!-- 介護保険 -->
          <div
            class="insurance-item"
            [class.eligible]="judgmentResult.careInsurance.eligible"
            *ngIf="judgmentResult.careInsurance"
          >
            <div class="insurance-header">
              <h4>介護保険</h4>
              <span class="status-badge" [class.eligible]="judgmentResult.careInsurance.eligible">
                {{ judgmentResult.careInsurance.eligible ? '加入対象' : '加入対象外' }}
              </span>
            </div>
            <p class="reason">{{ judgmentResult.careInsurance.reason }}</p>
          </div>
        </div>

        <!-- アクションボタン -->
        <div class="action-buttons">
          <button
            type="button"
            class="btn-primary"
            (click)="saveJudgment()"
            [disabled]="isJudgmentSaved"
          >
            {{ isJudgmentSaved ? '保存済み' : '判定結果を保存' }}
          </button>
          <button type="button" class="btn-secondary" (click)="resetQuestionnaire()">再判定</button>
          <button type="button" class="btn-outline" (click)="goBack()">戻る</button>
        </div>
      </div>

      <!-- 開始ボタン（初期表示） -->
      <div class="start-section" *ngIf="!showQuestionnaire && !judgmentResult">
        <div class="start-card">
          <h3>社会保険加入判定を開始します</h3>
          <p>従業員の雇用形態や労働条件について質問にお答えください。</p>
          <button type="button" class="btn-primary btn-lg" (click)="startQuestionnaire()">
            判定を開始
          </button>
        </div>
      </div>

      <!-- ローディング状態 -->
      <div class="loading-section" *ngIf="isLoading">
        <div class="loading-spinner"></div>
        <p>設定を読み込んでいます...</p>
      </div>

      <!-- エラー表示 -->
      <div class="error-section" *ngIf="errorMessage">
        <div class="error-card">
          <h4>エラーが発生しました</h4>
          <p>{{ errorMessage }}</p>
          <button type="button" class="btn-secondary" (click)="retryInitialization()">
            再試行
          </button>
        </div>
      </div>

      <!-- デバッグ情報（開発時のみ） -->
      <div class="debug-section" *ngIf="showDebugInfo">
        <h4>デバッグ情報</h4>
        <div class="debug-item">
          <strong>現在の回答:</strong>
          <pre>{{ answers | json }}</pre>
        </div>
        <div class="debug-item" *ngIf="questionHistory.length > 0">
          <strong>質問履歴:</strong>
          <pre>{{ questionHistory | json }}</pre>
        </div>
      </div>
    </div>
  `,
  styleUrl: './insurance-judgment.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class InsuranceJudgmentRefactoredComponent implements OnInit {
  // 従業員情報
  employeeName = '';
  employeeNumber = '';
  birthDate = '';
  age = 0;
  officeNumber = '';
  officePrefecture = '';

  // 質問応答状態
  showQuestionnaire = false;
  currentQuestion: QuestionConfig | null = null;
  answers: Record<string, string> = {};
  dateRangeAnswers: Record<string, { startDate: string; endDate: string } | undefined> = {};
  questionHistory: string[] = [];

  // 判定結果
  judgmentResult: InsuranceEligibility | null = null;
  isJudgmentSaved = false;

  // UI状態
  isLoading = false;
  errorMessage = '';
  showDebugInfo = false; // 開発時のみtrue

  // その他
  currentUid = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private userService: UserService,
    private insuranceJudgmentService: InsuranceJudgmentService,
    private rulesConfigService: RulesConfigService
  ) {}

  async ngOnInit() {
    this.isLoading = true;
    this.errorMessage = '';

    try {
      const uid = this.route.snapshot.paramMap.get('uid');
      if (!uid) {
        throw new Error('UID not found in route');
      }

      this.currentUid = uid;

      // 並列でデータを取得
      await Promise.all([this.loadUserData(uid), this.loadSavedJudgment()]);
    } catch (error) {
      console.error('初期化エラー:', error);
      this.errorMessage = 'データの読み込みに失敗しました。';
    } finally {
      this.isLoading = false;
    }
  }

  private async loadUserData(uid: string): Promise<void> {
    const user = await this.userService.getUserByUid(uid);
    if (!user) {
      throw new Error('User not found');
    }

    // ユーザー情報を設定
    this.employeeName = `${user.lastName || ''} ${user.firstName || ''}`.trim();
    this.employeeNumber = user.employeeNumber || '';
    this.birthDate = user.birthDate || '';

    // 年齢計算
    if (user.birthDate) {
      this.age = this.calculateAge(new Date(user.birthDate));
    }

    // 事業所情報を取得
    if (user.branchNumber && user.companyId) {
      const office = await this.getOfficeInfo(user.companyId, user.branchNumber);
      if (office) {
        this.officeNumber = office.branchNumber.toString();
        this.officePrefecture = office.addressPrefecture;
      }
    }
  }

  private calculateAge(birthDate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
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

  async startQuestionnaire(): Promise<void> {
    this.isLoading = true;
    try {
      this.currentQuestion = await this.insuranceJudgmentService.getInitialQuestion();
      if (this.currentQuestion) {
        this.showQuestionnaire = true;
        this.questionHistory = [this.currentQuestion.id];
      } else {
        throw new Error('初期質問の取得に失敗しました');
      }
    } catch (error) {
      console.error('質問開始エラー:', error);
      this.errorMessage = '質問の開始に失敗しました。';
    } finally {
      this.isLoading = false;
    }
  }

  onAnswerChange(): void {
    // 回答変更時の処理（バリデーション等）
  }

  updateDateRange(field: 'startDate' | 'endDate', value: string): void {
    if (this.currentQuestion) {
      // dateRangeAnswersの初期化
      if (!this.dateRangeAnswers[this.currentQuestion.id]) {
        this.dateRangeAnswers[this.currentQuestion.id] = { startDate: '', endDate: '' };
      }

      const range = this.dateRangeAnswers[this.currentQuestion.id];
      if (range) {
        range[field] = value;

        // 両方の日付が入力されたら回答を設定
        if (range.startDate && range.endDate) {
          this.answers[this.currentQuestion.id] = 'custom';
        }
      }
    }
  }

  onDateRangeChange(): void {
    if (this.currentQuestion) {
      // dateRangeAnswersの初期化
      if (!this.dateRangeAnswers[this.currentQuestion.id]) {
        this.dateRangeAnswers[this.currentQuestion.id] = { startDate: '', endDate: '' };
      }

      const range = this.dateRangeAnswers[this.currentQuestion.id];
      if (range && range.startDate && range.endDate) {
        this.answers[this.currentQuestion.id] = 'custom';
      }
    }
  }

  isAnswerComplete(): boolean {
    if (!this.currentQuestion) return false;

    if (this.currentQuestion.type === 'date-range') {
      const range = this.dateRangeAnswers[this.currentQuestion.id];
      return !!(range && range.startDate && range.endDate);
    }

    return !!this.answers[this.currentQuestion.id];
  }

  async proceedToNext(): Promise<void> {
    if (!this.currentQuestion || !this.isAnswerComplete()) return;

    this.isLoading = true;
    try {
      const currentAnswer = this.answers[this.currentQuestion.id];
      const result = await this.insuranceJudgmentService.getNextQuestion(
        this.currentQuestion.id,
        currentAnswer,
        this.answers
      );

      if (result.isCompleted) {
        // 判定実行
        await this.executeJudgment();
      } else if (result.currentQuestion) {
        // 次の質問に進む
        this.currentQuestion = result.currentQuestion;
        this.questionHistory.push(result.currentQuestion.id);
      }
    } catch (error) {
      console.error('次の質問取得エラー:', error);
      this.errorMessage = '次の質問の取得に失敗しました。';
    } finally {
      this.isLoading = false;
    }
  }

  async executeJudgment(): Promise<void> {
    try {
      // 雇用形態が設定されていない場合はエラー
      if (!this.answers['employmentType']) {
        throw new Error('雇用形態が選択されていません');
      }

      const employeeInfo: EmployeeInfo = {
        age: this.age,
        employmentType: this.answers['employmentType'],
        answers: this.answers,
      };

      this.judgmentResult = await this.insuranceJudgmentService.executeJudgment(employeeInfo);
      this.showQuestionnaire = false;
    } catch (error) {
      console.error('判定実行エラー:', error);
      this.errorMessage = '判定の実行に失敗しました。';
    }
  }

  goToPreviousQuestion(): void {
    if (this.questionHistory.length <= 1) return;

    // 現在の質問の回答を削除
    if (this.currentQuestion) {
      delete this.answers[this.currentQuestion.id];
      delete this.dateRangeAnswers[this.currentQuestion.id];
    }

    // 履歴から前の質問を取得
    this.questionHistory.pop(); // 現在の質問を削除
    const previousQuestionId = this.questionHistory[this.questionHistory.length - 1];

    // 前の質問を設定（実際には設定から再取得が必要）
    this.loadQuestionById(previousQuestionId);
  }

  private async loadQuestionById(questionId: string): Promise<void> {
    try {
      const flow = await this.insuranceJudgmentService.getQuestionFlow();
      this.currentQuestion = flow?.questions.find((q) => q.id === questionId) || null;
    } catch (error) {
      console.error('質問読み込みエラー:', error);
    }
  }

  get canGoToPreviousQuestion(): boolean {
    return this.questionHistory.length > 1;
  }

  getQuestionNumber(): number {
    return this.questionHistory.length;
  }

  resetQuestionnaire(): void {
    this.answers = {};
    this.dateRangeAnswers = {};
    this.questionHistory = [];
    this.judgmentResult = null;
    this.isJudgmentSaved = false;
    this.showQuestionnaire = false;
    this.currentQuestion = null;
  }

  getJudgmentSummary(): string {
    if (!this.judgmentResult) return '';

    const employeeInfo: EmployeeInfo = {
      age: this.age,
      employmentType: this.answers['employmentType'] || '',
      answers: this.answers,
    };

    return this.insuranceJudgmentService.generateJudgmentSummary(this.judgmentResult, employeeInfo);
  }

  async saveJudgment(): Promise<void> {
    if (!this.judgmentResult || !this.currentUid) return;

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
      };

      const docRef = doc(firestore, 'insuranceJudgments', this.currentUid);
      await setDoc(docRef, judgmentData);

      this.isJudgmentSaved = true;
      console.log('判定結果を保存しました:', judgmentData);
    } catch (error) {
      console.error('判定結果の保存に失敗しました:', error);
      this.errorMessage = '判定結果の保存に失敗しました。';
    }
  }

  async loadSavedJudgment(): Promise<void> {
    if (!this.currentUid) return;

    try {
      const firestore = getFirestore();
      const docRef = doc(firestore, 'insuranceJudgments', this.currentUid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const savedData = docSnap.data() as SavedJudgmentData;
        this.answers = savedData.answers;
        this.judgmentResult = savedData.judgmentResult;
        this.isJudgmentSaved = true;
        console.log('保存済み判定結果を読み込みました:', savedData);
      }
    } catch (error) {
      console.error('保存済み判定結果の読み込みに失敗しました:', error);
    }
  }

  retryInitialization(): void {
    this.errorMessage = '';
    this.ngOnInit();
  }

  goBack(): void {
    this.router.navigate(['/employee-procedures']);
  }
}
