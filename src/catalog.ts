/**
 * Toan bo san pham dang ban cua shop, kem gia va ton cua TUNG phan loai.
 *
 * Vi sao can: san pham co phan loai (mui, co, combo...) thi Shopee chi luu gia
 * va ton o cap phan loai, get_item_base_info tra ve trong. Phai hoi them
 * get_model_list cho tung san pham do.
 *
 * Tai mot lan roi giu trong bo nho 10 phut: giao dien tim, sap xep ngay tren
 * trinh duyet, tep Excel cung lay tu day. Sua gia/ton thanh cong thi va ngay
 * vao ban luu, khong phai tai lai.
 */
import {
  ItemStatus,
  type FetchResponse,
  type GetItemBaseInfoItem,
  type GetItemBaseInfoStockInfoV2,
  type GetModelListResponseData,
} from "@congminh1254/shopee-sdk/schemas";
import { sdk } from "./shopee.js";

/** Gioi han cung cua Shopee: get_item_list toi da 100, get_item_base_info toi da 50 ma. */
const LIST_PAGE_SIZE = 100;
const DETAIL_BATCH = 50;
/** So lenh get_model_list chay cung luc: du nhanh ma khong cham gioi han toc do. */
const MODEL_CONCURRENCY = 4;
const TTL_MS = 10 * 60 * 1000;

/** SDK khai bao stock_info_v2 sai cap (xem api.ts); khai bao lai cho dung du lieu that. */
type ItemWithStock = GetItemBaseInfoItem & { item_id: number; stock_info_v2?: GetItemBaseInfoStockInfoV2 };

export interface CatalogModel {
  modelId: number;
  /** Ten ghep tu cac tang phan loai, vd "Huong hoa / 1 lit". */
  name: string;
  sku?: string;
  price?: number;
  currentPrice?: number;
  stock?: number;
  reserved?: number;
}

export interface CatalogItem {
  itemId: number;
  name: string;
  sku?: string;
  image?: string;
  hasModel: boolean;
  /** San pham khong phan loai: gia, ton cua chinh no. Co phan loai: bo trong, xem models. */
  price?: number;
  currentPrice?: number;
  stock?: number;
  reserved?: number;
  models: CatalogModel[];
  /** Tong hop de hien va sap xep: khoang gia, tong ton. */
  priceMin?: number;
  priceMax?: number;
  stockTotal?: number;
  /** Loi khi hoi phan loai cua rieng san pham nay (khong lam hong ca danh sach). */
  problem?: string;
}

export interface Catalog {
  items: CatalogItem[];
  loadedAt: number;
}

function unwrap<T>(response: FetchResponse<T>): T {
  if (response.error) throw new Error(`${response.error}: ${response.message || "không có mô tả"}`);
  return response.response;
}

type StockInfo = {
  summary_info?: { total_available_stock?: number; total_reserved_stock?: number };
  seller_stock?: { stock?: number }[];
};

/**
 * Ton ma nguoi ban sua duoc (seller_stock). Chi mot kho thi lay dung so do;
 * khong co thi lay tong co the ban.
 */
export function editableStock(info: StockInfo | undefined): number | undefined {
  const seller = info?.seller_stock;
  if (seller?.length === 1 && typeof seller[0]?.stock === "number") return seller[0].stock;
  return info?.summary_info?.total_available_stock;
}

/** Ten phan loai tu tier_index, vd [1, 0] -> "Huong hoa / 1 lit". */
export function modelName(
  tiers: { name?: string; option_list?: { option?: string }[] }[] | undefined,
  tierIndex: number[] | undefined,
): string {
  const parts = (tierIndex ?? []).map((idx, t) => tiers?.[t]?.option_list?.[idx]?.option?.trim()).filter(Boolean);
  return parts.length ? parts.join(" / ") : "(không tên)";
}

/** Tinh lai khoang gia va tong ton sau moi lan thay doi. */
export function summarize(item: CatalogItem): CatalogItem {
  const prices = item.hasModel ? item.models.map((m) => m.price) : [item.price];
  const stocks = item.hasModel ? item.models.map((m) => m.stock) : [item.stock];
  const p = prices.filter((x): x is number => typeof x === "number");
  const s = stocks.filter((x): x is number => typeof x === "number");
  item.priceMin = p.length ? Math.min(...p) : undefined;
  item.priceMax = p.length ? Math.max(...p) : undefined;
  item.stockTotal = s.length ? s.reduce((a, b) => a + b, 0) : undefined;
  return item;
}

