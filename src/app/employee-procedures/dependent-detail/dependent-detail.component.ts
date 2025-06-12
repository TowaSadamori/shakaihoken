import { Component, OnInit } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { UserService, User, Dependent } from '../../services/user.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-dependent-detail',
  standalone: true,
  imports: [RouterModule, FormsModule, CommonModule],
  templateUrl: './dependent-detail.component.html',
  styleUrl: './dependent-detail.component.scss',
})
export class DependentDetailComponent implements OnInit {
  userName = '';
  dependents: (Dependent & { isEditMode: boolean; originalData: Dependent | null })[] = [];
  currentUser: User | null = null;
  uid = '';

  constructor(
    private route: ActivatedRoute,
    private userService: UserService
  ) {}

  async ngOnInit() {
    this.uid = this.route.snapshot.paramMap.get('uid') || '';
    if (this.uid) {
      this.currentUser = await this.userService.getUserByUid(this.uid);
      if (this.currentUser) {
        this.userName = this.currentUser.lastName + this.currentUser.firstName;
        // 被扶養者一覧取得
        const deps = await this.userService.getDependents(this.uid);
        this.dependents = deps.map((dep) => ({
          ...dep,
          isEditMode: false,
          originalData: { ...dep },
        }));
      }
    }
  }

  addDependent() {
    if (!this.currentUser) return;
    const empty: Dependent & { isEditMode: boolean; originalData: Dependent | null } = {
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
      companyId: this.currentUser.companyId || '',
      employeeNumber: this.currentUser.employeeNumber || '',
      isEditMode: true,
      originalData: null,
    };
    empty.originalData = JSON.parse(JSON.stringify(empty));
    this.dependents.push(empty);
  }

  enableEdit(i: number) {
    this.dependents[i].isEditMode = true;
  }

  cancelEdit(i: number) {
    this.dependents[i] = {
      ...(this.dependents[i].originalData as Dependent),
      isEditMode: false,
      originalData: this.dependents[i].originalData,
    };
  }

  async save(i: number) {
    if (!this.currentUser) return;
    // companyId/employeeNumberを本人情報で上書き
    this.dependents[i].companyId = this.currentUser.companyId || '';
    this.dependents[i].employeeNumber = this.currentUser.employeeNumber || '';
    // Firestore保存
    await this.userService.saveDependent(this.uid, this.dependents[i]);
    this.dependents[i].originalData = { ...this.dependents[i] };
    this.dependents[i].isEditMode = false;
    alert('保存しました');
    // 保存後にIDを再取得（新規追加時）
    const deps = await this.userService.getDependents(this.uid);
    this.dependents = deps.map((dep) => ({
      ...dep,
      isEditMode: false,
      originalData: { ...dep },
    }));
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

  async deleteUser(i: number) {
    if (!this.currentUser) return;
    const dep = this.dependents[i];
    if (!dep || !dep.id) {
      // まだFirestoreに保存されていない場合はローカルから削除
      this.dependents.splice(i, 1);
      return;
    }
    if (confirm('本当に削除しますか？')) {
      await this.userService.deleteDependent(this.uid, dep.id);
      this.dependents.splice(i, 1);
    }
  }
}
