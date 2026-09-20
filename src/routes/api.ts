/**
 * API noi bo cho giao dien web.
 *
 * Giao dien khong bao gio goi thang Shopee: partner_key va access_token chi
 * nam tren may chu. Trinh duyet chi noi chuyen voi cac duong dan o day.
 */
import { Router, type Request, type Response } from "express";
import {
  ItemStatus,
  TimeRangeField,
  type FetchResponse,
  type GetItemBaseInfoItem,
  type GetItemBaseInfoStockInfoV2,
} from "@congminh1254/shopee-sdk/schemas";
import { sdk } from "../shopee.js";

/**
 * Va kieu bi dat nham cho trong SDK.
 *
 * SDK khai bao `stock_info_v2` nam o cap bao ngoai (GetItemBaseInfoResponseData),
 * nhung Shopee that ra tra ve ton kho cho TUNG san pham trong item_list. Khai bao
 * lai o day cho khop du lieu that.
 *
 * Can kiem lai khi nang cap SDK: neu ban moi sua cho nay thi bo doan va di.
 */
type ItemWithStock = GetItemBaseInfoItem & {
  stock_info_v2?: GetItemBaseInfoStockInfoV2;
};

/** So san pham toi da moi lan hoi chi tiet - gioi han cung cua Shopee la 50. */
const MAX_ITEM_DETAIL_BATCH = 50;

/** Khoang thoi gian toi da cho mot lan lay don - gioi han cung cua Shopee la 15 ngay. */
const MAX_ORDER_RANGE_DAYS = 15;

export const apiRouter: Router = Router();

/**
 * Shopee bao loi trong than phan hoi chu khong qua ma HTTP, nen phan hoi
 * "thanh cong" van co the chua loi. Ham nay bien no thanh ngoai le that.
 */
function unwrap<T>(response: FetchResponse<T>): T {
  if (response.error) {
    throw new Error(`${response.error}: ${response.message || "khong co mo ta"}`);
  }
  return response.response;
}

/** Bat loi cua mot ham xu ly bat dong bo va tra ve JSON thong nhat. */
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response): void => {
    fn(req, res).catch((error: Error) => {
      console.error(`[api] ${req.method} ${req.originalUrl}:`, error.message);
      res.status(502).json({ error: error.message });
    });
  };
}

/** Doc mot so nguyen tu chuoi truy van, tra ve gia tri mac dinh neu khong co. */
function intParam(raw: unknown, fallback: number, min: number, max: number): number {
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`Tham so phai la so nguyen, dang nhan duoc: ${raw}`);
  }
  return Math.min(Math.max(value, min), max);
}

apiRouter.get(
  "/shop",
  handle(async (_req, res) => {
    res.json(unwrap(await sdk.shop.getShopInfo()));
  }),
);

/**
 * Danh sach san pham kem gia va ton kho.
 *
 * Shopee tach lam hai lenh goi: get_item_list chi tra ve item_id, con gia va
 * ton kho phai hoi them bang get_item_base_info.
 */
apiRouter.get(
  "/products",
  handle(async (req, res) => {
    const offset = intParam(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const pageSize = intParam(req.query.page_size, 20, 1, MAX_ITEM_DETAIL_BATCH);

    const list = unwrap(
      await sdk.product.getItemList({
        offset,
        page_size: pageSize,
        item_status: ItemStatus.NORMAL,
      }),
    );

    const itemIds = (list.item ?? []).map((item) => item.item_id).filter((id): id is number => typeof id === "number");

    if (itemIds.length === 0) {
      res.json({ items: [], total_count: list.total_count ?? 0, has_next_page: false, next_offset: offset });
      return;
    }

    const detail = unwrap(await sdk.product.getItemBaseInfo({ item_id_list: itemIds }));

    const items = ((detail.item_list ?? []) as ItemWithStock[]).map((item) => {
      const price = item.price_info?.[0];
      const stock = item.stock_info_v2?.summary_info;
      return {
        item_id: item.item_id,
        item_name: item.item_name,
        item_sku: item.item_sku,
        item_status: item.item_status,
        has_model: (item.has_model ?? false) as boolean,
        currency: price?.currency,
        original_price: price?.original_price,
        current_price: price?.current_price,
        available_stock: stock?.total_available_stock,
        // Ton dang bi giu cho khuyen mai. Dat ton moi thap hon so nay se bi Shopee tu choi.
        reserved_stock: stock?.total_reserved_stock,
        image: item.image?.image_url_list?.[0],
      };
    });

    res.json({
      items,
      total_count: list.total_count ?? items.length,
      has_next_page: list.has_next_page ?? false,
      next_offset: list.next_offset ?? offset + pageSize,
    });
  }),
);

/** Cac bien the (model) cua mot san pham, kem gia va ton rieng tung bien the. */
apiRouter.get(
  "/products/:itemId/models",
  handle(async (req, res) => {
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(itemId)) {
      res.status(400).json({ error: `item_id khong hop le: ${req.params.itemId}` });
      return;
    }
    res.json(unwrap(await sdk.product.getModelList({ item_id: itemId })));
  }),
);

