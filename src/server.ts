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
      error: "Shop chua duoc uy quyen.",
      action: "Mo /auth/start tren trinh duyet de ket noi shop.",
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
  console.log(`Dang chay tai ${appUrl} (cong ${config.port})`);
  console.log(`Tep cau hinh: ${envFile}`);
  console.log(`Vung: ${config.region}${isSandbox ? " (moi truong thu nghiem)" : " (moi truong that)"}`);
  console.log(`Dia chi nhan uy quyen: ${config.redirectUri}`);
  console.log(`Token luu tai: ${config.tokenFile}`);
  if (!isSandbox) {
    console.log(
      "Canh bao: dang noi vao shop THAT. Moi thay doi gia va ton kho deu co hieu luc ngay.",
    );
  }
  startTokenKeepalive();
});
