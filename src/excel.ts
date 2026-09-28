/**
 * Sua gia, ton hang loat bang Excel.
 *
 * Quy trinh: xuat tep co san gia/ton hien tai -> nguoi dung dien cot "moi" ->
 * tai len -> so voi du lieu Shopee luc do, chi ra tung thay doi va dong loi ->
 * nguoi dung chon dong -> gui dan len Shopee, bao ket qua tung dong.
 *
 * Cac ham o day khong goi mang (tru khi duoc truyen ham goi vao) de kiem thu duoc.
 */
import ExcelJS from "exceljs";
import type { CatalogItem } from "./catalog.js";

export const SHEET_GUIDE = "00-HuongDan";
export const SHEET_DATA = "01-GiaTon";

/** Ten cot trong tep. Doc lai theo ten, nen nguoi dung doi thu tu cot van duoc. */
export const COLUMNS = [
  { key: "itemId", header: "Mã sản phẩm", width: 14 },
  { key: "modelId", header: "Mã phân loại", width: 14 },
  { key: "name", header: "Tên sản phẩm", width: 48 },
  { key: "model", header: "Phân loại", width: 26 },
  { key: "sku", header: "SKU", width: 16 },
  { key: "price", header: "Giá gốc hiện tại", width: 15 },
  { key: "stock", header: "Tồn kho hiện tại", width: 14 },
  { key: "newPrice", header: "Giá gốc mới", width: 15 },
  { key: "newStock", header: "Tồn kho mới", width: 14 },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];

const HEADER_FILL = "FF1C2B73";
const INPUT_FILL = "FFE8ECF8";
const THIN = { style: "thin" as const, color: { argb: "FFB7BCDA" } };

export interface ExportMeta {
  shopName: string;
  sandbox: boolean;
  exportedAt: Date;
}

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();

function hanoiTime(date: Date): string {
  return date.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
}

/** Tep Excel gom trang huong dan va trang gia/ton, moi phan loai mot dong. */
export async function buildWorkbook(items: CatalogItem[], meta: ExportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Quản lý shop Shopee";
  wb.created = meta.exportedAt;

  const rows: Record<ColumnKey, string | number | null>[] = [];
  const skipped: string[] = [];
  for (const item of items) {
    if (item.hasModel && !item.models.length) {
      skipped.push(`${item.name} (mã ${item.itemId})${item.problem ? ": " + item.problem : ""}`);
      continue;
    }
    const lines = item.hasModel ? item.models : [{ modelId: 0, name: "", sku: item.sku, price: item.price, stock: item.stock }];
    for (const m of lines) {
      rows.push({
        itemId: item.itemId,
        modelId: m.modelId,
        name: item.name,
        model: m.name || null,
        sku: m.sku ?? (item.hasModel ? null : item.sku ?? null),
        price: m.price ?? null,
        stock: m.stock ?? null,
        newPrice: null,
        newStock: null,
      });
    }
  }

  // ---- Trang huong dan ----
  const guide = wb.addWorksheet(SHEET_GUIDE);
  guide.getColumn(1).width = 90;
  const lines: [string, Partial<ExcelJS.Font>?][] = [
    [`Sửa giá và tồn kho hàng loạt - ${meta.shopName}`, { size: 14, bold: true }],
    [""],
    [`Môi trường: ${meta.sandbox ? "Shop thử nghiệm" : "SHOP THẬT - thay đổi có hiệu lực ngay với khách mua"}`, { bold: true }],
    [`Xuất lúc: ${hanoiTime(meta.exportedAt)} (giờ Hà Nội). Số dòng: ${rows.length}.`],
    [""],
    ["Cách dùng", { bold: true }],
    [`1. Mở trang "${SHEET_DATA}". Mỗi dòng là một sản phẩm, hoặc một phân loại nếu sản phẩm có phân loại.`],
    ['2. Chỉ điền vào hai cột nền xanh nhạt "Giá gốc mới" và "Tồn kho mới". Để trống là giữ nguyên.'],
    ["3. Không sửa cột Mã sản phẩm, Mã phân loại: hệ thống dựa vào hai cột này để biết dòng nào là dòng nào."],
    ["4. Lưu tệp (vẫn dạng .xlsx), vào trang quản lý, thẻ Sửa hàng loạt, chọn tệp để xem trước."],
    ["5. Xem kỹ danh sách thay đổi, bỏ chọn dòng không muốn đổi, rồi bấm Áp dụng."],
    [""],
    ["Lưu ý", { bold: true }],
    ["- Giá là số nguyên, đơn vị đồng, không cần dấu chấm hay chữ đ (gõ 95000 hoặc 95.000 đều được)."],
    ["- Tồn kho không được thấp hơn phần Shopee đang giữ cho khuyến mại, nếu không Shopee sẽ từ chối dòng đó."],
    ["- Giá, tồn có thể đã đổi sau lúc xuất tệp. Khi xem trước, hệ thống so với số liệu Shopee ngay lúc đó."],
    ["- Giá mới gấp rưỡi trở lên hoặc chỉ bằng một nửa trở xuống sẽ được đánh dấu để kiểm tra lại, phòng gõ thừa hoặc thiếu số 0."],
  ];
  if (skipped.length) {
    lines.push([""], ["Sản phẩm không xuất được (chưa đọc được phân loại, thử tải lại sau)", { bold: true }]);
    for (const s of skipped) lines.push([`- ${s}`]);
  }
  lines.forEach(([text, font], i) => {
    const cell = guide.getCell(i + 1, 1);
    cell.value = text;
    cell.alignment = { wrapText: true, vertical: "top" };
    if (font) cell.font = font;
  });

  // ---- Trang gia/ton ----
  const sheet = wb.addWorksheet(SHEET_DATA, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = COLUMNS.map((c) => ({ key: c.key, header: c.header, width: c.width }));
  const head = sheet.getRow(1);
  head.height = 32;
  head.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
  });

  for (const r of rows) {
    const row = sheet.addRow(r);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const key = COLUMNS[col - 1]?.key;
      cell.border = { top: THIN, left: THIN, bottom: THIN, right: THIN };
      cell.alignment = { vertical: "middle", wrapText: key === "name" || key === "model" };
      if (key === "price" || key === "stock" || key === "newPrice" || key === "newStock") {
        cell.numFmt = "#,##0";
        cell.alignment = { ...cell.alignment, horizontal: "right" };
      }
      if (key === "itemId" || key === "modelId") cell.numFmt = "0";
      if (key === "newPrice" || key === "newStock") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: INPUT_FILL } };
        cell.dataValidation = {
          type: "whole",
          operator: "greaterThanOrEqual",
          formulae: [key === "newPrice" ? 1 : 0],
          allowBlank: true,
          showErrorMessage: true,
          errorTitle: "Chưa đúng",
          error: key === "newPrice" ? "Giá gốc mới phải là số nguyên lớn hơn 0." : "Tồn kho mới phải là số nguyên từ 0 trở lên.",
        };
      }
    });
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------- doc tep

