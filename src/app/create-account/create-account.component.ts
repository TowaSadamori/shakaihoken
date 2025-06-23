import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { RegisterComponent } from '../register/register.component';
import { getFirestore, collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { MatNativeDateModule } from '@angular/material/core';
import { EditUserDialogComponent } from '../edit-user-dialog/edit-user-dialog.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { AuthService } from '../services/auth.service';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, Auth } from 'firebase/auth';

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
  employeeNumber?: string | number;
  branchNumber?: string | number;
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
  functions = getFunctions(undefined, 'asia-northeast1');
  currentUserRole = '';
  currentUid = '';
  currentRole = '';
  auth: Auth | null = null;
  lastCreatedAccount: {
    email: string;
    password: string;
    lastName: string;
    firstName: string;
    birthDate: Date | string;
  } | null = null;
  shouldShowLastCreatedAccount = false;

  constructor(
    private dialog: MatDialog,
    private authService: AuthService
  ) {
    this.auth = getAuth();
    this.loadUsers();
  }

  async ngOnInit() {
    if (this.auth && this.auth.currentUser) {
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
    if (this.auth && this.auth.currentUser) {
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

    const isValidUser = (user: User) =>
      !!user.uid && !!user.email && !!user.lastName && !!user.firstName && !!user.role;

    if (currentRole === 'employee_user') {
      this.users = allUsers.filter((user) => user.uid === currentUid && isValidUser(user));
    } else {
      this.users = allUsers.filter(isValidUser);
    }
    // lastCreatedAccountの行を表示するか判定
    this.shouldShowLastCreatedAccount =
      !!this.lastCreatedAccount &&
      !this.users.some((user) => user.email === this.lastCreatedAccount?.email);
  }

  async openRegisterDialog() {
    let companyId = '';
    if (this.auth && this.auth.currentUser) {
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
        // lastCreatedAccountの行を表示するか判定
        this.shouldShowLastCreatedAccount = !this.users.some(
          (user) => user.email === this.lastCreatedAccount?.email
        );
      } else {
        this.shouldShowLastCreatedAccount = false;
      }
    });
  }

  async editUser(user: User) {
    const dialogRef = this.dialog.open(EditUserDialogComponent, {
      width: '400px',
      data: { user, currentUid: this.currentUid },
    });
    dialogRef.afterClosed().subscribe(async (result) => {
      if (result === 'deleted') {
        await this.deleteUser(user);
        return;
      }
      if (result) {
        try {
          if (this.currentRole === 'employee_user' && user.uid === this.currentUid) {
            // Firestoreに保存する値からパスワード系だけ除外し、emailは元の値をセット
            const firestoreValues = { ...result };
            firestoreValues.email = user.email;
            delete firestoreValues.password;
            delete firestoreValues.confirmPassword;
            delete firestoreValues.currentPassword;
            const userDocRef = doc(this.db, 'users', user.uid);
            await setDoc(
              userDocRef,
              {
                ...user,
                ...firestoreValues,
                birthDate:
                  firestoreValues.birthDate instanceof Date
                    ? formatDateToYMD(firestoreValues.birthDate)
                    : firestoreValues.birthDate,
              },
              { merge: true }
            );
          } else {
            // 管理者による編集
            console.log('管理者編集', result);
            const updateFields: Record<string, string | number | boolean | null | undefined> = {};
            if (result.lastName !== undefined) updateFields['lastName'] = result.lastName;
            if (result.firstName !== undefined) updateFields['firstName'] = result.firstName;
            if (result.lastNameKana !== undefined)
              updateFields['lastNameKana'] = result.lastNameKana;
            if (result.firstNameKana !== undefined)
              updateFields['firstNameKana'] = result.firstNameKana;
            if (result.birthDate !== undefined) {
              updateFields['birthDate'] =
                result.birthDate instanceof Date
                  ? formatDateToYMD(result.birthDate)
                  : result.birthDate;
            }
            if (result.gender !== undefined) updateFields['gender'] = result.gender;
            if (result.email !== undefined) updateFields['email'] = result.email;
            if (result.role !== undefined) updateFields['role'] = result.role;
            if (result.password !== undefined) updateFields['password'] = result.password;
            if (result.branchNumber !== undefined)
              updateFields['branchNumber'] = result.branchNumber;
            if (result.employeeNumber !== undefined)
              updateFields['employeeNumber'] = result.employeeNumber;
            await this.authService.updateUserByAdmin(
              user.uid,
              result.email,
              result.password,
              updateFields
            );
            // ここで現在ユーザーのroleを再取得してcurrentUserRoleとcurrentRoleを更新
            if (this.auth && this.auth.currentUser) {
              const userDocRef = doc(this.db, 'users', this.auth.currentUser.uid);
              const userDocSnap = await getDoc(userDocRef);
              if (userDocSnap.exists()) {
                const data = userDocSnap.data() as User;
                this.currentUserRole = data.role || '';
                this.currentRole = data.role || '';
              }
            }
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
          this.users = this.users.filter((u) => u.uid !== user.uid);
          // await this.loadUsers(); // 即時反映のため、一旦コメントアウト
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
