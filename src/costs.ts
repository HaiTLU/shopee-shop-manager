/**
 * Gia von tung san pham, tung phan loai. Shopee khong biet gia von, nen shop tu
 * nhap (tren trang hoac qua tep Excel) va chi luu tren may nay, khong gui Shopee.
 *
 * Khoa: "<item_id>:<model_id>", san pham khong phan loai dung model_id 0.
 */
import { jsonStore } from "./jsonStore.js";

interface CostData {
  costs: Record<string, number>;
}

const store = jsonStore<CostData>("costs", () => ({ costs: {} }));

export const costKey = (itemId: number, modelId: number) => `${itemId}:${modelId || 0}`;

export async function readCosts(): Promise<Record<string, number>> {
  return (await store.read()).costs;
}

/** Luu nhieu gia von mot lan. null la xoa (chua co gia von). */
export async function saveCosts(entries: { itemId: number; modelId: number; cost: number | null }[]): Promise<Record<string, number>> {
  for (const e of entries) {
    if (e.cost !== null && (!Number.isInteger(e.cost) || e.cost < 0)) {
      throw new Error(`Giá vốn phải là số nguyên từ 0 trở lên, đang nhận: ${e.cost}`);
    }
  }
  const data = await store.update((d) => {
    for (const e of entries) {
      const key = costKey(e.itemId, e.modelId);
      if (e.cost === null) delete d.costs[key];
      else d.costs[key] = e.cost;
    }
  });
  return data.costs;
}
