export interface StandardRemunerationPerson {
  被保険者整理番号: string;
  被保険者氏名: string;
  生年月日: string;
  適用年月: string;
  個人番号: string;
  従前の標準報酬月額: string;
  従前改定月: string;
  '昇（降）給': string;
  遡及支払額: string;
  '4月_支給月': string;
  '4月_日数': string;
  '4月_通貨': string;
  '4月_現物': string;
  '4月_合計': string;
  '5月_支給月': string;
  '5月_日数': string;
  '5月_通貨': string;
  '5月_現物': string;
  '5月_合計': string;
  '6月_支給月': string;
  '6月_日数': string;
  '6月_通貨': string;
  '6月_現物': string;
  '6月_合計': string;
  総計: string;
  平均額: string;
  修正平均額: string;
  備考: string;
}

export interface StandardRemunerationReportFormData {
  提出年月日x年: string;
  提出年月日x月: string;
  提出年月日x日: string;
  事業所整理記号: string;
  事業所番号: string;
  事業所所在地: string;
  事業所名称: string;
  事業主氏名: string;
  電話番号: string;
  社会保険労務士氏名: string;
  insuredList: StandardRemunerationPerson[];
  [key: string]: unknown;
}

export function exportStandardRemunerationReportToCSV(
  formData: Record<string, string | Record<string, string>[]>
): string {
  // 提出者情報のキー
  const officeKeys = [
    '提出年月日x年',
    '提出年月日x月',
    '提出年月日x日',
    '事業所整理記号',
    '事業所番号',
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
    '従前の標準報酬月額',
    '4月_固定的賃金',
    '4月_通勤手当',
    '4月_現物給与',
    '4月_合計',
    '5月_固定的賃金',
    '5月_通勤手当',
    '5月_現物給与',
    '5月_合計',
    '6月_固定的賃金',
    '6月_通勤手当',
    '6月_現物給与',
    '6月_合計',
    '平均額',
    '修正後平均額',
    '個人番号',
    '備考',
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
