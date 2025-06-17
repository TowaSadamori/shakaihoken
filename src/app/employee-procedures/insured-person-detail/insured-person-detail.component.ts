import { Component, OnInit } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UserService, User } from '../../services/user.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-insured-person-detail',
  standalone: true,
  imports: [RouterModule, FormsModule, CommonModule],
  templateUrl: './insured-person-detail.component.html',
  styleUrl: './insured-person-detail.component.scss',
})
export class InsuredPersonDetailComponent implements OnInit {
  userName = '';
  isEditMode = false;
  formData: User = {
    uid: '',
    employeeNumber: '',
    branchNumber: '',
    lastName: '',
    firstName: '',
    companyId: '',
    lastNameKana: '',
    firstNameKana: '',
    birthDate: '',
    gender: '',
    myNumber: '',
    pensionNumber: '',
    insuranceSymbolNumber: '',
    zipCode: '',
    prefectureCity: '',
    addressDetail: '',
    phone: '',
  };
  originalData: User = { ...this.formData };

  constructor(
    private route: ActivatedRoute,
    private userService: UserService
  ) {}

  async ngOnInit() {
    const uid = this.route.snapshot.paramMap.get('uid');
    this.formData = { ...this.formData };
    this.originalData = { ...this.formData };
    if (uid) {
      const user = await this.userService.getUserByUid(uid);
      if (user) {
        this.userName = user.lastName + user.firstName;
        this.formData = { ...this.formData, ...user };
        this.originalData = { ...this.formData };
      }
    }
  }

  enableEdit() {
    this.isEditMode = true;
  }

  cancelEdit() {
    this.formData = { ...this.originalData };
    this.isEditMode = false;
  }

  async save() {
    await this.userService.saveUser(this.formData);
    this.originalData = { ...this.formData };
    this.isEditMode = false;
    alert('保存しました');
  }

  async onCsvUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];
    if (!file) return;
    const text = await file.text();
    const data = this.parseCsv(text);
    if (data && data.uid && data.lastName && data.firstName) {
      await this.userService.saveUser(data);
      this.formData = { ...this.formData, ...data };
      this.originalData = { ...this.formData };
      alert('CSVから情報を保存しました');
    } else {
      alert('CSVの内容が不正です');
    }
  }

  parseCsv(text: string): User | null {
    // 1行目: ヘッダー, 2行目: データ
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l);
    if (lines.length < 2) return null;
    const headers = lines[0].split(',');
    const values = lines[1].split(',');
    const obj: Partial<User> = {};
    headers.forEach((h, i) => {
      const key = h.trim() as keyof User;
      const v: string = values[i] ? values[i].trim() : '';
      (obj as Record<string, unknown>)[key] = v;
    });
    // 必須項目チェック
    if (!obj.uid || !obj.lastName || !obj.firstName) return null;
    return obj as User;
  }

  deleteUser() {
    if (confirm('本当に削除しますか？')) {
      // TODO: 実際の削除処理を実装
      alert('削除処理（未実装）');
    }
  }
}
