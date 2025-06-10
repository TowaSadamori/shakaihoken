import { Component } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-prefecture-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './prefecture-detail.component.html',
  styleUrl: './prefecture-detail.component.scss',
})
export class PrefectureDetailComponent {
  year: string | null = null;
  prefecture: string | null = null;
  prefectureName: string | null = null;

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

  constructor(
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.route.paramMap.subscribe((params) => {
      this.year = params.get('year');
      this.prefecture = params.get('prefecture');
      this.prefectureName =
        PrefectureDetailComponent.PREF_LIST.find((p) => p.code === this.prefecture)?.name || '';
    });
  }

  goBackToPrefList() {
    if (this.year) {
      this.router.navigate(['/insurance-rate-list', this.year]);
    } else {
      this.router.navigate(['/insurance-rate-list']);
    }
  }
}
