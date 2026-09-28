/**
 * Cong cu dong lenh de thu nhanh ma khong can mo trinh duyet.
 *
 *   npm run cli -- status              Xem tinh trang token
 *   npm run cli -- auth-url            In duong dan uy quyen shop
 *   npm run cli -- exchange "<url>"    Doi code lay token tu duong dan sau uy quyen
 *   npm run cli -- tao-san-pham-thu 3  Tao san pham thu tren shop thu (chi sandbox)
 *   npm run cli -- trang-thai-day      Xem danh sach day san pham va luot dang day
 *   npm run cli -- day-ngay            Chay mot vong day san pham ngay
 *   npm run cli -- refresh             Gia han token ngay
 *   npm run cli -- shop                Thong tin shop
 *   npm run cli -- products [so_luong] Danh sach san pham
 */
import { appUrl, config, envFile } from "./config.js";
import { sdk, tokenStatus, startTokenKeepalive } from "./shopee.js";
import { parseAuthCallback } from "./authCallback.js";
import { seedTestProducts } from "./seed.js";
import { readState } from "./stateStore.js";
import { fetchBoostedNow, runBoostCycle, MAX_BOOST_SLOTS } from "./boost.js";
import {
  ItemStatus,
  type GetItemBaseInfoItem,
  type GetItemBaseInfoStockInfoV2,
} from "@congminh1254/shopee-sdk/schemas";

// Xem chu thich trong src/routes/api.ts: SDK dat nham cho truong ton kho.
type ItemWithStock = GetItemBaseInfoItem & { stock_info_v2?: GetItemBaseInfoStockInfoV2 };

const [command = "status", ...args] = process.argv.slice(2);

/** Lenh chay may chu ung voi tep cau hinh dang dung, de loi nhac khong chi nham moi truong. */
function startCommand(): string {
  if (envFile === ".env") return "npm start";
  if (envFile === ".env.live") return "npm run start:live";
  return `ENV_FILE=${envFile} npm start`;
}

