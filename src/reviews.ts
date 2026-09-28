/**
 * Tu tra loi danh gia.
 *
 * Quy tac PM chon (28/9/2026): danh gia 4-5 sao tu tra loi theo mau; 1-3 sao
 * vao hang cho de nguoi duyet doc, sua roi moi gui; cu 30 phut kiem tra mot lan.
 *
 * Nguon: get_comment (toi da 1000 danh gia gan nhat), reply_comment (moi lan
 * toi da 100). Khong luu ten nguoi mua.
 */
import { config } from "./config.js";
import { describeError } from "./errors.js";
import { jsonStore } from "./jsonStore.js";

export interface Review {
  commentId: string;
  itemId: number;
  rating: number;
  text: string;
  /** Giay (Unix). */
  createTime: number;
  hidden: boolean;
  replied: boolean;
  reply?: string;
  replyTime?: number;
  images: string[];
  orderSn?: string;
}

export type Templates = Record<"1" | "2" | "3" | "4" | "5", string[]>;

export interface ReviewSettings {
  enabled: boolean;
  templates: Templates;
  lastRunAt?: number;
  lastResult?: string;
  /** Da tra loi qua he thong nay: tranh gui lai khi Shopee cap nhat cham. */
  log: Record<string, { at: number; auto: boolean }>;
}

/** Chi tu tra loi cac muc sao nay. */
export const AUTO_STARS = [4, 5];
/** Chi tu tra loi danh gia trong ngan ay ngay gan nhat; cu hon thi de nguoi duyet. */
export const AUTO_DAYS = 30;
/** Do dai toi da mot cau tra loi. */
export const MAX_REPLY = 500;
const BATCH = 100;
const LOG_KEEP = 3000;

/** {shop}: ten shop, {san_pham}: ten san pham rut gon. Khong dung bieu tuong cam xuc. */
export const DEFAULT_TEMPLATES: Templates = {
  "5": [
    "{shop} cảm ơn anh chị đã tin chọn {san_pham}. Rất vui vì sản phẩm làm anh chị hài lòng, hẹn gặp lại anh chị ở những đơn sau ạ.",
    "Cảm ơn anh chị đã dành thời gian đánh giá cho shop. Chúc anh chị dùng {san_pham} thật tiện, cần hỗ trợ gì cứ nhắn {shop} nhé.",
    "Shop rất vui khi nhận được đánh giá của anh chị. {shop} sẽ giữ chất lượng {san_pham} như vậy, mong anh chị ủng hộ shop lâu dài ạ.",
  ],
  "4": [
    "Cảm ơn anh chị đã mua {san_pham} và để lại đánh giá. Nếu có điểm nào chưa thật ưng ý, anh chị nhắn shop để {shop} làm tốt hơn nhé.",
    "{shop} cảm ơn anh chị nhiều. Shop luôn lắng nghe góp ý để {san_pham} ngày càng tốt hơn, hẹn gặp lại anh chị ạ.",
  ],
  "3": [
    "{shop} cảm ơn anh chị đã góp ý về {san_pham}. Shop rất tiếc vì trải nghiệm chưa trọn vẹn, anh chị nhắn tin cho shop để được hỗ trợ ngay nhé.",
    "Cảm ơn anh chị đã đánh giá. Shop ghi nhận góp ý để cải thiện {san_pham}; nếu cần đổi trả hay hướng dẫn sử dụng, anh chị nhắn {shop} ạ.",
  ],
  "2": [
    "{shop} thành thật xin lỗi vì {san_pham} chưa làm anh chị hài lòng. Anh chị vui lòng nhắn tin cho shop để được kiểm tra và hỗ trợ đổi trả sớm nhất ạ.",
    "Shop rất tiếc về trải nghiệm của anh chị. {shop} muốn xử lý ngay: anh chị nhắn tin qua Shopee kèm ảnh sản phẩm để shop hỗ trợ nhé.",
  ],
  "1": [
    "{shop} thành thật xin lỗi anh chị. Shop muốn được kiểm tra ngay đơn {san_pham} này, anh chị nhắn tin cho shop kèm ảnh để được đổi trả hoặc hoàn tiền sớm nhất ạ.",
    "Shop rất tiếc vì {san_pham} làm anh chị không hài lòng. {shop} xin nhận trách nhiệm, anh chị nhắn tin qua Shopee để shop xử lý cho anh chị ngay ạ.",
  ],
};

