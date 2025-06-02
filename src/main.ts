// src/main.ts

import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component'; // AppComponentのパスが正しいか確認してください
import { environment } from './environments/environment';

// Firebase SDK から initializeApp をインポート
import { initializeApp } from 'firebase/app';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';

// Firebaseを初期化
initializeApp(environment.firebase);

bootstrapApplication(AppComponent, {
  providers: [
    // ここに他のプロバイダーがあれば記述します
    // 例: importProvidersFrom(HttpClientModule) など
    provideRouter(routes),
  ],
}).catch((err) => console.error(err));
