import { Pipe, PipeTransform } from '@angular/core';
import { Decimal } from 'decimal.js';
import { SocialInsuranceCalculator } from '../utils/decimal-calculator';

@Pipe({ name: 'roundForEmployeeBurden', standalone: true })
export class RoundForEmployeeBurdenPipe implements PipeTransform {
  transform(value: string | number | null | undefined): string {
    if (value == null || value === '' || value === '0') return '0';
    try {
      return SocialInsuranceCalculator.roundForEmployeeBurden(new Decimal(value));
    } catch {
      return String(value);
    }
  }
}
