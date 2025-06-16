// 賞与不支給報告書（no-bonus-report）CSVエクスポート
export interface NoBonusReportFormData {
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
  賞与支払予定年月: string;
  賞与支払年月: string;
  支給の状況: string;
  賞与支払予定月の変更: string;
  [key: string]: unknown;
}

export function exportNoBonusReportToCSV(formData: NoBonusReportFormData): string {
  const headers = [
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
    '賞与支払予定年月',
    '賞与支払年月',
    '支給の状況',
    '賞与支払予定月の変更',
  ];
  const row = headers.map((key) => formData[key] ?? '');
  const csv = [headers, row]
    .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  return csv;
}
