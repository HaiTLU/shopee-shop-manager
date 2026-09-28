/**
 * Tao san pham thu tren shop thu (sandbox) qua API.
 *
 * Shop thu luc moi tao khong co san pham nao, nen chua thu duoc chuc nang
 * sua gia va ton kho. Lenh nay tu lam cac buoc ma tren Kenh Nguoi Ban phai
 * bam tay: bat don vi van chuyen, chon nganh hang it thuoc tinh bat buoc,
 * tai anh, roi dang san pham.
 *
 * CHI chay tren moi truong thu nghiem. Tren shop that thi tu choi.
 */
import zlib from "node:zlib";
import type {
  AddItemAttribute,
  AddItemRequest,
  GetAttributeTreeAttributeTree,
  GetCategoryCategory,
} from "@congminh1254/shopee-sdk/schemas";
import type { GetChannelListLogisticsChannel } from "@congminh1254/shopee-sdk/schemas/logistics";
import { isSandbox } from "./config.js";
import { describeError } from "./errors.js";
import { sdk } from "./shopee.js";

type Log = (message: string) => void;

// ---------- Anh san pham ----------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * Tao anh PNG vuong mot mau, co mot o vuong sang o giua de khong bi coi la
 * anh trang tron. Khong can thu vien ngoai.
 */
