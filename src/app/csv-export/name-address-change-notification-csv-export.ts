import { nameAddressChangeFormItems } from '../employer-procedures/name-address-change-notification/name-address-change-notification.component';

export function exportNameAddressChangeNotificationToCSV(
  formData: Record<string, unknown>
): string {
  const headers = nameAddressChangeFormItems;
  const values = headers.map((h) => (formData[h] ?? '').toString().replace(/"/g, '""'));
  return [headers.join(','), values.join(',')].join('\n');
}
