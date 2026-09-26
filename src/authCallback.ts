/**
 * Tach code va shop_id tu duong dan Shopee chuyen ve sau khi uy quyen.
 *
 * Dung khi trinh duyet khong mo duoc trang callback, vi du may chu chay o
 * noi khac voi may dang bam uy quyen. Nguoi dung chep nguyen duong dan tren
 * thanh dia chi roi dan vao lenh:
 *
 *   npm run cli -- exchange "http://localhost:3000/auth/callback?code=...&shop_id=..."
 *
 * Luu y: code chi dung duoc mot lan va het han sau vai phut.
 */
export interface AuthCallbackParams {
  code: string;
  shopId?: number;
}

export function parseAuthCallback(input: string): AuthCallbackParams {
  const trimmed = input.trim();

  let params: URLSearchParams;
  try {
    params = new URL(trimmed).searchParams;
  } catch {
    // Khong phai duong dan day du: chap nhan ca phan truy van tran "code=...&shop_id=...".
    params = new URLSearchParams(trimmed.replace(/^\?/, ""));
  }

  const code = params.get("code");
  if (!code) {
    throw new Error(
      "Khong tim thay code trong duong dan. Hay chep NGUYEN duong dan tren thanh dia chi cua trinh duyet.",
    );
  }

  const shopIdRaw = params.get("shop_id");
  if (shopIdRaw === null) return { code };

  const shopId = Number(shopIdRaw);
  if (!Number.isInteger(shopId) || shopId <= 0) {
    throw new Error(`shop_id khong hop le: ${shopIdRaw}`);
  }
  return { code, shopId };
}
