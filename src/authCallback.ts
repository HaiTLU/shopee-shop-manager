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
      "Không tìm thấy mã code trong đường dẫn. Hãy chép NGUYÊN đường dẫn trên thanh địa chỉ của trình duyệt.",
    );
  }

  const shopIdRaw = params.get("shop_id");
  if (shopIdRaw === null) return { code };

  const shopId = Number(shopIdRaw);
  if (!Number.isInteger(shopId) || shopId <= 0) {
    throw new Error(`shop_id không hợp lệ: ${shopIdRaw}`);
  }
  return { code, shopId };
}
