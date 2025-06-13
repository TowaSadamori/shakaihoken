import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { UserService } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-childcare-leave-application',
  standalone: true,
  imports: [RouterModule, CommonModule],
  templateUrl: './childcare-leave-application.component.html',
  styleUrl: './childcare-leave-application.component.scss',
})
export class ChildcareLeaveApplicationComponent implements OnInit {
  userName = '';
  uid: string | null = null;
  constructor(
    private route: ActivatedRoute,
    private userService: UserService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.uid = this.route.snapshot.paramMap.get('uid');
    const currentUser = await this.authService.getCurrentUserProfileWithRole();
    if (!currentUser) {
      this.userName = '';
      this.cdr.detectChanges();
      return;
    }

    if (this.uid) {
      if (currentUser.role === 'admin' || this.uid === currentUser.uid) {
        const user = await this.userService.getUserByUid(this.uid);
        if (user) {
          this.userName = user.lastName + user.firstName;
        } else {
          this.userName = '';
        }
        this.cdr.detectChanges();
      } else {
        // アクセス権がない場合
        this.userName = '';
        this.cdr.detectChanges();
      }
    } else {
      // uid指定なし
      if (currentUser.role === 'employee_user') {
        this.userName = currentUser.lastName + currentUser.firstName;
        this.uid = currentUser.uid;
      } else {
        // 管理者でuid無しは何も表示しない
        this.userName = '';
      }
      this.cdr.detectChanges();
    }
  }
}
