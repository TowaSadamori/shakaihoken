export interface Over70ApplicationData {
  // 提出年月日
  提出年月日和暦?: string;
  提出年月日年?: string;
  提出年月日月?: string;
  提出年月日日?: string;

  // 事業所情報
  事業所整理記号都道府県コード?: string;
  事業所整理記号郡市区符号?: string;
  事業所整理記号事業所記号?: string;
  事業所所在地?: string;
  事業所名称?: string;
  事業主氏名?: string;
  電話番号?: string;
  社会保険労務士氏名?: string;

  // 被保険者情報
  被保険者整理番号?: string;
  被保険者氏名?: string;
  被保険者生年月日年?: string;
  被保険者生年月日月?: string;
  被保険者生年月日日?: string;
  個人番号?: string;

  // 該当情報
  該当年月日年?: string;
  該当年月日月?: string;
  該当年月日日?: string;
  該当理由?: string;
  報酬月額?: string;

  // 70歳到達時の情報
  '70歳到達年月日年'?: string;
  '70歳到達年月日月'?: string;
  '70歳到達年月日日'?: string;
  '70歳到達時の報酬月額'?: string;

  // 適用区分
  適用区分?: string;

  // 被扶養者情報
  被扶養者有無?: string;
  被扶養者氏名?: string;
  被扶養者生年月日年?: string;
  被扶養者生年月日月?: string;
  被扶養者生年月日日?: string;
  被扶養者続柄?: string;
  被扶養者個人番号?: string;

  // その他
  備考?: string;
  添付書類確認?: string;

  [key: string]: unknown;
}

export function exportOver70ApplicationToCSV(data: Over70ApplicationData): string {
  // CSVヘッダー（公式様式に基づく）
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
    '電話番号',
    '社会保険労務士氏名',
    '被保険者整理番号',
    '被保険者氏名',
    '被保険者生年月日年',
    '被保険者生年月日月',
    '被保険者生年月日日',
    '個人番号',
    '該当年月日年',
    '該当年月日月',
    '該当年月日日',
    '該当理由',
    '報酬月額',
    '70歳到達年月日年',
    '70歳到達年月日月',
    '70歳到達年月日日',
    '70歳到達時の報酬月額',
    '適用区分',
    '被扶養者有無',
    '被扶養者氏名',
    '被扶養者生年月日年',
    '被扶養者生年月日月',
    '被扶養者生年月日日',
    '被扶養者続柄',
    '被扶養者個人番号',
    '備考',
    '添付書類確認',
  ];

  // データ行の作成
  const values = headers.map((header) => {
    const value = data[header];
    if (value === null || value === undefined) {
      return '';
    }
    // 文字列の場合、カンマやダブルクォートをエスケープ
    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  });

  // CSV形式で結合
  const csvContent = [headers.join(','), values.join(',')].join('\n');

  // BOM付きUTF-8で返す（Excelでの文字化け防止）
  return '\uFEFF' + csvContent;
}
