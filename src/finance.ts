/**
 * Tai chinh cua shop: tien tung don, tien ve vi, lai lo.
 *
 * Nguon so lieu (Shopee Open Platform, shop noi dia):
 *   - get_order_list + get_order_detail: danh sach don va ngay tao
 *   - get_escrow_detail_batch: tien tung don (khach tra, phi san, thue, thuc nhan)
 *   - get_income_detail: tien da ve theo tung don va ngay ve
 *   - get_wallet_transaction_list: giao dich vi (tien vao, rut tien)
 *   - get_income_overview: tong tien dang cho va da ve (hoi truc tiep, khong luu)
 *
 * So lieu luu vao data/finance-<vung>-<partner_id>.json, chi giu con so can
 * cho bao cao; khong luu ten, dia chi hay thong tin nguoi mua.
 *
 * Cac ham tinh toan (normalizeIncome, buildReport...) khong goi mang de kiem thu.
 */
import { jsonStore } from "./jsonStore.js";
import { costKey } from "./costs.js";

// ---------------------------------------------------------------- kieu du lieu

/** Tien mot don, da quy ve cac dong cua bang ke. Moi so tinh bang dong. */
export interface Income {
  /** Tien hang theo gia ban, da tru giam gia cua shop. */
  goods: number;
  /** Ma giam gia, xu hoan cua shop. */
  sellerVoucher: number;
  commission: number;
  service: number;
  transaction: number;
  /** Phi xu ly don, hoa hong tiep thi lien ket, phi chien dich, bao hiem... */
  otherFees: number;
  /** Thue Shopee khau tru thay (VAT, TNCN cua ho kinh doanh). */
  tax: number;
  /** Thuc nhan = escrow_amount cua Shopee. */
  net: number;
  /** Van chuyen, tra hang, dieu chinh: phan con lai de bang ke khop dung so Shopee tra. */
  adjust: number;
  shippingActual?: number;
  shippingRebate?: number;
  refund?: number;
}

export interface OrderLine {
  itemId: number;
  modelId: number;
  name: string;
  modelName?: string;
  qty: number;
  /** Thanh tien cua dong sau giam gia (da nhan so luong). */
  amount: number;
}

export interface OrderRecord {
  sn: string;
  status: string;
  /** Giay (Unix). */
  createTime?: number;
  income?: Income;
  lines?: OrderLine[];
  /** Trang thai don luc lay tien, de biet khi nao can lay lai. */
  incomeStatus?: string;
  incomeAt?: number;
}

export interface WalletTx {
  time: number;
  type: string;
  title: string;
  amount: number;
  balance?: number;
  orderSn?: string;
  status?: string;
  description?: string;
}

export interface Released {
  sn: string;
  amount: number;
  time: number;
}

export interface FinanceData {
  orders: Record<string, OrderRecord>;
  wallet: WalletTx[];
  released: Released[];
  /** Ngay (YYYY-MM-DD, gio Ha Noi) da lay so lieu -> luc lay. */
  syncedDays: Record<string, number>;
}

export const financeStore = jsonStore<FinanceData>("finance", () => ({ orders: {}, wallet: [], released: [], syncedDays: {} }));

// ---------------------------------------------------------------- ngay gio Ha Noi

const TZ_OFFSET = 7 * 3600;

/** YYYY-MM-DD theo gio Ha Noi cua mot moc giay. */
export function dayKey(seconds: number): string {
  return new Date((seconds + TZ_OFFSET) * 1000).toISOString().slice(0, 10);
}

/** Moc giay luc 00:00 gio Ha Noi cua ngay YYYY-MM-DD. */
export function dayStart(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / 1000 - TZ_OFFSET;
}

export function isDay(text: unknown): text is string {
  if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const t = Date.parse(`${text}T00:00:00Z`);
  // Loai ngay khong co that nhu 2026-02-30 (Date.parse tu day sang thang sau).
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === text;
}

/** Danh sach ngay tu from den to (tinh ca hai dau). */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = dayStart(from); t <= dayStart(to); t += 86400) out.push(dayKey(t));
  return out;
}

/** Chia khoang [from, to] thanh cac doan toi da `maxDays` ngay (gioi han cua Shopee). */
export function windows(from: string, to: string, maxDays: number): { from: string; to: string }[] {
  const days = daysBetween(from, to);
  const out: { from: string; to: string }[] = [];
  for (let i = 0; i < days.length; i += maxDays) out.push({ from: days[i]!, to: days[Math.min(i + maxDays, days.length) - 1]! });
  return out;
}

// ---------------------------------------------------------------- quy doi tien mot don

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

