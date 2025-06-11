import { Component, OnInit } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { UserService } from '../../services/user.service';

@Component({
  selector: 'app-insured-person-detail',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './insured-person-detail.component.html',
  styleUrl: './insured-person-detail.component.scss',
})
export class InsuredPersonDetailComponent implements OnInit {
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
