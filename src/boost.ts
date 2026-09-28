/**
 * Day san pham tu dong, kieu Salework.
 *
 * Luat cua Shopee: day toi da 5 san pham cung luc, moi luot keo dai 4 gio.
 * get_boosted_list cho biet san pham nao dang duoc day va con bao lau.
 *
 * Cach lam: nguoi dung chon mot danh sach san pham (khong gioi han 5). Dinh
 * ky he thong xem con bao nhieu cho trong, roi day tiep cac san pham lau chua
 * duoc day nhat, xoay vong ca danh sach.
 */
import { config } from "./config.js";
import { describeError } from "./errors.js";
import { sdk } from "./shopee.js";
import { readState, updateState, type BoostState } from "./stateStore.js";

/** So san pham Shopee cho day cung luc. */
export const MAX_BOOST_SLOTS = 5;

/** Gioi han danh sach xoay vong, de lay ten san pham trong mot lan goi (Shopee cho toi da 50). */
export const MAX_ROTATION_ITEMS = 50;

export interface BoostedNow {
  itemId: number;
  remainingMinutes: number;
}

/**
 * Chon san pham de day: bo cac san pham dang duoc day, uu tien san pham
 * chua day bao gio (theo thu tu trong danh sach), roi den san pham day lau
 * nhat. Ham thuan, khong goi mang, de kiem thu.
 */
export function pickItemsToBoost(
  rotation: number[],
  boostedIds: number[],
  lastBoosted: Record<string, number>,
  freeSlots: number,
): number[] {
  if (freeSlots <= 0) return [];
  const boosted = new Set(boostedIds);
  return rotation
    .map((itemId, order) => ({ itemId, order, last: lastBoosted[String(itemId)] ?? 0 }))
    .filter((x) => !boosted.has(x.itemId))
    .sort((a, b) => a.last - b.last || a.order - b.order)
    .slice(0, freeSlots)
    .map((x) => x.itemId);
}

/** Chuan hoa danh sach nguoi dung gui len: so nguyen duong, bo trung, giu thu tu. */
export function normalizeItemIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) throw new Error("itemIds phai la danh sach ma san pham.");
  const ids = [...new Set(raw.map(Number))];
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error("Moi ma san pham phai la so nguyen duong.");
  }
  if (ids.length > MAX_ROTATION_ITEMS) {
    throw new Error(`Toi da ${MAX_ROTATION_ITEMS} san pham trong danh sach day.`);
  }
  return ids;
}

export async function fetchBoostedNow(): Promise<BoostedNow[]> {
  const list = (await sdk.product.getBoostedList()).response?.item_list ?? [];
  return list
    .filter((x) => x.item_id && (x.cool_down_second ?? 0) > 0)
    .map((x) => ({ itemId: x.item_id!, remainingMinutes: Math.ceil((x.cool_down_second ?? 0) / 60) }));
}

export interface BoostRunResult {
  boostedNow: BoostedNow[];
  newlyBoosted: number[];
  failed: { itemId: number; reason: string }[];
  message: string;
}

/**
 * Chay mot vong: xem cho trong, day tiep san pham trong danh sach.
 * `force` = true khi nguoi dung bam "Chay ngay", bo qua cong tac bat/tat.
 */
export async function runBoostCycle(options: { force?: boolean } = {}): Promise<BoostRunResult> {
  const state = await readState();
  if (!state.boost.enabled && !options.force) {
    return { boostedNow: [], newlyBoosted: [], failed: [], message: "Dang tat day tu dong." };
  }
  if (!state.boost.itemIds.length) {
    return { boostedNow: [], newlyBoosted: [], failed: [], message: "Chua chon san pham nao de day." };
  }

  const boostedNow = await fetchBoostedNow();
  const freeSlots = MAX_BOOST_SLOTS - boostedNow.length;
  const toBoost = pickItemsToBoost(
    state.boost.itemIds,
    boostedNow.map((b) => b.itemId),
    state.boost.lastBoosted,
    freeSlots,
  );

  let newlyBoosted: number[] = [];
  let failed: BoostRunResult["failed"] = [];
  let message: string;

  if (!toBoost.length) {
    message =
      freeSlots <= 0
        ? `Du ${MAX_BOOST_SLOTS} san pham dang duoc day, cho het luot.`
        : "Cac san pham trong danh sach deu dang duoc day.";
  } else {
    try {
      const result = (await sdk.product.boostItem({ item_id_list: toBoost })).response;
      failed = (result?.failure_list ?? [])
        .filter((f) => f.item_id)
        .map((f) => ({ itemId: f.item_id!, reason: f.failed_reason ?? "khong ro" }));
      const failedIds = new Set(failed.map((f) => f.itemId));
      newlyBoosted = toBoost.filter((id) => !failedIds.has(id));
      message = `Da day ${newlyBoosted.length} san pham` + (failed.length ? `, ${failed.length} that bai` : "") + ".";
    } catch (error) {
      failed = toBoost.map((itemId) => ({ itemId, reason: describeError(error) }));
      message = `Day that bai: ${describeError(error)}`;
    }
  }

  const now = Date.now();
  await updateState((s) => {
    for (const id of newlyBoosted) s.boost.lastBoosted[String(id)] = now;
    s.boost.lastRunAt = now;
    s.boost.lastResult = message;
  });

  return { boostedNow, newlyBoosted, failed, message };
}

export async function saveBoostSettings(patch: { itemIds?: unknown; enabled?: unknown }): Promise<BoostState> {
  const itemIds = patch.itemIds === undefined ? undefined : normalizeItemIds(patch.itemIds);
  if (patch.enabled !== undefined && typeof patch.enabled !== "boolean") {
    throw new Error("enabled phai la true hoac false.");
  }
  const state = await updateState((s) => {
    if (itemIds) {
      s.boost.itemIds = itemIds;
      // Bo lich su cua san pham da bi go khoi danh sach.
      s.boost.lastBoosted = Object.fromEntries(
        Object.entries(s.boost.lastBoosted).filter(([id]) => itemIds.includes(Number(id))),
      );
    }
    if (typeof patch.enabled === "boolean") s.boost.enabled = patch.enabled;
  });
  return state.boost;
}

/**
 * Hen gio chay dinh ky. Chi day khi cong tac dang bat. Chay mot lan ngay
 * sau khi khoi dong de khong phai cho het chu ky dau.
 */
export function startBoostScheduler(): NodeJS.Timeout | null {
  const minutes = config.boostCheckMinutes;
  if (minutes <= 0) return null;

  const tick = async () => {
    try {
      const result = await runBoostCycle();
      if (result.newlyBoosted.length || result.failed.length) console.log(`[day san pham] ${result.message}`);
    } catch (error) {
      console.error(`[day san pham] Loi: ${describeError(error)}`);
    }
  };

  setTimeout(() => void tick(), 15_000).unref();
  const timer = setInterval(() => void tick(), minutes * 60 * 1000);
  timer.unref();
  return timer;
}