export interface ParsedRow {
  row: number;
  itemId?: number;
  modelId: number;
  newPrice?: number;
  newStock?: number;
  /** Chu nguoi dung go ma khong doc ra so, de bao loi dung nguyen van. */
  badPrice?: string;
  badStock?: string;
  badId?: string;
}

/** Doc gia tri o thanh so nguyen. Nhan 95000, "95.000", "95,000", "95 000". */
export function readWhole(value: unknown): { value?: number; bad?: string } {
  if (value == null || value === "") return {};
  if (typeof value === "object") {
    const v = value as { result?: unknown; richText?: { text: string }[]; text?: string };
    if ("result" in v) return readWhole(v.result);
    if (v.richText) return readWhole(v.richText.map((t) => t.text).join(""));
    if (typeof v.text === "string") return readWhole(v.text);
    return { bad: String(value) };
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? { value } : { bad: String(value) };
  }
  const text = String(value).trim();
  if (text === "") return {};
  const compact = text.replace(/[\s ]/g, "").replace(/(đ|₫|vnd)$/i, "");
  if (/^\d+$/.test(compact)) return { value: Number(compact) };
  if (/^\d{1,3}([.,]\d{3})+$/.test(compact)) return { value: Number(compact.replace(/[.,]/g, "")) };
  return { bad: text };
}

