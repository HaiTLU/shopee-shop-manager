/**
 * Kiem thu lop chan gia han token chay chong len nhau.
 *
 * Day la loi nguy hiem nhat khi dung Shopee API: refresh_token chi dung duoc
 * MOT LAN. Neu hai lenh goi cung gia han, mot ben se nhan loi va ket noi voi
 * shop co the hong han, phai vao Shopee uy quyen lai tu dau.
 *
 * SDK goc khong co khoa. Cac bai duoi day chung minh lop boc cua du an da va
 * duoc lo hong do.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, beforeEach } from "node:test";

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shopee-refresh-test-"));
const tokenFile = path.join(tmpRoot, "token.json");

// Phai dat bien moi truong TRUOC khi nap config.
process.env.SHOPEE_PARTNER_ID = "1000001";
process.env.SHOPEE_PARTNER_KEY = "khoa-gia-dung-de-kiem-thu";
process.env.SHOPEE_REGION = "TEST_GLOBAL";
process.env.SHOPEE_REDIRECT_URI = "http://localhost:3000/auth/callback";
process.env.TOKEN_FILE = tokenFile;
process.env.TOKEN_KEEPALIVE_MINUTES = "0";

/**
 * Thay mang that bang ban gia, PHAI dat truoc khi nap SDK vi SDK giu tham
 * chieu toi globalThis.fetch ngay luc nap.
 */