type EscrowIncome = Record<string, unknown> & { items?: Record<string, unknown>[] };

/** Quy tien Shopee tra ve (order_income) thanh cac dong bang ke. */
export function normalizeIncome(oi: EscrowIncome): Income {
  const selling = typeof oi.order_selling_price === "number" ? oi.order_selling_price : n(oi.order_original_price);
  const goods =
    selling > 0 ? selling - n(oi.seller_discount) : n(oi.order_discounted_price) || n(oi.cost_of_goods_sold);
  const income: Income = {
    goods,
    sellerVoucher: n(oi.voucher_from_seller) + n(oi.seller_coin_cash_back),
    commission: n(oi.commission_fee),
    service: n(oi.service_fee),
    transaction: n(oi.seller_transaction_fee),
    otherFees:
      n(oi.seller_order_processing_fee) +
      n(oi.order_ams_commission_fee) +
      n(oi.campaign_fee) +
      n(oi.delivery_seller_protection_fee_premium_amount) +
      n(oi.shipping_seller_protection_fee_amount),
    tax: n(oi.withholding_vat_tax) + n(oi.withholding_pit_tax) + n(oi.withholding_cit_tax) + n(oi.withholding_tax) + n(oi.escrow_tax),
    net: n(oi.escrow_amount),
    adjust: 0,
  };
  income.adjust =
    income.net -
    (income.goods - income.sellerVoucher - income.commission - income.service - income.transaction - income.otherFees - income.tax);
  if (typeof oi.actual_shipping_fee === "number") income.shippingActual = oi.actual_shipping_fee;
  if (typeof oi.shopee_shipping_rebate === "number") income.shippingRebate = oi.shopee_shipping_rebate;
  const refund = n(oi.refund_amount_to_buyer) || n(oi.drc_adjustable_refund);
  if (refund) income.refund = refund;
  return income;
}

/** Cac dong san pham cua don, de tinh gia von. */
export function orderLines(oi: EscrowIncome): OrderLine[] {
  return (oi.items ?? []).map((it) => {
    const qty = n(it.quantity_purchased) || 1;
    const amount = n(it.discounted_price) || n(it.selling_price) || n(it.original_price);
    return {
      itemId: n(it.item_id),
      modelId: n(it.model_id),
      name: String(it.item_name ?? "(không tên)"),
      ...(it.model_name ? { modelName: String(it.model_name) } : {}),
      qty,
      amount,
    };
  });
}

// ---------------------------------------------------------------- tien da ve

type Row = Record<string, unknown>;
const isRow = (v: unknown): v is Row => typeof v === "object" && v !== null && !Array.isArray(v);
const seconds = (v: unknown): number => (v instanceof Date ? Math.floor(v.getTime() / 1000) : Number(v) || 0);

/**
 * Doc mot trang get_income_detail thanh cac khoan da ve.
 *
 * Khac cac API khac, tai lieu Shopee (ca bang tham so lan vi du phan hoi) dat
 * income_detail_list o cap ngoai cung chu khong trong `response`, va la mot
 * doi tuong { list, next_page }. Kieu cua SDK ghi la mang nhom
 * { income_detail_list_item, next_page } trong `response`; doc theo kieu do thi
 * trang nao cung ra 0 khoan ma khong bao loi. Nhan ca hai dang, dang khac thi
 * bao loi chu khong coi la khong co tien ve.
 */
export function readIncomeDetail(body: unknown): { items: Released[]; next: string } {
  const top = isRow(body) ? body : {};
  const detail = top.income_detail_list ?? (isRow(top.response) ? top.response.income_detail_list : undefined);
  const groups = Array.isArray(detail) ? detail : [detail];
  const lists = groups.map((g) => (isRow(g) ? (g.list ?? g.income_detail_list_item ?? []) : undefined));
  if (!lists.every(Array.isArray)) {
    const fields = Object.keys(top).join(", ") || "trống";
    throw new Error(`Không đọc được tiền đã về: Shopee trả về income_detail_list không đúng dạng hoặc không có (các trường: ${fields}).`);
  }
  const rows = lists.flat().filter(isRow);
  const page = groups.find(isRow)?.next_page;
  const cursor = isRow(page) && typeof page.cursor === "string" ? page.cursor : "";
  return {
    items: rows
      .filter((i) => i.order_sn)
      .map((i) => ({ sn: String(i.order_sn), amount: Number(i.released_amount ?? i.estimated_escrow_amount ?? 0), time: seconds(i.actual_payout_time ?? i.creation_date) })),
    // Trang rong thi thoi, du Shopee van gui cursor.
    next: rows.length ? cursor : "",
  };
}

