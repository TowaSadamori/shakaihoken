import { Component } from '@angular/core';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-insurance-rate-pref-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './insurance-rate-pref-list.component.html',
  styleUrl: './insurance-rate-pref-list.component.scss',
})
export class InsuranceRatePrefListComponent {
  pageTitleYear = '';
  year: string | null = null;
  constructor(
    private router: Router,
    public route: ActivatedRoute
  ) {
    this.route.paramMap.subscribe((params) => {
      const year = params.get('year');
      this.year = year;
      if (year) {
        this.pageTitleYear = this.toWareki(Number(year)) + '（' + year + '）';
      }
    });
  }

  goBack() {
    this.router.navigate(['/insurance-rate-list']);
  }

  // 都道府県リスト（エリア分け）
  prefectureAreas = [
    {
      area: '北海道・東北',
      prefectures: [
        { code: '01', name: '北海道' },
        { code: '02', name: '青森' },
        { code: '03', name: '岩手' },
        { code: '04', name: '宮城' },
        { code: '05', name: '秋田' },
        { code: '06', name: '山形' },
        { code: '07', name: '福島' },
      ],
    },
    {
      area: '関東',
      prefectures: [
        { code: '08', name: '茨城' },
        { code: '09', name: '栃木' },
        { code: '10', name: '群馬' },
        { code: '11', name: '埼玉' },
        { code: '12', name: '千葉' },
        { code: '13', name: '東京' },
        { code: '14', name: '神奈川' },
      ],
    },
    {
      area: '甲信越・北陸',
      prefectures: [
        { code: '15', name: '新潟' },
        { code: '16', name: '富山' },
        { code: '17', name: '石川' },
        { code: '18', name: '福井' },
        { code: '19', name: '山梨' },
        { code: '20', name: '長野' },
      ],
    },
    {
      area: '東海',
      prefectures: [
        { code: '21', name: '岐阜' },
        { code: '22', name: '静岡' },
        { code: '23', name: '愛知' },
        { code: '24', name: '三重' },
      ],
    },
    {
      area: '近畿',
      prefectures: [
        { code: '25', name: '滋賀' },
        { code: '26', name: '京都' },
        { code: '27', name: '大阪' },
        { code: '28', name: '兵庫' },
        { code: '29', name: '奈良' },
        { code: '30', name: '和歌山' },
      ],
    },
    {
      area: '中国',
      prefectures: [
        { code: '31', name: '鳥取' },
        { code: '32', name: '島根' },
        { code: '33', name: '岡山' },
        { code: '34', name: '広島' },
        { code: '35', name: '山口' },
      ],
    },
    {
      area: '四国',
      prefectures: [
        { code: '36', name: '徳島' },
        { code: '37', name: '香川' },
        { code: '38', name: '愛媛' },
        { code: '39', name: '高知' },
      ],
    },
    {
      area: '九州・沖縄',
      prefectures: [
        { code: '40', name: '福岡' },
        { code: '41', name: '佐賀' },
        { code: '42', name: '長崎' },
        { code: '43', name: '熊本' },
        { code: '44', name: '大分' },
        { code: '45', name: '宮崎' },
        { code: '46', name: '鹿児島' },
        { code: '47', name: '沖縄' },
      ],
    },
  ];

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
