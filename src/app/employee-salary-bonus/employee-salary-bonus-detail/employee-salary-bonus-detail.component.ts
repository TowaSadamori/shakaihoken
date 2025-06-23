import { Component, OnInit, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  setDoc,
  doc,
  getDoc,
} from 'firebase/firestore';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { EmployeeSalaryBonusCsvImportComponent } from '../employee-salary-bonus-csv-import/employee-salary-bonus-csv-import.component';
import Decimal from 'decimal.js';
import { SocialInsuranceCalculator } from '../../utils/decimal-calculator';

export type SalaryTable = Record<string, Record<string, number | string | null>>;

@Component({
  selector: 'app-employee-salary-bonus-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, EmployeeSalaryBonusCsvImportComponent],
  templateUrl: './employee-salary-bonus-detail.component.html',
  styleUrl: './employee-salary-bonus-detail.component.scss',
})
export class EmployeeSalaryBonusDetailComponent implements OnInit, OnChanges {
  employeeName = '';
  employeeId: string | null = null;
  companyId: string | null = null;
  rows = [
    '基本給',
    '諸手当',
    '役職手当',
    '職務手当',
    '資格手当',
    '技能手当',
    '家族手当',
    '扶養手当',
    '住宅手当',
    '地域手当',
    '通勤手当（通勤費）',
    '時間外勤務手当（残業手当）',
    '深夜勤務手当',
    '休日勤務手当',
    '宿直・日直手当（一定の基準を超える場合）',
    '調整手当',
    '奨励手当',
    '皆勤手当',
    '精勤手当',
    'その他（金銭支給）',
    '食事代',
    '食券',
    '社宅',
    '寮費',
    '通勤定期券',
    '回数券',
    '被服',
    'その他（現物支給）',
    '欠勤控除額',
    '合計',
    '出勤日数',
    '欠勤日数',
    '支給年月日',
  ];
  baseColumns = [
    '1月',
    '2月',
    '3月',
    '4月',
    '5月',
    '6月',
    '7月',
    '8月',
    '9月',
    '10月',
    '11月',
    '12月',
  ];
  bonusColumns = ['賞与（1回目）', '賞与（2回目）', '賞与（3回目）'];
  visibleBonusCount = 3;
  get columns() {
    return [...this.baseColumns, ...this.bonusColumns.slice(0, this.visibleBonusCount)];
  }

  salaryTable: SalaryTable = {};
  selectedYear = String(new Date().getFullYear());
  years: string[] = [];
  isEditMode = false;
  editSalaryTable: SalaryTable | null = null;
  integerRows = [
    '基本給',
    '諸手当',
    '役職手当',
    '職務手当',
    '資格手当',
    '技能手当',
    '家族手当',
    '扶養手当',
    '住宅手当',
    '地域手当',
    '通勤手当（通勤費）',
    '時間外勤務手当（残業手当）',
    '深夜勤務手当',
    '休日勤務手当',
    '宿直・日直手当（一定の基準を超える場合）',
    '調整手当',
    '奨励手当',
    '皆勤手当',
    '精勤手当',
    'その他（金銭支給）',
    '食事代',
    '食券',
    '社宅',
    '寮費',
    '通勤定期券',
    '回数券',
    '被服',
    'その他（現物支給）',
    '欠勤控除額',
    '合計',
    '出勤日数',
    '欠勤日数',
  ];
  editErrorMessage = '';
  salaryTableReady = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {
    // 年度リスト（例: 2020～今年）
    const thisYear = new Date().getFullYear();
    for (let y = 2020; y <= thisYear; y++) {
      this.years.push(String(y));
    }
  }

  getTotal(col: string): string {
    let sum = '0';
    for (const row of this.rows) {
      if (row === '合計' || row === '出勤日数' || row === '欠勤日数' || row === '支給年月日')
        continue;
      if (row === '欠勤控除額') continue;
      const val = this.salaryTable[row]?.[col];
      if (typeof val === 'string' && !isNaN(Number(val))) {
        sum = SocialInsuranceCalculator.addAmounts(sum, val);
      } else if (typeof val === 'number') {
        sum = SocialInsuranceCalculator.addAmounts(sum, val.toString());
      }
    }
    // 欠勤控除額を引く
    const minus = this.salaryTable['欠勤控除額']?.[col];
    if (typeof minus === 'string' && !isNaN(Number(minus))) {
      sum = SocialInsuranceCalculator.subtractAmounts(sum, minus);
    } else if (typeof minus === 'number') {
      sum = SocialInsuranceCalculator.subtractAmounts(sum, minus.toString());
    }
    return sum;
  }

