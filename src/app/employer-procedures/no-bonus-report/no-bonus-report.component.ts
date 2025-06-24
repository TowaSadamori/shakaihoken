import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { OfficeService } from '../../services/office.service';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { doc, getDoc } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { exportNoBonusReportToCSV } from '../../csv-export/no-bonus-report-csv-export';

@Component({
  selector: 'app-no-bonus-report',
  standalone: true,
  imports: [CommonModule, MatButtonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './no-bonus-report.component.html',
  styleUrl: './no-bonus-report.component.scss',
})
export class NoBonusReportComponent implements OnInit {
  uid = '';
  officeName = '';
  isEditing = false;
  form: FormGroup;
  formItems = [
    '提出年月日x年',
    '提出年月日x月',
    '提出年月日x日',
    '事業所整理記号',
    '事業所番号',
    '事業所所在地',
    '事業所名称',
    '事業主氏名',
    '電話番号',
    '社会保険労務士氏名',
    '賞与支払予定年月',
    '賞与支払年月',
    '支給の状況',
    '賞与支払予定月の変更',
  ];

  constructor(
    private route: ActivatedRoute,
    private officeService: OfficeService,
    private fb: FormBuilder,
    private authService: AuthService
  ) {
    this.form = this.fb.group({
      提出年月日x年: [''],
      提出年月日x月: [''],
      提出年月日x日: [''],
      事業所整理記号: [''],
      事業所番号: [''],
      事業所所在地: [''],
      事業所名称: [''],
      事業主氏名: [''],
      電話番号: [''],
      社会保険労務士氏名: [''],
      賞与支払予定年月: [''],
      賞与支払年月: [''],
      支給の状況: [''],
      賞与支払予定月の変更: [''],
    });
  }

  setFormEnabled(enabled: boolean) {
    Object.keys(this.form.controls).forEach((key) => {
      const control = this.form.get(key);
      if (!control) return;
      if (enabled) {
        control.enable();
      } else {
        control.disable();
      }
    });
  }

  async ngOnInit(): Promise<void> {
    this.uid = this.route.snapshot.params['uid'];
    if (this.uid) {
      const office = await this.officeService.getOfficeById(this.uid);
      this.officeName =
        (office && ((office['officeName'] as string) || (office['name'] as string) || office.id)) ||
        '';
      // Firestoreから既存データ取得
      const db = getFirestore();
      const appDocRef = doc(db, 'offices', this.uid, 'applications', 'no-bonus-report');
      const appDocSnap = await getDoc(appDocRef);
      if (appDocSnap.exists()) {
        const data = appDocSnap.data();
        if (data && data['formData']) {
          this.form.patchValue(data['formData']);
        }
      }
    }
    this.isEditing = false;
    this.setFormEnabled(false);
  }

  onEdit() {
    this.isEditing = true;
    this.setFormEnabled(true);
  }

  async onSave() {
    // Firestore保存処理
    const userProfile = await this.authService.getCurrentUserProfileWithRole();
    const userId = userProfile?.uid || '';
    if (this.uid && userId) {
      await this.officeService.saveApplicationForOffice(
        this.uid,
        'no-bonus-report',
        this.form.value,
        userId
      );
    }
    this.isEditing = false;
    this.setFormEnabled(false);
  }

  onCancel() {
    this.isEditing = false;
    this.setFormEnabled(false);
  }

  onExportCSV() {
    const csv = exportNoBonusReportToCSV(this.form.value);
    const blob = new Blob([csv], { type: 'text/csv' });
    const pageTitle = '賞与不支給報告書';
    const fileName = `${pageTitle}${this.officeName ? '（' + this.officeName + '）' : ''}.csv`;
    const navigatorWithSave: Navigator & {
      msSaveOrOpenBlob?: (blob: Blob, fileName: string) => void;
    } = window.navigator as Navigator & {
      msSaveOrOpenBlob?: (blob: Blob, fileName: string) => void;
    };
    if (navigatorWithSave.msSaveOrOpenBlob) {
      navigatorWithSave.msSaveOrOpenBlob(blob, fileName);
    } else {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      window.URL.revokeObjectURL(url);
    }
  }
}