/**
 * Cap nhat gia.
 *
 * model_id = 0 nghia la san pham khong co bien the. San pham co bien the phai
 * truyen dung model_id cua tung bien the.
 */
apiRouter.post(
  "/products/:itemId/price",
  handle(async (req, res) => {
    const itemId = Number(req.params.itemId);
    const { original_price: originalPrice, model_id: modelId } = req.body ?? {};

    if (!Number.isInteger(itemId)) {
      res.status(400).json({ error: `item_id khong hop le: ${req.params.itemId}` });
      return;
    }
    if (typeof originalPrice !== "number" || !Number.isFinite(originalPrice) || originalPrice <= 0) {
      res.status(400).json({ error: "original_price phai la so duong." });
      return;
    }

    const result = unwrap(
      await sdk.product.updatePrice({
        item_id: itemId,
        price_list: [{ model_id: typeof modelId === "number" ? modelId : 0, original_price: originalPrice }],
      }),
    );

    // Shopee co the tra ve thanh cong o cap lenh goi nhung that bai o tung dong.
    if (result.failure_list?.length) {
      res.status(422).json({ error: "Shopee tu choi cap nhat gia", failure_list: result.failure_list });
      return;
    }
    res.json({ ok: true, result });
  }),
);

/**
 * Cap nhat ton kho.
 *
 * Luu y: Shopee chi cho sua phan ton cua nguoi ban (seller_stock). Ton moi
 * phai lon hon hoac bang phan dang bi giu cho khuyen mai (reserved_stock),
 * neu khong Shopee se tu choi.
 */
apiRouter.post(
  "/products/:itemId/stock",
  handle(async (req, res) => {
    const itemId = Number(req.params.itemId);
    const { stock, model_id: modelId } = req.body ?? {};

    if (!Number.isInteger(itemId)) {
      res.status(400).json({ error: `item_id khong hop le: ${req.params.itemId}` });
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      res.status(400).json({ error: "stock phai la so nguyen khong am." });
      return;
    }

    const result = unwrap(
      await sdk.product.updateStock({
        item_id: itemId,
        stock_list: [
          {
            model_id: typeof modelId === "number" ? modelId : 0,
            seller_stock: [{ stock }],
          },
        ],
      }),
    );

    if (result.failure_list?.length) {
      res.status(422).json({ error: "Shopee tu choi cap nhat ton kho", failure_list: result.failure_list });
      return;
    }
    res.json({ ok: true, result });
  }),
);

/** Don hang trong N ngay gan nhat. Shopee gioi han moi lan hoi toi da 15 ngay. */
apiRouter.get(
  "/orders",
  handle(async (req, res) => {
    const days = intParam(req.query.days, 7, 1, MAX_ORDER_RANGE_DAYS);
    const now = Math.floor(Date.now() / 1000);

    const result = unwrap(
      await sdk.order.getOrderList({
        time_range_field: TimeRangeField.CREATE_TIME,
        time_from: now - days * 86_400,
        time_to: now,
        page_size: 50,
        response_optional_fields: "order_status",
      }),
    );

    res.json(result);
  }),
);
