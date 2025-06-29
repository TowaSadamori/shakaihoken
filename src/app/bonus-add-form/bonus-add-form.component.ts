import { Component, EventEmitter, Output, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-bonus-add-form',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './bonus-add-form.component.html',
  styleUrl: './bonus-add-form.component.scss',
})
export class BonusAddFormComponent implements OnChanges {
  paymentDate = '';
  amount: number | null = null;
  leaveType: 'excluded' | 'maternity' | 'childcare' = 'excluded';

  @Input() initialData?: { paymentDate: string; amount: number; leaveType: string };
  @Input() existingBonusMonths: string[] = []; // 既存の賞与月リスト（YYYY-MM形式）
  @Input() isEdit = false; // 編集モードかどうか
  @Input() originalMonth?: string; // 編集時の元の月（YYYY-MM形式）
  @Output() save = new EventEmitter<{ paymentDate: string; amount: number; leaveType: string }>();
  @Output() closed = new EventEmitter<void>();

  duplicateMonthError = false;
  errorMessage = '';

  ngOnChanges(changes: SimpleChanges) {
    if (changes['initialData'] && this.initialData) {
      // 初期データから月部分（YYYY-MM）を抽出
      this.paymentDate = this.initialData.paymentDate.substring(0, 7);
      this.amount = this.initialData.amount;
      this.leaveType = this.initialData.leaveType as 'excluded' | 'maternity' | 'childcare';
      // 初期データ設定後も重複チェックを実行
      this.checkDuplicateMonth();
    }
    // 既存の賞与月リストが変更された場合も重複チェックを実行
    if (changes['existingBonusMonths'] && this.paymentDate) {
      this.checkDuplicateMonth();
    }
  }

  onPaymentDateChange() {
    this.checkDuplicateMonth();
  }

  private checkDuplicateMonth() {
    if (!this.paymentDate) {
      this.duplicateMonthError = false;
      this.errorMessage = '';
      return;
    }

    const selectedMonth = this.paymentDate; // 既にYYYY-MM形式

    // 編集モードの場合は、元の月は除外してチェック
    const monthsToCheck =
      this.isEdit && this.originalMonth
        ? this.existingBonusMonths.filter((month) => month !== this.originalMonth)
        : this.existingBonusMonths;

    if (monthsToCheck.includes(selectedMonth)) {
      this.duplicateMonthError = true;
      const [year, month] = selectedMonth.split('-');
      this.errorMessage = `${year}年${parseInt(month)}月には既に賞与が登録されています。`;
    } else {
      this.duplicateMonthError = false;
      this.errorMessage = '';
    }
  }

  onSave() {
    if (this.paymentDate && this.amount && this.amount > 0 && !this.duplicateMonthError) {
      // 月の最終日を計算してフルの日付形式に変換
      const [year, month] = this.paymentDate.split('-');
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      const fullDate = `${this.paymentDate}-${lastDay.toString().padStart(2, '0')}`;

      this.save.emit({
        paymentDate: fullDate,
        amount: this.amount,
        leaveType: this.leaveType,
      });
      this.closed.emit();
    }
  }

  onCancel() {
    this.closed.emit();
  }
}
