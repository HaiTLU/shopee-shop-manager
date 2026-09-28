/**
 * Duong dan danh gia (gan duoi /api/reviews).
 *
 *   GET  /            danh sach danh gia kem cau tra loi soan san, cai dat
 *   PUT  /settings    bat/tat tu tra loi, sua mau
 *   POST /run         chay tu tra loi ngay
 *   POST /reply       gui cac cau tra loi nguoi duyet da sua
 */
import { Router } from "express";
import { config } from "../config.js";
import { getCatalog } from "../catalog.js";
import { describeError } from "../errors.js";
import { sdk } from "../shopee.js";
import { withRetry } from "../excel.js";
import {
  AUTO_DAYS,
  autoCandidates,
  checkTemplates,
  draftReply,
  fetchReviews,
  reviewStore,
  runAutoReply,
  sendReplies,
  type Review,
  type ReviewDeps,
} from "../reviews.js";

export const reviewsRouter: Router = Router();

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const seconds = (v: unknown): number => (v instanceof Date ? Math.floor(v.getTime() / 1000) : Number(v) || 0);

let shopNameCache: { name: string; at: number } | null = null;

/** Cach goi Shopee that; tach rieng de phan xu ly kiem thu duoc bang ham gia. */
export function shopeeReviewDeps(): ReviewDeps {
  return {
    getComments: async (cursor) => {
      const r = await withRetry(() => sdk.product.getComment({ cursor, page_size: 100 }), sleep);
      const list = r.response?.item_comment_list ?? [];
      return {
        // Bo ten nguoi mua: khong can de tra loi va khong nen luu.
        reviews: list
          .filter((c) => c.comment_id !== undefined)
          .map((c) => ({
            commentId: String(c.comment_id),
            itemId: Number(c.item_id ?? 0),
            rating: Number(c.rating_star ?? 0),
            text: String(c.comment ?? ""),
            createTime: seconds(c.create_time),
            hidden: Boolean(c.hidden),
            replied: Boolean(c.comment_reply?.reply),
            ...(c.comment_reply?.reply ? { reply: c.comment_reply.reply, replyTime: seconds(c.comment_reply.create_time) } : {}),
            images: c.media?.image_url_list ?? [],
            ...(c.order_sn ? { orderSn: c.order_sn } : {}),
          })),
        more: Boolean(r.response?.more),
        next: r.response?.next_cursor ?? "",
      };
    },
    reply: async (list) => {
      const r = await withRetry(() => sdk.product.replyComment({ comment_list: list }), sleep);
      return (r.response?.result_list ?? []).map((x) => ({
        commentId: String(x.comment_id),
        ...(x.fail_error || x.fail_message ? { error: [x.fail_message, x.fail_error].filter(Boolean).join(": ") } : {}),
      }));
    },
    itemName: async (itemId) => {
      try {
        const catalog = await getCatalog();
        return catalog.items.find((i) => i.itemId === itemId)?.name ?? "sản phẩm";
      } catch {
        return "sản phẩm";
      }
    },
    shopName: async () => {
      if (shopNameCache && Date.now() - shopNameCache.at < 3600_000) return shopNameCache.name;
      try {
        const info = await sdk.shop.getShopInfo();
        const name = ((info.response ?? info) as { shop_name?: string }).shop_name || "Shop";
        shopNameCache = { name, at: Date.now() };
        return name;
      } catch {
        return "Shop";
      }
    },
  };
}

/** Giu danh sach 2 phut de mo lai trang khong hoi Shopee lien tuc. */
let cached: { reviews: Review[]; at: number } | null = null;
const TTL_MS = 2 * 60 * 1000;

async function loadReviews(force: boolean): Promise<Review[]> {
  if (!force && cached && Date.now() - cached.at < TTL_MS) return cached.reviews;
  const reviews = await fetchReviews(shopeeReviewDeps());
  cached = { reviews, at: Date.now() };
  return reviews;
}

function markReplied(items: { commentId: string; text: string }[], ids: Set<string>): void {
  if (!cached) return;
  const now = Math.floor(Date.now() / 1000);
  for (const r of cached.reviews) {
    if (!ids.has(r.commentId)) continue;
    r.replied = true;
    r.reply = items.find((i) => i.commentId === r.commentId)?.text ?? r.reply;
    r.replyTime = now;
  }
}

reviewsRouter.get("/", async (req, res) => {
  try {
    const [reviews, settings] = await Promise.all([loadReviews(req.query.refresh === "1"), reviewStore.read()]);
    const deps = shopeeReviewDeps();
    const auto = new Set(autoCandidates(reviews, settings).map((r) => r.commentId));
    const shop = await deps.shopName();
    const names = new Map<number, string>();
    for (const r of reviews) if (!names.has(r.itemId)) names.set(r.itemId, await deps.itemName(r.itemId));
    res.json({
      reviews: reviews.map((r) => ({
        ...r,
        itemName: names.get(r.itemId) ?? "sản phẩm",
        auto: auto.has(r.commentId),
        byUs: settings.log[r.commentId] ?? null,
        ...(r.replied ? {} : { draft: draftReply(settings.templates, r, names.get(r.itemId) ?? "", shop) }),
      })),
      settings: {
        enabled: settings.enabled,
        templates: settings.templates,
        lastRunAt: settings.lastRunAt ?? null,
        lastResult: settings.lastResult ?? null,
        checkMinutes: config.reviewCheckMinutes,
        autoDays: AUTO_DAYS,
      },
      shopName: shop,
      loadedAt: cached?.at ?? Date.now(),
    });
  } catch (error) {
    res.status(502).json({ error: describeError(error) });
  }
});

reviewsRouter.put("/settings", async (req, res) => {
  const { enabled, templates } = (req.body ?? {}) as { enabled?: unknown; templates?: unknown };
  try {
    const clean = templates === undefined ? undefined : checkTemplates(templates);
    const s = await reviewStore.update((d) => {
      if (typeof enabled === "boolean") d.enabled = enabled;
      if (clean) d.templates = clean;
    });
    res.json({ enabled: s.enabled, templates: s.templates });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

reviewsRouter.post("/run", async (_req, res) => {
  try {
    const result = await runAutoReply(shopeeReviewDeps(), { force: true });
    cached = null;
    res.json(result);
  } catch (error) {
    res.status(502).json({ error: describeError(error) });
  }
});

reviewsRouter.post("/reply", async (req, res) => {
  const items = (req.body?.items ?? []) as { commentId?: unknown; text?: unknown }[];
  if (!Array.isArray(items) || !items.length) {
    res.status(400).json({ error: "Chưa chọn đánh giá nào để trả lời." });
    return;
  }
  const clean = items.map((i) => ({ commentId: String(i.commentId ?? ""), text: String(i.text ?? "") }));
  try {
    const results = await sendReplies(clean, false, shopeeReviewDeps());
    markReplied(clean, new Set(results.filter((r) => r.ok).map((r) => r.commentId)));
    res.json({ results });
  } catch (error) {
    res.status(502).json({ error: describeError(error) });
  }
});
