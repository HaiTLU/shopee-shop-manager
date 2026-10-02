/**
 * Bo ban ghi trung y het. Giao dich vi Shopee khong co ma giao dich (SDK
 * @congminh1254/shopee-sdk 2.6.0 khong tra transaction_id), nen so ca ban ghi.
 * So du sau giao dich nam trong ban ghi, vi vay hai giao dich that cung luc,
 * cung so tien van khac nhau o so du va khong bi gop nham.
 *
 * Tep nay khong doc cau hinh (.env) de tap lenh lam sach dung duoc ma khong
 * can dang nhap shop.
 */

/** Khoa on dinh: JSON voi ten truong xep theo abc, khong phu thuoc thu tu truong. */
export function recordKey(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/** Giu lan xuat hien dau cua moi ban ghi, giu nguyen thu tu. */
export function uniqueRecords<T>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = recordKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
