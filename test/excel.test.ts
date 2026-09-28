/**
 * Kiem thu doc phan loai va sua hang loat bang Excel: xuat tep, doc lai,
 * so sanh thay doi, gui len Shopee (bang ham gia) va bao ket qua tung dong.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import ExcelJS from "exceljs";

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shopee-excel-test-"));
process.env.SHOPEE_PARTNER_ID = "1000001";
process.env.SHOPEE_PARTNER_KEY = "khoa-gia-dung-de-kiem-thu";
process.env.SHOPEE_REGION = "TEST_GLOBAL";
process.env.SHOPEE_REDIRECT_URI = "http://localhost:3000/auth/callback";
process.env.TOKEN_FILE = path.join(tmpRoot, "token.json");
process.env.TOKEN_KEEPALIVE_MINUTES = "0";

const { buildItem, modelName, editableStock } = await import("../src/catalog.js");
const excel = await import("../src/excel.js");
type CatalogItem = import("../src/catalog.js").CatalogItem;

after(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

// Du lieu that Shopee tra ve cho san pham co phan loai: khong co price_info o cap san pham.
const variantBase = {
  item_id: 22925708328,
  item_name: "Nước hoa ô tô kẹp cửa gió",
  has_model: true,
  image: { image_url_list: ["https://cf.shopee.vn/file/a"] },
};
const variantModels = {
  tier_variation: [
    { name: "Mùi", option_list: [{ option: "Hương hoa" }, { option: "Hương biển" }] },
    { name: "Loại", option_list: [{ option: "Lẻ" }, { option: "Combo 3" }] },
  ],
  model: [
    { model_id: 1, tier_index: [0, 0], model_sku: "HH-L", price_info: [{ original_price: 45000, current_price: 39000 }], stock_info_v2: { seller_stock: [{ stock: 12 }], summary_info: { total_available_stock: 12, total_reserved_stock: 2 } } },
    { model_id: 2, tier_index: [1, 1], price_info: [{ original_price: 120000, current_price: 120000 }], stock_info_v2: { summary_info: { total_available_stock: 0 } } },
  ],
};

test("san pham co phan loai: lay gia, ton tung phan loai, tinh khoang gia va tong ton", () => {
  const item = buildItem(variantBase as never, variantModels as never);
  assert.equal(item.hasModel, true);
  assert.equal(item.price, undefined, "gia o cap san pham bo trong");
  assert.deepEqual(
    item.models.map((m) => [m.modelId, m.name, m.price, m.stock]),
    [
      [1, "Hương hoa / Lẻ", 45000, 12],
      [2, "Hương biển / Combo 3", 120000, 0],
    ],
  );
  assert.equal(item.models[0]!.reserved, 2);
  assert.equal(item.models[0]!.sku, "HH-L");
  assert.equal(item.priceMin, 45000);
  assert.equal(item.priceMax, 120000);
  assert.equal(item.stockTotal, 12);
});

test("san pham khong phan loai giu cach doc cu", () => {
  const item = buildItem({
    item_id: 5,
    item_name: "Quà tặng gói xả",
    has_model: false,
    price_info: [{ original_price: 23000, current_price: 23000 }],
    stock_info_v2: { summary_info: { total_available_stock: 7, total_reserved_stock: 0 } },
  } as never);
  assert.deepEqual([item.price, item.stock, item.priceMin, item.stockTotal, item.models.length], [23000, 7, 23000, 7, 0]);
});

test("ten phan loai va ton sua duoc: truong hop thieu du lieu", () => {
  assert.equal(modelName(undefined, [0]), "(không tên)");
  assert.equal(modelName([{ option_list: [{ option: " Đỏ " }] }], [0]), "Đỏ");
  assert.equal(editableStock({ seller_stock: [{ stock: 5 }, { stock: 3 }], summary_info: { total_available_stock: 8 } }), 8, "nhieu kho thi lay tong");
  assert.equal(editableStock(undefined), undefined);
});

test("doc so trong o Excel: so, chu co dau cham, dau phay, chu d", () => {
  assert.deepEqual(excel.readWhole(95000), { value: 95000 });
  assert.deepEqual(excel.readWhole("95.000"), { value: 95000 });
  assert.deepEqual(excel.readWhole("1,250,000"), { value: 1250000 });
  assert.deepEqual(excel.readWhole(" 95 000 đ "), { value: 95000 });
  assert.deepEqual(excel.readWhole({ formula: "A1*2", result: 40 }), { value: 40 });
  assert.deepEqual(excel.readWhole(""), {});
  assert.deepEqual(excel.readWhole(12.5), { bad: "12.5" });
  assert.deepEqual(excel.readWhole("mười"), { bad: "mười" });
});

function catalog(): CatalogItem[] {
  return [
    buildItem(variantBase as never, variantModels as never),
    buildItem({
      item_id: 5,
      item_name: "Quà tặng gói xả",
      has_model: false,
      item_sku: "QT-5",
      price_info: [{ original_price: 23000, current_price: 23000 }],
      stock_info_v2: { summary_info: { total_available_stock: 7 } },
    } as never),
  ];
}

test("xuat tep roi doc lai: moi phan loai mot dong, cot nhap co kiem tra so", async () => {
  const buffer = await excel.buildWorkbook(catalog(), { shopName: "Combi Home", sandbox: true, exportedAt: new Date() });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as never);
  assert.deepEqual(wb.worksheets.map((s) => s.name), [excel.SHEET_GUIDE, excel.SHEET_DATA]);
  const sheet = wb.getWorksheet(excel.SHEET_DATA)!;
  assert.equal(sheet.rowCount, 4, "1 dong tieu de + 2 phan loai + 1 san pham don");
  assert.equal(sheet.getCell("D2").value, "Hương hoa / Lẻ");
  assert.equal(sheet.getCell("F3").value, 120000);
  assert.equal(sheet.getCell("B4").value, 0, "san pham khong phan loai co ma phan loai 0");
  assert.equal(sheet.getCell("H2").dataValidation?.type, "whole");
  const view = sheet.views[0] as { state?: string; ySplit?: number };
  assert.deepEqual([view.state, view.ySplit], ["frozen", 1], "dong tieu de dung yen khi cuon");

  // Chua co gi dien: doc lai van ra dung so dong, khong co thay doi.
  const rows = await excel.parseWorkbook(buffer);
  assert.equal(rows.length, 3);
  const diff = excel.diffRows(rows, catalog());
  assert.deepEqual([diff.changes.length, diff.unchanged, diff.problems.length], [0, 3, 0]);
});

/** Tao tep nhu nguoi dung da sua: dien cac o cot moi. */
async function filled(edits: Record<string, unknown>, extraRows: unknown[][] = []): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await excel.buildWorkbook(catalog(), { shopName: "Combi Home", sandbox: true, exportedAt: new Date() })) as never);
  const sheet = wb.getWorksheet(excel.SHEET_DATA)!;
  for (const [cell, value] of Object.entries(edits)) sheet.getCell(cell).value = value as ExcelJS.CellValue;
  for (const r of extraRows) sheet.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test("so sanh: chi ra thay doi, bo qua so giu nguyen, bao dong loi kem so dong", async () => {
  const buffer = await filled(
    {
      H2: "40.000", // gia moi phan loai 1
      I2: 12, // ton giu nguyen -> khong tinh
      I3: 50, // ton moi phan loai 2
      H4: 230000, // gia doi 900% -> canh bao
    },
    [
      [5, 0, "", "", "", "", "", 99000], // trung dong san pham 5
      [999, 0, "", "", "", "", "", 1000], // ma khong ton tai
      [22925708328, 0, "", "", "", "", "", 1000], // co phan loai ma dien o cap san pham
      [22925708328, 1, "", "", "", "", "", "", 1], // ton thap hon phan giu (2)... nhung trung dong 2
    ],
  );
  const diff = excel.diffRows(await excel.parseWorkbook(buffer), catalog());

  assert.deepEqual(
    diff.changes.map((c) => [c.key, c.oldPrice, c.newPrice, c.oldStock, c.newStock]),
    [
      ["22925708328:1", 45000, 40000, 12, undefined],
      ["22925708328:2", 120000, undefined, 0, 50],
      ["5:0", 23000, 230000, 7, undefined],
    ],
  );
  assert.equal(diff.changes[0]!.modelName, "Hương hoa / Lẻ");
  assert.match(diff.changes[2]!.warnings[0]!, /gấp 10 lần giá cũ/);
  assert.deepEqual(
    diff.problems.map((p) => p.row),
    [5, 6, 7, 8],
  );
  assert.match(diff.problems[0]!.message, /Trùng với dòng 4/);
  assert.match(diff.problems[1]!.message, /mã 999/);
  assert.match(diff.problems[2]!.message, /có phân loại/);
  assert.match(diff.problems[3]!.message, /Trùng với dòng 2/);
});

