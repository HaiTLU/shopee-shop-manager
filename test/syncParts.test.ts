/**
 * Kiem thu danh dau ngay da lay so lieu rieng cho tung phan: don hang, tien da
 * ve (get_income_detail), vi (get_wallet_transaction_list).
 *
 * Loi cu: syncedDays chi theo phan don, nen tien da ve hoac vi loi (vd shop
 * chua duoc cap quyen Payment) thi cac ngay van bi danh dau da lay. Lan mo sau,
 * bao cao coi ky la du va dong "Da ve vi trong ky" hien 0 d nhu so that.
 *
 * Nay moi phan co ngay rieng. missingDays van chi tinh ngay chua lay don, vi
 * trang tu lay lai theo no: shop thieu quyen Payment thi hai phan kia luon loi,
 * tinh vao day thi lan mo nao cung tu lay lai. Moi so lieu o day la so gia.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, beforeEach } from "node:test";

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shopee-sync-parts-test-"));
process.env.SHOPEE_PARTNER_ID = "1000001";
process.env.SHOPEE_PARTNER_KEY = "khoa-gia-dung-de-kiem-thu";
process.env.SHOPEE_REGION = "GLOBAL";
process.env.SHOPEE_REDIRECT_URI = "http://localhost:3000/auth/callback";
process.env.TOKEN_FILE = path.join(tmpRoot, "token.json");
process.env.TOKEN_KEEPALIVE_MINUTES = "0";

const fin = await import("../src/finance.js");
type FinanceData = import("../src/finance.js").FinanceData;
type Released = import("../src/finance.js").Released;
type SyncDeps = import("../src/finance.js").SyncDeps;
type WalletTx = import("../src/finance.js").WalletTx;

after(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await fs.rm(fin.financeStore.file, { force: true });
});

/** Giay luc `hour` gio Ha Noi ngay `day`. */
const at = (day: string, hour: number) => fin.dayStart(day) + hour * 3600;

type Part = "orders" | "released" | "wallet";

/** Shopee gia: phan nao nam trong `deny` thi nem loi thieu quyen, phan khac tra so lieu da cho. */
function fakeShopee(opts: { deny?: Part[]; released?: Released[]; wallet?: WalletTx[] } = {}): SyncDeps {
  const denied = (part: Part) => {
    if (opts.deny?.includes(part)) throw new Error("error_permission: no permission");
  };
  return {
    listOrders: async () => {
      denied("orders");
      return { orders: [], more: false, next: "" };
    },
    orderDetails: async () => [],
    escrowBatch: async () => [],
    released: async (from, to) => {
      denied("released");
      return { items: (opts.released ?? []).filter((r) => fin.dayKey(r.time) >= from && fin.dayKey(r.time) <= to), next: "" };
    },
    wallet: async (timeFrom, timeTo) => {
      denied("wallet");
      return { items: (opts.wallet ?? []).filter((t) => t.time >= timeFrom && t.time <= timeTo), more: false };
    },
    sleep: async () => {},
    progress: () => {},
  };
}

const marked = (days: Record<string, number> | undefined) => Object.keys(days ?? {}).sort();

const A: Released = { sn: "DON-GIA-A", amount: 150_000, time: at("2026-09-02", 10) };
const W: WalletTx = { time: at("2026-09-02", 11), type: "ESCROW_VERIFIED_ADD", title: "Doanh thu đơn hàng", amount: 150_000, balance: 150_000 };

const KY = ["2026-09-01", "2026-09-02", "2026-09-03"];

for (const c of [
  { name: "thieu quyen Payment: tien da ve va vi loi", deny: ["released", "wallet"] as Part[], ok: { orders: true, released: false, wallet: false } },
  { name: "chi vi loi", deny: ["wallet"] as Part[], ok: { orders: true, released: true, wallet: false } },
  { name: "don loi, tien da ve va vi van lay duoc", deny: ["orders"] as Part[], ok: { orders: false, released: true, wallet: true } },
  { name: "ca ba phan lay duoc", deny: [] as Part[], ok: { orders: true, released: true, wallet: true } },
]) {
  test(`${c.name}: chi phan lay duoc moi danh dau ngay, bao cao bao dung phan nao con thieu`, async () => {
    const steps = await fin.syncFinance("2026-09-01", "2026-09-03", fakeShopee({ deny: c.deny }));
    assert.deepEqual(steps.map((s) => s.ok), [c.ok.orders, c.ok.released, c.ok.wallet]);

    const saved = await fin.financeStore.read();
    assert.deepEqual(marked(saved.syncedDays), c.ok.orders ? KY : []);
    assert.deepEqual(marked(saved.releasedDays), c.ok.released ? KY : []);
    assert.deepEqual(marked(saved.walletDays), c.ok.wallet ? KY : []);

    const r = fin.buildReport(saved, {}, "2026-09-01", "2026-09-03");
    // Trang tu lay lai khi missingDays khac rong: phan tien, vi loi khong duoc tinh vao day.
    assert.deepEqual(r.missingDays, c.ok.orders ? [] : KY, "missingDays chi tinh ngay chua lay don");
    assert.deepEqual(r.releasedMissingDays, c.ok.released ? [] : KY);
    assert.deepEqual(r.walletMissingDays, c.ok.wallet ? [] : KY);
  });
}