  async ngOnInit() {
    const employeeId = this.route.snapshot.paramMap.get('employeeId');
    this.employeeId = employeeId;
    // companyId取得
    const userDoc = await this.authService['auth'].currentUser;
    if (userDoc) {
      const db = getFirestore();
      const userSnap = await getDoc(doc(db, 'users', userDoc.uid));
      if (userSnap.exists()) {
        this.companyId = userSnap.data()['companyId'] || null;
      }
    }
    if (!employeeId) return;
    const db = getFirestore();
    const usersRef = collection(db, 'users');
    const q = query(
      usersRef,
      where('companyId', '==', this.companyId),
      where('employeeNumber', '==', employeeId)
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const data = querySnapshot.docs[0].data();
      this.employeeName = (data['lastName'] || '') + ' ' + (data['firstName'] || '');
    }
    await this.loadSalaryTable();
  }

  async loadSalaryTable() {
    this.salaryTableReady = false;
    if (!this.companyId || !this.employeeId || !this.selectedYear) return;
    const db = getFirestore();
    const yearRef = doc(
      db,
      'employee-salary-bonus',
      this.companyId,
      'employees',
      this.employeeId,
      'years',
      this.selectedYear
    );
    const docSnap = await getDoc(yearRef);
    if (docSnap.exists()) {
      this.salaryTable = docSnap.data()['salaryTable'] || {};
      for (const row of this.rows) {
        if (!this.salaryTable[row]) {
          this.salaryTable[row] = {};
        }
      }
      let maxBonus = 0;
      for (let i = 0; i < this.bonusColumns.length; i++) {
        const col = this.bonusColumns[i];
        if (Object.values(this.salaryTable).some((row) => row && row[col] != null)) {
          maxBonus = i + 1;
        }
      }
      this.visibleBonusCount = maxBonus;
    } else {
      this.salaryTable = {};
      const allColumns = [...this.baseColumns, ...this.bonusColumns];
      for (const row of this.rows) {
        this.salaryTable[row] = {};
        for (const col of allColumns) {
          this.salaryTable[row][col] = null;
        }
      }
    }
    this.salaryTableReady = true;
  }

  // 年度切り替え時に再取得
  ngOnChanges() {
    this.loadSalaryTable();
  }

  async saveSalaryTable() {
    if (!this.companyId || !this.employeeId || !this.selectedYear) return;
    const db = getFirestore();
    const ref = doc(
      db,
      'employee-salary-bonus',
      this.companyId,
      'employees',
      this.employeeId,
      'years',
      this.selectedYear
    );
    await setDoc(ref, { salaryTable: this.salaryTable });
    alert('保存しました');
  }

  goBack() {
    this.router.navigate(['/employee-salary-bonus']);
  }

  openGradeJudgment() {
    if (this.employeeId) {
      // 新しい等級判定ページに遷移
      this.router.navigate(['/grade-judgment', this.employeeId]);
    } else {
      alert('従業員情報が取得できませんでした。');
    }
  }

