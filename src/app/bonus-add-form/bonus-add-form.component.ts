import { Component, EventEmitter, Output, Input, OnChanges, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-bonus-add-form',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './bonus-add-form.component.html',
  styleUrl: './bonus-add-form.component.scss',
})
export class BonusAddFormComponent implements OnChanges {
  paymentDate = '';
  amount: number | null = null;
  leaveType: 'excluded' | 'maternity' | 'childcare' = 'excluded';

  @Input() initialData?: { paymentDate: string; amount: number; leaveType: string };
  @Output() save = new EventEmitter<{ paymentDate: string; amount: number; leaveType: string }>();
  @Output() closed = new EventEmitter<void>();

  ngOnChanges(changes: SimpleChanges) {
    if (changes['initialData'] && this.initialData) {
      this.paymentDate = this.initialData.paymentDate;
      this.amount = this.initialData.amount;
      this.leaveType = this.initialData.leaveType as 'excluded' | 'maternity' | 'childcare';
    }
  }

  onSave() {
    if (this.paymentDate && this.amount && this.amount > 0) {
      this.save.emit({
        paymentDate: this.paymentDate,
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
