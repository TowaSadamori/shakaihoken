import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { getFirestore, collection, getDocs, doc, setDoc, query, orderBy } from 'firebase/firestore';

@Component({
  selector: 'app-insurance-rate-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './insurance-rate-list.component.html',
  styleUrl: './insurance-rate-list.component.scss',
})
export class InsuranceRateListComponent implements OnInit {
  showYearSelect = false;
  years: number[] = [];
  private allYears: number[] = [2024, 2023, 2022, 2021];
  get candidateYears(): number[] {
    return this.allYears.filter((y) => !this.years.includes(y));
  }
  selectedYear: number = this.candidateYears[0];
  db = getFirestore();
  rateId = 'kenpo'; // 今回は健康保険で固定
  eras = [
    { label: '令和', value: 'reiwa', start: 2019 },
    { label: '平成', value: 'heisei', start: 1989 },
  ];
  selectedEra = 'reiwa';
  eraYear = 1;
  errorMessage = '';

  constructor(private router: Router) {}

  async ngOnInit() {
    await this.loadYearsFromFirestore();
  }

  async loadYearsFromFirestore() {
    const yearsCol = collection(this.db, `insurance_rates/${this.rateId}/years`);
    const qy = query(yearsCol, orderBy('year', 'desc'));
    const snapshot = await getDocs(qy);
    this.years = snapshot.docs
      .map((d) => d.data()['year'])
      .filter((y): y is number => typeof y === 'number');
  }

  goHome() {
    this.router.navigate(['/']);
  }

  async addYear() {
    // 和暦→西暦変換
    const era = this.eras.find((e) => e.value === this.selectedEra);
    if (!era || !this.eraYear || this.eraYear < 1 || this.eraYear > 99) return;
    const year = era.start + this.eraYear - 1;
    if (this.years.includes(year)) {
      this.errorMessage = `${this.toWareki(year)}（${year}年）はすでに追加されています。`;
      return;
    }
    const yearsCol = collection(this.db, `insurance_rates/${this.rateId}/years`);
    const yearDoc = doc(yearsCol, String(year));
    await setDoc(yearDoc, { year });
    await this.loadYearsFromFirestore();
    this.showYearSelect = false;
    this.eraYear = 1;
    this.selectedEra = 'reiwa';
    this.errorMessage = '';
  }

  toggleYearSelect() {
    this.showYearSelect = !this.showYearSelect;
    if (this.showYearSelect && this.candidateYears.length > 0) {
      this.selectedYear = this.candidateYears[0];
    }
  }

  toWareki(year: number): string {
    if (year >= 2019) {
      return `令和${year - 2018}年`;
    } else if (year >= 1989) {
      return `平成${year - 1988}年`;
    } else if (year >= 1926) {
      return `昭和${year - 1925}年`;
    } else {
      return `${year}年`;
    }
  }
}
