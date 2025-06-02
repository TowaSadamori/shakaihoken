// src/main.ts

import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component'; // AppComponentのパスが正しいか確認してください
import { environment } from './environments/environment';

// Firebase SDK から initializeApp をインポート
import { initializeApp } from 'firebase/app';

// Firebaseを初期化
initializeApp(environment.firebase);

bootstrapApplication(AppComponent, {
  providers: [
    // ここに他のプロバイダーがあれば記述します
    // 例: importProvidersFrom(HttpClientModule) など
  ],
}).catch((err) => console.error(err));
