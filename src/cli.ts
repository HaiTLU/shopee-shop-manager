/**
 * Cong cu dong lenh de thu nhanh ma khong can mo trinh duyet.
 *
 *   npm run cli -- status              Xem tinh trang token
 *   npm run cli -- auth-url            In duong dan uy quyen shop
 *   npm run cli -- refresh             Gia han token ngay
 *   npm run cli -- shop                Thong tin shop
 *   npm run cli -- products [so_luong] Danh sach san pham
 */
import { config } from "./config.js";
import { sdk, tokenStatus, startTokenKeepalive } from "./shopee.js";
import {
  ItemStatus,
  type GetItemBaseInfoItem,
  type GetItemBaseInfoStockInfoV2,
} from "@congminh1254/shopee-sdk/schemas";

// Xem chu thich trong src/routes/api.ts: SDK dat nham cho truong ton kho.
type ItemWithStock = GetItemBaseInfoItem & { stock_info_v2?: GetItemBaseInfoStockInfoV2 };

const [command = "status", ...args] = process.argv.slice(2);

async function main(): Promise<void> {
  switch (command) {
    case "status": {
      const status = await tokenStatus();
      console.log(`Vung:            ${config.region}`);
      console.log(`Da ket noi:      ${status.connected ? "co" : "chua"}`);
      if (status.connected) {
        console.log(`Shop ID:         ${status.shopId ?? "khong ro"}`);
        console.log(`Token con:       ${status.accessTokenExpiresInMinutes} phut`);
        console.log(`Ma gia han con:  ${status.refreshTokenExpiresInDays} ngay`);
      }
      if (status.needsReauthorization) {
        console.log("Can uy quyen lai: chay lenh auth-url roi mo duong dan do tren trinh duyet.");
      }
      break;
    }

    case "auth-url": {
      console.log(sdk.getAuthorizationUrl(config.redirectUri, { auth_type: "seller" }));
      console.log("\nMo duong dan tren, dang nhap tai khoan nguoi ban va bam dong y.");
      console.log("Nho chay 'npm start' truoc de may chu san sang nhan ket qua tra ve.");
      break;
    }

    case "refresh": {
      const token = await sdk.refreshToken();
      console.log(token ? "Da gia han token." : "Khong gia han duoc.");
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
        console.log("Shop chua co san pham nao o trang thai dang ban.");
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
            `ton ${String(stock?.total_available_stock ?? "-").padStart(5)}`,
            item.item_name ?? "",
          ].join("  "),
        );
      }
      break;
    }

    default:
      console.error(`Lenh khong ro: ${command}`);
      console.error("Cac lenh co: status, auth-url, refresh, shop, products");
      process.exitCode = 1;
  }
}

// Tat hen gio gia han tu dong: cli chay mot lan roi thoat, khong can giu.
startTokenKeepalive()?.unref();

main().catch((error: Error) => {
  console.error(`Loi: ${error.message}`);
  process.exitCode = 1;
});
