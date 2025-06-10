import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-csv-import',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="open" class="csv-import-modal">
      <div class="csv-import-modal-content">
        <h2>CSV取り込み</h2>
        <input type="file" accept=".csv" (change)="onFileSelected($event)" />
        <button (click)="close()">閉じる</button>
      </div>
    </div>
  `,
  styles: [
    `
      .csv-import-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      .csv-import-modal-content {
        background: #fff;
        padding: 2rem;
        border-radius: 8px;
        min-width: 320px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }
    `,
  ],
})
export class CsvImportComponent {
  @Input() open = false;
  @Output() closeModal = new EventEmitter<void>();
  @Output() csvImported = new EventEmitter<string>();

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        this.csvImported.emit(text);
      };
      reader.readAsText(file, 'utf-8');
    }
  }

  close() {
    this.closeModal.emit();
  }
}
