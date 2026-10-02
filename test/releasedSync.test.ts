/**
 * Kiem thu lay tien da ve (get_income_detail): doc dung dang phan hoi cua Shopee.
 *
 * Loi that (9/2026): kho tai chinh co mang released rong du syncedDays da danh
 * dau du ca nam va vi co nhieu khoan tien don ve, nen "Tien da ve trong ky"
 * luon bang 0. Tai lieu Shopee (bang tham so va vi du phan hoi) dat
 * income_detail_list o cap ngoai cung, khong boc trong `response` nhu cac API
 * khac, va la mot doi tuong { list, next_page }. Ma cu doc theo kieu cua SDK
 * (mang nhom nam trong `response`) nen trang nao cung ra 0 khoan, cursor rong,
 * ma buoc "Tien da ve" van bao thanh cong. Shopee gia duoi day tra dung dang
 * trong tai lieu. Moi so lieu o day la so gia.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, beforeEach } from "node:test";

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shopee-released-test-"));
process.env.SHOPEE_PARTNER_ID = "1000001";
process.env.SHOPEE_PARTNER_KEY = "khoa-gia-dung-de-kiem-thu";
process.env.SHOPEE_REGION = "GLOBAL";
process.env.SHOPEE_REDIRECT_URI = "http://localhost:3000/auth/callback";
process.env.TOKEN_FILE = path.join(tmpRoot, "token.json");
process.env.TOKEN_KEEPALIVE_MINUTES = "0";

const fin = await import("../src/finance.js");
type Released = import("../src/finance.js").Released;
type SyncDeps = import("../src/finance.js").SyncDeps;
type SyncStep = import("../src/finance.js").SyncStep;

after(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await fs.rm(fin.financeStore.file, { force: true });
});

/** Giay luc `hour` gio Ha Noi ngay `day`. */
const at = (day: string, hour: number) => fin.dayStart(day) + hour * 3600;

/** Mot dong tien da ve, dung ten truong trong tai lieu Shopee. */
const row = (r: Released) => ({
  payment_method: "ShopeePay",
  order_sn: r.sn,
  status: "Đã chuyển tiền",
  currency: "VND",
  released_amount: r.amount,
  actual_payout_time: r.time,
});

/** Phan hoi dung dang vi du trong tai lieu: khong co `response`, income_detail_list la doi tuong. */
const docBody = (list: unknown[], cursor: string) => ({
  error: "",
  message: "",
  request_id: "yeu-cau-gia",
  income_detail_list: { list, next_page: { cursor, page_size: 50 } },
});

/** Shopee gia: loc khoan da ve theo ngay (gio Ha Noi), `size` khoan mot trang, cursor la vi tri trang sau. */
function fakeIncomeDetail(all: Released[], size: number) {
  const calls: { from: string; to: string; cursor: string }[] = [];
  const get = (from: string, to: string, cursor: string) => {
    calls.push({ from, to, cursor });
    const inRange = all.filter((r) => fin.dayKey(r.time) >= from && fin.dayKey(r.time) <= to);
    const start = Number(cursor || 0);
    const next = start + size < inRange.length ? String(start + size) : "";
    return docBody(inRange.slice(start, start + size).map(row), next);
  };
  return { get, calls };
}

/** Cac phan khac cua lan lay so lieu tra rong; moi phep kiem chi thay phan tien da ve. */
function quietDeps(released: SyncDeps["released"]): SyncDeps {
  return {
    listOrders: async () => ({ orders: [], more: false, next: "" }),
    orderDetails: async () => [],
    escrowBatch: async () => [],
    released,
    wallet: async () => ({ items: [], more: false }),
    sleep: async () => {},
    progress: () => {},
  };
}

const releasedStep = (steps: SyncStep[]) => steps.find((s) => s.name === "Tiền đã về")!;

const A: Released = { sn: "DON-GIA-A", amount: 150_000, time: at("2026-09-03", 10) };
const B: Released = { sn: "DON-GIA-B", amount: 250_000, time: at("2026-09-03", 15) };
const C: Released = { sn: "DON-GIA-C", amount: 90_000, time: at("2026-09-08", 9) };

