import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-employee-salary-bonus-csv-import',
  standalone: true,
  template: `
    <input
      type="file"
      accept=".csv,text/csv"
      style="display:none"
      #csvInput
      (change)="onCsvImport($event)"
    />
    <button class="csv-import-btn" (click)="csvInput.click()">CSV取り込み</button>
  `,
  styleUrls: ['./employee-salary-bonus-csv-import.component.scss'],
})
export class EmployeeSalaryBonusCsvImportComponent {
  @Output() csvImported = new EventEmitter<string>();

  onCsvImport(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      this.csvImported.emit(text);
    };
    reader.readAsText(file, 'utf-8');
  }
}
