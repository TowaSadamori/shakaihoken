import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { getFirestore, doc, getDoc, deleteDoc } from 'firebase/firestore';
import type { Company } from '../company-register/company-register.component';
import { CommonModule } from '@angular/common';
import { TimestampToDatePipe } from '../timestamp-to-date.pipe';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-office-detail',
  standalone: true,
  imports: [CommonModule, TimestampToDatePipe],
  templateUrl: './office-detail.component.html',
  styleUrl: './office-detail.component.scss',
})
export class OfficeDetailComponent implements OnInit {
  officeId: string | null = null;
  officeData: Partial<Company> | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private dialog: MatDialog
  ) {}

  async ngOnInit() {
    this.officeId = this.route.snapshot.paramMap.get('id');
    if (this.officeId) {
      const db = getFirestore();
      const officeDocRef = doc(db, 'offices', this.officeId);
      const officeDocSnap = await getDoc(officeDocRef);
      if (officeDocSnap.exists()) {
        this.officeData = officeDocSnap.data();
      }
    }
  }

  goBack() {
    this.router.navigate(['/company-register']);
  }

  async onDelete() {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      disableClose: true,
      data: {
        title: '削除確認',
        message: '本当に削除しますか？',
        confirmText: '削除',
        cancelText: 'キャンセル',
        icon: 'warning',
        iconColor: '#e53935',
      },
    });
    dialogRef.afterClosed().subscribe(async (result) => {
      if (result && this.officeId) {
        const db = getFirestore();
        const officeDocRef = doc(db, 'offices', this.officeId);
        await deleteDoc(officeDocRef);
        this.router.navigate(['/company-register']);
      }
    });
  }
}
