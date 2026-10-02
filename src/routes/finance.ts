/**
 * Duong dan tai chinh (gan duoi /api/finance) va gia von (/api/costs).
 *
 *   GET  /finance/overview        tien dang cho va da ve, hoi thang Shopee
 *   GET  /finance/report          bao cao ky ?from=YYYY-MM-DD&to=YYYY-MM-DD tu so lieu da luu
 *   POST /finance/sync            lay so lieu ky {from, to} tu Shopee (chay nen)
 *   GET  /finance/jobs/:id        tien do lan lay so lieu
 *   GET  /costs, PUT /costs       doc, luu gia von
 */
import crypto from "node:crypto";
import { Router } from "express";
import { TimeRangeField } from "@congminh1254/shopee-sdk/schemas";
import { commaList, sdk } from "../shopee.js";
import { readCosts, saveCosts } from "../costs.js";
import { withRetry } from "../excel.js";
import { buildReport, daysBetween, financeStore, isDay, syncFinance, type SyncStep, type WalletTx } from "../finance.js";

export const financeRouter: Router = Router();
export const costsRouter: Router = Router();

/** Toi da 1 nam moi bao cao, tranh mot lan lay so lieu qua lau. */
const MAX_DAYS = 366;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const retry = <T>(fn: () => Promise<T>) => withRetry(fn, sleep);
const seconds = (v: unknown): number => (v instanceof Date ? Math.floor(v.getTime() / 1000) : Number(v) || 0);

function readRange(from: unknown, to: unknown): { from: string; to: string } {
  if (!isDay(from) || !isDay(to)) throw new Error("Ngày phải có dạng YYYY-MM-DD.");
  if (from > to) throw new Error("Ngày bắt đầu phải trước ngày kết thúc.");
  if (daysBetween(from, to).length > MAX_DAYS) throw new Error(`Mỗi lần xem tối đa ${MAX_DAYS} ngày.`);
  return { from, to };
}

/** Loi thieu quyen cua Shopee thi giai thich cho de hieu. */
function explain(message: string): string {
  if (/permission|no_access|not.?authori[sz]ed|access.?denied/i.test(message)) {
    return `${message}. Ứng dụng chưa được Shopee cấp quyền đọc mục này: vào open.shopee.com, mục ứng dụng, kiểm tra quyền Payment/Order rồi ủy quyền lại shop.`;
  }
  return message;
}

financeRouter.get("/overview", async (_req, res) => {
  try {
    const r = await retry(() => sdk.payment.getIncomeOverview({}));
    const total = r.response?.total_income ?? {};
    res.json({ pending: total.pending_amount ?? null, released: total.released_amount ?? null });
  } catch (error) {
    res.status(502).json({ error: explain((error as Error).message) });
  }
});

