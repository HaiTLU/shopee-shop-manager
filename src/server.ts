/**
 * May chu web: phuc vu giao dien va lam cau noi sang Shopee.
 *
 * Nguyen tac: partner_key va access_token KHONG BAO GIO roi khoi may chu.
 * Trinh duyet chi goi cac duong dan /api/... cua chinh may chu nay.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { appUrl, config, envFile, isSandbox } from "./config.js";
import { startTokenKeepalive, tokenStorage, tokenStatus } from "./shopee.js";
import { authRouter } from "./routes/auth.js";
import { apiRouter } from "./routes/api.js";
import { startBoostScheduler } from "./boost.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");

const app = express();
app.use(express.json());

app.use("/auth", authRouter);

/**
 * Chan cac lenh goi API khi shop chua duoc uy quyen.
 *
 * Neu khong co buoc nay, SDK se bao "No access token found" - dung nhung kho
 * hieu voi nguoi dung. O day tra ve 401 kem huong dan cu the.
 */
app.use("/api", async (_req, res, next) => {
  const token = await tokenStorage.get();
  if (!token?.access_token) {
    res.status(401).json({
      error: "Shop chưa được ủy quyền.",
      action: "Mở /auth/start trên trình duyệt để kết nối shop.",
    });
    return;
  }
  next();
});

app.use("/api", apiRouter);

app.get("/healthz", async (_req, res) => {
  res.json({ ok: true, region: config.region, sandbox: isSandbox, token: await tokenStatus() });
});

app.use(express.static(publicDir));

app.listen(config.port, () => {
  console.log(`Đang chạy tại ${appUrl} (cổng ${config.port})`);
  console.log(`Tệp cấu hình: ${envFile}`);
  console.log(`Vùng: ${config.region}${isSandbox ? " (môi trường thử nghiệm)" : " (môi trường thật)"}`);
  console.log(`Địa chỉ nhận ủy quyền: ${config.redirectUri}`);
  console.log(`Token lưu tại: ${config.tokenFile}`);
  if (!isSandbox) {
    console.log(
      "Cảnh báo: đang nối vào shop THẬT. Mọi thay đổi giá và tồn kho đều có hiệu lực ngay.",
    );
  }
  startTokenKeepalive();
  startBoostScheduler();
});
