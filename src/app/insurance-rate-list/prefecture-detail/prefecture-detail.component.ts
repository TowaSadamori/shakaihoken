import { Component } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CsvImportComponent } from './insurance-rate-csv-import.component';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import Papa from 'papaparse';

@Component({
  selector: 'app-prefecture-detail',
  standalone: true,
  imports: [CommonModule, CsvImportComponent],
  templateUrl: './prefecture-detail.component.html',
  styleUrl: './prefecture-detail.component.scss',
})
export class PrefectureDetailComponent {
  year: string | null = null;
  prefecture: string | null = null;
  prefectureName: string | null = null;
  showCsvImport = false;

  // 都道府県コードと名称の対応表
  static PREF_LIST = [
    { code: '01', name: '北海道' },
    { code: '02', name: '青森' },
    { code: '03', name: '岩手' },
    { code: '04', name: '宮城' },
    { code: '05', name: '秋田' },
    { code: '06', name: '山形' },
    { code: '07', name: '福島' },
    { code: '08', name: '茨城' },
    { code: '09', name: '栃木' },
    { code: '10', name: '群馬' },
    { code: '11', name: '埼玉' },
    { code: '12', name: '千葉' },
    { code: '13', name: '東京' },
    { code: '14', name: '神奈川' },
    { code: '15', name: '新潟' },
    { code: '16', name: '富山' },
    { code: '17', name: '石川' },
    { code: '18', name: '福井' },
    { code: '19', name: '山梨' },
    { code: '20', name: '長野' },
    { code: '21', name: '岐阜' },
    { code: '22', name: '静岡' },
    { code: '23', name: '愛知' },
    { code: '24', name: '三重' },
    { code: '25', name: '滋賀' },
    { code: '26', name: '京都' },
    { code: '27', name: '大阪' },
    { code: '28', name: '兵庫' },
    { code: '29', name: '奈良' },
    { code: '30', name: '和歌山' },
    { code: '31', name: '鳥取' },
    { code: '32', name: '島根' },
    { code: '33', name: '岡山' },
    { code: '34', name: '広島' },
    { code: '35', name: '山口' },
    { code: '36', name: '徳島' },
    { code: '37', name: '香川' },
    { code: '38', name: '愛媛' },
    { code: '39', name: '高知' },
    { code: '40', name: '福岡' },
    { code: '41', name: '佐賀' },
    { code: '42', name: '長崎' },
    { code: '43', name: '熊本' },
    { code: '44', name: '大分' },
    { code: '45', name: '宮崎' },
    { code: '46', name: '鹿児島' },
    { code: '47', name: '沖縄' },
  ];

  // ダミーデータ: 写真のカラム構成に合わせて拡張
  insuranceTable: {
    grade: string;
    standardSalary: string;
    salaryRange: string;
    nonNursingRate: string;
    nonNursingTotal: string;
    nonNursingHalf: string;
    nursingRate: string;
    nursingTotal: string;
    nursingHalf: string;
    pensionRate: string;
    pensionTotal: string;
    pensionHalf: string;
  }[] = [];

  // 厚生年金保険料（等級が異なる場合）のダミーデータ
  pensionTable: {
    grade: number;
    standardSalary: string;
    salaryRange: string;
    pensionRate: string;
    pensionTotal: string;
    pensionHalf: string;
  }[] = [];

  rates: {
    nonNursingRate: string;
    nursingRate: string;
    pensionRate: string;
  } = { nonNursingRate: '', nursingRate: '', pensionRate: '' };