// ---------------------------------------------------------------- bao cao

/** Trang thai Shopee da chot tien; con lai la tam tinh. */
const FINAL = new Set(["COMPLETED"]);
const CANCELLED = new Set(["CANCELLED", "IN_CANCEL"]);
const UNPAID = new Set(["UNPAID"]);

const STATUS_NAME: Record<string, string> = {
  UNPAID: "Chờ thanh toán",
  READY_TO_SHIP: "Chờ lấy hàng",
  PROCESSED: "Đã xử lý",
  RETRY_SHIP: "Giao lại",
  SHIPPED: "Đang giao",
  TO_CONFIRM_RECEIVE: "Đã giao, chờ xác nhận",
  COMPLETED: "Hoàn thành",
  TO_RETURN: "Trả hàng",
  IN_CANCEL: "Đang hủy",
  CANCELLED: "Đã hủy",
};
export const statusName = (s: string) => STATUS_NAME[s] ?? s;

export interface Statement {
  goods: number;
  sellerVoucher: number;
  commission: number;
  service: number;
  transaction: number;
  otherFees: number;
  tax: number;
  adjust: number;
  net: number;
}

const emptyStatement = (): Statement => ({ goods: 0, sellerVoucher: 0, commission: 0, service: 0, transaction: 0, otherFees: 0, tax: 0, adjust: 0, net: 0 });

function addTo(s: Statement, i: Income): void {
  s.goods += i.goods;
  s.sellerVoucher += i.sellerVoucher;
  s.commission += i.commission;
  s.service += i.service;
  s.transaction += i.transaction;
  s.otherFees += i.otherFees;
  s.tax += i.tax;
  s.adjust += i.adjust;
  s.net += i.net;
}

export interface ReportOrder {
  sn: string;
  day: string;
  status: string;
  statusName: string;
  final: boolean;
  income: Income;
  lines: OrderLine[];
  cogs?: number;
  profit?: number;
  missingCost: boolean;
}

export interface Report {
  from: string;
  to: string;
  /** Ngay trong ky chua lay so lieu tu Shopee. */
  missingDays: string[];
  counts: { orders: number; final: number; estimated: number; cancelled: number; unpaid: number; noIncome: number };
  statement: Statement;
  /** Tien don huy, giao that bai (thuong la 0, co khi bi tru phi). */
  cancelledNet: number;
  profit: { orders: number; net: number; cogs: number; profit: number };
  daily: { day: string; orders: number; goods: number; net: number; profit?: number; complete: boolean }[];
  products: {
    itemId: number;
    modelId: number;
    name: string;
    modelName?: string;
    qty: number;
    goods: number;
    net: number;
    cost?: number;
    cogs?: number;
    profit?: number;
  }[];
  orders: ReportOrder[];
  wallet: { balance?: number; balanceAt?: number; inflow: number; outflow: number; withdrawn: number; transactions: WalletTx[] };
  releasedInPeriod: number;
}

const WITHDRAW = /withdraw|rút/i;

