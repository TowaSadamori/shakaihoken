export interface ChildcarePeriodExemptionData {
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

  // 申出区分
  申出区分?: string;

  // 被保険者情報
  被保険者整理番号?: string;
  被保険者氏名カナ?: string;
  被保険者氏名漢字?: string;
  被保険者生年月日年?: string;
  被保険者生年月日月?: string;
  被保険者生年月日日?: string;
  被保険者個人番号?: string;

  // 養育する子の情報
  養育する子の氏名?: string;
  養育する子の生年月日年?: string;
  養育する子の生年月日月?: string;
  養育する子の生年月日日?: string;
  養育する子の性別?: string;
  被保険者との続柄?: string;

  // 養育期間の申出をする場合
  申出養育開始年月日年?: string;
  申出養育開始年月日月?: string;
  申出養育開始年月日日?: string;
  申出特例期間開始年月日年?: string;
  申出特例期間開始年月日月?: string;
  申出特例期間開始年月日日?: string;
  申出特例期間終了年月日年?: string;
  申出特例期間終了年月日月?: string;
  申出特例期間終了年月日日?: string;

  // 養育期間の終了をする場合
  終了養育終了年月日年?: string;
  終了養育終了年月日月?: string;
  終了養育終了年月日日?: string;
  終了特例期間終了年月日年?: string;
  終了特例期間終了年月日月?: string;
  終了特例期間終了年月日日?: string;

  // 終了について
  終了理由チェック1?: boolean; // 申出に係る子が3歳に到達したため
  終了理由チェック2?: boolean; // 退職により、申出者が厚生年金保険の被保険者資格を喪失したとき
  終了理由チェック3?: boolean; // 申出に係る子以外の子について養育特例措置をうけるため
  終了理由チェック4?: boolean; // 申出者が産前産後休業または育児休業を開始したため

  // 記入方法
  記入方法確認?: string;

  // 備考
  備考?: string;
  添付書類確認?: string;

  [key: string]: unknown;
}

export function exportChildcarePeriodExemptionToCSV(data: ChildcarePeriodExemptionData): string {
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
    '申出区分',
    '被保険者整理番号',
    '被保険者氏名カナ',
    '被保険者氏名漢字',
    '被保険者生年月日年',
    '被保険者生年月日月',
    '被保険者生年月日日',
    '被保険者個人番号',
    '養育する子の氏名',
    '養育する子の生年月日年',
    '養育する子の生年月日月',
    '養育する子の生年月日日',
    '養育する子の性別',
    '被保険者との続柄',
    '申出養育開始年月日年',
    '申出養育開始年月日月',
    '申出養育開始年月日日',
    '申出特例期間開始年月日年',
    '申出特例期間開始年月日月',
    '申出特例期間開始年月日日',
    '申出特例期間終了年月日年',
    '申出特例期間終了年月日月',
    '申出特例期間終了年月日日',
    '終了養育終了年月日年',
    '終了養育終了年月日月',
    '終了養育終了年月日日',
    '終了特例期間終了年月日年',
    '終了特例期間終了年月日月',
    '終了特例期間終了年月日日',
    '終了理由チェック1',
    '終了理由チェック2',
    '終了理由チェック3',
    '終了理由チェック4',
    '記入方法確認',
    '備考',
    '添付書類確認',
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
