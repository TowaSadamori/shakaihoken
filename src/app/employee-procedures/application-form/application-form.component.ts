import { Component, OnInit } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-application-form',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './application-form.component.html',
  styleUrl: './application-form.component.scss',
})
export class ApplicationFormComponent implements OnInit {
  userName = '';
  uid: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private userService: UserService
  ) {}

  async ngOnInit() {
    // パスパラメータからuid取得
    this.uid = this.route.snapshot.paramMap.get('uid');
    let user = null;
    if (this.uid) {
      user = await this.userService.getUserByUid(this.uid);
    } else {
      const auth = await this.authService['auth'];
      const currentUser = auth.currentUser;
      if (currentUser) {
        user = await this.userService.getUserByUid(currentUser.uid);
        this.uid = currentUser.uid;
      }
    }
    if (user) {
      this.userName = user.lastName + user.firstName;
    }
  }
}
