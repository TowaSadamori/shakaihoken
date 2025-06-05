// src/main.ts

import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component'; // AppComponentのパスが正しいか確認してください
import { environment } from './environments/environment';

// Firebase SDK から initializeApp をインポート
import { initializeApp } from 'firebase/app';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { importProvidersFrom } from '@angular/core';
import { MaterialProviderModule } from './app/modules/material-provider.module';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeJa from '@angular/common/locales/ja';
import { DateAdapter } from '@angular/material/core';
import { CustomDateAdapter } from './app/utils/custom-date-adapter';
import { MAT_DATE_FORMATS } from '@angular/material/core';
import { MY_DATE_FORMATS } from './app/utils/my-date-formats';

// Firebaseを初期化
initializeApp(environment.firebase);

// 日付フォーマットの「d日」を「d」に書き換える
if (localeJa && Array.isArray(localeJa[3]) && Array.isArray(localeJa[3][0])) {
  localeJa[3][0][2] = 'd';
}
registerLocaleData(localeJa);

bootstrapApplication(AppComponent, {
  providers: [
    // ここに他のプロバイダーがあれば記述します
    // 例: importProvidersFrom(HttpClientModule) など
    provideRouter(routes),
    provideAnimationsAsync(),
    importProvidersFrom(MaterialProviderModule),
    { provide: LOCALE_ID, useValue: 'ja-JP' },
    { provide: DateAdapter, useClass: CustomDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: MY_DATE_FORMATS },
  ],
}).catch((err) => console.error(err));
