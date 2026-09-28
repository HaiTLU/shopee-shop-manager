import assert from "node:assert/strict";
import test from "node:test";
import { parseAuthCallback } from "../src/authCallback.js";

test("tach duoc code va shop_id tu duong dan day du", () => {
  const result = parseAuthCallback(
    "http://localhost:3000/auth/callback?code=abc123&shop_id=987654&state=xyz",
  );
  assert.deepEqual(result, { code: "abc123", shopId: 987654 });
});

test("chap nhan phan truy van tran, co hoac khong co dau hoi", () => {
  assert.deepEqual(parseAuthCallback("code=abc&shop_id=5"), { code: "abc", shopId: 5 });
  assert.deepEqual(parseAuthCallback("?code=abc&shop_id=5"), { code: "abc", shopId: 5 });
});

test("bo qua khoang trang thua khi dan vao", () => {
  assert.deepEqual(parseAuthCallback("  https://x.vn/cb?code=q&shop_id=1  \n"), { code: "q", shopId: 1 });
});

test("khong co shop_id thi van tra ve code", () => {
  assert.deepEqual(parseAuthCallback("https://x.vn/cb?code=q"), { code: "q" });
});

test("thieu code thi bao loi huong dan chep nguyen duong dan", () => {
  assert.throws(() => parseAuthCallback("https://x.vn/cb?shop_id=1"), /NGUYÊN đường dẫn/);
  assert.throws(() => parseAuthCallback("abc123"), /NGUYÊN đường dẫn/);
});

test("shop_id khong phai so nguyen duong thi bao loi", () => {
  assert.throws(() => parseAuthCallback("https://x.vn/cb?code=q&shop_id=abc"), /shop_id không hợp lệ/);
  assert.throws(() => parseAuthCallback("https://x.vn/cb?code=q&shop_id=-3"), /shop_id không hợp lệ/);
});
