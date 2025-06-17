export function exportCareInsuranceExemptionToCSV(formData: Record<string, unknown>): string {
  const headers = [
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
    '事業所電話番号',
    '社会保険労務士氏名',
    '被保険者氏名',
    '被保険者生年月日年',
    '被保険者生年月日月',
    '被保険者生年月日日',
    '被保険者整理番号',
  ];

  // 被扶養者リストを取得
  const dependentList = (formData['被扶養者リスト'] as Record<string, unknown>[]) || [];

  // 被扶養者ごとのヘッダーを追加
  dependentList.forEach((_, index) => {
    const dependentNumber = index + 1;
    headers.push(
      `被扶養者${dependentNumber}_氏名`,
      `被扶養者${dependentNumber}_生年月日年`,
      `被扶養者${dependentNumber}_生年月日月`,
      `被扶養者${dependentNumber}_生年月日日`,
      `被扶養者${dependentNumber}_続柄`,
      `被扶養者${dependentNumber}_作成年月日年`,
      `被扶養者${dependentNumber}_作成年月日月`,
      `被扶養者${dependentNumber}_作成年月日日`,
      `被扶養者${dependentNumber}_受給被保険者住所`,
      `被扶養者${dependentNumber}_受給被保険者氏名`,
      `被扶養者${dependentNumber}_適用除外理由該当1`,
      `被扶養者${dependentNumber}_適用除外理由該当2`,
      `被扶養者${dependentNumber}_適用除外理由非該当1`,
      `被扶養者${dependentNumber}_適用除外理由非該当2`,
      `被扶養者${dependentNumber}_該当年月日年`,
      `被扶養者${dependentNumber}_該当年月日月`,
      `被扶養者${dependentNumber}_該当年月日日`,
      `被扶養者${dependentNumber}_入居施設名称`,
      `被扶養者${dependentNumber}_入居施設所在地`,
      `被扶養者${dependentNumber}_電話番号`,
      `被扶養者${dependentNumber}_備考`
    );
  });

  // 基本情報の値を取得
  const values: string[] = [];

  // 基本情報（被扶養者リスト以外）
  const basicFields = [
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
    '事業所電話番号',
    '社会保険労務士氏名',
    '被保険者氏名',
    '被保険者生年月日年',
    '被保険者生年月日月',
    '被保険者生年月日日',
    '被保険者整理番号',
  ];

  basicFields.forEach((field) => {
    const value = formData[field];
    values.push(value != null ? String(value) : '');
  });

  // 被扶養者の値を追加
  dependentList.forEach((dependent) => {
    const dependentFields = [
      '被扶養者氏名',
      '被扶養者生年月日年',
      '被扶養者生年月日月',
      '被扶養者生年月日日',
      '続柄',
      '被扶養者作成年月日年',
      '被扶養者作成年月日月',
      '被扶養者作成年月日日',
      '受給被保険者住所',
      '受給被保険者氏名',
      '適用除外理由該当1',
      '適用除外理由該当2',
      '適用除外理由非該当1',
      '適用除外理由非該当2',
      '該当年月日年',
      '該当年月日月',
      '該当年月日日',
      '入居施設名称',
      '入居施設所在地',
      '電話番号',
      '備考',
    ];

    dependentFields.forEach((field) => {
      const value = dependent[field];
      values.push(value != null ? String(value) : '');
    });
  });

  // CSVフォーマット（ヘッダー + データ）
  const csvContent = [
    headers.join(','),
    values.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','),
  ].join('\n');

  return csvContent;
}
