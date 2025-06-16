import { accountTransferFormItems } from '../employer-procedures/account-transfer-notification/account-transfer-notification.component';

export function exportAccountTransferNotificationToCSV(formData: Record<string, unknown>): string {
  const headers = accountTransferFormItems;
  const values = headers.map((h) => (formData[h] ?? '').toString().replace(/"/g, '""'));
  return [headers.join(','), values.join(',')].join('\n');
}
