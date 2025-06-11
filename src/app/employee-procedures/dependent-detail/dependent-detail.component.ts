import { Component, OnInit } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { UserService, User } from '../../services/user.service';

@Component({
  selector: 'app-dependent-detail',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './dependent-detail.component.html',
  styleUrl: './dependent-detail.component.scss',
})
export class DependentDetailComponent implements OnInit {
  userName = '';

  constructor(
    private route: ActivatedRoute,
    private userService: UserService
  ) {}

  async ngOnInit() {
    const uid = this.route.snapshot.paramMap.get('uid');
    if (uid) {
      const user = await this.userService.getUserByUid(uid);
      if (user) {
        this.userName = user.lastName + user.firstName;
      }
    }
  }
}
