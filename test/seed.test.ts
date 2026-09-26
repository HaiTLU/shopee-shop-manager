/**
 * Kiem thu lenh tao san pham thu. Mang that duoc thay bang ban gia tra loi
 * giong Shopee, de kiem tra lenh goi dung duong dan va gui dung du lieu.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import test, { after } from "node:test";

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shopee-seed-test-"));
process.env.SHOPEE_PARTNER_ID = "1000001";
process.env.SHOPEE_PARTNER_KEY = "khoa-gia-dung-de-kiem-thu";
process.env.SHOPEE_REGION = "TEST_GLOBAL";
process.env.SHOPEE_REDIRECT_URI = "http://localhost:3000/auth/callback";
process.env.TOKEN_FILE = path.join(tmpRoot, "token.json");
process.env.TOKEN_KEEPALIVE_MINUTES = "0";

/** Trang thai shop gia: don vi van chuyen ban dau deu tat. */
const channels = [
  { logistics_channel_id: 50011, logistics_channel_name: "Nhanh", enabled: false, fee_type: "SIZE_INPUT" },
  { logistics_channel_id: 50012, logistics_channel_name: "Cong kenh", enabled: false, fee_type: "SIZE_SELECTION", size_list: [{ size_id: "3" }] },
];
const calls: { path: string; body: unknown }[] = [];
let nextItemId = 9001;

const ok = (response: unknown) => ({ error: "", message: "", request_id: "r", response });

function reply(apiPath: string, body: unknown): unknown {
  switch (apiPath) {
    case "/api/v2/logistics/get_channel_list":
      return ok({ logistics_channel_list: channels });
    case "/api/v2/logistics/update_channel": {
      const id = (body as { logistics_channel_id: number }).logistics_channel_id;
      channels.find((c) => c.logistics_channel_id === id)!.enabled = true;
      return ok({});
    }
    case "/api/v2/product/get_category":
      return ok({
        category_list: [
          { category_id: 1, display_category_name: "Thời trang", has_children: true },
          { category_id: 100, display_category_name: "Áo thun", has_children: false },
          { category_id: 200, display_category_name: "Sổ tay", has_children: false },
        ],
      });
    case "/api/v2/product/get_attribute_tree":
      return ok({
        list: [
          { category_id: 100, attribute_tree: [{ attribute_id: 1, mandatory: true, attribute_value_list: [{ value_id: 11 }] }, { attribute_id: 2, mandatory: true }] },
          { category_id: 200, attribute_tree: [{ attribute_id: 9, mandatory: true }, { attribute_id: 10, mandatory: false }] },
        ],
      });
    case "/api/v2/media_space/upload_image":
      return ok({ image_info: { image_id: `img-${calls.length}` } });
    case "/api/v2/product/add_item":
      return ok({ item_id: nextItemId++ });
    default:
      throw new Error(`Kiem thu khong ngo toi duong dan ${apiPath}`);
  }
}

// Phai dat truoc khi nap SDK vi SDK giu tham chieu toi fetch ngay luc nap.
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
  calls.push({ path: url.pathname, body });
  return new Response(JSON.stringify(reply(url.pathname, body)), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

const { tokenStorage } = await import("../src/shopee.js");
const seed = await import("../src/seed.js");

after(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("anh PNG tu tao hop le: dung chu ky, dung kich thuoc, giai nen duoc", () => {
  const png = seed.makeSquarePng(40, [10, 20, 30]);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(png.readUInt32BE(16), 40);
  assert.equal(png.readUInt32BE(20), 40);
  const idatLength = png.readUInt32BE(33);
  const pixels = zlib.inflateSync(png.subarray(41, 41 + idatLength));
  assert.equal(pixels.length, 40 * (1 + 40 * 3), "moi dong 1 byte loc + 3 byte moi diem anh");
});

test("uu tien nganh hang don gian va bo nganh co nganh con", () => {
  const ranked = seed.rankLeafCategories([
    { category_id: 1, display_category_name: "Thời trang", has_children: true },
    { category_id: 100, display_category_name: "Áo thun", has_children: false },
    { category_id: 200, display_category_name: "Sổ tay", has_children: false },
  ]);
  assert.deepEqual(ranked.map((c) => c.category_id), [200, 100]);
});

test("thuoc tinh bat buoc: co danh sach thi lay gia tri dau, tu nhap thi dien Khac", () => {
  const attrs = seed.buildMandatoryAttributes([
    { attribute_id: 1, mandatory: true, attribute_value_list: [{ value_id: 11 }, { value_id: 12 }] },
    { attribute_id: 2, mandatory: true },
    { attribute_id: 3, mandatory: false, attribute_value_list: [{ value_id: 31 }] },
  ]);
  assert.deepEqual(attrs, [
    { attribute_id: 1, attribute_value_list: [{ value_id: 11 }] },
    { attribute_id: 2, attribute_value_list: [{ value_id: 0, original_value_name: "Khac" }] },
  ]);
});

test("tao san pham thu tu dau den cuoi tren shop gia", async () => {
  await tokenStorage.store({
    access_token: "acc",
    refresh_token: "ref",
    expire_in: 14_400,
    request_id: "r",
    error: "",
    message: "",
    shop_id: 227936844,
    expired_at: Date.now() + 4 * 60 * 60 * 1000,
  });

  const logs: string[] = [];
  const ids = await seed.seedTestProducts(2, (m) => logs.push(m));

  assert.deepEqual(ids, [9001, 9002], "phai tao du 2 san pham");

  // Chua co don vi van chuyen nao bat -> phai tu bat.
  assert.equal(calls.filter((c) => c.path.endsWith("/update_channel")).length, 2);

  const addItems = calls.filter((c) => c.path.endsWith("/add_item")).map((c) => c.body as Record<string, any>);
  assert.equal(addItems.length, 2);
  const first = addItems[0]!;
  assert.equal(first.category_id, 200, "chon nganh So tay vi it thuoc tinh bat buoc nhat");
  assert.deepEqual(first.attribute_list, [{ attribute_id: 9, attribute_value_list: [{ value_id: 0, original_value_name: "Khac" }] }]);
  assert.equal(first.original_price, 100000);
  assert.deepEqual(first.seller_stock, [{ stock: 20 }]);
  assert.deepEqual(first.logistic_info, [
    { logistic_id: 50011, enabled: true },
    { logistic_id: 50012, enabled: true, size_id: 3 },
  ]);
  assert.equal(first.image.image_id_list.length, 1);
  assert.equal(addItems[1]!.original_price, 200000);

  // Anh gui len dang multipart, khong phai JSON.
  const upload = calls.find((c) => c.path.endsWith("/upload_image"))!;
  assert.ok(upload.body instanceof FormData, "tai anh phai gui dang multipart");
});

test("tren shop that (GLOBAL) thi tu choi, khong goi Shopee", () => {
  const env = { ...process.env, SHOPEE_REGION: "GLOBAL", TOKEN_FILE: path.join(tmpRoot, "khong-co.json") };
  let output = "";
  let code = 0;
  try {
    output = execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", "tao-san-pham-thu", "1"], {
      env,
      encoding: "utf8",
      stdio: "pipe",
    });
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    code = e.status;
    output = e.stdout + e.stderr;
  }
  assert.equal(code, 1);
  assert.match(output, /Tu choi/);
});