type FetchHandler = (url: URL) => unknown;
let fetchHandler: FetchHandler = () => {
  throw new Error("Kiem thu khong duoc goi mang that");
};
const fetchedUrls: URL[] = [];
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  fetchedUrls.push(url);
  return new Response(JSON.stringify(fetchHandler(url)), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

const { sdk, tokenStorage, tokenStatus } = await import("../src/shopee.js");

/** Token da het han, buoc he thong phai gia han. */
function expiredToken(suffix: string) {
  return {
    access_token: `acc-${suffix}`,
    refresh_token: `ref-${suffix}`,
    expire_in: 14_400,
    request_id: `req-${suffix}`,
    error: "",
    message: "",
    shop_id: 12345,
    expired_at: Date.now() - 1000,
  };
}

/** So lan SDK thuc su goi sang Shopee de gia han. */
let refreshCalls = 0;
let refreshDelayMs = 20;
let refreshError: string | null = null;

// Thay lenh goi mang that bang ban gia, de dem so lan goi.
sdk.auth.getRefreshToken = async (refreshToken: string) => {
  refreshCalls += 1;
  const seq = refreshCalls;
  await new Promise((resolve) => setTimeout(resolve, refreshDelayMs));
  if (refreshError) {
    return { ...expiredToken(String(seq)), error: refreshError, message: "gia lap loi" };
  }
  return {
    access_token: `acc-moi-${seq}`,
    refresh_token: `${refreshToken}-moi-${seq}`,
    expire_in: 14_400,
    request_id: `req-${seq}`,
    error: "",
    message: "",
    shop_id: 12345,
    expired_at: Date.now() + 4 * 60 * 60 * 1000,
  };
};

beforeEach(async () => {
  refreshCalls = 0;
  refreshDelayMs = 20;
  refreshError = null;
  fetchedUrls.length = 0;
  fetchHandler = () => {
    throw new Error("Kiem thu khong duoc goi mang that");
  };
  await fs.rm(tokenFile, { force: true });
  await fs.rm(`${tokenFile}.lock`, { force: true });
});

after(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("hai muoi lenh goi song song chi sinh ra DUNG MOT lan gia han", async () => {
  await tokenStorage.store(expiredToken("cu"));

  const results = await Promise.all(Array.from({ length: 20 }, () => sdk.refreshToken()));

  assert.equal(
    refreshCalls,
    1,
    "goi gia han nhieu hon mot lan se dot chay refresh_token va lam hong ket noi",
  );
  // Tat ca deu phai nhan cung mot token moi.
  const tokens = new Set(results.map((token) => token?.access_token));
  assert.equal(tokens.size, 1, "moi lenh goi phai nhan cung mot token");
  assert.equal(results[0]?.access_token, "acc-moi-1");
});

test("token moi duoc ghi xuong tep, khong chi nam trong bo nho", async () => {
  await tokenStorage.store(expiredToken("cu"));
  await sdk.refreshToken();

  const saved = await tokenStorage.get();
  assert.equal(saved?.access_token, "acc-moi-1");
  assert.equal(saved?.refresh_token, "ref-cu-moi-1", "phai luu refresh_token MOI, khong giu cai cu");
});

test("tien trinh khac vua gia han xong thi dung luon token do, khong gia han them", async () => {
  // Token con han va vua duoc ghi xong: dung la dau hieu tien trinh khac vua gia han.
  await tokenStorage.store({
    ...expiredToken("vua-gia-han"),
    expired_at: Date.now() + 4 * 60 * 60 * 1000,
  });

  await sdk.refreshToken();
  assert.equal(refreshCalls, 0, "gia han chong len tien trinh khac la lang phi va nguy hiem");
});

test("token con han theo dong ho nhung da cu thi goi gia han la gia han that", async () => {
  // Truong hop SDK goi gia han du token chua het han: Shopee vua tu choi token
  // (bi thu hoi, het han som). Phai lay token moi, khong duoc tra lai token hong.
  await tokenStorage.store({
    ...expiredToken("bi-thu-hoi"),
    expired_at: Date.now() + 3 * 60 * 60 * 1000,
    obtained_at: Date.now() - 60 * 60 * 1000,
  });

  const token = await sdk.refreshToken();
  assert.equal(refreshCalls, 1);
  assert.equal(token?.access_token, "acc-moi-1");
});

test("Shopee tu choi token giua chung thi SDK gia han mot lan roi goi lai thanh cong", async () => {
  // Tai hien day du duong di that trong SDK: goi API -> Shopee bao
  // invalid_access_token -> SDK goi gia han -> goi lai voi token moi.
  await tokenStorage.store({
    ...expiredToken("bi-thu-hoi"),
    expired_at: Date.now() + 3 * 60 * 60 * 1000,
    obtained_at: Date.now() - 60 * 60 * 1000,
  });

  fetchHandler = (url) => {
    if (url.searchParams.get("access_token") === "acc-bi-thu-hoi") {
      return { error: "invalid_access_token", message: "Invalid access_token.", request_id: "r1" };
    }
    return { error: "", message: "", request_id: "r2", shop_name: "Shop thu nghiem" };
  };

  const info = await sdk.shop.getShopInfo();

  assert.equal(refreshCalls, 1, "phai gia han dung mot lan");
  assert.equal(fetchedUrls.length, 2, "lan dau bi tu choi, lan hai goi lai");
  assert.equal(fetchedUrls[1]?.searchParams.get("access_token"), "acc-moi-1", "lan goi lai phai dung token moi");
  assert.equal((info as { shop_name?: string }).shop_name, "Shop thu nghiem");
});

test("dot gia han thu hai sau khi dot dau xong thi goi lai binh thuong", async () => {
  await tokenStorage.store(expiredToken("cu"));

  await Promise.all([sdk.refreshToken(), sdk.refreshToken()]);
  assert.equal(refreshCalls, 1);

  // Lam token het han lai de buoc gia han lan nua.
  const current = await tokenStorage.get();
  await tokenStorage.store({ ...current!, expired_at: Date.now() - 1000 });

  await sdk.refreshToken();
  assert.equal(refreshCalls, 2, "lan gia han sau phai chay that, khong duoc dung lai ket qua cu");
});

test("Shopee tu choi gia han thi bao loi ro va khoa duoc tha ra", async () => {
  await tokenStorage.store(expiredToken("cu"));
  refreshError = "invalid_refresh_token";

  await assert.rejects(() => sdk.refreshToken(), /invalid_refresh_token/);

  // Khoa phai duoc tha, neu khong lan thu sau se treo.
  refreshError = null;
  const token = await sdk.refreshToken();
  assert.equal(token?.access_token, "acc-moi-2");
});

test("refresh_token qua 30 ngay thi bao phai uy quyen lai, khong goi Shopee vo ich", async () => {
  await tokenStorage.store(expiredToken("cu"));

  const current = await tokenStorage.get();
  await tokenStorage.store({
    ...current!,
    expired_at: Date.now() - 1000,
    obtained_at: Date.now() - 31 * 24 * 60 * 60 * 1000,
  });

  await assert.rejects(() => sdk.refreshToken(), /uy quyen lai/);
  assert.equal(refreshCalls, 0, "het han 30 ngay thi goi Shopee cung vo ich");
});

test("chua co token nao thi bao huong dan uy quyen", async () => {
  await assert.rejects(() => sdk.refreshToken(), /auth\/start/);
});

test("tokenStatus bao dung tinh trang khi chua ket noi", async () => {
  const status = await tokenStatus();
  assert.equal(status.connected, false);
  assert.equal(status.needsReauthorization, true);
});

test("tokenStatus bao dung so ngay con lai cua ma gia han", async () => {
  await tokenStorage.store(expiredToken("cu"));
  const current = await tokenStorage.get();
  await tokenStorage.store({ ...current!, obtained_at: Date.now() - 10 * 24 * 60 * 60 * 1000 });

  const status = await tokenStatus();
  assert.equal(status.connected, true);
  assert.equal(status.shopId, 12345);
  assert.equal(status.refreshTokenExpiresInDays, 19, "30 ngay tru 10 ngay da troi qua, con 19 ngay tron");
  assert.equal(status.needsReauthorization, false);
});
