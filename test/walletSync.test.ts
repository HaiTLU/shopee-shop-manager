/**
 * Kiem thu lay giao dich vi va tien da ve: khong bao gio luu trung.
 *
 * Loi that (9/2026): moi cua so 15 ngay co tren 100 giao dich bi luu thua dung
 * 100 dong moi nhat. page_no cua Shopee danh so tu 1 va coi 0 la trang 1, ma
 * vong lap cu bat dau tu 0 nen trang dau bi lay hai lan. Vi Shopee gia duoi day
 * lam dung nhu vay. Moi so lieu o day la so gia.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, beforeEach } from "node:test";

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shopee-wallet-test-"));
process.env.SHOPEE_PARTNER_ID = "1000001";
process.env.SHOPEE_PARTNER_KEY = "khoa-gia-dung-de-kiem-thu";
process.env.SHOPEE_REGION = "GLOBAL";
process.env.SHOPEE_REDIRECT_URI = "http://localhost:3000/auth/callback";
process.env.TOKEN_FILE = path.join(tmpRoot, "token.json");
process.env.TOKEN_KEEPALIVE_MINUTES = "0";

const fin = await import("../src/finance.js");
const { recordKey, uniqueRecords } = await import("../src/dedupe.js");
type WalletTx = import("../src/finance.js").WalletTx;
type SyncDeps = import("../src/finance.js").SyncDeps;

after(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await fs.rm(fin.financeStore.file, { force: true });
});

const PAGE_SIZE = 100;

/** So ban thua, dem doc lap voi ma dang kiem (ban ghi gia luon cung thu tu truong). */
const dupes = (list: unknown[]) => list.length - new Set(list.map((x) => JSON.stringify(x))).size;

/** `count` giao dich cach nhau `step` giay tu 00:00 ngay `day`; cu 5 dong co 1 dong nap quang cao. */
function makeTxs(day: string, count: number, step: number): WalletTx[] {
  let balance = 10_000_000;
  return Array.from({ length: count }, (_, i): WalletTx => {
    const time = fin.dayStart(day) + i * step;
    if (i % 5 === 4) {
      balance -= 216_000;
      return { time, type: "SPM_DEDUCT", title: "Nạp tiền quảng cáo", amount: -216_000, balance, status: "COMPLETED" };
    }
    balance += 150_000 + i;
    return { time, type: "ESCROW_VERIFIED_ADD", title: "Doanh thu đơn hàng", amount: 150_000 + i, balance, orderSn: `SN${i}`, status: "COMPLETED" };
  });
}

/**
 * Shopee gia: giao dich moi nhat truoc, 100 dong mot trang, page_no danh so tu
 * 1 va 0 cung la trang 1 (dung nhu du lieu that: hoi trang 0 roi trang 1 thi
 * nhan hai lan cung mot trang).
 */
function fakeShopee(all: WalletTx[]) {
  const pages: number[] = [];
  const ranges: { kind: "orders" | "wallet"; from: number; to: number }[] = [];
  const deps: SyncDeps = {
    listOrders: async (from, to) => {
      ranges.push({ kind: "orders", from, to });
      return { orders: [], more: false, next: "" };
    },
    orderDetails: async () => [],
    escrowBatch: async () => [],
    released: async () => ({ items: [], next: "" }),
    wallet: async (from, to, page) => {
      ranges.push({ kind: "wallet", from, to });
      pages.push(page);
      const inRange = all.filter((t) => t.time >= from && t.time <= to).sort((a, b) => b.time - a.time);
      const p = Math.max(1, page);
      return { items: inRange.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE), more: p * PAGE_SIZE < inRange.length };
    },
    sleep: async () => {},
    progress: () => {},
  };
  return { deps, pages, ranges };
}

const outflow = (list: WalletTx[]) => list.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);

test("vi: page_no bat dau tu 1, moi trang hoi mot lan, cua so tren 100 giao dich khong luu thua trang dau", async () => {
  const txs = makeTxs("2026-09-01", 250, 3000); // ~9 ngay, nam gon trong mot cua so 15 ngay
  const shopee = fakeShopee(txs);
  const steps = await fin.syncFinance("2026-09-01", "2026-09-15", shopee.deps);

  assert.deepEqual(shopee.pages, [1, 2, 3], "trang 0 va trang 1 cua Shopee la mot, chi hoi tu trang 1");
  const saved = (await fin.financeStore.read()).wallet;
  assert.equal(dupes(saved), 0, "khong co ban trung");
  assert.equal(saved.length, 250);
  assert.equal(outflow(saved), outflow(txs), "tong tien ra (nap quang cao) dung bang so goc");
  assert.equal(steps.find((s) => s.name === "Ví Shopee")!.message, "250 giao dịch.");
});