/** Lap bao cao cho ky [from, to] tu so lieu da luu va gia von hien tai. */
export function buildReport(data: FinanceData, costs: Record<string, number>, from: string, to: string): Report {
  const start = dayStart(from);
  const end = dayStart(to) + 86400;
  const days = daysBetween(from, to);
  const statement = emptyStatement();
  const counts = { orders: 0, final: 0, estimated: 0, cancelled: 0, unpaid: 0, noIncome: 0 };
  const profit = { orders: 0, net: 0, cogs: 0, profit: 0 };
  let cancelledNet = 0;
  const daily = new Map(days.map((d) => [d, { day: d, orders: 0, goods: 0, net: 0, profit: 0, complete: true }]));
  const products = new Map<string, Report["products"][number]>();
  const orders: ReportOrder[] = [];

  for (const o of Object.values(data.orders)) {
    if (!o.createTime || o.createTime < start || o.createTime >= end) continue;
    if (UNPAID.has(o.status)) {
      counts.unpaid++;
      continue;
    }
    if (CANCELLED.has(o.status)) {
      counts.cancelled++;
      cancelledNet += o.income?.net ?? 0;
      continue;
    }
    if (!o.income) {
      counts.noIncome++;
      continue;
    }
    counts.orders++;
    const final = FINAL.has(o.status);
    if (final) counts.final++;
    else counts.estimated++;
    addTo(statement, o.income);

    const lines = o.lines ?? [];
    const missingCost = !lines.length || lines.some((l) => costs[costKey(l.itemId, l.modelId)] === undefined);
    const cogs = missingCost ? undefined : lines.reduce((sum, l) => sum + l.qty * costs[costKey(l.itemId, l.modelId)]!, 0);
    const day = dayKey(o.createTime);
    const d = daily.get(day)!;
    d.orders++;
    d.goods += o.income.goods;
    d.net += o.income.net;
    if (cogs === undefined) d.complete = false;
    else {
      d.profit += o.income.net - cogs;
      profit.orders++;
      profit.net += o.income.net;
      profit.cogs += cogs;
      profit.profit += o.income.net - cogs;
    }

    // Phan bo thuc nhan cua don cho tung dong theo ti le thanh tien.
    const lineTotal = lines.reduce((s, l) => s + l.amount, 0);
    for (const l of lines) {
      const key = costKey(l.itemId, l.modelId);
      const p =
        products.get(key) ??
        ({ itemId: l.itemId, modelId: l.modelId, name: l.name, ...(l.modelName ? { modelName: l.modelName } : {}), qty: 0, goods: 0, net: 0 } as Report["products"][number]);
      p.qty += l.qty;
      p.goods += l.amount;
      p.net += lineTotal > 0 ? (o.income.net * l.amount) / lineTotal : o.income.net / lines.length;
      products.set(key, p);
    }

    orders.push({
      sn: o.sn,
      day,
      status: o.status,
      statusName: statusName(o.status),
      final,
      income: o.income,
      lines,
      ...(cogs !== undefined ? { cogs, profit: o.income.net - cogs } : {}),
      missingCost,
    });
  }

  for (const p of products.values()) {
    const cost = costs[costKey(p.itemId, p.modelId)];
    p.net = Math.round(p.net);
    if (cost !== undefined) {
      p.cost = cost;
      p.cogs = cost * p.qty;
      p.profit = p.net - p.cogs;
    }
  }

  const txs = data.wallet.filter((t) => t.time >= start && t.time < end).sort((a, b) => b.time - a.time);
  const latest = [...data.wallet].sort((a, b) => b.time - a.time).find((t) => typeof t.balance === "number");
  const withdrawn = txs.filter((t) => t.amount < 0 && WITHDRAW.test(`${t.type} ${t.title}`)).reduce((s, t) => s - t.amount, 0);

  return {
    from,
    to,
    missingDays: days.filter((d) => !data.syncedDays[d]),
    counts,
    statement,
    cancelledNet,
    profit,
    // Ngay co don thieu gia von thi khong neu lai ngay do (tranh so sai).
    daily: [...daily.values()].map(({ profit: dayProfit, ...d }) => ({ ...d, ...(d.complete ? { profit: dayProfit } : {}) })),
    products: [...products.values()].sort((a, b) => b.net - a.net),
    orders: orders.sort((a, b) => b.sn.localeCompare(a.sn)),
    wallet: {
      ...(latest ? { balance: latest.balance, balanceAt: latest.time } : {}),
      inflow: txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0),
      outflow: txs.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0),
      withdrawn,
      transactions: txs,
    },
    releasedInPeriod: data.released.filter((r) => r.time >= start && r.time < end).reduce((s, r) => s + r.amount, 0),
  };
}

// ---------------------------------------------------------------- dong bo tu Shopee

export interface SyncDeps {
  listOrders(timeFrom: number, timeTo: number, cursor: string): Promise<{ orders: { sn: string; status: string }[]; more: boolean; next: string }>;
  orderDetails(sns: string[]): Promise<{ sn: string; status: string; createTime: number }[]>;
  escrowBatch(sns: string[]): Promise<{ sn: string; income: EscrowIncome }[]>;
  released(dateFrom: string, dateTo: string, cursor: string): Promise<{ items: Released[]; next: string }>;
  wallet(timeFrom: number, timeTo: number, page: number): Promise<{ items: WalletTx[]; more: boolean }>;
  sleep(ms: number): Promise<void>;
  progress(message: string): void;
}

export interface SyncStep {
  name: string;
  ok: boolean;
  message: string;
}

const BATCH = 50;
const PAUSE_MS = 150;

/**
 * Lay so lieu tu Shopee cho ky [from, to] va luu lai. Moi phan (don, tien ve,
 * vi) chay rieng: phan nao Shopee tu choi (vd chua cap quyen) thi bao loi phan
 * do, cac phan khac van lay.
 */
