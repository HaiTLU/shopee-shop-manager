/**
 * Kiem thu tai chinh: quy tien tung don thanh bang ke, lap bao cao ky, lay
 * so lieu tu Shopee (bang ham gia) va gia von qua Excel.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import ExcelJS from "exceljs";

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shopee-finance-test-"));
process.env.SHOPEE_PARTNER_ID = "1000001";
process.env.SHOPEE_PARTNER_KEY = "khoa-gia-dung-de-kiem-thu";
process.env.SHOPEE_REGION = "GLOBAL";
process.env.SHOPEE_REDIRECT_URI = "http://localhost:3000/auth/callback";
process.env.TOKEN_FILE = path.join(tmpRoot, "token.json");
process.env.TOKEN_KEEPALIVE_MINUTES = "0";

const fin = await import("../src/finance.js");
const { readCosts, saveCosts } = await import("../src/costs.js");
const excel = await import("../src/excel.js");
const { buildItem } = await import("../src/catalog.js");

after(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("ngay gio Ha Noi: 23:30 UTC la ngay hom sau o Ha Noi; chia khoang toi da N ngay", () => {
  assert.equal(fin.dayKey(Date.parse("2026-09-27T23:30:00Z") / 1000), "2026-09-28");
  assert.equal(fin.dayStart("2026-09-28"), Date.parse("2026-09-27T17:00:00Z") / 1000);
  assert.deepEqual(fin.windows("2026-09-01", "2026-10-10", 15), [
    { from: "2026-09-01", to: "2026-09-15" },
    { from: "2026-09-16", to: "2026-09-30" },
    { from: "2026-10-01", to: "2026-10-10" },
  ]);
  assert.equal(fin.isDay("2026-02-30"), false, "ngay khong co that");
  assert.equal(fin.isDay("28/09/2026"), false);
});

// Tien mot don that dang Shopee VN tra ve (so da lam tron cho de doc).
const escrow = {
  order_selling_price: 300000,
  seller_discount: 30000,
  voucher_from_seller: 10000,
  commission_fee: 27000,
  service_fee: 13500,
  seller_transaction_fee: 7000,
  seller_order_processing_fee: 1620,
  withholding_vat_tax: 2700,
  withholding_pit_tax: 1350,
  actual_shipping_fee: 32000,
  shopee_shipping_rebate: 32000,
  escrow_amount: 206830,
  items: [
    { item_id: 1, model_id: 11, item_name: "Nước giặt", model_name: "Hương hoa", quantity_purchased: 2, discounted_price: 180000 },
    { item_id: 2, model_id: 0, item_name: "Túi giặt", quantity_purchased: 1, discounted_price: 90000 },
  ],
};

test("quy tien mot don: cac dong bang ke cong lai dung bang tien Shopee tra", () => {
  const i = fin.normalizeIncome(escrow);
  assert.equal(i.goods, 270000, "gia ban tru giam gia cua shop");
  assert.equal(i.sellerVoucher, 10000);
  assert.deepEqual([i.commission, i.service, i.transaction, i.otherFees, i.tax], [27000, 13500, 7000, 1620, 4050]);
  assert.equal(i.net, 206830);
  assert.equal(i.goods - i.sellerVoucher - i.commission - i.service - i.transaction - i.otherFees - i.tax + i.adjust, i.net, "bang ke phai khop tuyet doi");
  assert.equal(i.adjust, 0);
  assert.deepEqual(
    fin.orderLines(escrow).map((l) => [l.itemId, l.modelId, l.qty, l.amount, l.modelName]),
    [
      [1, 11, 2, 180000, "Hương hoa"],
      [2, 0, 1, 90000, undefined],
    ],
  );
});

const t = (iso: string) => Date.parse(iso) / 1000;

function sampleData(): import("../src/finance.js").FinanceData {
  const income = fin.normalizeIncome(escrow);
  const lines = fin.orderLines(escrow);
  return {
    orders: {
      A: { sn: "A", status: "COMPLETED", createTime: t("2026-09-10T03:00:00Z"), income, lines },
      B: { sn: "B", status: "SHIPPED", createTime: t("2026-09-11T03:00:00Z"), income: { ...income, net: 100000, adjust: income.adjust + 100000 - income.net }, lines: [lines[1]!] },
      C: { sn: "C", status: "CANCELLED", createTime: t("2026-09-11T05:00:00Z"), income: { ...income, net: -15000 } },
      D: { sn: "D", status: "UNPAID", createTime: t("2026-09-12T05:00:00Z") },
      E: { sn: "E", status: "COMPLETED", createTime: t("2026-08-30T05:00:00Z"), income, lines }, // ngoai ky
    },
    wallet: [
      { time: t("2026-09-10T08:00:00Z"), type: "ESCROW_VERIFIED_ADD", title: "Doanh thu đơn hàng", amount: 206830, balance: 506830 },
      { time: t("2026-09-12T08:00:00Z"), type: "WITHDRAWAL_CREATED", title: "Rút tiền", amount: -500000, balance: 6830 },
      { time: t("2026-08-01T08:00:00Z"), type: "ESCROW_VERIFIED_ADD", title: "Doanh thu đơn hàng", amount: 300000, balance: 300000 },
    ],
    released: [
      { sn: "A", amount: 206830, time: t("2026-09-10T08:00:00Z") },
      { sn: "E", amount: 206830, time: t("2026-09-01T08:00:00Z") },
    ],
    syncedDays: Object.fromEntries(fin.daysBetween("2026-09-01", "2026-09-11").map((d) => [d, 1])),
  };
}

test("bao cao ky: dem don theo trang thai, bang ke, lai lo chi tinh don du gia von", () => {
  const costs = { "1:11": 50000, "2:0": 30000 };
  const r = fin.buildReport(sampleData(), costs, "2026-09-10", "2026-09-12");

  assert.deepEqual(r.counts, { orders: 2, final: 1, estimated: 1, cancelled: 1, unpaid: 1, noIncome: 0 });
  assert.equal(r.statement.net, 206830 + 100000);
  assert.equal(r.cancelledNet, -15000, "don huy bi tru phi van duoc bao");
  // Don A: gia von 2*50.000 + 30.000 = 130.000. Don B: 1 tui = 30.000.
  assert.deepEqual(r.profit, { orders: 2, net: 306830, cogs: 160000, profit: 146830 });
  assert.deepEqual(r.missingDays, ["2026-09-12"], "ngay 12 chua lay so lieu");
  assert.deepEqual(r.daily.map((d) => [d.day, d.orders, d.net, d.profit]), [
    ["2026-09-10", 1, 206830, 76830],
    ["2026-09-11", 1, 100000, 70000],
    ["2026-09-12", 0, 0, 0],
  ]);
  // Phan bo thuc nhan don A theo thanh tien: 180/270 cho nuoc giat, 90/270 cho tui.
  const giat = r.products.find((p) => p.itemId === 1)!;
  assert.equal(giat.qty, 2);
  assert.equal(giat.net, Math.round((206830 * 180000) / 270000));
  assert.equal(giat.profit, giat.net - 100000);
  assert.equal(r.wallet.balance, 6830, "so du lay tu giao dich moi nhat");
  assert.equal(r.wallet.withdrawn, 500000);
  assert.equal(r.wallet.inflow, 206830);
  assert.equal(r.releasedInPeriod, 206830, "chi tinh tien ve trong ky");
});

test("bao cao: thieu gia von thi khong tinh lai cho don do va danh dau ngay", () => {
  const r = fin.buildReport(sampleData(), { "2:0": 30000 }, "2026-09-10", "2026-09-11");
  assert.deepEqual(r.profit, { orders: 1, net: 100000, cogs: 30000, profit: 70000 });
  assert.equal(r.orders.find((o) => o.sn === "A")!.missingCost, true);
  assert.equal(r.daily[0]!.profit, undefined, "ngay co don thieu gia von khong neu lai");
  assert.equal(r.products.find((p) => p.itemId === 1)!.profit, undefined);
});

test("lay so lieu: chia khoang theo gioi han Shopee, chi hoi tien don can, phan loi khong chan phan khac", async () => {
  const calls: string[] = [];
  let run = 0;
  const statuses: Record<string, string> = { S1: "COMPLETED", S2: "SHIPPED", S3: "UNPAID" };
  const deps: import("../src/finance.js").SyncDeps = {
    listOrders: async (from, to, cursor) => {
      calls.push(`list ${fin.dayKey(from)} ${fin.dayKey(to)} ${cursor || "-"}`);
      // Chi khoang dau co don, trang 2 co them mot don.
      if (fin.dayKey(from) !== "2026-09-01") return { orders: [], more: false, next: "" };
      return cursor
        ? { orders: [{ sn: "S3", status: statuses.S3! }], more: false, next: "" }
        : { orders: [{ sn: "S1", status: statuses.S1! }, { sn: "S2", status: statuses.S2! }], more: true, next: "p2" };
    },
    orderDetails: async (sns) => {
      calls.push(`detail ${sns.join(",")}`);
      return sns.map((sn) => ({ sn, status: statuses[sn]!, createTime: t("2026-09-02T03:00:00Z") }));
    },
    escrowBatch: async (sns) => {
      calls.push(`escrow ${sns.join(",")}`);
      return sns.map((sn) => ({ sn, income: escrow }));
    },
    released: async (from, to) => {
      calls.push(`released ${from} ${to}`);
      return { items: [{ sn: "S1", amount: 206830, time: t("2026-09-05T03:00:00Z") }], next: "" };
    },
    wallet: async () => {
      calls.push("wallet");
      throw new Error("error_permission: no permission");
    },
    sleep: async () => {},
    progress: () => {},
  };

  run++;
  const steps = await fin.syncFinance("2026-09-01", "2026-10-10", deps);
  assert.deepEqual(
    calls.filter((c) => c.startsWith("list")),
    ["list 2026-09-01 2026-09-15 -", "list 2026-09-01 2026-09-15 p2", "list 2026-09-16 2026-09-30 -", "list 2026-10-01 2026-10-10 -"],
  );
  assert.deepEqual(calls.filter((c) => c.startsWith("released")), [
    "released 2026-09-01 2026-09-14",
    "released 2026-09-15 2026-09-28",
    "released 2026-09-29 2026-10-10",
  ]);
  assert.ok(calls.includes("detail S1,S2,S3"));
  assert.ok(calls.includes("escrow S1,S2"), "don chua thanh toan khong hoi tien");
  assert.deepEqual(steps.map((s) => [s.name, s.ok]), [
    ["Đơn hàng và tiền từng đơn", true],
    ["Tiền đã về", true],
    ["Ví Shopee", false],
  ]);
  const saved = await fin.financeStore.read();
  assert.equal(saved.orders.S1!.income!.net, 206830);
  assert.ok(saved.syncedDays["2026-10-10"], "danh dau da lay so lieu ca ky");

  // Lan hai: don da hoan thanh va da co tien thi khong hoi lai; don dang giao thi hoi lai.
  calls.length = 0;
  run++;
  await fin.syncFinance("2026-09-01", "2026-09-15", deps);
  assert.ok(!calls.some((c) => c.startsWith("detail")), "don cu da co ngay tao");
  assert.deepEqual(calls.filter((c) => c.startsWith("escrow")), ["escrow S2"]);
  assert.equal(run, 2);
});

test("gia von: luu, xoa, tu choi so am", async () => {
  await saveCosts([{ itemId: 5, modelId: 0, cost: 12000 }, { itemId: 6, modelId: 61, cost: 8000 }]);
  await saveCosts([{ itemId: 6, modelId: 61, cost: null }]);
  assert.deepEqual(await readCosts(), { "5:0": 12000 });
  await assert.rejects(() => saveCosts([{ itemId: 5, modelId: 0, cost: -1 }]), /từ 0 trở lên/);
});

test("Excel: cot Gia von dien san gia von dang luu, sua thi luu tren may, canh bao khi cao hon gia", async () => {
  const items = [
    buildItem({ item_id: 5, item_name: "Quà tặng gói xả", has_model: false, price_info: [{ original_price: 23000, current_price: 23000 }], stock_info_v2: { summary_info: { total_available_stock: 7 } } } as never),
  ];
  const costs = await readCosts();
  const buffer = await excel.buildWorkbook(items, { shopName: "Combi Home", sandbox: false, exportedAt: new Date(), costs });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as never);
  const sheet = wb.getWorksheet(excel.SHEET_DATA)!;
  assert.equal(sheet.getCell("J1").value, "Giá vốn");
  assert.equal(sheet.getCell("J2").value, 12000, "dien san gia von dang luu");

  // Chua sua gi: khong co thay doi.
  assert.equal(excel.diffRows(await excel.parseWorkbook(buffer), items, costs).changes.length, 0);

  sheet.getCell("J2").value = 25000;
  const diff = excel.diffRows(await excel.parseWorkbook(Buffer.from(await wb.xlsx.writeBuffer())), items, costs);
  assert.deepEqual([diff.changes[0]!.oldCost, diff.changes[0]!.newCost, diff.changes[0]!.newPrice], [12000, 25000, undefined]);
  assert.match(diff.changes[0]!.warnings[0]!, /cao hơn giá gốc/);

  const saved: unknown[] = [];
  const results: string[] = [];
  await excel.applyChanges(diff.changes, {
    updatePrice: async () => { throw new Error("khong duoc goi Shopee"); },
    updateStock: async () => { throw new Error("khong duoc goi Shopee"); },
    saveCosts: async (list) => { saved.push(...list); },
    sleep: async () => {},
    onResult: (r) => results.push(`${r.field} ${r.ok}`),
  });
  assert.deepEqual(saved, [{ itemId: 5, modelId: 0, cost: 25000 }]);
  assert.deepEqual(results, ["cost true"], "chi luu gia von, khong goi Shopee");
});