/** Doc tep do nguoi dung tai len. Loi cau truc (sai tep, thieu cot) thi nem loi co huong dan. */
export async function parseWorkbook(buffer: Buffer): Promise<ParsedRow[]> {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error("Tệp không phải dạng .xlsx. Trong Excel chọn Lưu thành (Save As) kiểu Excel Workbook (.xlsx) rồi thử lại.");
  }
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new Error("Không mở được tệp Excel. Tệp có thể bị hỏng hoặc đang đặt mật khẩu.");
  }

  // Tim trang va dong tieu de theo ten cot, khong phu thuoc ten trang.
  const wanted = new Map(COLUMNS.map((c) => [fold(c.header), c.key]));
  for (const sheet of [wb.getWorksheet(SHEET_DATA), ...wb.worksheets].filter(Boolean) as ExcelJS.Worksheet[]) {
    for (let headerRow = 1; headerRow <= Math.min(5, sheet.rowCount); headerRow++) {
      const cols = new Map<ColumnKey, number>();
      sheet.getRow(headerRow).eachCell((cell, col) => {
        const key = wanted.get(fold(String(cell.text ?? "")));
        if (key && !cols.has(key)) cols.set(key, col);
      });
      if (!cols.has("itemId")) continue;
      if (!cols.has("newPrice") && !cols.has("newStock")) {
        throw new Error('Không thấy cột "Giá gốc mới" hoặc "Tồn kho mới". Hãy dùng tệp tải về từ trang quản lý.');
      }
      const out: ParsedRow[] = [];
      for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const get = (key: ColumnKey) => (cols.has(key) ? row.getCell(cols.get(key)!).value : undefined);
        const id = readWhole(get("itemId"));
        const model = readWhole(get("modelId"));
        const price = readWhole(get("newPrice"));
        const stock = readWhole(get("newStock"));
        if (id.value === undefined && !id.bad && price.value === undefined && !price.bad && stock.value === undefined && !stock.bad) continue;
        out.push({
          row: r,
          ...(id.value !== undefined ? { itemId: id.value } : {}),
          modelId: model.value ?? 0,
          ...(price.value !== undefined ? { newPrice: price.value } : {}),
          ...(stock.value !== undefined ? { newStock: stock.value } : {}),
          ...(price.bad ? { badPrice: price.bad } : {}),
          ...(stock.bad ? { badStock: stock.bad } : {}),
          ...(id.bad || model.bad ? { badId: id.bad ?? model.bad } : {}),
        });
      }
      return out;
    }
  }
  throw new Error('Không thấy cột "Mã sản phẩm". Hãy dùng tệp tải về từ trang quản lý, không xóa dòng tiêu đề.');
}

// ---------------------------------------------------------------- so sanh

export interface Change {
  key: string;
  row: number;
  itemId: number;
  modelId: number;
  name: string;
  modelName?: string;
  oldPrice?: number;
  newPrice?: number;
  oldStock?: number;
  newStock?: number;
  warnings: string[];
}

export interface Problem {
  row: number;
  message: string;
}

export interface Diff {
  rowsRead: number;
  changes: Change[];
  unchanged: number;
  problems: Problem[];
}

/** Ti le doi gia duoc coi la bat thuong, de nguoi dung kiem lai. */
const BIG_PRICE_CHANGE = 0.5;

/** So tep voi so lieu Shopee hien tai. Ham thuan, khong goi mang. */
export function diffRows(rows: ParsedRow[], items: CatalogItem[]): Diff {
  const byId = new Map(items.map((i) => [i.itemId, i]));
  const seen = new Map<string, number>();
  const changes: Change[] = [];
  const problems: Problem[] = [];
  let unchanged = 0;

  for (const r of rows) {
    const hasInput = r.newPrice !== undefined || r.newStock !== undefined || r.badPrice || r.badStock;
    if (!hasInput) {
      unchanged++;
      continue;
    }
    if (r.badId || r.itemId === undefined) {
      problems.push({ row: r.row, message: `Mã sản phẩm hoặc mã phân loại không đọc được${r.badId ? `: "${r.badId}"` : ""}.` });
      continue;
    }
    const key = `${r.itemId}:${r.modelId}`;
    if (seen.has(key)) {
      problems.push({ row: r.row, message: `Trùng với dòng ${seen.get(key)}: mỗi sản phẩm, phân loại chỉ điền một dòng.` });
      continue;
    }
    seen.set(key, r.row);

    const item = byId.get(r.itemId);
    if (!item) {
      problems.push({ row: r.row, message: `Không thấy sản phẩm mã ${r.itemId} đang bán (có thể đã xóa hoặc ẩn).` });
      continue;
    }
    if (item.hasModel && r.modelId === 0) {
      problems.push({ row: r.row, message: `"${item.name}" có phân loại: điền giá, tồn ở từng dòng phân loại.` });
      continue;
    }
    const target = r.modelId ? item.models.find((m) => m.modelId === r.modelId) : item;
    if (!target) {
      problems.push({ row: r.row, message: `Không thấy phân loại mã ${r.modelId} của "${item.name}".` });
      continue;
    }
    const bad: string[] = [];
    if (r.badPrice) bad.push(`Giá gốc mới "${r.badPrice}" không phải số nguyên.`);
    if (r.badStock) bad.push(`Tồn kho mới "${r.badStock}" không phải số nguyên.`);
    if (r.newPrice !== undefined && r.newPrice < 1) bad.push("Giá gốc mới phải lớn hơn 0.");
    const reserved = target.reserved ?? 0;
    if (r.newStock !== undefined && r.newStock < reserved) {
      bad.push(`Tồn kho mới ${r.newStock} thấp hơn phần Shopee đang giữ cho khuyến mại (${reserved}).`);
    }
    if (bad.length) {
      problems.push({ row: r.row, message: bad.join(" ") });
      continue;
    }

    const priceChanged = r.newPrice !== undefined && r.newPrice !== target.price;
    const stockChanged = r.newStock !== undefined && r.newStock !== target.stock;
    if (!priceChanged && !stockChanged) {
      unchanged++;
      continue;
    }
    const warnings: string[] = [];
    if (priceChanged && typeof target.price === "number" && target.price > 0) {
      const ratio = r.newPrice! / target.price;
      const fmt = (x: number) => x.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
      if (ratio >= 1 + BIG_PRICE_CHANGE) {
        warnings.push(`Giá mới gấp ${fmt(ratio)} lần giá cũ, kiểm tra có gõ thừa số 0 không.`);
      } else if (ratio <= 1 - BIG_PRICE_CHANGE) {
        warnings.push(`Giá mới chỉ bằng ${fmt(ratio * 100)}% giá cũ, kiểm tra có gõ thiếu số 0 không.`);
      }
    }
    const modelName = r.modelId ? (target as { name: string }).name : undefined;
    changes.push({
      key,
      row: r.row,
      itemId: item.itemId,
      modelId: r.modelId,
      name: item.name,
      ...(modelName ? { modelName } : {}),
      ...(typeof target.price === "number" ? { oldPrice: target.price } : {}),
      ...(priceChanged ? { newPrice: r.newPrice } : {}),
      ...(typeof target.stock === "number" ? { oldStock: target.stock } : {}),
      ...(stockChanged ? { newStock: r.newStock } : {}),
      warnings,
    });
  }
  return { rowsRead: rows.length, changes, unchanged, problems };
}

