/**
 * Khoi tao SDK Shopee va va lo hong gia han token.
 *
 * SDK goc tu gia han khi token het han, nhung KHONG co khoa. Vi refresh_token
 * cua Shopee chi dung duoc mot lan, hai lenh goi cung luc se lam hong ket noi.
 * Tep nay thay ham gia han cua SDK bang mot ban co hai lop chan:
 *
 * 1. Gop lenh trong cung tien trinh: nhieu lenh goi cung doi mot loi hua.
 * 2. Khoa lien tien trinh: neu chay nhieu ban sao (vi du PM2 cluster), chi
 *    mot ban duoc gia han, cac ban con lai doc lai token vua duoc ghi.
 */
import { ShopeeSDK } from "@congminh1254/shopee-sdk";
import type { AccessToken } from "@congminh1254/shopee-sdk/schemas";
import { config } from "./config.js";
import { FileTokenStorage, withLock, type StoredToken } from "./tokenStore.js";

/**
 * Khoang an toan truoc khi token het han (mili giay).
 *
 * SDK da tru san 60 giay khi tinh expired_at. Cong them 5 phut o day de mot
 * lenh goi dai khong bi het han giua chung.
 */
const SAFETY_MARGIN_MS = 5 * 60 * 1000;

/** refresh_token cua Shopee song 30 ngay ke tu lan gia han gan nhat. */
const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Token duoc ghi trong khoang nay coi nhu "vua gia han xong" boi mot tien
 * trinh khac, nen dung luon thay vi gia han them lan nua.
 */
const JUST_REFRESHED_MS = 60 * 1000;

export const tokenStorage = new FileTokenStorage(config.tokenFile);

export const sdk = new ShopeeSDK(
  {
    partner_id: config.partnerId,
    partner_key: config.partnerKey,
    region: config.region,
    ...(config.baseUrl ? { base_url: config.baseUrl } : {}),
    ...(config.authUrl ? { base_auth_url: config.authUrl } : {}),
  },
  tokenStorage,
);

/** Loi hua gia han dang chay, de gop cac lenh goi song song. */
let inflightRefresh: Promise<AccessToken | null> | null = null;

/**
 * True khi token con han dung duoc, tinh ca khoang an toan.
 *
 * Co y KHONG khai bao la ham thu hep kieu (`token is StoredToken`): neu lam
 * vay, TypeScript se thu hep nhanh `else` xuong `never` va cac dong sau khong
 * truy cap duoc truong nao nua.
 */
function isUsable(token: StoredToken | null): boolean {
  if (!token?.access_token) return false;
  if (!token.expired_at) return false;
  return token.expired_at > Date.now() + SAFETY_MARGIN_MS;
}

/**
 * Gia han token, dam bao ca he thong chi co dung mot lenh gia han chay.
 *
 * Ham nay thay the ShopeeSDK.refreshToken nen duoc goi ca tu ben trong SDK:
 * khi SDK thay token het han, va khi Shopee tra ve loi invalid_access_token.
 */
async function guardedRefresh(shopId?: number, merchantId?: number): Promise<AccessToken | null> {
  if (inflightRefresh) return inflightRefresh;

  inflightRefresh = withLock(tokenStorage.lockPath, async () => {
    // Doc lai sau khi da giu khoa: co the mot tien trinh khac vua gia han xong
    // trong luc minh dang xep hang. Neu vay thi dung luon, khong gia han nua.
    const current = await tokenStorage.get();
    if (!current) {
      throw new Error(
        "Chưa có mã truy cập nào được lưu. Mở /auth/start trên trình duyệt để ủy quyền shop.",
      );
    }
    const justRefreshed =
      current.obtained_at !== undefined && Date.now() - current.obtained_at < JUST_REFRESHED_MS;
    if (isUsable(current) && justRefreshed) return current;

    // Con lai la hai truong hop, deu phai gia han that:
    // - token het han (hoac sap het han) theo dong ho;
    // - token con han theo dong ho nhung Shopee vua tu choi no (bi thu hoi,
    //   het han som). SDK goi ham nay khi nhan loi invalid_access_token. Neu
    //   chi xet han theo dong ho ma tra lai token cu thi SDK goi lai bang dung
    //   token hong do va ket noi khong bao gio tu phuc hoi.

    const ageMs = current.obtained_at ? Date.now() - current.obtained_at : null;
    if (ageMs !== null && ageMs > REFRESH_TOKEN_LIFETIME_MS) {
      throw new Error(
        `Mã gia hạn đã quá hạn 30 ngày (lần gia hạn gần nhất cách đây ${Math.floor(
          ageMs / 86_400_000,
        )} ngày). Phải vào /auth/start để ủy quyền lại shop.`,
      );
    }

    const fresh = await sdk.auth.getRefreshToken(
      current.refresh_token,
      shopId ?? current.shop_id,
      merchantId,
    );
    if (fresh.error) {
      throw new Error(
        `Shopee từ chối gia hạn mã truy cập: ${fresh.error} - ${fresh.message}. ` +
          "Nếu lỗi là invalid_refresh_token thì phải ủy quyền lại shop tại /auth/start.",
      );
    }

    // Ghi khi dang giu khoa, dung writeUnlocked de khong tu khoa chinh minh.
    await tokenStorage.writeUnlocked(fresh);
    return fresh;
  }).finally(() => {
    inflightRefresh = null;
  });

  return inflightRefresh;
}

sdk.refreshToken = guardedRefresh;

/** Tinh trang token hien tai, dung cho trang theo doi va lenh cli. */
export async function tokenStatus(): Promise<{
  connected: boolean;
  shopId?: number;
  accessTokenExpiresInMinutes?: number;
  refreshTokenExpiresInDays?: number;
  needsReauthorization: boolean;
}> {
  const token = await tokenStorage.get();
  if (!token?.access_token) {
    return { connected: false, needsReauthorization: true };
  }

  const accessMs = token.expired_at ? token.expired_at - Date.now() : 0;
  const refreshMs = token.obtained_at
    ? token.obtained_at + REFRESH_TOKEN_LIFETIME_MS - Date.now()
    : 0;

  return {
    connected: true,
    ...(token.shop_id !== undefined ? { shopId: token.shop_id } : {}),
    accessTokenExpiresInMinutes: Math.floor(accessMs / 60_000),
    refreshTokenExpiresInDays: Math.floor(refreshMs / 86_400_000),
    needsReauthorization: refreshMs <= 0,
  };
}

/**
 * Chu dong gia han token theo dinh ky.
 *
 * Khong bat buoc, vi SDK da tu gia han khi can. Nhung neu shop im ang hon 30
 * ngay (nghi Tet chang han) thi refresh_token chet han va phai uy quyen lai
 * bang tay. Vong lap nay giu ket noi song.
 */
export function startTokenKeepalive(): NodeJS.Timeout | null {
  if (config.keepaliveMinutes <= 0) return null;

  const intervalMs = config.keepaliveMinutes * 60 * 1000;
  const timer = setInterval(() => {
    void (async () => {
      try {
        const token = await tokenStorage.get();
        if (!token) return;
        if (isUsable(token)) return;
        await guardedRefresh();
        console.log("[token] Đã tự gia hạn mã truy cập.");
      } catch (error) {
        console.error("[token] Tự gia hạn thất bại:", (error as Error).message);
      }
    })();
  }, intervalMs);

  // Khong giu tien trinh song chi vi cai hen gio nay.
  timer.unref();
  return timer;
}
