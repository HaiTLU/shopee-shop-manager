/**
 * Kiem thu day san pham tu dong. Shopee duoc gia lap: danh sach dang day
 * (get_boosted_list) do kiem thu dat, lenh day (boost_item) duoc ghi lai.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, beforeEach } from "node:test";

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shopee-boost-test-"));
process.env.SHOPEE_PARTNER_ID = "1000001";
process.env.SHOPEE_PARTNER_KEY = "khoa-gia-dung-de-kiem-thu";
process.env.SHOPEE_REGION = "TEST_GLOBAL";
process.env.SHOPEE_REDIRECT_URI = "http://localtest.me:3000/auth/callback";
process.env.TOKEN_FILE = path.join(tmpRoot, "token.json");
process.env.TOKEN_KEEPALIVE_MINUTES = "0";

/** San pham dang duoc day tren Shopee gia: ma -> so giay con lai. */
let boostedOnShopee = new Map<number, number>();
let failIds = new Set<number>();
const boostCalls: number[][] = [];

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  let response: unknown;
  if (url.pathname.endsWith("/product/get_boosted_list")) {
    response = { item_list: [...boostedOnShopee].map(([item_id, cool_down_second]) => ({ item_id, cool_down_second })) };
  } else if (url.pathname.endsWith("/product/boost_item")) {
    const ids = (body as { item_id_list: number[] }).item_id_list;
    boostCalls.push(ids);
    const failed = ids.filter((id) => failIds.has(id));
    for (const id of ids) if (!failIds.has(id)) boostedOnShopee.set(id, 4 * 3600);
    response = {
      success_list: { item_id_list: ids.filter((id) => !failIds.has(id)) },
      failure_list: failed.map((item_id) => ({ item_id, failed_reason: "item is not allowed to boost" })),
    };
  } else {
    throw new Error(`Kiem thu khong ngo toi ${url.pathname}`);
  }
  return new Response(JSON.stringify({ error: "", message: "", request_id: "r", response }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

const { tokenStorage } = await import("../src/shopee.js");
const boost = await import("../src/boost.js");
const { readState, stateFile } = await import("../src/stateStore.js");

beforeEach(async () => {
  boostedOnShopee = new Map();
  failIds = new Set();
  boostCalls.length = 0;
  await fs.rm(stateFile, { force: true });
  await tokenStorage.store({
    access_token: "acc", refresh_token: "ref", expire_in: 14_400, request_id: "r", error: "", message: "",
    shop_id: 1, expired_at: Date.now() + 4 * 3600 * 1000,
  });
});

after(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("chon san pham: bo san pham dang day, uu tien chua day bao gio theo thu tu, roi day lau nhat", () => {
  const picked = boost.pickItemsToBoost([1, 2, 3, 4, 5, 6], [2], { "1": 500, "3": 100 }, 3);
  // 4, 5, 6 chua day bao gio (moc 0) nen truoc; trong so da day, 3 (100) truoc 1 (500).
  assert.deepEqual(picked, [4, 5, 6]);
  assert.deepEqual(boost.pickItemsToBoost([1, 2, 3, 4, 5, 6], [2], { "1": 500, "3": 100 }, 5), [4, 5, 6, 3, 1]);
  assert.deepEqual(boost.pickItemsToBoost([1, 2], [], {}, 0), [], "het cho thi khong chon");
});

test("danh sach nguoi dung gui len duoc chuan hoa va kiem tra", () => {
  assert.deepEqual(boost.normalizeItemIds([3, "3", 7]), [3, 7], "bo trung, nhan chu so");
  assert.throws(() => boost.normalizeItemIds([1, -2]), /số nguyên dương/);
  assert.throws(() => boost.normalizeItemIds("1,2"), /danh sách/);
  assert.throws(() => boost.normalizeItemIds(Array.from({ length: 51 }, (_, i) => i + 1)), /Tối đa 50/);
});

test("dang tat thi lich tu dong khong day, bam Chay ngay thi van day", async () => {
  await boost.saveBoostSettings({ itemIds: [11, 12], enabled: false });

  const auto = await boost.runBoostCycle();
  assert.equal(boostCalls.length, 0);
  assert.match(auto.message, /tắt/);

  const manual = await boost.runBoostCycle({ force: true });
  assert.deepEqual(boostCalls, [[11, 12]]);
  assert.deepEqual(manual.newlyBoosted, [11, 12]);
});

test("chi day dung so cho con trong, vong sau xoay tiep phan con lai", async () => {
  await boost.saveBoostSettings({ itemIds: [1, 2, 3, 4, 5, 6, 7], enabled: true });
  boostedOnShopee.set(99, 1800); // mot san pham ngoai danh sach dang chiem 1 cho

  const first = await boost.runBoostCycle();
  assert.deepEqual(boostCalls[0], [1, 2, 3, 4], "con 4 cho thi day 4 san pham dau");
  assert.equal(first.boostedNow.length, 1);

  const second = await boost.runBoostCycle();
  assert.equal(boostCalls.length, 1, "du 5 cho thi khong goi day");
  assert.match(second.message, /đủ 5/);

  // Het 4 gio: Shopee khong con san pham nao dang day.
  boostedOnShopee.clear();
  await boost.runBoostCycle();
  assert.deepEqual(boostCalls[1], [5, 6, 7, 1, 2], "day 5, 6, 7 chua tung day truoc, roi den 1, 2 day lau nhat");
});

test("san pham Shopee tu choi khong bi ghi la da day", async () => {
  await boost.saveBoostSettings({ itemIds: [21, 22], enabled: true });
  failIds.add(22);

  const result = await boost.runBoostCycle();
  assert.deepEqual(result.newlyBoosted, [21]);
  assert.deepEqual(result.failed, [{ itemId: 22, reason: "item is not allowed to boost" }]);
  const { boost: saved } = await readState();
  assert.ok(saved.lastBoosted["21"]);
  assert.equal(saved.lastBoosted["22"], undefined);
});

test("bo san pham khoi danh sach thi xoa ca lich su day cua no", async () => {
  await boost.saveBoostSettings({ itemIds: [31, 32], enabled: true });
  await boost.runBoostCycle();
  const saved = await boost.saveBoostSettings({ itemIds: [31] });
  assert.deepEqual(saved.itemIds, [31]);
  assert.deepEqual(Object.keys(saved.lastBoosted), ["31"]);
});
