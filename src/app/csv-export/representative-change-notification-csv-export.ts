import { representativeChangeFormItems } from '../employer-procedures/representative-change-notification/representative-change-notification.component';

export function exportRepresentativeChangeNotificationToCSV(
  formData: Record<string, unknown>
): string {
  const headers = representativeChangeFormItems;
  const values = headers.map((h) => (formData[h] ?? '').toString().replace(/"/g, '""'));
  return [headers.join(','), values.join(',')].join('\n');
}