financeRouter.get("/report", async (req, res) => {
  try {
    const { from, to } = readRange(req.query.from, req.query.to);
    const [data, costs] = await Promise.all([financeStore.read(), readCosts()]);
    const report = buildReport(data, costs, from, to);
    const syncedAt = Math.max(0, ...daysBetween(from, to).map((d) => data.syncedDays[d] ?? 0));
    res.json({ ...report, syncedAt: syncedAt || null });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

interface Job {
  id: string;
  from: string;
  to: string;
  message: string;
  finished: boolean;
  steps: SyncStep[];
  startedAt: number;
}
const jobs = new Map<string, Job>();
let running: Job | null = null;

financeRouter.post("/sync", async (req, res) => {
  let range;
  try {
    range = readRange(req.body?.from, req.body?.to);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }
  if (running && !running.finished) {
    res.json({ jobId: running.id, already: true });
    return;
  }
  const job: Job = { id: crypto.randomUUID(), ...range, message: "Bắt đầu...", finished: false, steps: [], startedAt: Date.now() };
  jobs.set(job.id, job);
  running = job;
  for (const old of [...jobs.values()].filter((j) => j.finished).slice(0, -10)) jobs.delete(old.id);
  res.json({ jobId: job.id });

  syncFinance(range.from, range.to, {
    listOrders: async (timeFrom, timeTo, cursor) => {
      const r = await retry(() =>
        sdk.order.getOrderList({
          time_range_field: TimeRangeField.CREATE_TIME,
          time_from: timeFrom,
          time_to: timeTo,
          page_size: 100,
          ...(cursor ? { cursor } : {}),
          response_optional_fields: "order_status",
        }),
      );
      return {
        orders: (r.response?.order_list ?? []).filter((o) => o.order_sn).map((o) => ({ sn: o.order_sn!, status: String(o.order_status ?? "") })),
        more: Boolean(r.response?.more),
        next: r.response?.next_cursor ?? "",
      };
    },
    orderDetails: async (sns) => {
      const r = await retry(() => sdk.order.getOrderDetail({ order_sn_list: commaList(sns) }));
      return (r.response?.order_list ?? [])
        .filter((o) => o.order_sn)
        .map((o) => ({ sn: o.order_sn!, status: String(o.order_status ?? ""), createTime: seconds(o.create_time) }));
    },
    escrowBatch: async (sns) => {
      const r = await retry(() => sdk.payment.getEscrowDetailBatch({ order_sn_list: sns }));
      return (r.response ?? [])
        .map((x) => x.escrow_detail)
        .filter((d) => d?.order_sn && d.order_income)
        .map((d) => ({ sn: d!.order_sn!, income: d!.order_income as unknown as Record<string, unknown> }));
    },
    released: async (dateFrom, dateTo, cursor) => {
      const r = await retry(() => sdk.payment.getIncomeDetail({ date_from: dateFrom, date_to: dateTo, income_status: 1, cursor, page_size: 50 }));
      const groups = r.response?.income_detail_list ?? [];
      const items = groups.flatMap((g) => g.income_detail_list_item ?? []);
      return {
        items: items
          .filter((i) => i.order_sn)
          .map((i) => ({ sn: i.order_sn!, amount: Number(i.released_amount ?? i.estimated_escrow_amount ?? 0), time: seconds(i.actual_payout_time ?? i.creation_date) })),
        next: groups[0]?.next_page?.cursor ?? "",
      };
    },
    wallet: async (timeFrom, timeTo, page) => {
      const r = await retry(() =>
        sdk.payment.getWalletTransactionList({ page_no: page, page_size: 100, create_time_from: timeFrom, create_time_to: timeTo }),
      );
      return {
        // Bo ten nguoi mua va cac truong khong can cho bao cao.
        items: (r.response?.transaction_list ?? []).map(
          (t): WalletTx => ({
            time: seconds(t.create_time),
            type: String(t.transaction_type ?? ""),
            title: String(t.txn_title ?? t.transaction_type ?? ""),
            amount: Number(t.amount ?? 0),
            ...(typeof t.current_balance === "number" ? { balance: t.current_balance } : {}),
            ...(t.order_sn ? { orderSn: t.order_sn } : {}),
            ...(t.status !== undefined ? { status: String(t.status) } : {}),
            ...(t.description ? { description: String(t.description) } : {}),
          }),
        ),
        more: Boolean(r.response?.more),
      };
    },
    sleep,
    progress: (message) => {
      job.message = message;
    },
  })
    .then((steps) => {
      job.steps = steps.map((s) => (s.ok ? s : { ...s, message: explain(s.message) }));
      job.message = steps.every((s) => s.ok) ? "Đã lấy xong số liệu." : "Đã lấy xong, có phần Shopee chưa cho lấy.";
    })
    .catch((error: Error) => {
      job.steps = [{ name: "Lấy số liệu", ok: false, message: explain(error.message) }];
      job.message = "Lấy số liệu thất bại.";
    })
    .finally(() => {
      job.finished = true;
    });
});

financeRouter.get("/jobs/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Không thấy lần lấy số liệu này (máy chủ có thể vừa khởi động lại)." });
    return;
  }
  res.json(job);
});

costsRouter.get("/", async (_req, res) => {
  res.json(await readCosts());
});

costsRouter.put("/", async (req, res) => {
  const { itemId, modelId, cost } = (req.body ?? {}) as { itemId?: unknown; modelId?: unknown; cost?: unknown };
  if (!Number.isInteger(itemId) || !Number.isInteger(modelId ?? 0)) {
    res.status(400).json({ error: "Thiếu mã sản phẩm hoặc mã phân loại." });
    return;
  }
  try {
    const costs = await saveCosts([{ itemId: itemId as number, modelId: (modelId as number) ?? 0, cost: cost === null ? null : (cost as number) }]);
    res.json({ ok: true, count: Object.keys(costs).length });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});
