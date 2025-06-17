export interface MonthlyChangeNotificationPerson {
  被保険者整理番号: string;
  被保険者氏名: string;
  生年月日: string;
  改定年月: string;
  従前の標準報酬月額: string;
  従前改定月: string;
  昇降給: string;
  遡及支払額: string;
  支給月1: string;
  支給月2: string;
  支給月3: string;
  給与計算の基礎日数1: string;
  給与計算の基礎日数2: string;
  給与計算の基礎日数3: string;
  通貨によるものの額1: string;
  通貨によるものの額2: string;
  通貨によるものの額3: string;
  現物によるものの額1: string;
  現物によるものの額2: string;
  現物によるものの額3: string;
  合計1: string;
  合計2: string;
  合計3: string;
  総計: string;
  平均額: string;
  修正平均額: string;
  個人番号: string;
  備考: string;
  該当理由チェック1: string;
  該当理由チェック2: string;
  該当理由チェック3: string;
  該当理由チェック4: string;
  該当理由チェック5: string;
  該当理由チェック6: string;
}

export interface MonthlyChangeNotificationFormData {
  提出年月日和暦: string;
  提出年月日年: string;
  提出年月日月: string;
  提出年月日日: string;
  事業所整理記号都道府県コード: string;
  事業所整理記号郡市区符号: string;
  事業所整理記号事業所記号: string;
  事業所所在地: string;
  事業所名称: string;
  事業主氏名: string;
  電話番号: string;
  社会保険労務士氏名: string;
  insuredList: MonthlyChangeNotificationPerson[];
  [key: string]: unknown;
}

export function exportMonthlyChangeNotificationToCSV(
  formData: Record<string, string | Record<string, string>[]>
): string {
  // 提出者情報のキー
  const officeKeys = [
    '提出年月日和暦',
    '提出年月日年',
    '提出年月日月',
    '提出年月日日',
    '事業所整理記号都道府県コード',
    '事業所整理記号郡市区符号',
    '事業所整理記号事業所記号',
    '事業所所在地',
    '事業所名称',
    '事業主氏名',
    '電話番号',
    '社会保険労務士氏名',
  ];

  // 被保険者情報のキー
  const personKeys = [
    '被保険者整理番号',
    '被保険者氏名',
    '生年月日',
    '改定年月',
    '従前の標準報酬月額',
    '従前改定月',
    '昇降給',
    '遡及支払額',
    '支給月1',
    '支給月2',
    '支給月3',
    '給与計算の基礎日数1',
    '給与計算の基礎日数2',
    '給与計算の基礎日数3',
    '通貨によるものの額1',
    '通貨によるものの額2',
    '通貨によるものの額3',
    '現物によるものの額1',
    '現物によるものの額2',
    '現物によるものの額3',
    '合計1',
    '合計2',
    '合計3',
    '総計',
    '平均額',
    '修正平均額',
    '個人番号',
    '備考',
    '該当理由チェック1',
    '該当理由チェック2',
    '該当理由チェック3',
    '該当理由チェック4',
    '該当理由チェック5',
    '該当理由チェック6',
  ];

  const headers = [...officeKeys, ...personKeys];
  const rows = ((formData['insuredList'] as Record<string, string>[]) || []).map(
    (person: Record<string, string>) => [
      ...officeKeys.map((key) => `"${(formData[key] ?? '').toString().replace(/"/g, '""')}"`),
      ...personKeys.map((key) => `"${(person[key] ?? '').replace(/"/g, '""')}"`),
    ]
  );

  const csvContent = [
    headers.map((h) => `"${h}"`).join(','),
    ...rows.map((row: string[]) => row.join(',')),
  ].join('\r\n');

  return csvContent;
}
