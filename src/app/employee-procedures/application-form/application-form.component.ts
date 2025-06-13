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

  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
    private userService: UserService
  ) {}

  async ngOnInit() {
    // クエリパラメータからuid取得
    const uid = this.route.snapshot.queryParamMap.get('uid');
    let user = null;
    if (uid) {
      user = await this.userService.getUserByUid(uid);
    } else {
      const auth = await this.authService['auth'];
      const currentUser = auth.currentUser;
      if (currentUser) {
        user = await this.userService.getUserByUid(currentUser.uid);
      }
    }
    if (user) {
      this.userName = user.lastName + user.firstName;
    }
  }
}
