import { Component, OnInit } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { UserService } from '../../services/user.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

interface Dependent {
  lastName: string;
  firstName: string;
  lastNameKana: string;
  firstNameKana: string;
  birthDate: string;
  gender: string;
  myNumber: string;
  relationship: string;
  relationshipOther: string;
  removalDate: string;
  removalReason: string;
  address: string;
  occupationIncome: string;
  livingType: string;
  remittance: string;
  nenkin3gou: string;
  certificationDate: string;
  certificationReason: string;
  zipCode: string;
  prefectureCity: string;
  addressDetail: string;
  occupation: string;
  income: string;
  incomeAmount: string;
  incomeType: string;
  incomeTypeOther: string;
  nenkin3gouStatus: string;
  nenkin3gouReason: string;
  companyId: string;
  employeeNumber: string;
  isEditMode: boolean;
  originalData: Dependent | null;
}

@Component({
  selector: 'app-dependent-detail',
  standalone: true,
  imports: [RouterModule, FormsModule, CommonModule],
  templateUrl: './dependent-detail.component.html',
  styleUrl: './dependent-detail.component.scss',
})
export class DependentDetailComponent implements OnInit {
  userName = '';
  dependents: Dependent[] = [];

  constructor(
    private route: ActivatedRoute,
    private userService: UserService
  ) {}

  async ngOnInit() {
    const uid = this.route.snapshot.paramMap.get('uid');
    if (uid) {
      const user = await this.userService.getUserByUid(uid);
      if (user) {
        this.userName = user.lastName + user.firstName;
      }
    }
    // 1件だけ初期表示
    this.addDependent();
  }

  addDependent() {
    const empty: Dependent = {
      lastName: '',
      firstName: '',
      lastNameKana: '',
      firstNameKana: '',
      birthDate: '',
      gender: '',
      myNumber: '',
      relationship: '',
      relationshipOther: '',
      removalDate: '',
      removalReason: '',
      address: '',
      occupationIncome: '',
      livingType: '',
      remittance: '',
      nenkin3gou: '',
      certificationDate: '',
      certificationReason: '',
      zipCode: '',
      prefectureCity: '',
      addressDetail: '',
      occupation: '',
      income: '',
      incomeAmount: '',
      incomeType: '',
      incomeTypeOther: '',
      nenkin3gouStatus: '',
      nenkin3gouReason: '',
      companyId: '',
      employeeNumber: '',
      isEditMode: false,
      originalData: null,
    };
    empty.originalData = JSON.parse(JSON.stringify(empty));
    this.dependents.push(empty);
  }

  enableEdit(i: number) {
    this.dependents[i].isEditMode = true;
  }

  cancelEdit(i: number) {
    this.dependents[i] = { ...(this.dependents[i].originalData as Dependent) };
    this.dependents[i].isEditMode = false;
  }

  async save(i: number) {
    // Firestore保存処理をここに実装予定
    this.dependents[i].originalData = { ...this.dependents[i] };
    this.dependents[i].isEditMode = false;
    alert('保存しました');
  }

  async onCsvUpload(event: Event, i: number) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    const text = await file.text();
    const data = this.parseCsv(text);
    if (data && data['lastName'] && data['firstName']) {
      this.dependents[i] = { ...this.dependents[i], ...data };
      this.dependents[i].originalData = { ...this.dependents[i] };
      alert('CSVから情報を保存しました');
    } else {
      alert('CSVの内容が不正です');
    }
  }

  parseCsv(text: string): Record<string, string> | null {
    // 1行目: ヘッダー, 2行目: データ
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);
    if (lines.length < 2) return null;
    const headers = lines[0].split(',');
    const values = lines[1].split(',');
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      const key = h.trim();
      const v: string = values[i] ? values[i].trim() : '';
      obj[key] = v;
    });
    if (!obj['lastName'] || !obj['firstName']) return null;
    return obj;
  }

  formatDateJp(date: string): string {
    if (!date) return '';
    const [y, m, d] = date.split('-');
    if (!y || !m || !d) return date;
    return `${y}年${m}月${d}日`;
  }

  deleteUser(i: number) {
    if (confirm('本当に削除しますか？')) {
      this.dependents.splice(i, 1);
    }
  }
}