test("cua so lien nhau noi tiep dung tung giay: khong chong, khong ho, toi da 15 ngay", async () => {
  const shopee = fakeShopee([]);
  await fin.syncFinance("2026-08-01", "2026-09-09", shopee.deps);
  for (const kind of ["orders", "wallet"] as const) {
    // Moi cua so co the hoi nhieu trang; lay moi cua so mot lan theo moc bat dau.
    const ws = [...new Map(shopee.ranges.filter((r) => r.kind === kind).map((r) => [r.from, r])).values()];
    assert.equal(ws.length, 3, `${kind}: 40 ngay chia 3 cua so`);
    assert.equal(ws[0]!.from, fin.dayStart("2026-08-01"), `${kind}: bat dau 00:00 ngay dau ky`);
    assert.equal(ws.at(-1)!.to, fin.dayStart("2026-09-09") + 86400 - 1, `${kind}: ket thuc 23:59:59 ngay cuoi ky`);
    for (const [i, w] of ws.entries()) {
      assert.ok(w.to - w.from + 1 <= 15 * 86400, `${kind}: cua so ${i} khong qua 15 ngay`);
      if (i > 0) assert.equal(w.from, ws[i - 1]!.to + 1, `${kind}: cua so ${i} bat dau ngay sau giay cuoi cua cua so truoc`);
    }
  }
});

test("lay lai nhieu lan, ky chong len nhau: khong luu trung, khong mat giao dich", async () => {
  const txs = makeTxs("2026-09-01", 600, 4000); // 01/9 den 28/9, nhieu cua so co tren 100 dong
  const shopee = fakeShopee(txs);
  await fin.syncFinance("2026-09-01", "2026-09-20", shopee.deps);
  await fin.syncFinance("2026-09-10", "2026-09-30", shopee.deps);
  await fin.syncFinance("2026-09-01", "2026-09-30", shopee.deps);
  await fin.syncFinance("2026-09-15", "2026-09-15", shopee.deps);

  const saved = (await fin.financeStore.read()).wallet;
  assert.equal(dupes(saved), 0);
  assert.equal(saved.length, 600);
  assert.equal(outflow(saved), outflow(txs));
});

test("kho da co ban trung tu ban cu thi lan lay sau don sach, ca phan ngoai ky vua lay", async () => {
  const august = makeTxs("2026-08-01", 150, 3000);
  const newestFirst = [...august].sort((a, b) => b.time - a.time);
  // Giong tep that: 100 dong moi nhat cua cua so bi luu hai lan, lien nhau.
  await fin.financeStore.update((d) => {
    d.wallet = [...newestFirst.slice(0, 100), ...newestFirst];
  });

  await fin.syncFinance("2026-09-01", "2026-09-15", fakeShopee(makeTxs("2026-09-01", 50, 3000)).deps);

  const saved = (await fin.financeStore.read()).wallet;
  assert.equal(dupes(saved), 0);
  assert.equal(saved.length, 150 + 50);
});

test("hai giao dich that cung giay, cung loai, cung so tien nhung khac so du: giu ca hai", async () => {
  const t0 = fin.dayStart("2026-09-05") + 3600;
  const twins: WalletTx[] = [
    { time: t0, type: "SPM_DEDUCT", title: "Nạp tiền quảng cáo", amount: -216_000, balance: 1_000_000, status: "COMPLETED" },
    { time: t0, type: "SPM_DEDUCT", title: "Nạp tiền quảng cáo", amount: -216_000, balance: 784_000, status: "COMPLETED" },
  ];
  await fin.syncFinance("2026-09-01", "2026-09-15", fakeShopee(twins).deps);
  assert.equal((await fin.financeStore.read()).wallet.length, 2);

  // Khoa so ca ban ghi, khong phu thuoc thu tu truong.
  assert.equal(recordKey({ a: 1, b: { d: 2, c: 3 } }), recordKey({ b: { c: 3, d: 2 }, a: 1 }));
  assert.deepEqual(uniqueRecords([{ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 1, b: 3 }]), [{ a: 1, b: 2 }, { a: 1, b: 3 }]);
});

test("tien da ve: Shopee tra lai cung mot khoan o trang sau thi chi luu mot lan", async () => {
  const item = { sn: "S1", amount: 206_830, time: fin.dayStart("2026-09-03") + 7200 };
  const shopee = fakeShopee([]);
  shopee.deps.released = async (_from, _to, cursor) => (cursor ? { items: [item], next: "" } : { items: [item], next: "p2" });

  const steps = await fin.syncFinance("2026-09-01", "2026-09-10", shopee.deps);

  assert.deepEqual((await fin.financeStore.read()).released, [item]);
  assert.equal(steps.find((s) => s.name === "Tiền đã về")!.message, "1 khoản.");
});