export function makeSquarePng(size: number, rgb: [number, number, number]): Buffer {
  const [r, g, b] = rgb;
  const rows: Buffer[] = [];
  const inner = [Math.floor(size / 3), Math.floor((size * 2) / 3)];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const center = x >= inner[0]! && x < inner[1]! && y >= inner[0]! && y < inner[1]!;
      row[1 + x * 3] = center ? 255 : r;
      row[2 + x * 3] = center ? 255 : g;
      row[3 + x * 3] = center ? 255 : b;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 8 bit moi kenh mau
  header[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- Chon nganh hang ----------

/** Tu khoa nganh hang don gian, it thuoc tinh bat buoc, uu tien thu truoc. */
const SIMPLE_CATEGORY_HINTS = [
  "so tay", "notebook", "but", "pen", "van phong pham", "stationery",
  "moc khoa", "keychain", "khac", "others",
];

function removeAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}

/** Nganh hang la (khong co nganh con), nganh de uu tien len dau. */
export function rankLeafCategories(categories: GetCategoryCategory[]): GetCategoryCategory[] {
  const leaves = categories.filter((c) => c.category_id && c.has_children === false);
  const score = (c: GetCategoryCategory) => {
    const name = removeAccents(`${c.display_category_name ?? ""} ${c.original_category_name ?? ""}`);
    const hit = SIMPLE_CATEGORY_HINTS.findIndex((hint) => name.includes(hint));
    return hit === -1 ? SIMPLE_CATEGORY_HINTS.length : hit;
  };
  return [...leaves].sort((a, b) => score(a) - score(b));
}

/**
 * Dien san thuoc tinh bat buoc. Thuoc tinh co danh sach gia tri thi lay gia
 * tri dau tien; thuoc tinh tu nhap thi dien chu "Khac".
 */
export function buildMandatoryAttributes(tree: GetAttributeTreeAttributeTree[]): AddItemAttribute[] {
  return tree
    .filter((a) => a.mandatory && a.attribute_id)
    .map((a) => {
      const first = a.attribute_value_list?.find((v) => v.value_id);
      return {
        attribute_id: a.attribute_id!,
        attribute_value_list: first
          ? [{ value_id: first.value_id! }]
          : [{ value_id: 0, original_value_name: "Khac" }],
      };
    });
}

// ---------- Van chuyen ----------

/** Chon don vi van chuyen dung duoc cho san pham, kem size_id neu bat buoc. */
export function logisticInfoFrom(channels: GetChannelListLogisticsChannel[]) {
  return channels
    .filter((c) => c.enabled && c.logistics_channel_id)
    .map((c) => {
      const size = c.fee_type === "SIZE_SELECTION" ? c.size_list?.[0]?.size_id : undefined;
      if (c.fee_type === "SIZE_SELECTION" && size === undefined) return null;
      return {
        logistic_id: c.logistics_channel_id!,
        enabled: true,
        ...(size !== undefined ? { size_id: Number(size) } : {}),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

// ---------- Quy trinh chinh ----------

async function ensureLogistics(log: Log) {
  const list = (await sdk.logistics.getChannelList()).response?.logistics_channel_list ?? [];
  let usable = logisticInfoFrom(list);
  if (usable.length) {
    log(`Van chuyen: dang bat ${usable.length} don vi.`);
    return usable;
  }

  log("Van chuyen: chua bat don vi nao, dang thu bat...");
  for (const channel of list) {
    if (!channel.logistics_channel_id) continue;
    try {
      await sdk.logistics.updateChannel({ logistics_channel_id: channel.logistics_channel_id, enabled: true });
      log(`  Da bat: ${channel.logistics_channel_name ?? channel.logistics_channel_id}`);
    } catch (error) {
      log(`  Khong bat duoc ${channel.logistics_channel_name ?? channel.logistics_channel_id}: ${describeError(error)}`);
    }
  }
  const again = (await sdk.logistics.getChannelList()).response?.logistics_channel_list ?? [];
  usable = logisticInfoFrom(again);
  if (!usable.length) {
    throw new Error(
      "Khong bat duoc don vi van chuyen nao. Vao Kenh Nguoi Ban thu nghiem > Cai dat van chuyen, bat mot don vi roi chay lai.",
    );
  }
  return usable;
}

async function pickCategory(log: Log) {
  let categories: GetCategoryCategory[] = [];
  try {
    categories = (await sdk.product.getCategory({ language: "vi" })).response?.category_list ?? [];
  } catch {
    categories = (await sdk.product.getCategory()).response?.category_list ?? [];
  }
  const ranked = rankLeafCategories(categories).slice(0, 20);
  if (!ranked.length) throw new Error("Shopee khong tra ve nganh hang nao.");

  const trees =
    (await sdk.product.getAttributeTree({ category_id_list: ranked.map((c) => c.category_id!) })).response?.list ?? [];

  // Chon nganh co it thuoc tinh bat buoc nhat trong nhom uu tien.
  let best: { category: GetCategoryCategory; attributes: AddItemAttribute[] } | null = null;
  for (const category of ranked) {
    const tree = trees.find((t) => t.category_id === category.category_id)?.attribute_tree ?? [];
    const attributes = buildMandatoryAttributes(tree);
    if (!best || attributes.length < best.attributes.length) best = { category, attributes };
    if (attributes.length === 0) break;
  }
  log(
    `Nganh hang: ${best!.category.display_category_name ?? best!.category.original_category_name} ` +
      `(ma ${best!.category.category_id}, ${best!.attributes.length} thuoc tinh bat buoc)`,
  );
  return best!;
}

/**
 * Don vi van chuyen thu nghiem co muc gia toi da rieng, thap hon ngoai that
 * nhieu, va Shopee khong tra muc nay qua API. Gap loi nay thi ha gia xuong
 * mot nua (lam tron nghin dong) roi thu lai, den khi duoc hoac cham san.
 */
const PRICE_LIMIT_ERROR = /price\.max\.limit|max price of the product is over max limit/i;
const MIN_PRICE = 1000;

async function addItemLoweringPrice(
  label: string,
  startPrice: number,
  log: Log,
  build: (price: number) => AddItemRequest,
) {
  let price = startPrice;
  for (;;) {
    try {
      return { result: await sdk.product.addItem(build(price)), price, lowered: price < startPrice };
    } catch (error) {
      const next = Math.max(MIN_PRICE, Math.floor(price / 2 / 1000) * 1000);
      if (!PRICE_LIMIT_ERROR.test(describeError(error)) || next >= price) throw error;
      log(`  ${label}: gia ${price.toLocaleString("vi-VN")}d vuot muc toi da cua don vi van chuyen thu nghiem, thu ${next.toLocaleString("vi-VN")}d`);
      price = next;
    }
  }
}

const COLORS: [number, number, number][] = [
  [238, 77, 45],
  [36, 99, 235],
  [22, 163, 74],
  [217, 119, 6],
  [124, 58, 237],
];

export async function seedTestProducts(count: number, log: Log = console.log): Promise<number[]> {
  if (!isSandbox) {
    throw new Error(
      "Tu choi: lenh nay chi chay tren moi truong thu nghiem (SHOPEE_REGION=TEST_GLOBAL), khong tao hang gia tren shop that.",
    );
  }

  const logistics = await ensureLogistics(log);
  const { category, attributes } = await pickCategory(log);
  const created: number[] = [];
  // Chi dat tran khi da thuc su phai ha gia: luc do biet muc toi da nam o
  // quanh day, san pham sau bat dau tu day de khong phai do lai tu dau.
  let acceptedCeiling = Number.POSITIVE_INFINITY;

  for (let i = 1; i <= count; i++) {
    const label = `San pham thu ${i}`;
    try {
      const png = makeSquarePng(800, COLORS[(i - 1) % COLORS.length]!);
      const upload = await sdk.mediaSpace.uploadImage({ image: png });
      const imageId = upload.response?.image_info?.image_id ?? upload.response?.image_info_list?.[0]?.image_info?.image_id;
      if (!imageId) throw new Error("Shopee khong tra ve image_id khi tai anh");

      const { result, price, lowered } = await addItemLoweringPrice(label, Math.min(100000 * i, acceptedCeiling), log, (originalPrice) => ({
        item_name: `Sản phẩm thử nghiệm số ${i} - tạo qua API`,
        description:
          `Đây là sản phẩm thử nghiệm số ${i} được tạo tự động qua Shopee Open API ` +
          "để kiểm tra chức năng sửa giá và tồn kho của trang quản lý shop. " +
          "Sản phẩm chỉ tồn tại trên môi trường thử nghiệm, không bán thật.",
        original_price: originalPrice,
        seller_stock: [{ stock: 20 * i }],
        weight: 0.3,
        dimension: { package_length: 20, package_width: 15, package_height: 5 },
        category_id: category.category_id!,
        attribute_list: attributes,
        brand: { brand_id: 0, original_brand_name: "NoBrand" },
        condition: "NEW",
        item_status: "NORMAL",
        item_sku: `THU-${i}`,
        image: { image_id_list: [imageId] },
        logistic_info: logistics,
      }));
      if (lowered) acceptedCeiling = Math.min(acceptedCeiling, price);
      const itemId = result.response?.item_id;
      log(`${label}: da tao, ma san pham ${itemId}, gia ${price.toLocaleString("vi-VN")}d`);
      if (itemId) created.push(itemId);
    } catch (error) {
      log(`${label}: LOI ${describeError(error)}`);
    }
  }
  return created;
}
