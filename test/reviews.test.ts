/**
 * Kiem thu tu tra loi danh gia: soan theo mau, chon danh gia duoc tu tra loi,
 * gui theo lo va ghi lai de khong gui trung.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shopee-reviews-test-"));
process.env.SHOPEE_PARTNER_ID = "1000001";
process.env.SHOPEE_PARTNER_KEY = "khoa-gia-dung-de-kiem-thu";
process.env.SHOPEE_REGION = "GLOBAL";
process.env.SHOPEE_REDIRECT_URI = "http://localhost:3000/auth/callback";
process.env.TOKEN_FILE = path.join(tmpRoot, "token.json");
process.env.TOKEN_KEEPALIVE_MINUTES = "0";

const rv = await import("../src/reviews.js");
type Review = import("../src/reviews.js").Review;

after(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

const now = Math.floor(Date.now() / 1000);
const review = (id: string, rating: number, daysAgo = 1, extra: Partial<Review> = {}): Review => ({
  commentId: id, itemId: 101, rating, text: "Hàng tốt", createTime: now - daysAgo * 86400, hidden: false, replied: false, images: [], ...extra,
});

test("soan tra loi: dung mau theo so sao, chen ten shop va ten san pham rut gon, on dinh theo ma danh gia", () => {
  const t = rv.DEFAULT_TEMPLATES;
  const a = rv.draftReply(t, { commentId: "123", rating: 5 }, "Túi giặt lưới bảo vệ quần áo cỡ lớn 50x60cm siêu bền", "Combi Home");
  assert.ok(t["5"].some((tpl) => a === tpl.replaceAll("{san_pham}", rv.shortName("Túi giặt lưới bảo vệ quần áo cỡ lớn 50x60cm siêu bền")).replaceAll("{shop}", "Combi Home")));
  assert.ok(!a.includes("{"), "khong con cho trong chua dien");
  assert.equal(rv.draftReply(t, { commentId: "123", rating: 5 }, "X", "Combi Home"), rv.draftReply(t, { commentId: "123", rating: 5 }, "X", "Combi Home"));
  const variants = new Set(["1", "2", "3", "4", "5", "6", "7", "8"].map((id) => rv.draftReply(t, { commentId: id, rating: 5 }, "X", "S")));
  assert.ok(variants.size > 1, "cac danh gia khac nhau dung cau khac nhau");
  assert.match(rv.draftReply(t, { commentId: "9", rating: 1 }, "Nước giặt", "Combi Home"), /xin lỗi|rất tiếc/i);
});

test("rut gon ten san pham: bo phan trong ngoac, cat o ranh gioi tu", () => {
  assert.equal(rv.shortName("[Tách lẻ] Giấy thơm quần áo"), "Giấy thơm quần áo");
  const s = rv.shortName("Túi giặt lưới bảo vệ quần áo cỡ lớn 50x60cm siêu bền chắc chắn");
  assert.ok(s.length <= 40 && !s.endsWith(" "), s);
});

test("kiem tra mau: moi muc sao can it nhat mot mau, khong qua 500 ky tu", () => {
  const ok = rv.checkTemplates({ ...rv.DEFAULT_TEMPLATES, "3": ["  Cảm ơn  ", ""] });
  assert.deepEqual(ok["3"], ["Cảm ơn"]);
  assert.throws(() => rv.checkTemplates({ ...rv.DEFAULT_TEMPLATES, "1": [""] }), /ít nhất một mẫu/);
  assert.throws(() => rv.checkTemplates({ ...rv.DEFAULT_TEMPLATES, "5": ["x".repeat(501)] }), /500 ký tự/);
});

test("chi tu tra loi 4-5 sao, chua tra loi, khong an, trong 30 ngay, chua gui qua he thong", () => {
  const list = [
    review("1", 5),
    review("2", 4),
    review("3", 3),
    review("4", 5, 1, { replied: true, reply: "Cảm ơn" }),
    review("5", 5, 1, { hidden: true }),
    review("6", 5, 45),
    review("7", 4),
  ];
  const picked = rv.autoCandidates(list, { log: { "7": { at: 1, auto: true } } }).map((r) => r.commentId);
  assert.deepEqual(picked, ["1", "2"]);
});

test("gui tra loi: chan cau rong hoac qua dai, chia lo 100, doc loi tung danh gia, ghi so da gui", async () => {
  const calls: number[] = [];
  const items = Array.from({ length: 150 }, (_, i) => ({ commentId: String(1000 + i), text: "Cảm ơn anh chị" }));
  items.push({ commentId: "2000", text: "   " }, { commentId: "2001", text: "x".repeat(501) }, { commentId: "abc", text: "Cảm ơn" });
  const results = await rv.sendReplies(items, false, {
    reply: async (list) => {
      calls.push(list.length);
      return list.map((l) => ({ commentId: String(l.comment_id), ...(l.comment_id === 1005 ? { error: "comment_already_replied" } : {}) }));
    },
  });
  assert.deepEqual(calls, [100, 50]);
  assert.equal(results.filter((r) => r.ok).length, 149);
  assert.deepEqual(
    results.filter((r) => !r.ok).map((r) => [r.commentId, r.message]),
    [
      ["2000", "Câu trả lời đang trống."],
      ["2001", "Câu trả lời dài quá 500 ký tự."],
      ["abc", "Mã đánh giá không hợp lệ."],
      ["1005", "comment_already_replied"],
    ],
  );
  const saved = await rv.reviewStore.read();
  assert.equal(saved.log["1000"]!.auto, false);
  assert.equal(saved.log["1005"], undefined, "loi thi khong ghi la da gui");
});

test("vong tu tra loi: tat thi khong gui; bat thi gui 4-5 sao, dem so cho duyet, khong gui lai lan sau", async () => {
  const sent: string[] = [];
  const reviews = [review("501", 5), review("502", 4), review("503", 2), review("504", 1), review("505", 5, 60)];
  const deps = {
    getComments: async (cursor: string) =>
      cursor ? { reviews: reviews.slice(3), more: false, next: "" } : { reviews: reviews.slice(0, 3), more: true, next: "p2" },
    reply: async (list: { comment_id: number; comment: string }[]) => {
      sent.push(...list.map((l) => `${l.comment_id}:${l.comment}`));
      return list.map((l) => ({ commentId: String(l.comment_id) }));
    },
    itemName: async () => "Nước giặt hương hoa",
    shopName: async () => "Combi Home",
  };

  const off = await rv.runAutoReply(deps);
  assert.equal(off.sent, 0);
  assert.equal(sent.length, 0);

  await rv.reviewStore.update((s) => { s.enabled = true; });
  const r = await rv.runAutoReply(deps);
  assert.equal(r.checked, 5, "doc ca hai trang");
  assert.equal(r.sent, 2);
  assert.deepEqual(sent.map((s) => s.split(":")[0]), ["501", "502"]);
  assert.ok(sent.every((s) => s.includes("Combi Home") || s.includes("Nước giặt")));
  assert.equal(r.waiting, 3, "2 danh gia xau va 1 danh gia cu cho duyet");
  assert.match(r.message, /Đã tự trả lời 2 đánh giá 4-5 sao. 3 đánh giá đang chờ duyệt./);

  // Shopee chua kip cap nhat trang thai da tra loi: van khong gui lai.
  sent.length = 0;
  await rv.runAutoReply(deps);
  assert.equal(sent.length, 0, "khong gui trung nho so ghi");
  assert.ok((await rv.reviewStore.read()).lastRunAt);
});