test("so sanh: ton thap hon phan giu khuyen mai va chu khong phai so thi bao loi", async () => {
  const diff = excel.diffRows(await excel.parseWorkbook(await filled({ I2: 1, H3: "một trăm" })), catalog());
  assert.equal(diff.changes.length, 0);
  assert.match(diff.problems[0]!.message, /thấp hơn phần Shopee đang giữ cho khuyến mại \(2\)/);
  assert.match(diff.problems[1]!.message, /"một trăm" không phải số nguyên/);
});

test("tep khong phai xlsx hoac thieu cot thi bao loi co huong dan", async () => {
  await assert.rejects(() => excel.parseWorkbook(Buffer.from("ma,gia\n1,2")), /không phải dạng \.xlsx/);
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("A").addRow(["Tên", "Giá"]);
  await assert.rejects(async () => excel.parseWorkbook(Buffer.from(await wb.xlsx.writeBuffer())), /Mã sản phẩm/);
});

test("gui len Shopee: gom theo san pham, doc failure_list tung phan loai, thu lai khi qua tai", async () => {
  const diff = excel.diffRows(await excel.parseWorkbook(await filled({ H2: 40000, H3: 110000, I3: 50, H4: 24000 })), catalog());
  const calls: string[] = [];
  const results: { key: string; field: string; ok: boolean; message: string }[] = [];
  const sleeps: number[] = [];
  let busyOnce = true;

  await excel.applyChanges(diff.changes, {
    updatePrice: async (itemId, list) => {
      calls.push(`price ${itemId} ${list.map((l) => `${l.model_id}=${l.original_price}`).join(",")}`);
      if (itemId === 5 && busyOnce) {
        busyOnce = false;
        throw new Error("error_busy: hệ thống đang bận");
      }
      return itemId === 22925708328 ? { failure_list: [{ model_id: 2, failed_reason: "giá vượt mức cho phép" }] } : {};
    },
    updateStock: async (itemId, list) => {
      calls.push(`stock ${itemId} ${list.map((l) => `${l.model_id}=${l.seller_stock[0]!.stock}`).join(",")}`);
      return {};
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    onResult: (r) => results.push(r),
  });

  assert.deepEqual(calls, [
    "price 22925708328 1=40000,2=110000",
    "stock 22925708328 2=50",
    "price 5 0=24000",
    "price 5 0=24000",
  ]);
  assert.ok(sleeps.includes(1000), "loi qua tai thi cho 1 giay roi thu lai");
  assert.deepEqual(
    results.map((r) => [r.key, r.field, r.ok]),
    [
      ["22925708328:1", "price", true],
      ["22925708328:2", "price", false],
      ["22925708328:2", "stock", true],
      ["5:0", "price", true],
    ],
  );
  assert.equal(results[1]!.message, "giá vượt mức cho phép");
});

test("loi du lieu khong thu lai, loi mang thi thu lai", () => {
  assert.equal(excel.isRetryable("error_busy: busy"), true);
  assert.equal(excel.isRetryable("fetch failed"), true);
  assert.equal(excel.isRetryable("error_param: price invalid"), false);
});
