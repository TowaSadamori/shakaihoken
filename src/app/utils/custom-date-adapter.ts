import { NativeDateAdapter } from '@angular/material/core';

export class CustomDateAdapter extends NativeDateAdapter {
  override format(date: Date, displayFormat: object): string {
    const formatted = super.format(date, displayFormat);
    // 「日」で終わる場合は「日」を除去
    if (typeof formatted === 'string' && formatted.match(/日$/)) {
      return formatted.replace(/日$/, '');
    }
    return formatted;
  }
}