  constructor(
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.route.paramMap.subscribe(async (params) => {
      this.year = params.get('year');
      this.prefecture = params.get('prefecture');
      this.prefectureName =
        PrefectureDetailComponent.PREF_LIST.find((p) => p.code === this.prefecture)?.name || '';
      // Firestoreからデータ取得
      if (this.year && this.prefectureName) {
        const db = getFirestore();
        const docRef = doc(
          db,
          `insurance_rates/${this.year}/prefectures/${this.prefectureName}/rate_table/main`
        );
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          this.insuranceTable = data['insuranceTable'] || [];
          this.pensionTable = data['pensionTable'] || [];
          this.rates = data['rates'] || { nonNursingRate: '', nursingRate: '', pensionRate: '' };
        }
      }
    });
  }

  goBackToPrefList() {
    if (this.year) {
      this.router.navigate(['/insurance-rate-list', this.year]);
    } else {
      this.router.navigate(['/insurance-rate-list']);
    }
  }

  openCsvImport() {
    this.showCsvImport = true;
  }
  closeCsvImport() {
    this.showCsvImport = false;
  }
  async onCsvImported(csvText: string) {
    const result = Papa.parse<string[]>(csvText, { skipEmptyLines: true });
    const rows = result.data;

    // 保険料率の抽出
    const rateRow = rows.find((r) => r.some((cell) => cell.match(/\d+\.\d+%/)));
    const nonNursingRate = rateRow?.[5] || '';
    const nursingRate = rateRow?.[7] || '';
    const pensionRate = rateRow?.[9] || '';
    this.rates = { nonNursingRate, nursingRate, pensionRate };

    // データ行の抽出（等級が数字または数字＋（数字）で始まる行のみ）
    const dataRows = rows.filter((r) => r[0] && r[0].match(/^\d+(（\d+）)?/));

    // デバッグ用：CSVの構造を確認
    console.log('🔍 CSV構造デバッグ:');
    dataRows.slice(0, 5).forEach((r, i) => {
      console.log(`行${i + 1}:`, r);
    });

    // 健康保険・介護保険用
    this.insuranceTable = dataRows.map((r, index) => {
      // 前の等級の上限を下限とする（1級は例外）
      const prevUpperLimit = index > 0 ? dataRows[index - 1][4] : r[2];

      // デバッグ用：範囲設定の詳細をログ
      console.log(`等級${r[0]}: prevUpperLimit=${prevUpperLimit}, r[4]=${r[4]}`);

      return {
        grade: r[0],
        standardSalary: r[1],
        salaryRange: `${prevUpperLimit} ～ ${r[4]}`,
        nonNursingRate: nonNursingRate,
        nonNursingTotal: r[5]?.replace(/,/g, '') || '0',
        nonNursingHalf: r[6]?.replace(/,/g, '') || '0',
        nursingRate: nursingRate,
        nursingTotal: r[7]?.replace(/,/g, '') || '0',
        nursingHalf: r[8]?.replace(/,/g, '') || '0',
        pensionRate: '',
        pensionTotal: '0',
        pensionHalf: '0',
      };
    });

    // 厚生年金用
    const pensionRows = dataRows.filter((r) => r[0].includes('（'));
    this.pensionTable = pensionRows.map((r, index) => {
      // 厚生年金1等級は下限なし、その他は前の等級の上限を下限とする
      const gradeNumber = Number(r[0].match(/（(\d+)）/)?.[1] || '0');
      const prevUpperLimit = gradeNumber === 1 ? '' : index > 0 ? pensionRows[index - 1][4] : r[2];

      return {
        grade: gradeNumber,
        standardSalary: r[1],
        salaryRange: `${prevUpperLimit} ～ ${r[4]}`,
        pensionRate: pensionRate,
        pensionTotal: r[9]?.replace(/,/g, '') || '0',
        pensionHalf: r[10]?.replace(/,/g, '') || '0',
      };
    });

    this.showCsvImport = false;

    // Firestore保存
    const db = getFirestore();
    if (this.year && this.prefectureName) {
      const docRef = doc(
        db,
        `insurance_rates/${this.year}/prefectures/${this.prefectureName}/rate_table/main`
      );
      await setDoc(docRef, {
        insuranceTable: this.insuranceTable,
        pensionTable: this.pensionTable,
        rates: this.rates,
        updatedAt: new Date(),
      });
    }
  }
}
