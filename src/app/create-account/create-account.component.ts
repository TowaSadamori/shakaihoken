import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { RegisterComponent } from '../register/register.component';
import { getFirestore, collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import {
  getAuth,
  updateEmail,
  updatePassword,
  sendEmailVerification,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { MatNativeDateModule } from '@angular/material/core';
import { EditUserDialogComponent } from '../edit-user-dialog/edit-user-dialog.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { AuthService } from '../services/auth.service';
import { getFunctions, httpsCallable } from 'firebase/functions';

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
  companyId?: string;
}

@Component({
  selector: 'app-create-account',
  standalone: true,
  imports: [CommonModule, RouterModule, MatNativeDateModule],
  templateUrl: './create-account.component.html',
  styleUrls: ['./create-account.component.scss'],
})
export class CreateAccountComponent implements OnInit {
  users: User[] = [];
  db = getFirestore();
  auth = getAuth();
  lastCreatedAccount: {
    email: string;
    password: string;
    lastName: string;
    firstName: string;
    birthDate: Date | string;
  } | null = null;
  functions = getFunctions(undefined, 'asia-northeast1');
  currentUserRole = '';
  currentUid = '';
  currentRole = '';

  constructor(
    private dialog: MatDialog,
    private authService: AuthService
  ) {
    this.loadUsers();
  }

  async ngOnInit() {
    if (this.auth.currentUser) {
      const userDocRef = doc(this.db, 'users', this.auth.currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const data = userDocSnap.data() as User;
        this.currentUserRole = data.role || '';
        this.currentUid = this.auth.currentUser.uid;
        this.currentRole = data.role || '';
      }
    }
    this.loadUsers();
  }

  async loadUsers() {
    // まず現在ユーザーのcompanyIdとuid、roleを取得
    let companyId = '';
    let currentUid = this.currentUid;
    let currentRole = this.currentRole;
    if (this.auth.currentUser) {
      currentUid = this.auth.currentUser.uid;
      const userDocRef = doc(this.db, 'users', currentUid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const data = userDocSnap.data() as User;
        companyId = data.companyId || '';
        currentRole = data.role || '';
      }
    }
    const usersCol = collection(this.db, 'users');
    const userSnapshot = await getDocs(usersCol);
    const allUsers = userSnapshot.docs
      .map((doc) => doc.data() as User)
      .filter((user) => user.companyId === companyId);

    if (currentRole === 'employee_user') {
      this.users = allUsers.filter((user) => user.uid === currentUid);
    } else {
      this.users = allUsers;
    }
  }

  async openRegisterDialog() {
    let companyId = '';
    if (this.auth.currentUser) {
      const userDocRef = doc(this.db, 'users', this.auth.currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const data = userDocSnap.data() as User;
        companyId = data.companyId || '';
      }
    }
    console.log('openRegisterDialogで渡すcompanyId:', companyId);
    const dialogRef = this.dialog.open(RegisterComponent, {
      width: '400px',
      disableClose: false,
      data: { companyId },
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
      data: { user, currentUid: this.currentUid },
    });
    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        try {
          if (this.currentRole === 'employee_user' && user.uid === this.currentUid) {
            // 再認証
            const currentUser = this.auth.currentUser;
            if (currentUser) {
              try {
                const credential = EmailAuthProvider.credential(
                  user.email,
                  result.currentPassword // フォームから取得
                );
                await reauthenticateWithCredential(currentUser, credential);
              } catch (e) {
                alert('再認証に失敗しました。現在のパスワードが正しいかご確認ください。');
                throw e;
              }
              if (result.email && result.email !== user.email) {
                try {
                  await updateEmail(currentUser, result.email);
                  await sendEmailVerification(currentUser);
                  alert(
                    'メールアドレスを変更しました。新しいメールアドレスの認証を完了してください。'
                  );
                } catch (e) {
                  alert('メールアドレスの変更には認証が必要です。再ログイン後にお試しください。');
                  throw e;
                }
              }
              if (result.password && result.password !== user.password) {
                await updatePassword(currentUser, result.password);
              }
            }
            const userDocRef = doc(this.db, 'users', user.uid);
            await setDoc(
              userDocRef,
              {
                ...user,
                ...result,
                birthDate:
                  result.birthDate instanceof Date
                    ? formatDateToYMD(result.birthDate)
                    : result.birthDate,
              },
              { merge: true }
            );
          } else {
            // 管理者による編集
            console.log('管理者編集', result);
            await this.authService.updateUserByAdmin(user.uid, result.email, result.password, {
              lastName: result.lastName,
              firstName: result.firstName,
              birthDate:
                result.birthDate instanceof Date
                  ? formatDateToYMD(result.birthDate)
                  : result.birthDate,
              email: result.email,
              password: result.password,
              role: result.role,
            });
          }
          await this.loadUsers();
        } catch (e) {
          console.error('ユーザー更新エラー:', e);
        }
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
        // Cloud Functions経由でAuthユーザーとFirestoreユーザーを削除
        const deleteUserByAdmin = httpsCallable(this.functions, 'deleteUserByAdmin');
        try {
          await deleteUserByAdmin({ uid: user.uid });
          await this.loadUsers();
        } catch (e) {
          console.error('ユーザー削除エラー:', e);
        }
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
