/**
 * Doc va kiem tra bien moi truong.
 *
 * Bao loi som va noi ro thieu gi, thay vi de Shopee tra ve loi kho hieu
 * sau khi da chay duoc nua chung.
 */
import "dotenv/config";
import path from "node:path";
import { ShopeeRegion } from "@congminh1254/shopee-sdk/schemas";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Thieu bien moi truong ${name}. Hay sao chep .env.example thanh .env va dien gia tri.`,
    );
  }
  return value.trim();
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Bien moi truong ${name} phai la so, dang nhan duoc: ${raw}`);
  }
  return value;
}

function parseRegion(raw: string): ShopeeRegion {
  const allowed = Object.values(ShopeeRegion) as string[];
  if (!allowed.includes(raw)) {
    throw new Error(
      `SHOPEE_REGION khong hop le: ${raw}. Chi chap nhan: ${allowed.join(", ")}`,
    );
  }
  return raw as ShopeeRegion;
}

const partnerIdRaw = required("SHOPEE_PARTNER_ID");
const partnerId = Number(partnerIdRaw);
if (!Number.isInteger(partnerId) || partnerId <= 0) {
  throw new Error(`SHOPEE_PARTNER_ID phai la so nguyen duong, dang nhan duoc: ${partnerIdRaw}`);
}

export const config = {
  partnerId,
  partnerKey: required("SHOPEE_PARTNER_KEY"),
  region: parseRegion(process.env.SHOPEE_REGION?.trim() || "TEST_GLOBAL"),
  redirectUri: required("SHOPEE_REDIRECT_URI"),
  port: optionalNumber("PORT", 3000),
  tokenFile: path.resolve(process.env.TOKEN_FILE?.trim() || "./data/shopee-token.json"),
  keepaliveMinutes: optionalNumber("TOKEN_KEEPALIVE_MINUTES", 60),
  /**
   * Ghi de dia chi API va trang uy quyen. Bo trong thi dung mac dinh theo vung.
   *
   * Can khi Shopee doi dia chi sandbox: tai lieu cu dung
   * partner.test-stable.shopeemobile.com, SDK hien dung
   * openplatform.sandbox.test-stable.shopee.sg. Neu khoa thu nghiem bao loi
   * voi dia chi nay thi doi sang dia chi kia ma khong phai sua ma nguon.
   */
  baseUrl: process.env.SHOPEE_BASE_URL?.trim() || undefined,
  authUrl: process.env.SHOPEE_AUTH_URL?.trim() || undefined,
} as const;

/** True khi dang chay tren moi truong thu nghiem cua Shopee. */
export const isSandbox = config.region.startsWith("TEST_");