export const reviewStore = jsonStore<ReviewSettings>("reviews", () => ({ enabled: false, templates: structuredClone(DEFAULT_TEMPLATES), log: {} }));

// ---------------------------------------------------------------- soan tra loi

/** Rut gon ten san pham cho cau tra loi: toi da ~40 ky tu, cat o ranh gioi tu. */
export function shortName(name: string): string {
  const clean = name.replace(/\s+/g, " ").replace(/[[(].*?[\])]/g, "").trim() || name.trim();
  if (clean.length <= 40) return clean;
  const cut = clean.slice(0, 40);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 20)).trim();
}

/** Chon mau co dinh theo ma danh gia: moi danh gia luon ra cung mot cau, cac danh gia khac nhau ra cau khac nhau. */
export function draftReply(templates: Templates, review: Pick<Review, "commentId" | "rating">, itemName: string, shopName: string): string {
  const star = String(Math.min(5, Math.max(1, Math.round(review.rating)))) as keyof Templates;
  const list = templates[star]?.filter((t) => t.trim()) ?? [];
  if (!list.length) return "";
  let hash = 0;
  for (const ch of review.commentId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return list[hash % list.length]!.replaceAll("{san_pham}", shortName(itemName) || "sản phẩm").replaceAll("{shop}", shopName || "Shop").trim();
}

export function checkTemplates(t: unknown): Templates {
  const out = {} as Templates;
  for (const star of ["1", "2", "3", "4", "5"] as const) {
    const list = (t as Record<string, unknown>)?.[star];
    if (!Array.isArray(list)) throw new Error(`Thiếu mẫu cho ${star} sao.`);
    const clean = list.map((x) => String(x ?? "").trim()).filter(Boolean);
    if (!clean.length) throw new Error(`Mức ${star} sao cần ít nhất một mẫu.`);
    for (const x of clean) {
      if (x.length > MAX_REPLY) throw new Error(`Mẫu ${star} sao dài quá ${MAX_REPLY} ký tự: "${x.slice(0, 40)}..."`);
    }
    out[star] = clean;
  }
  return out;
}

/** Danh gia se duoc tu tra loi o lan chay nay. */
export function autoCandidates(reviews: Review[], settings: Pick<ReviewSettings, "log">, nowSec = Date.now() / 1000): Review[] {
  return reviews.filter(
    (r) =>
      !r.replied &&
      !r.hidden &&
      AUTO_STARS.includes(r.rating) &&
      nowSec - r.createTime <= AUTO_DAYS * 86400 &&
      !settings.log[r.commentId],
  );
}

// ---------------------------------------------------------------- goi Shopee

export interface ReviewDeps {
  /** Mot trang danh gia cua ca shop. */
  getComments(cursor: string): Promise<{ reviews: Review[]; more: boolean; next: string }>;
  /** Gui tra loi; tra ve danh sach loi tung danh gia. */
  reply(list: { comment_id: number; comment: string }[]): Promise<{ commentId: string; error?: string }[]>;
  itemName(itemId: number): Promise<string>;
  shopName(): Promise<string>;
}

/** Toi da 1000 danh gia gan nhat (gioi han cua Shopee). */
export async function fetchReviews(deps: Pick<ReviewDeps, "getComments">): Promise<Review[]> {
  const out: Review[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const r = await deps.getComments(cursor);
    out.push(...r.reviews);
    if (!r.more || !r.next) break;
    cursor = r.next;
  }
  return out.sort((a, b) => b.createTime - a.createTime);
}

export interface SendResult {
  commentId: string;
  ok: boolean;
  message: string;
}

/** Gui nhieu cau tra loi, moi lan toi da 100, ghi lai de khong gui trung. */
export async function sendReplies(items: { commentId: string; text: string }[], auto: boolean, deps: Pick<ReviewDeps, "reply">): Promise<SendResult[]> {
  const results: SendResult[] = [];
  const valid: { commentId: string; text: string }[] = [];
  for (const it of items) {
    const text = it.text.trim();
    if (!/^\d+$/.test(it.commentId)) results.push({ commentId: it.commentId, ok: false, message: "Mã đánh giá không hợp lệ." });
    else if (!text) results.push({ commentId: it.commentId, ok: false, message: "Câu trả lời đang trống." });
    else if (text.length > MAX_REPLY) results.push({ commentId: it.commentId, ok: false, message: `Câu trả lời dài quá ${MAX_REPLY} ký tự.` });
    else valid.push({ commentId: it.commentId, text });
  }
  for (let i = 0; i < valid.length; i += BATCH) {
    const batch = valid.slice(i, i + BATCH);
    try {
      const res = await deps.reply(batch.map((b) => ({ comment_id: Number(b.commentId), comment: b.text })));
      const failed = new Map(res.filter((r) => r.error).map((r) => [r.commentId, r.error!]));
      for (const b of batch) {
        const error = failed.get(b.commentId);
        results.push({ commentId: b.commentId, ok: !error, message: error ?? "Đã gửi." });
      }
    } catch (error) {
      for (const b of batch) results.push({ commentId: b.commentId, ok: false, message: describeError(error) });
    }
  }
  const sent = results.filter((r) => r.ok).map((r) => r.commentId);
  if (sent.length) {
    await reviewStore.update((s) => {
      const at = Date.now();
      for (const id of sent) s.log[id] = { at, auto };
      const keys = Object.keys(s.log);
      if (keys.length > LOG_KEEP) {
        for (const k of keys.sort((a, b) => s.log[a]!.at - s.log[b]!.at).slice(0, keys.length - LOG_KEEP)) delete s.log[k];
      }
    });
  }
  return results;
}

export interface AutoRunResult {
  checked: number;
  sent: number;
  failed: SendResult[];
  waiting: number;
  message: string;
}

/** Mot vong: lay danh gia, tu tra loi 4-5 sao chua tra loi, dem so dang cho duyet. */
export async function runAutoReply(deps: ReviewDeps, options: { force?: boolean } = {}): Promise<AutoRunResult> {
  const settings = await reviewStore.read();
  if (!settings.enabled && !options.force) {
    return { checked: 0, sent: 0, failed: [], waiting: 0, message: "Đang tắt tự trả lời." };
  }
  const reviews = await fetchReviews(deps);
  const todo = autoCandidates(reviews, settings);
  const shop = todo.length ? await deps.shopName() : "";
  const items: { commentId: string; text: string }[] = [];
  for (const r of todo) {
    const text = draftReply(settings.templates, r, await deps.itemName(r.itemId), shop);
    if (text) items.push({ commentId: r.commentId, text });
  }
  const results = items.length ? await sendReplies(items, true, deps) : [];
  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  const waiting = reviews.filter((r) => !r.replied && !r.hidden && !todo.includes(r)).length;
  const message =
    `Đã tự trả lời ${sent} đánh giá 4-5 sao` +
    (failed.length ? `, ${failed.length} lỗi` : "") +
    `. ${waiting} đánh giá đang chờ duyệt.`;
  await reviewStore.update((s) => {
    s.lastRunAt = Date.now();
    s.lastResult = message;
  });
  return { checked: reviews.length, sent, failed, waiting, message };
}

/** Hen gio chay dinh ky; chi gui khi cong tac dang bat. */
export function startReviewScheduler(deps: () => ReviewDeps): NodeJS.Timeout | null {
  const minutes = config.reviewCheckMinutes;
  if (minutes <= 0) return null;
  const tick = async () => {
    try {
      const settings = await reviewStore.read();
      if (!settings.enabled) return;
      const r = await runAutoReply(deps());
      if (r.sent || r.failed.length) console.log(`[đánh giá] ${r.message}`);
    } catch (error) {
      console.error(`[đánh giá] Lỗi: ${describeError(error)}`);
      await reviewStore.update((s) => {
        s.lastRunAt = Date.now();
        s.lastResult = `Lỗi: ${describeError(error)}`;
      }).catch(() => {});
    }
  };
  setTimeout(() => void tick(), 30_000).unref();
  const timer = setInterval(() => void tick(), minutes * 60 * 1000);
  timer.unref();
  return timer;
}
