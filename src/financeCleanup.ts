/**
 * Lam sach tep tai chinh da luu: bo giao dich vi va tien da ve trung y het, do
 * ban cu lay trang dau cua moi cua so hai lan (xem syncFinance).
 *
 * Chi doc va ghi tep tren may: khong goi Shopee, khong doc cau hinh (.env).
 * Truoc khi ghi, sao tep goc sang <ten>.backup-YYYYMMDD-HHMMSS.json va khong
 * bao gio ghi de ban sao da co. Dung chung khoa voi kho du lieu (jsonStore)
 * nen khong ghi chong len may chu dang luu.
 */
import fs from "node:fs/promises";
import { uniqueRecords } from "./dedupe.js";
import { withLock } from "./tokenStore.js";
import type { FinanceData, WalletTx } from "./finance.js";

/** Tong tien vi mot thang. Cac khoan tru ghi so duong. */
export interface MonthTotals {
  /** YYYY-MM gio Ha Noi. */
  month: string;
  count: number;
  inflow: number;
  outflow: number;
  /** Nap tien quang cao (SPM_DEDUCT). */
  ads: number;
  /** Phi van chuyen don huy, giao that bai tru vao vi (FSF_COST_PASSING_DEDUCT). */
  freeship: number;
  /** Rut ve ngan hang (WITHDRAWAL_CREATED). */
  withdrawn: number;
}

export function walletByMonth(wallet: readonly WalletTx[]): MonthTotals[] {
  const months = new Map<string, MonthTotals>();
  for (const t of wallet) {
    const month = new Date((t.time + 7 * 3600) * 1000).toISOString().slice(0, 7);
    const m = months.get(month) ?? { month, count: 0, inflow: 0, outflow: 0, ads: 0, freeship: 0, withdrawn: 0 };
    m.count++;
    if (t.amount > 0) m.inflow += t.amount;
    else m.outflow -= t.amount;
    if (t.type === "SPM_DEDUCT") m.ads -= t.amount;
    if (t.type === "FSF_COST_PASSING_DEDUCT") m.freeship -= t.amount;
    if (t.type === "WITHDRAWAL_CREATED") m.withdrawn -= t.amount;
    months.set(month, m);
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export interface CleanResult {
  before: { wallet: number; released: number };
  after: { wallet: number; released: number };
  /** So ban thua cua vi theo loai giao dich. */
  removedByType: Record<string, number>;
  removed: number;
  months: { before: MonthTotals[]; after: MonthTotals[] };
  /** Tep sao luu, chi co khi da ghi. */
  backup?: string;
  written: boolean;
}

export interface CleanOptions {
  /** Chi tinh va bao, khong sao luu, khong ghi. */
  dryRun?: boolean;
  /** So dong du kien bo (tu lan chay thu). Lech thi dung, khong ghi gi. */
  expectRemoved?: number;
  /** Gio dat ten tep sao luu, mac dinh la bay gio. */
  now?: Date;
}

const pad = (n: number) => String(n).padStart(2, "0");
const stamp = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

export async function cleanFinanceFile(file: string, options: CleanOptions = {}): Promise<CleanResult> {
  return withLock(`${file}.lock`, async () => {
    const data = JSON.parse(await fs.readFile(file, "utf8")) as FinanceData;
    const wallet = data.wallet ?? [];
    const released = data.released ?? [];
    const cleanWallet = uniqueRecords(wallet);
    const cleanReleased = uniqueRecords(released);

    const removedByType: Record<string, number> = {};
    const firstSeen = new Set(cleanWallet);
    for (const t of wallet) if (!firstSeen.has(t)) removedByType[t.type] = (removedByType[t.type] ?? 0) + 1;

    const result: CleanResult = {
      before: { wallet: wallet.length, released: released.length },
      after: { wallet: cleanWallet.length, released: cleanReleased.length },
      removedByType,
      removed: wallet.length - cleanWallet.length + released.length - cleanReleased.length,
      months: { before: walletByMonth(wallet), after: walletByMonth(cleanWallet) },
      written: false,
    };
    if (result.removed === 0 || options.dryRun) return result;
    if (options.expectRemoved !== undefined && result.removed !== options.expectRemoved) {
      throw new Error(`Dự kiến bỏ ${options.expectRemoved} dòng nhưng tính ra ${result.removed}. Không ghi gì, chạy thử lại để xem.`);
    }

    // COPYFILE_EXCL: ban sao cung ten da co thi bao loi, khong ghi de.
    const backup = `${file.replace(/\.json$/, "")}.backup-${stamp(options.now ?? new Date())}.json`;
    await fs.copyFile(file, backup, fs.constants.COPYFILE_EXCL);
    await fs.chmod(backup, 0o600);

    data.wallet = cleanWallet;
    data.released = cleanReleased;
    const temp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(data), { mode: 0o600 });
    await fs.rename(temp, file);
    return { ...result, backup, written: true };
  });
}
