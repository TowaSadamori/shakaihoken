export interface QualificationAcquisitionNotificationFormData {
  届書提出日年: string;
  届書提出日月: string;
  届書提出日日: string;
  事業所整理記号: string;
  事業所番号: string;
  事業所所在地: string;
  事業所名称: string;
  事業主氏名: string;
  電話番号: string;
  被保険者整理番号: string;
  被保険者氏名: string;
  フリガナ: string;
  生年月日: string;
  性別: string;
  資格取得年月日: string;
  報酬月額: string;
  従事する事業の内容: string;
  就労形態: string;
  所定労働時間: string;
  所定労働日数: string;
  契約期間: string;
  住所: string;
  基礎年金番号: string;
  個人番号マイナンバー: string;
  '70歳以上被用者該当': string;
  国籍等: string;
  在留カード番号等: string;
  現物給与食事: string;
  現物給与住宅: string;
  現物給与通勤定期券等: string;
  備考: string;
  [key: string]: unknown;
}

export function exportQualificationAcquisitionNotificationToCSV(
  formData: Record<string, string>
): string {
  // 実際の帳票画像から抽出した項目
  const keys = [
    '届書提出日年',
    '届書提出日月',
    '届書提出日日',
    '事業所整理記号',
    '事業所番号',
    '事業所所在地',
    '事業所名称',
    '事業主氏名',
    '電話番号',
    '被保険者整理番号',
    '被保険者氏名',
    'フリガナ',
    '生年月日',
    '性別',
    '資格取得年月日',
    '報酬月額',
    '従事する事業の内容',
    '就労形態',
    '所定労働時間',
    '所定労働日数',
    '契約期間',
    '住所',
    '基礎年金番号',
    '個人番号マイナンバー',
    '70歳以上被用者該当',
    '国籍等',
    '在留カード番号等',
    '現物給与食事',
    '現物給与住宅',
    '現物給与通勤定期券等',
    '備考',
  ];

  const headers = keys.map((key) => `"${key}"`).join(',');
  const values = keys.map((key) => `"${(formData[key] ?? '').replace(/"/g, '""')}"`).join(',');

  return [headers, values].join('\r\n');
}
