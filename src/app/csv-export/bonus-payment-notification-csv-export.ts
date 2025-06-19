// 賞与支払届（bonus-payment-notification）CSVエクスポート
export interface InsuredPerson {
  被保険者整理番号: string;
  被保険者氏名: string;
  生年月日: string;
  賞与支払年月日: string;
  賞与支払額: string;
  賞与額千円未満切捨て: string;
  個人番号基礎年金番号: string;
  備考: string;
}

export interface BonusPaymentNotificationFormData {
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
  insuredList: InsuredPerson[];
  [key: string]: unknown;
}

export function exportBonusPaymentNotificationToCSV(
  formData: BonusPaymentNotificationFormData
): string {
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
    '被保険者整理番号',
    '被保険者氏名',
    '生年月日',
    '賞与支払年月日',
    '賞与支払額',
    '賞与額千円未満切捨て',
    '個人番号基礎年金番号',
    '備考',
  ];

  const insuredList: InsuredPerson[] = formData.insuredList || [];
  const rows = insuredList.map((insured: InsuredPerson) => [
    formData['提出年月日x年'] || '',
    formData['提出年月日x月'] || '',
    formData['提出年月日x日'] || '',
    formData['事業所整理記号'] || '',
    formData['事業所番号'] || '',
    formData['事業所所在地'] || '',
    formData['事業所名称'] || '',
    formData['事業主氏名'] || '',
    formData['電話番号'] || '',
    formData['社会保険労務士氏名'] || '',
    insured['被保険者整理番号'] || '',
    insured['被保険者氏名'] || '',
    insured['生年月日'] || '',
    insured['賞与支払年月日'] || '',
    insured['賞与支払額'] || '',
    insured['賞与額千円未満切捨て'] || '',
    insured['個人番号基礎年金番号'] || '',
    insured['備考'] || '',
  ]);

  const csv = [headers, ...rows]
    .map((row: string[]) => row.map((v: string) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  return csv;
}
