import { Component, EventEmitter, Input, Output, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';
import { User, getAuth, onAuthStateChanged } from 'firebase/auth';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent implements OnInit, OnDestroy {
  @Input() isHandset = false;
  @Output() menuClick = new EventEmitter<void>();

  user: User | null = null;
  userName = '';
  private unsubscribe: (() => void) | null = null;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    const auth = getAuth();
    this.unsubscribe = onAuthStateChanged(auth, async (user) => {
      this.user = user;
      if (user) {
        const profile = await this.authService.getCurrentUserProfile();
        if (profile) {
          this.userName = `${profile.lastName} ${profile.firstName}`;
        } else {
          this.userName = user.email || '';
        }
      } else {
        this.userName = '';
      }
    });
  }

  ngOnDestroy() {
    if (this.unsubscribe) this.unsubscribe();
  }

  async logout() {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }
}
