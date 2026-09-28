/**
 * Duong dan sua gia, ton hang loat bang Excel (gan duoi /api/excel).
 *
 *   GET  /template      tai tep gia, ton hien tai
 *   POST /preview       tai tep da sua len, nhan danh sach thay doi va dong loi
 *   POST /apply         gui cac dong da chon trong ban xem truoc len Shopee
 *   GET  /jobs/:id      tien do va ket qua tung dong
 *
 * Ban xem truoc duoc giu tren may chu: luc ap dung chi gui ma ban xem truoc va
 * cac dong duoc chon, nen dung cai nguoi dung da nhin thay, khong tin so lieu
 * trinh duyet gui len.
 */
import crypto from "node:crypto";
import express, { Router } from "express";
import { isSandbox } from "../config.js";
import { getCatalog, patchCatalog } from "../catalog.js";
import { applyChanges, buildWorkbook, diffRows, parseWorkbook, type ApplyResult, type Change } from "../excel.js";
import { sdk } from "../shopee.js";

export const excelRouter: Router = Router();

const PREVIEW_TTL_MS = 30 * 60 * 1000;
const MAX_UPLOAD = "10mb";

interface Preview {
  changes: Map<string, Change>;
  createdAt: number;
}
interface Job {
  id: string;
  total: number;
  results: ApplyResult[];
  finished: boolean;
  startedAt: number;
  finishedAt?: number;
}

const previews = new Map<string, Preview>();
const jobs = new Map<string, Job>();
let running: Job | null = null;

function prune(): void {
  const now = Date.now();
  for (const [id, p] of previews) if (now - p.createdAt > PREVIEW_TTL_MS) previews.delete(id);
  // Giu 20 lan ap dung gan nhat de xem lai ket qua.
  const done = [...jobs.values()].filter((j) => j.finished).sort((a, b) => a.startedAt - b.startedAt);
  while (done.length > 20) jobs.delete(done.shift()!.id);
}

/** Ten tep theo quy uoc YYMMDD_Ten_NoiDung.xlsx, ngay theo gio Ha Noi. */
function fileName(shopName: string): string {
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const slug =
    shopName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[đĐ]/g, "d")
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((w) => w[0]!.toUpperCase() + w.slice(1))
      .join("") || "Shop";
  return `${ymd}_${slug}${isSandbox ? "_ThuNghiem" : ""}_SuaGiaTon.xlsx`;
}

async function shopName(): Promise<string> {
  try {
    const info = await sdk.shop.getShopInfo();
    const data = (info.response ?? info) as { shop_name?: string };
    return data.shop_name || "Shop";
  } catch {
    return "Shop";
  }
}

excelRouter.get("/template", async (_req, res) => {
  try {
    // Luon lay so moi nhat: tep Excel la can cu de nguoi dung sua.
    const [catalog, name] = await Promise.all([getCatalog({ force: true }), shopName()]);
    const buffer = await buildWorkbook(catalog.items, { shopName: name, sandbox: isSandbox, exportedAt: new Date() });
    const file = fileName(name);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${file}"; filename*=UTF-8''${encodeURIComponent(file)}`);
    res.send(buffer);
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

excelRouter.post("/preview", express.raw({ type: () => true, limit: MAX_UPLOAD }), async (req, res) => {
  prune();
  const body = req.body as Buffer | undefined;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: "Chưa nhận được tệp. Chọn lại tệp .xlsx." });
    return;
  }
  let rows;
  try {
    rows = await parseWorkbook(body);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }
  try {
    // So voi so lieu Shopee ngay luc nay, khong dung so trong tep.
    const catalog = await getCatalog({ force: true });
    const diff = diffRows(rows, catalog.items);
    const id = crypto.randomUUID();
    previews.set(id, { changes: new Map(diff.changes.map((c) => [c.key, c])), createdAt: Date.now() });
    res.json({ previewId: id, sandbox: isSandbox, ...diff });
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

excelRouter.post("/apply", async (req, res) => {
  prune();
  const { previewId, keys } = (req.body ?? {}) as { previewId?: unknown; keys?: unknown };
  const preview = typeof previewId === "string" ? previews.get(previewId) : undefined;
  if (!preview) {
    res.status(410).json({ error: "Bản xem trước đã hết hạn (quá 30 phút) hoặc máy chủ vừa khởi động lại. Chọn lại tệp để xem trước." });
    return;
  }
  if (!Array.isArray(keys) || !keys.length) {
    res.status(400).json({ error: "Chưa chọn dòng nào để áp dụng." });
    return;
  }
  if (running && !running.finished) {
    res.status(409).json({ error: "Đang áp dụng một tệp khác. Chờ xong rồi thử lại." });
    return;
  }
  const chosen = keys.map((k) => preview.changes.get(String(k))).filter((c): c is Change => Boolean(c));
  if (!chosen.length) {
    res.status(400).json({ error: "Các dòng đã chọn không có trong bản xem trước." });
    return;
  }
  // Moi ban xem truoc chi ap dung mot lan, tranh bam hai lan gui trung.
  previews.delete(previewId as string);

  const job: Job = {
    id: crypto.randomUUID(),
    total: chosen.reduce((n, c) => n + (c.newPrice !== undefined ? 1 : 0) + (c.newStock !== undefined ? 1 : 0), 0),
    results: [],
    finished: false,
    startedAt: Date.now(),
  };
  jobs.set(job.id, job);
  running = job;
  res.json({ jobId: job.id, total: job.total });

  const byKey = new Map(chosen.map((c) => [c.key, c]));
  applyChanges(chosen, {
    updatePrice: async (itemId, list) => {
      const r = await sdk.product.updatePrice({ item_id: itemId, price_list: list });
      if (r.error) throw new Error(`${r.error}: ${r.message || "không có mô tả"}`);
      return r.response ?? {};
    },
    updateStock: async (itemId, list) => {
      const r = await sdk.product.updateStock({ item_id: itemId, stock_list: list });
      if (r.error) throw new Error(`${r.error}: ${r.message || "không có mô tả"}`);
      return r.response ?? {};
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    onResult: (result) => {
      job.results.push(result);
      const c = byKey.get(result.key);
      if (result.ok && c) {
        patchCatalog(c.itemId, c.modelId, result.field === "price" ? { price: c.newPrice! } : { stock: c.newStock! });
      }
    },
  })
    .catch((error: Error) => console.error("[excel] áp dụng dừng giữa chừng:", error.message))
    .finally(() => {
      job.finished = true;
      job.finishedAt = Date.now();
      const failed = job.results.filter((r) => !r.ok).length;
      console.log(`[excel] áp dụng xong: ${job.results.length - failed} dòng Shopee nhận, ${failed} dòng lỗi.`);
    });
});

excelRouter.get("/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Không thấy lần áp dụng này (máy chủ có thể vừa khởi động lại)." });
    return;
  }
  res.json(job);
});