/** Ghep thong tin co ban va danh sach phan loai thanh mot dong so. Ham thuan de kiem thu. */
export function buildItem(base: ItemWithStock, models?: GetModelListResponseData): CatalogItem {
  const price = base.price_info?.[0];
  const item: CatalogItem = {
    itemId: base.item_id,
    name: base.item_name ?? "(không tên)",
    ...(base.item_sku ? { sku: base.item_sku } : {}),
    ...(base.image?.image_url_list?.[0] ? { image: base.image.image_url_list[0] } : {}),
    hasModel: Boolean(base.has_model),
    models: [],
  };
  if (!item.hasModel) {
    if (typeof price?.original_price === "number") item.price = price.original_price;
    if (typeof price?.current_price === "number") item.currentPrice = price.current_price;
    const stock = editableStock(base.stock_info_v2 as StockInfo | undefined);
    if (typeof stock === "number") item.stock = stock;
    const reserved = base.stock_info_v2?.summary_info?.total_reserved_stock;
    if (reserved) item.reserved = reserved;
  } else if (models) {
    item.models = (models.model ?? []).map((m) => {
      const mp = m.price_info?.[0];
      const stock = editableStock(m.stock_info_v2 as StockInfo | undefined);
      const reserved = m.stock_info_v2?.summary_info?.total_reserved_stock;
      return {
        modelId: m.model_id,
        name: modelName(models.tier_variation, m.tier_index),
        ...(m.model_sku ? { sku: m.model_sku } : {}),
        ...(typeof mp?.original_price === "number" ? { price: mp.original_price } : {}),
        ...(typeof mp?.current_price === "number" ? { currentPrice: mp.current_price } : {}),
        ...(typeof stock === "number" ? { stock } : {}),
        ...(reserved ? { reserved } : {}),
      };
    });
  }
  return summarize(item);
}

/** Chay ham bat dong bo cho tung phan tu, toi da `limit` viec cung luc. */
async function mapLimit<T, R>(list: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

async function loadCatalog(): Promise<Catalog> {
  // 1. Moi ma san pham dang ban.
  const ids: number[] = [];
  for (let offset = 0; ; ) {
    const page = unwrap(await sdk.product.getItemList({ offset, page_size: LIST_PAGE_SIZE, item_status: ItemStatus.NORMAL }));
    for (const it of page.item ?? []) if (typeof it.item_id === "number") ids.push(it.item_id);
    if (!page.has_next_page) break;
    offset = page.next_offset ?? offset + LIST_PAGE_SIZE;
  }

  // 2. Thong tin co ban theo lo 50.
  const bases: ItemWithStock[] = [];
  for (let i = 0; i < ids.length; i += DETAIL_BATCH) {
    const detail = unwrap(await sdk.product.getItemBaseInfo({ item_id_list: ids.slice(i, i + DETAIL_BATCH) }));
    bases.push(...((detail.item_list ?? []).filter((b) => typeof b.item_id === "number") as ItemWithStock[]));
  }

  // 3. Phan loai cho san pham co phan loai. Loi o mot san pham chi danh dau san pham do.
  const items = await mapLimit(bases, MODEL_CONCURRENCY, async (base) => {
    if (!base.has_model) return buildItem(base);
    try {
      return buildItem(base, unwrap(await sdk.product.getModelList({ item_id: base.item_id })));
    } catch (error) {
      return { ...buildItem(base), problem: `Không đọc được phân loại: ${(error as Error).message}` };
    }
  });

  // Giu thu tu Shopee tra ve (moi cap nhat truoc).
  const order = new Map(ids.map((id, i) => [id, i]));
  items.sort((a, b) => (order.get(a.itemId) ?? 0) - (order.get(b.itemId) ?? 0));
  return { items, loadedAt: Date.now() };
}

let cached: Catalog | null = null;
let loading: Promise<Catalog> | null = null;

/** Lay danh sach, dung ban luu neu con moi. Nhieu nguoi goi cung luc chi tai mot lan. */
export async function getCatalog(options: { force?: boolean } = {}): Promise<Catalog> {
  if (!options.force && cached && Date.now() - cached.loadedAt < TTL_MS) return cached;
  if (!loading) {
    loading = loadCatalog()
      .then((data) => (cached = data))
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

/** Sua gia/ton thanh cong thi cap nhat ban luu cho khop, khoi tai lai ca danh sach. */
export function patchCatalog(itemId: number, modelId: number, change: { price?: number; stock?: number }): void {
  const item = cached?.items.find((i) => i.itemId === itemId);
  if (!item) return;
  const target = modelId ? item.models.find((m) => m.modelId === modelId) : item;
  if (!target) return;
  if (typeof change.price === "number") {
    // Khong dang giam gia (gia ban = gia goc) thi gia ban doi theo gia goc moi.
    if (target.currentPrice === target.price) target.currentPrice = change.price;
    target.price = change.price;
  }
  if (typeof change.stock === "number") target.stock = change.stock;
  summarize(item);
}

/** Chi dung trong kiem thu. */
export function resetCatalogCache(): void {
  cached = null;
  loading = null;
}
