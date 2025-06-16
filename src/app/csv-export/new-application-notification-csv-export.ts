export function exportNewApplicationNotificationToCSV(formData: Record<string, unknown>): string {
  // ヘッダー（項目名）はformDataのキー順で出力
  const headers = Object.keys(formData);
  const values = headers.map((h) => (formData[h] ?? '').toString().replace(/"/g, '""'));
  // CSV形式で返す
  return [headers.join(','), values.join(',')].join('\n');
}