// ---------------------------------------------------------------- gui len Shopee

export interface ApplyResult {
  key: string;
  field: "price" | "stock";
  ok: boolean;
  message: string;
}

type Failure = { model_id?: number; failed_reason?: string };
export interface ApplyDeps {
  updatePrice(itemId: number, list: { model_id: number; original_price: number }[]): Promise<{ failure_list?: Failure[] }>;
  updateStock(itemId: number, list: { model_id: number; seller_stock: { stock: number }[] }[]): Promise<{ failure_list?: Failure[] }>;
  sleep(ms: number): Promise<void>;
  onResult(result: ApplyResult): void;
}

/** Shopee toi da 50 phan loai moi lenh sua gia/ton. */
const UPDATE_BATCH = 50;
/** Nghi giua hai lenh de khong cham gioi han toc do cua Shopee. */
const PAUSE_MS = 200;
const RETRY_DELAYS = [1000, 2000, 4000];

/** Loi tam thoi (qua tai, mang chap chon) thi thu lai; loi du lieu thi khong. */
export function isRetryable(message: string): boolean {
  return /busy|too.?many|rate.?limit|timeout|timed out|ECONNRESET|ETIMEDOUT|fetch failed|socket hang up|50[234]|server_error|system_error/i.test(message);
}

async function withRetry<T>(fn: () => Promise<T>, sleep: (ms: number) => Promise<void>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const message = (error as Error).message ?? String(error);
      if (attempt >= RETRY_DELAYS.length || !isRetryable(message)) throw error;
      await sleep(RETRY_DELAYS[attempt]!);
    }
  }
}

/** Gui cac thay doi len Shopee: gom theo san pham, moi lenh toi da 50 phan loai. */
export async function applyChanges(changes: Change[], deps: ApplyDeps): Promise<void> {
  const byItem = new Map<number, Change[]>();
  for (const c of changes) byItem.set(c.itemId, [...(byItem.get(c.itemId) ?? []), c]);

  let first = true;
  const pace = async () => {
    if (!first) await deps.sleep(PAUSE_MS);
    first = false;
  };

  for (const [itemId, list] of byItem) {
    for (const field of ["price", "stock"] as const) {
      const todo = list.filter((c) => (field === "price" ? c.newPrice !== undefined : c.newStock !== undefined));
      for (let i = 0; i < todo.length; i += UPDATE_BATCH) {
        const batch = todo.slice(i, i + UPDATE_BATCH);
        await pace();
        try {
          const result = await withRetry(
            () =>
              field === "price"
                ? deps.updatePrice(itemId, batch.map((c) => ({ model_id: c.modelId, original_price: c.newPrice! })))
                : deps.updateStock(itemId, batch.map((c) => ({ model_id: c.modelId, seller_stock: [{ stock: c.newStock! }] }))),
            deps.sleep,
          );
          const failed = new Map((result.failure_list ?? []).map((f) => [f.model_id ?? 0, f.failed_reason ?? "không rõ lý do"]));
          for (const c of batch) {
            const reason = failed.get(c.modelId);
            deps.onResult({ key: c.key, field, ok: !reason, message: reason ?? "Shopee đã nhận." });
          }
        } catch (error) {
          for (const c of batch) deps.onResult({ key: c.key, field, ok: false, message: (error as Error).message });
        }
      }
    }
  }
}
