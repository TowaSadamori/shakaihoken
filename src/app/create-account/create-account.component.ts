import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { RegisterComponent } from '../register/register.component';
import { getFirestore, collection, getDocs, Firestore, updateDoc, doc } from 'firebase/firestore';
import { MatNativeDateModule } from '@angular/material/core';
import { EditUserDialogComponent } from '../edit-user-dialog/edit-user-dialog.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { AuthService } from '../auth.service';

export interface User {
  uid: string;
  email: string;
  lastName?: string;
  firstName?: string;
  lastNameKana?: string;
  firstNameKana?: string;
  gender?: string;
  role: string;
  createdAt: Date | string;
  password?: string;
  birthDate?: Date | string;
  name?: string;
}

@Component({
  selector: 'app-create-account',
  standalone: true,
  imports: [CommonModule, RouterModule, MatNativeDateModule],
  templateUrl: './create-account.component.html',
  styleUrls: ['./create-account.component.scss'],
})
export class CreateAccountComponent {
  users: User[] = [];
  db: Firestore;
  lastCreatedAccount: {
    email: string;
    password: string;
    lastName: string;
    firstName: string;
    birthDate: Date | string;
  } | null = null;

  constructor(
    private dialog: MatDialog,
    private authService: AuthService
  ) {
    this.db = getFirestore();
    this.loadUsers();
  }

  async loadUsers() {
    const usersCol = collection(this.db, 'users');
    const userSnapshot = await getDocs(usersCol);
    this.users = userSnapshot.docs.map((doc) => {
      const data = doc.data() as User;
      return {
        ...data,
        lastName: data.lastName || '',
        firstName: data.firstName || '',
        birthDate: data.birthDate ? new Date(data.birthDate) : '',
        password: data.password || '',
      };
    });
  }

  openRegisterDialog() {
    const dialogRef = this.dialog.open(RegisterComponent, {
      width: '400px',
      disableClose: false,
    });
    dialogRef.afterClosed().subscribe((result) => {
      this.loadUsers();
      if (result && result.email && result.password) {
        this.lastCreatedAccount = {
          email: result.email,
          password: result.password,
          lastName: result.lastName,
          firstName: result.firstName,
          birthDate: result.birthDate,
        };
      }
    });
  }

  async editUser(user: User) {
    const dialogRef = this.dialog.open(EditUserDialogComponent, {
      width: '400px',
      data: user,
    });
    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        const userRef = doc(this.db, 'users', user.uid);
        await updateDoc(userRef, {
          lastName: result.lastName,
          firstName: result.firstName,
          birthDate:
            result.birthDate instanceof Date ? formatDateToYMD(result.birthDate) : result.birthDate,
          email: result.email,
          password: result.password,
          role: result.role,
        });
        // Authにも反映
        try {
          await this.authService.updateCurrentUser(result.email, result.password);
        } catch (e) {
          console.error('Auth update error:', e);
        }
        await this.loadUsers();
      }
    });
  }

  async deleteUser(user: User) {
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
      if (result) {
        // Firestoreからユーザー削除
        const userRef = doc(this.db, 'users', user.uid);
        await (await import('firebase/firestore')).deleteDoc(userRef);
        await this.loadUsers();
      }
    });
  }
}

function formatDateToYMD(date: Date): string {
  const y = date.getFullYear();
  const m = ('0' + (date.getMonth() + 1)).slice(-2);
  const d = ('0' + date.getDate()).slice(-2);
  return `${y}-${m}-${d}`;
}