test("doc dung vi du trong tai lieu Shopee: income_detail_list o cap ngoai cung, la doi tuong { list, next_page }", () => {
  assert.deepEqual(fin.readIncomeDetail(docBody([row(A), row(B)], "trang-2")), { items: [A, B], next: "trang-2" });
  // Ban mau trong SDK con kem `response: {}` rong: cap ngoai cung van duoc doc truoc.
  assert.deepEqual(fin.readIncomeDetail({ ...docBody([row(C)], ""), response: {} }), { items: [C], next: "" });
});

test("nhan ca ten mang theo bang tham so (income_detail_list_item) va dang kieu SDK (mang nhom trong response)", () => {
  const table = { error: "", message: "", request_id: "r", income_detail_list: { income_detail_list_item: [row(A)], next_page: { cursor: "" } } };
  assert.deepEqual(fin.readIncomeDetail(table), { items: [A], next: "" });

  const sdkTyped = { error: "", message: "", response: { income_detail_list: [{ income_detail_list_item: [row(C)], next_page: { cursor: "trang-2" } }] } };
  assert.deepEqual(fin.readIncomeDetail(sdkTyped), { items: [C], next: "trang-2" });
});

test("khoan khong co ma don bi bo nhung van lat trang; trang rong thi dung du Shopee con gui cursor", () => {
  const adjustOnly = docBody([{ description: "Adjustment", released_amount: 5_000, actual_payout_time: A.time }], "trang-3");
  assert.deepEqual(fin.readIncomeDetail(adjustOnly), { items: [], next: "trang-3" });
  assert.deepEqual(fin.readIncomeDetail(docBody([], "trang-4")), { items: [], next: "" });
});

test("dang phan hoi la thi bao loi chu khong coi la 0 khoan; buoc Tien da ve bao loi va giu so cu", async () => {
  assert.throws(() => fin.readIncomeDetail({ error: "", message: "", request_id: "r" }), /error, message, request_id/);
  assert.throws(() => fin.readIncomeDetail({ error: "", income_detail_list: "khong-phai-doi-tuong" }), /income_detail_list/);
  assert.throws(() => fin.readIncomeDetail({ income_detail_list: { list: "khong-phai-mang" } }), /income_detail_list/);

  await fin.financeStore.update((d) => {
    d.released = [A];
  });
  const steps = await fin.syncFinance(
    "2026-09-01",
    "2026-09-10",
    quietDeps(async () => fin.readIncomeDetail({ error: "", message: "", request_id: "r" })),
  );
  assert.equal(releasedStep(steps).ok, false);
  assert.deepEqual((await fin.financeStore.read()).released, [A], "khong xoa so da co khi Shopee tra dang la");
});

test("lay nhieu trang qua syncFinance roi lap bao cao: Da ve vi trong ky bang tong cac khoan", async () => {
  const shopee = fakeIncomeDetail([A, B, C], 2);
  const steps = await fin.syncFinance(
    "2026-09-01",
    "2026-09-10",
    quietDeps(async (from, to, cursor) => fin.readIncomeDetail(shopee.get(from, to, cursor))),
  );

  assert.deepEqual(shopee.calls.map((c) => c.cursor), ["", "2"], "hoi trang sau bang cursor Shopee tra ve");
  assert.equal(releasedStep(steps).message, "3 khoản.");
  const data = await fin.financeStore.read();
  assert.deepEqual(data.released, [A, B, C]);
  assert.equal(fin.buildReport(data, {}, "2026-09-01", "2026-09-10").releasedInPeriod, 150_000 + 250_000 + 90_000);
  assert.equal(fin.buildReport(data, {}, "2026-09-05", "2026-09-10").releasedInPeriod, 90_000, "chi tinh khoan ve trong ky");
});

test("cursor Shopee tra lai y nhu cursor vua hoi thi dung, khong hoi mai", async () => {
  let calls = 0;
  const steps = await fin.syncFinance(
    "2026-09-01",
    "2026-09-10",
    quietDeps(async () => {
      calls++;
      if (calls > 10) throw new Error("vòng lặp không dừng");
      return { items: [{ ...A, sn: `DON-GIA-${calls}` }], next: "cung-mot-cursor" };
    }),
  );
  assert.equal(calls, 2, "trang dau hoi cursor rong, trang hai tra lai dung cursor vua hoi thi thoi");
  assert.equal(releasedStep(steps).ok, true);
});
