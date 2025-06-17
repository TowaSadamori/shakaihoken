export interface InsuranceCardReissueData {
  // 提出年月日
  提出年月日年?: string;
  提出年月日月?: string;
  提出年月日日?: string;

  // 事業所情報
  事業所整理記号?: string;
  事業所所在地?: string;
  事業所名称?: string;
  事業主氏名?: string;
  電話番号?: string;

  // 被保険者情報
  被保険者証記号?: string;
  被保険者証番号?: string;
  被保険者氏名カナ?: string;
  被保険者氏名漢字?: string;
  被保険者生年月日年?: string;
  被保険者生年月日月?: string;
  被保険者生年月日日?: string;
  被保険者住所?: string;
  電話番号被保険者?: string;

  // 再交付を申請する被保険者証
  被保険者本人分?: boolean;
  被扶養者家族分?: boolean;

  // 被扶養者情報（複数人対応）
  被扶養者1氏名?: string;
  被扶養者1続柄?: string;
  被扶養者1生年月日年?: string;
  被扶養者1生年月日月?: string;
  被扶養者1生年月日日?: string;
  被扶養者2氏名?: string;
  被扶養者2続柄?: string;
  被扶養者2生年月日年?: string;
  被扶養者2生年月日月?: string;
  被扶養者2生年月日日?: string;
  被扶養者3氏名?: string;
  被扶養者3続柄?: string;
  被扶養者3生年月日年?: string;
  被扶養者3生年月日月?: string;
  被扶養者3生年月日日?: string;

  // 再交付を必要とする理由
  再交付理由?: string;
  再交付理由詳細?: string;

  // 船員保険被保険者証
  船員保険被保険者証有無?: string;
  船員保険事業所整理記号?: string;
  船員保険被保険者氏名?: string;
  船員保険被保険者証番号?: string;

  // 添付書類
  添付書類確認?: string;

  // 備考
  備考?: string;

  [key: string]: unknown;
}

export function exportInsuranceCardReissueToCSV(data: InsuranceCardReissueData): string {
  // CSVヘッダー（公式様式に基づく）
  const headers = [
    '提出年月日年',
    '提出年月日月',
    '提出年月日日',
    '事業所整理記号',
    '事業所所在地',
    '事業所名称',
    '事業主氏名',
    '電話番号',
    '被保険者証記号',
    '被保険者証番号',
    '被保険者氏名カナ',
    '被保険者氏名漢字',
    '被保険者生年月日年',
    '被保険者生年月日月',
    '被保険者生年月日日',
    '被保険者住所',
    '電話番号被保険者',
    '被保険者本人分',
    '被扶養者家族分',
    '被扶養者1氏名',
    '被扶養者1続柄',
    '被扶養者1生年月日年',
    '被扶養者1生年月日月',
    '被扶養者1生年月日日',
    '被扶養者2氏名',
    '被扶養者2続柄',
    '被扶養者2生年月日年',
    '被扶養者2生年月日月',
    '被扶養者2生年月日日',
    '被扶養者3氏名',
    '被扶養者3続柄',
    '被扶養者3生年月日年',
    '被扶養者3生年月日月',
    '被扶養者3生年月日日',
    '再交付理由',
    '再交付理由詳細',
    '船員保険被保険者証有無',
    '船員保険事業所整理記号',
    '船員保険被保険者氏名',
    '船員保険被保険者証番号',
    '添付書類確認',
    '備考',
  ];

  // データ行の作成
  const values = headers.map((header) => {
    const value = data[header];
    if (value === null || value === undefined) {
      return '';
    }
    // チェックボックスの場合
    if (typeof value === 'boolean') {
      return value ? '1' : '0';
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