test("lay lai ky chong len ky cu ma tien da ve loi: giu ngay va so da lay cua phan do, chi ngay moi con thieu", async () => {
  await fin.syncFinance("2026-09-01", "2026-09-03", fakeShopee({ released: [A], wallet: [W] }));
  await fin.syncFinance("2026-09-02", "2026-09-05", fakeShopee({ deny: ["released"], released: [A], wallet: [W] }));

  const saved = await fin.financeStore.read();
  assert.deepEqual(marked(saved.releasedDays), KY, "ngay da lay xong truoc do van con");
  assert.deepEqual(saved.released, [A], "loi thi khong xoa khoan da ve da luu");
  assert.deepEqual(marked(saved.walletDays), [...KY, "2026-09-04", "2026-09-05"]);
  assert.deepEqual(marked(saved.syncedDays), [...KY, "2026-09-04", "2026-09-05"]);

  const r = fin.buildReport(saved, {}, "2026-09-01", "2026-09-05");
  assert.deepEqual(r.missingDays, []);
  assert.deepEqual(r.releasedMissingDays, ["2026-09-04", "2026-09-05"]);
  assert.deepEqual(r.walletMissingDays, []);
  assert.equal(r.releasedInPeriod, 150_000, "van cong cac ngay da co; giao dien tu bao la chua du");
});

test("tep luu tu ban cu (chua co releasedDays, walletDays): doc duoc, coi nhu chua lay tien da ve va vi, lay lai thi du", async () => {
  // Ban cu danh dau ca ky theo phan don, du tien da ve va vi co the da loi.
  const old = { orders: {}, wallet: [W], released: [], syncedDays: Object.fromEntries(KY.map((d) => [d, 1])) };
  await fs.writeFile(fin.financeStore.file, JSON.stringify(old));

  const data = await fin.financeStore.read();
  assert.deepEqual(data.wallet, [W], "so lieu cu van doc duoc");
  const before = fin.buildReport(data, {}, "2026-09-01", "2026-09-03");
  assert.deepEqual(before.missingDays, [], "ngay da lay don khong bi lay lai tu dong");
  assert.deepEqual(before.releasedMissingDays, KY, "khong suy ra tu syncedDays");
  assert.deepEqual(before.walletMissingDays, KY);

  await fin.syncFinance("2026-09-01", "2026-09-03", fakeShopee({ released: [A], wallet: [W] }));
  const afterSync = fin.buildReport(await fin.financeStore.read(), {}, "2026-09-01", "2026-09-03");
  assert.deepEqual([afterSync.releasedMissingDays, afterSync.walletMissingDays], [[], []]);
  assert.equal(afterSync.releasedInPeriod, 150_000);
});

test("kho khac (vd trong bo nho) tra du lieu khong co hai truong moi: bao cao va lay so lieu van chay", async () => {
  let saved: FinanceData = { orders: {}, wallet: [], released: [], syncedDays: {} };
  const store = {
    file: "(bo nho)",
    read: async () => structuredClone(saved),
    update: async (mutate: (d: FinanceData) => void) => {
      const d = structuredClone(saved);
      mutate(d);
      saved = d;
      return d;
    },
  };

  const empty = fin.buildReport(saved, {}, "2026-09-01", "2026-09-03");
  assert.deepEqual([empty.missingDays, empty.releasedMissingDays, empty.walletMissingDays], [KY, KY, KY]);

  await fin.syncFinance("2026-09-01", "2026-09-03", fakeShopee({ deny: ["wallet"] }), store);
  assert.deepEqual(marked(saved.releasedDays), KY);
  assert.deepEqual(marked(saved.walletDays), []);
});
