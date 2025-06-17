export function exportMaternityLeaveEndSalaryNotificationToCSV(
  formData: Record<string, unknown>
): string {
  const headers = [
    // 事業所情報
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
    '社会保険労務士氏名',

    // 申出者情報
    '申出者住所',
    '申出者氏名',
    '申出者続柄',
    '申出者電話番号',

    // 被保険者基本情報
    '被保険者整理番号',
    '個人番号',
    '被保険者氏名',
    '被保険者生年月日年',
    '被保険者生年月日月',
    '被保険者生年月日日',

    // 産前産後休業終了情報
    '産前産後休業終了年月日年',
    '産前産後休業終了年月日月',
    '産前産後休業終了年月日日',
    '産前産後休業終了予定年月日年',
    '産前産後休業終了予定年月日月',
    '産前産後休業終了予定年月日日',

    // 3か月間の報酬情報
    '支給年月1年',
    '支給年月1月',
    '給与計算の基礎日数1',
    '通貨によるものの額1',
    '現物によるものの額1',
    '合計1',

    '支給年月2年',
    '支給年月2月',
    '給与計算の基礎日数2',
    '通貨によるものの額2',
    '現物によるものの額2',
    '合計2',

    '支給年月3年',
    '支給年月3月',
    '給与計算の基礎日数3',
    '通貨によるものの額3',
    '現物によるものの額3',
    '合計3',

    // 計算結果
    '総計',
    '平均額',
    '修正平均額',

    // その他・備考
    '備考',
    '添付書類確認',
    'その他特記事項',
  ];

  const rows: string[][] = [headers];

  // データ行を作成
  const row: string[] = [
    // 事業所情報
    String(formData['提出年月日和暦'] || ''),
    String(formData['提出年月日年'] || ''),
    String(formData['提出年月日月'] || ''),
    String(formData['提出年月日日'] || ''),
    String(formData['事業所整理記号都道府県コード'] || ''),
    String(formData['事業所整理記号郡市区符号'] || ''),
    String(formData['事業所整理記号事業所記号'] || ''),
    String(formData['事業所所在地'] || ''),
    String(formData['事業所名称'] || ''),
    String(formData['事業主氏名'] || ''),
    String(formData['電話番号'] || ''),
    String(formData['社会保険労務士氏名'] || ''),

    // 申出者情報
    String(formData['申出者住所'] || ''),
    String(formData['申出者氏名'] || ''),
    String(formData['申出者続柄'] || ''),
    String(formData['申出者電話番号'] || ''),

    // 被保険者基本情報
    String(formData['被保険者整理番号'] || ''),
    String(formData['個人番号'] || ''),
    String(formData['被保険者氏名'] || ''),
    String(formData['被保険者生年月日年'] || ''),
    String(formData['被保険者生年月日月'] || ''),
    String(formData['被保険者生年月日日'] || ''),

    // 産前産後休業終了情報
    String(formData['産前産後休業終了年月日年'] || ''),
    String(formData['産前産後休業終了年月日月'] || ''),
    String(formData['産前産後休業終了年月日日'] || ''),
    String(formData['産前産後休業終了予定年月日年'] || ''),
    String(formData['産前産後休業終了予定年月日月'] || ''),
    String(formData['産前産後休業終了予定年月日日'] || ''),

    // 3か月間の報酬情報
    String(formData['支給年月1年'] || ''),
    String(formData['支給年月1月'] || ''),
    String(formData['給与計算の基礎日数1'] || ''),
    String(formData['通貨によるものの額1'] || ''),
    String(formData['現物によるものの額1'] || ''),
    String(formData['合計1'] || ''),

    String(formData['支給年月2年'] || ''),
    String(formData['支給年月2月'] || ''),
    String(formData['給与計算の基礎日数2'] || ''),
    String(formData['通貨によるものの額2'] || ''),
    String(formData['現物によるものの額2'] || ''),
    String(formData['合計2'] || ''),

    String(formData['支給年月3年'] || ''),
    String(formData['支給年月3月'] || ''),
    String(formData['給与計算の基礎日数3'] || ''),
    String(formData['通貨によるものの額3'] || ''),
    String(formData['現物によるものの額3'] || ''),
    String(formData['合計3'] || ''),

    // 計算結果
    String(formData['総計'] || ''),
    String(formData['平均額'] || ''),
    String(formData['修正平均額'] || ''),

    // その他・備考
    String(formData['備考'] || ''),
    String(formData['添付書類確認'] || ''),
    String(formData['その他特記事項'] || ''),
  ];

  rows.push(row);

  // CSV形式に変換
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const cellStr = String(cell || '');
          // カンマや改行、ダブルクォートが含まれる場合はダブルクォートで囲む
          if (cellStr.includes(',') || cellStr.includes('\n') || cellStr.includes('"')) {
            return '"' + cellStr.replace(/"/g, '""') + '"';
          }
          return cellStr;
        })
        .join(',')
    )
    .join('\n');
}
