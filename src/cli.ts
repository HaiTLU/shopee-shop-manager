/**
 * Cong cu dong lenh de thu nhanh ma khong can mo trinh duyet.
 *
 *   npm run cli -- status              Xem tinh trang token
 *   npm run cli -- auth-url            In duong dan uy quyen shop
 *   npm run cli -- exchange "<url>"    Doi code lay token tu duong dan sau uy quyen
 *   npm run cli -- tao-san-pham-thu 3  Tao san pham thu tren shop thu (chi sandbox)
 *   npm run cli -- refresh             Gia han token ngay
 *   npm run cli -- shop                Thong tin shop
 *   npm run cli -- products [so_luong] Danh sach san pham
 */
import { config } from "./config.js";
import { sdk, tokenStatus, startTokenKeepalive } from "./shopee.js";
import { parseAuthCallback } from "./authCallback.js";
import { seedTestProducts } from "./seed.js";
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
        console.log(
          `Can uy quyen: chay 'npm start', mo http://localhost:${config.port} tren trinh duyet ` +
            "roi bam 'Ket noi shop Shopee'.",
        );
      }
      break;
    }

    case "auth-url": {
      console.log(sdk.getAuthorizationUrl(config.redirectUri, { auth_type: "seller" }));
      // Duong dan nay khong di qua /auth/start nen khong co ma state. Trang
      // callback cua may chu se tu choi (dung nhu thiet ke chong gia mao) va
      // KHONG dung toi code, nen van doi code lay token bang lenh exchange duoc.
      console.log("\nCach nay chi dung khi khong mo duoc trang web. Binh thuong hay bam nut tren trang web.");
      console.log("1. Mo duong dan tren, dang nhap tai khoan nguoi ban va bam dong y.");
      console.log("2. Trinh duyet se bao loi 'Ma state khong hop le'. Day la binh thuong.");
      console.log("3. Chep NGUYEN duong dan tren thanh dia chi, chay trong vai phut:");
      console.log('   npm run cli -- exchange "<duong dan vua chep>"');
      break;
    }

    case "exchange": {
      const input = args.join(" ");
      if (!input) {
        console.error('Cach dung: npm run cli -- exchange "<duong dan tren thanh dia chi sau khi uy quyen>"');
        process.exitCode = 1;
        break;
      }
      const { code, shopId } = parseAuthCallback(input);
      const token = await sdk.authenticateWithCode(code, shopId);
      if (!token || token.error) {
        throw new Error(
          `Doi code lay token that bai: ${token?.error ?? "khong ro"} - ${token?.message ?? ""}. ` +
            "Code chi dung duoc mot lan va het han sau vai phut, hay uy quyen lai roi dan ngay.",
        );
      }
      console.log(`Da ket noi shop ${token.shop_id ?? shopId ?? ""}. Token luu tai ${config.tokenFile}`);
      break;
    }

    case "tao-san-pham-thu": {
      const count = Math.min(Math.max(Number(args[0]) || 3, 1), 5);
      console.log(`Dang tao ${count} san pham thu tren shop thu nghiem...`);
      const ids = await seedTestProducts(count);
      console.log(`\nXong: tao duoc ${ids.length}/${count} san pham. Tai lai http://localhost:${config.port} de xem.`);
      if (ids.length < count) process.exitCode = 1;
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
      console.error("Cac lenh co: status, auth-url, exchange, refresh, shop, products, tao-san-pham-thu");
      process.exitCode = 1;
  }
}

// Tat hen gio gia han tu dong: cli chay mot lan roi thoat, khong can giu.
startTokenKeepalive()?.unref();

main().catch((error: Error) => {
  console.error(`Loi: ${error.message}`);
  process.exitCode = 1;
});