async function main(): Promise<void> {
  switch (command) {
    case "status": {
      const status = await tokenStatus();
      console.log(`Tệp cấu hình:     ${envFile}`);
      console.log(`Vùng:             ${config.region}`);
      console.log(`Đã kết nối:       ${status.connected ? "có" : "chưa"}`);
      if (status.connected) {
        console.log(`Shop ID:          ${status.shopId ?? "không rõ"}`);
        const minutes = status.accessTokenExpiresInMinutes ?? 0;
        console.log(
          `Mã truy cập còn:  ${minutes > 0 ? `${minutes} phút` : "đã hết hạn, tự gia hạn ở lần gọi tiếp theo"}`,
        );
        console.log(`Mã gia hạn còn:   ${status.refreshTokenExpiresInDays} ngày`);
      }
      if (status.needsReauthorization) {
        console.log(
          `Cần ủy quyền: chạy '${startCommand()}', mở ${appUrl} trên trình duyệt ` +
            "rồi bấm 'Kết nối shop Shopee'.",
        );
      }
      break;
    }

    case "auth-url": {
      console.log(sdk.getAuthorizationUrl(config.redirectUri, { auth_type: "seller" }));
      // Duong dan nay khong di qua /auth/start nen khong co ma state. Trang
      // callback cua may chu se tu choi (dung nhu thiet ke chong gia mao) va
      // KHONG dung toi code, nen van doi code lay token bang lenh exchange duoc.
      console.log("\nCách này chỉ dùng khi không mở được trang web. Bình thường hãy bấm nút trên trang web.");
      console.log("1. Mở đường dẫn trên, đăng nhập tài khoản người bán và bấm đồng ý.");
      console.log("2. Trình duyệt sẽ báo lỗi 'Mã state không hợp lệ'. Đây là bình thường.");
      console.log("3. Chép NGUYÊN đường dẫn trên thanh địa chỉ, chạy trong vài phút:");
      console.log('   npm run cli -- exchange "<đường dẫn vừa chép>"');
      break;
    }

    case "exchange": {
      const input = args.join(" ");
      if (!input) {
        console.error('Cách dùng: npm run cli -- exchange "<đường dẫn trên thanh địa chỉ sau khi ủy quyền>"');
        process.exitCode = 1;
        break;
      }
      const { code, shopId } = parseAuthCallback(input);
      const token = await sdk.authenticateWithCode(code, shopId);
      if (!token || token.error) {
        throw new Error(
          `Đổi mã code lấy mã truy cập thất bại: ${token?.error ?? "không rõ"} - ${token?.message ?? ""}. ` +
            "Mã code chỉ dùng được một lần và hết hạn sau vài phút, hãy ủy quyền lại rồi dán ngay.",
        );
      }
      console.log(`Đã kết nối shop ${token.shop_id ?? shopId ?? ""}. Token lưu tại ${config.tokenFile}`);
      break;
    }

    case "tao-san-pham-thu": {
      const count = Math.min(Math.max(Number(args[0]) || 3, 1), 5);
      console.log(`Đang tạo ${count} sản phẩm thử trên shop thử nghiệm...`);
      const ids = await seedTestProducts(count);
      console.log(`\nXong: tạo được ${ids.length}/${count} sản phẩm. Tải lại ${appUrl} để xem.`);
      if (ids.length < count) process.exitCode = 1;
      break;
    }

    case "trang-thai-day": {
      const { boost } = await readState();
      const now = await fetchBoostedNow();
      console.log(`Tự động:         ${boost.enabled ? "BẬT" : "TẮT"}`);
      console.log(`Danh sách đẩy:   ${boost.itemIds.length} sản phẩm`);
      console.log(`Đang đẩy:        ${now.length}/${MAX_BOOST_SLOTS}`);
      for (const b of now) console.log(`  ${b.itemId}  còn ${b.remainingMinutes} phút`);
      if (boost.lastResult) console.log(`Lần chạy gần nhất: ${boost.lastResult}`);
      break;
    }

    case "day-ngay": {
      const result = await runBoostCycle({ force: true });
      console.log(result.message);
      for (const f of result.failed) console.log(`  Lỗi ${f.itemId}: ${f.reason}`);
      if (result.failed.length) process.exitCode = 1;
      break;
    }

    case "refresh": {
      const token = await sdk.refreshToken();
      console.log(token ? "Đã gia hạn mã truy cập." : "Không gia hạn được.");
      break;
    }

    case "shop": {
      const info = await sdk.shop.getShopInfo();
      console.log(JSON.stringify(info, null, 2));
      break;
    }

    case "products": {
      const pageSize = Math.min(Math.max(Number(args[0]) || 10, 1), 50);
      const list = await sdk.product.getItemList({
        offset: 0,
        page_size: pageSize,
        item_status: ItemStatus.NORMAL,
      });
      const ids = (list.response?.item ?? [])
        .map((item) => item.item_id)
        .filter((id): id is number => typeof id === "number");

      if (ids.length === 0) {
        console.log("Shop chưa có sản phẩm nào đang bán.");
        break;
      }

      const detail = await sdk.product.getItemBaseInfo({ item_id_list: ids });
      for (const item of (detail.response?.item_list ?? []) as ItemWithStock[]) {
        const price = item.price_info?.[0];
        const stock = item.stock_info_v2?.summary_info;
        console.log(
          [
            String(item.item_id).padEnd(14),
            String(price?.current_price ?? "-").padStart(10),
            `tồn ${String(stock?.total_available_stock ?? "-").padStart(5)}`,
            item.item_name ?? "",
          ].join("  "),
        );
      }
      break;
    }

    default:
      console.error(`Lệnh không rõ: ${command}`);
      console.error("Các lệnh có: status, auth-url, exchange, refresh, shop, products, tao-san-pham-thu, trang-thai-day, day-ngay");
      process.exitCode = 1;
  }
}

// Tat hen gio gia han tu dong: cli chay mot lan roi thoat, khong can giu.
startTokenKeepalive()?.unref();

main().catch((error: Error) => {
  console.error(`Lỗi: ${error.message}`);
  process.exitCode = 1;
});