  // CSV取り込み
  onCsvImport(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      this.parseAndApplyCsv(text);
    };
    reader.readAsText(file, 'utf-8');
  }

  addBonusColumn() {
    if (this.visibleBonusCount < 3) {
      this.visibleBonusCount++;
      this.recalcTotals();
    }
  }

  removeBonusColumn() {
    if (this.visibleBonusCount > 0) {
      this.visibleBonusCount--;
      this.recalcTotals();
    }
  }

  parseAndApplyCsv(csv: string) {
    const lines = csv.split(/\r\n|\n/).filter((line) => line.trim() !== '');
    if (lines.length < 2) {
      alert('CSVファイルにヘッダー行とデータ行が必要です。');
      return;
    }
    const header = lines[0].split(',');
    if (header[0] !== '項目') {
      alert('1列目のヘッダーは「項目」である必要があります。');
      return;
    }
    const dataRows = lines.slice(1);
    const table: SalaryTable = JSON.parse(JSON.stringify(this.salaryTable));
    dataRows.forEach((line) => {
      const data = line.split(',');
      const rowName = data[0];
      if (this.rows.includes(rowName)) {
        if (!table[rowName]) {
          table[rowName] = {};
        }
        for (let i = 1; i < header.length; i++) {
          const colName = header[i];
          if (this.columns.includes(colName)) {
            table[rowName][colName] = data[i] !== undefined ? data[i] : null;
          }
        }
      }
    });
    this.salaryTable = table;
    this.saveSalaryTable(); // CSV取り込み後、自動で保存
  }

  startEdit() {
    this.isEditMode = true;
    // deep copy
    this.editSalaryTable = JSON.parse(JSON.stringify(this.salaryTable));
  }

  cancelEdit() {
    this.isEditMode = false;
    this.editSalaryTable = null;
  }

  async saveEdit() {
    if (!this.editSalaryTable) return;
    // バリデーション: 整数のみ許容の行で小数点や空欄があればエラー
    for (const row of this.integerRows) {
      if (!this.editSalaryTable[row]) continue;
      for (const col of this.columns) {
        const val = this.editSalaryTable[row][col];
        if (val === null || val === undefined || val === '') {
          this.editErrorMessage = `「${row}」の「${col}」は空欄にできません。0以上の整数を入力してください。`;
          return;
        }
        if (!/^[0-9]+$/.test(String(val))) {
          this.editErrorMessage = `「${row}」の「${col}」は整数のみ入力可能です。小数点や記号は使えません。`;
          return;
        }
      }
    }
    this.salaryTable = JSON.parse(JSON.stringify(this.editSalaryTable));
    // rows全てにsalaryTable[row]が必ず存在するよう補完
    for (const row of this.rows) {
      if (!this.salaryTable[row]) {
        this.salaryTable[row] = {};
      }
    }
    this.isEditMode = false;
    this.editSalaryTable = null;
    this.editErrorMessage = '';
    this.recalcTotals();
    await this.saveSalaryTable();
  }

  editCellInput(event: Event, row: string, col: string) {
    if (!this.editSalaryTable || !this.editSalaryTable[row]) return;
    const input = event.target as HTMLInputElement;
    let val = input.value;
    // 半角数字のみ許可
    val = val.replace(/[^0-9]/g, '');
    this.editSalaryTable[row][col] = val;
  }

  // 日付フォーマット変換
  toDateInputValue(val: string | null | undefined): string {
    if (!val) return '';
    // YYYY/MM/DD -> YYYY-MM-DD
    return val.replace(/\//g, '-');
  }
  fromDateInputValue(val: string | null | undefined): string {
    if (!val) return '';
    // YYYY-MM-DD -> YYYY/MM/DD
    return val.replace(/-/g, '/');
  }
  getEditCellValue(row: string, col: string): string {
    return this.editSalaryTable &&
      this.editSalaryTable[row] &&
      this.editSalaryTable[row][col] != null
      ? String(this.editSalaryTable[row][col])
      : '';
  }
  onEditCellChange(row: string, col: string, value: string) {
    if (this.editSalaryTable && this.editSalaryTable[row]) {
      this.editSalaryTable[row][col] = value.replace(/[^0-9]/g, '');
    }
  }
  onDateEditChange(row: string, col: string, value: string) {
    if (this.editSalaryTable && this.editSalaryTable[row]) {
      this.editSalaryTable[row][col] = this.fromDateInputValue(value);
    }
  }

  // 金額を3桁ごとにカンマ、小数点以下にはカンマを付けない
  formatMoney(val: string | number | null | undefined): string {
    if (val === null || val === undefined || val === '') return '';
    const dec = new Decimal(val.toString().replace(/,/g, ''));
    const parts = dec.toFixed().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.length === 2 ? `${parts[0]}.${parts[1]}` : parts[0];
  }

  // 合計計算（Decimalで正確に）
  recalcTotals() {
    for (const col of [...this.baseColumns, ...this.bonusColumns]) {
      let sum = new Decimal(0);
      for (const row of this.rows) {
        if (
          row === '合計' ||
          row === '出勤日数' ||
          row === '欠勤日数' ||
          row === '支給年月日' ||
          row === '欠勤控除額'
        )
          continue;
        const val = this.salaryTable[row][col];
        if (val !== null && val !== undefined && val !== '') {
          sum = sum.plus(new Decimal(val.toString().replace(/,/g, '')));
        }
      }
      // 欠勤控除額を引く
      const minus = this.salaryTable['欠勤控除額'][col];
      if (minus !== null && minus !== undefined && minus !== '') {
        sum = sum.minus(new Decimal(minus.toString().replace(/,/g, '')));
      }
      this.salaryTable['合計'][col] = sum.toString();
    }
  }

  isNumeric(val: string | number | null | undefined): boolean {
    return typeof val === 'string' && val.trim() !== '' && !isNaN(Number(val));
  }
}
