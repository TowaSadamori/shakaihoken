export function exportInsuredPersonNameAddressChangeToCSV(
  formData: Record<string, unknown>
): string {
  // BOM付きUTF-8でExcelでの文字化けを防ぐ
  const BOM = '\uFEFF';

  // CSVヘッダー（公式様式の全フィールド）
  const headers = [
    // 提出年月日（右上）
    '提出年月日和暦',
    '提出年月日年',
    '提出年月日月',
    '提出年月日日',

    // 事業所整理記号（3つの部分）
    '事業所整理記号1',
    '事業所整理記号2',
    '事業所整理記号3',

    // 被保険者証記号
    '被保険者証記号',

    // 個人番号または基礎年金番号
    '個人番号または基礎年金番号',

    // 生年月日
    '生年月日和暦',
    '生年月日年',
    '生年月日月',
    '生年月日日',

    // 被保険者氏名（変更後）
    '被保険者氏名変更後フリガナ',
    '被保険者氏名変更後漢字',

    // 変更年月日
    '変更年月日和暦',
    '変更年月日年',
    '変更年月日月',
    '変更年月日日',

    // 備考
    '備考',

    // 事業所情報
    '事業所所在地',
    '事業所名称',
    '事業主氏名',
    '電話番号',

    // 社会保険労務士情報（右下）
    '社会保険労務士事務所整理番号',
    '社会保険労務士氏名',

    // その他
    '添付書類確認',
    '備考詳細',
  ];

  // データ行の作成
  const values = headers.map((header) => {
    const value = formData[header];

    // チェックボックスの値を数値に変換
    if (typeof value === 'boolean') {
      return value ? '1' : '0';
    }

    // 値が存在しない場合は空文字
    if (value === null || value === undefined) {
      return '';
    }

    // 文字列値をCSV形式でエスケープ
    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  });

  // CSV文字列の構築
  const csvContent = [headers.join(','), values.join(',')].join('\n');

  return BOM + csvContent;
}
