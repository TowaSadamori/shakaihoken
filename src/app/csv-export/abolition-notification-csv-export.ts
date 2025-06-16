import { abolitionNotificationFormItems } from '../employer-procedures/abolition-notification/abolition-notification.component';

export function exportAbolitionNotificationToCSV(formData: Record<string, unknown>): string {
  const headers = abolitionNotificationFormItems;
  const values = headers.map((h) => (formData[h] ?? '').toString().replace(/"/g, '""'));
  return [headers.join(','), values.join(',')].join('\n');
}
