import { voluntaryApplicationFormItems } from '../employer-procedures/voluntary-application-notification/voluntary-application-notification.component';

export function exportVoluntaryApplicationNotificationToCSV(
  formData: Record<string, unknown>
): string {
  const headers = voluntaryApplicationFormItems;
  const values = headers.map((h) => (formData[h] ?? '').toString().replace(/"/g, '""'));
  return [headers.join(','), values.join(',')].join('\n');
}