export async function syncFinance(from: string, to: string, deps: SyncDeps, store = financeStore): Promise<SyncStep[]> {
  const steps: SyncStep[] = [];
  const data = await store.read();
  const start = dayStart(from);
  const end = dayStart(to) + 86400 - 1;
  const pause = () => deps.sleep(PAUSE_MS);

  // 1. Don hang theo ngay tao, moi lan hoi toi da 15 ngay.
  let ordersOk = false;
  try {
    const found = new Map<string, string>();
    for (const w of windows(from, to, 15)) {
      let cursor = "";
      for (;;) {
        deps.progress(`Đang lấy danh sách đơn ${w.from} đến ${w.to}...`);
        const page = await deps.listOrders(dayStart(w.from), Math.min(dayStart(w.to) + 86400 - 1, end), cursor);
        for (const o of page.orders) found.set(o.sn, o.status);
        await pause();
        if (!page.more || !page.next) break;
        cursor = page.next;
      }
    }

    // Don moi: can ngay tao.
    const fresh = [...found.keys()].filter((sn) => !data.orders[sn]?.createTime);
    for (let i = 0; i < fresh.length; i += BATCH) {
      deps.progress(`Đang lấy ngày tạo đơn ${Math.min(i + BATCH, fresh.length)}/${fresh.length}...`);
      for (const d of await deps.orderDetails(fresh.slice(i, i + BATCH))) {
        data.orders[d.sn] = { ...data.orders[d.sn], sn: d.sn, status: d.status, createTime: d.createTime };
      }
      await pause();
    }
    for (const [sn, status] of found) data.orders[sn] = { ...data.orders[sn], sn, status };

    // Tien tung don: lay lai khi don chua chot hoac vua doi trang thai.
    const needIncome = [...found.entries()]
      .filter(([sn, status]) => {
        if (UNPAID.has(status)) return false;
        const o = data.orders[sn]!;
        return !o.income || o.incomeStatus !== status || !FINAL.has(status);
      })
      .map(([sn]) => sn);
    for (let i = 0; i < needIncome.length; i += BATCH) {
      deps.progress(`Đang lấy tiền từng đơn ${Math.min(i + BATCH, needIncome.length)}/${needIncome.length}...`);
      for (const e of await deps.escrowBatch(needIncome.slice(i, i + BATCH))) {
        const o = data.orders[e.sn];
        if (!o) continue;
        o.income = normalizeIncome(e.income);
        o.lines = orderLines(e.income);
        o.incomeStatus = o.status;
        o.incomeAt = Date.now();
      }
      await pause();
    }
    ordersOk = true;
    steps.push({ name: "Đơn hàng và tiền từng đơn", ok: true, message: `${found.size} đơn, cập nhật tiền ${needIncome.length} đơn.` });
  } catch (error) {
    steps.push({ name: "Đơn hàng và tiền từng đơn", ok: false, message: (error as Error).message });
  }

  // 2. Tien da ve theo tung don, moi lan hoi toi da 14 ngay.
  try {
    const got: Released[] = [];
    for (const w of windows(from, to, 14)) {
      let cursor = "";
      for (;;) {
        deps.progress(`Đang lấy tiền đã về ${w.from} đến ${w.to}...`);
        const page = await deps.released(w.from, w.to, cursor);
        got.push(...page.items);
        await pause();
        // Cursor tra lai y nhu vua hoi thi hoi tiep cung chi lap lai mai trang do.
        if (!page.next || page.next === cursor) break;
        cursor = page.next;
      }
    }
    data.released = [...data.released.filter((r) => r.time < start || r.time > end), ...got];
    steps.push({ name: "Tiền đã về", ok: true, message: `${got.length} khoản.` });
  } catch (error) {
    steps.push({ name: "Tiền đã về", ok: false, message: (error as Error).message });
  }

  // 3. Giao dich vi, moi lan hoi toi da 15 ngay.
  try {
    const got: WalletTx[] = [];
    for (const w of windows(from, to, 15)) {
      for (let page = 0; ; page++) {
        deps.progress(`Đang lấy giao dịch ví ${w.from} đến ${w.to}...`);
        const r = await deps.wallet(dayStart(w.from), Math.min(dayStart(w.to) + 86400 - 1, end), page);
        got.push(...r.items);
        await pause();
        if (!r.more) break;
      }
    }
    data.wallet = [...data.wallet.filter((t) => t.time < start || t.time > end), ...got];
    steps.push({ name: "Ví Shopee", ok: true, message: `${got.length} giao dịch.` });
  } catch (error) {
    steps.push({ name: "Ví Shopee", ok: false, message: (error as Error).message });
  }

  if (ordersOk) for (const d of daysBetween(from, to)) data.syncedDays[d] = Date.now();
  await store.update((d) => {
    d.orders = data.orders;
    d.released = data.released;
    d.wallet = data.wallet;
    d.syncedDays = data.syncedDays;
  });
  return steps;
}
