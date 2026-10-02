/**
 * Tap lenh chay mot lan: bo giao dich vi (va tien da ve) bi luu trung trong tep
 * tai chinh lay tu truoc ban sua page_no. Chi doc va ghi tep tren may, khong goi
 * Shopee, khong doc .env hay tep token.
 *
 *   npx tsx scripts/lam-sach-vi.ts data/finance-global-<partner_id>.json --chay-thu
 *   npx tsx scripts/lam-sach-vi.ts data/finance-global-<partner_id>.json --so-dong-bo=<so>
 *
 *   --chay-thu      chi in so lieu truoc va sau, khong sao luu, khong ghi.
 *   --so-dong-bo=N  so dong du kien bo (lay tu lan chay thu); lech thi dung, khong ghi.
 *
 * Tat may chu truoc khi chay de khong co lan lay so lieu nao dang do.
 */
import { cleanFinanceFile, type MonthTotals } from "../src/financeCleanup.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--chay-thu");
const expectArg = args.find((a) => a.startsWith("--so-dong-bo="));
const expectRemoved = expectArg ? Number(expectArg.split("=")[1]) : undefined;

if (!file || (expectRemoved !== undefined && !Number.isInteger(expectRemoved))) {
  console.error("Cách dùng: npx tsx scripts/lam-sach-vi.ts <tệp finance-...json> [--chay-thu] [--so-dong-bo=N]");
  process.exit(1);
}

const vnd = (n: number) => Math.round(n).toLocaleString("vi-VN");
const cell = (a: number, b: number) => (a === b ? vnd(a) : `${vnd(a)} → ${vnd(b)}`);

try {
  const r = await cleanFinanceFile(file, { dryRun, ...(expectRemoved !== undefined ? { expectRemoved } : {}) });
  console.log(`Tệp: ${file}`);
  console.log(`Ví: ${r.before.wallet} → ${r.after.wallet} dòng. Tiền đã về: ${r.before.released} → ${r.after.released} dòng.`);
  console.log(`Bỏ ${r.removed} dòng trùng.`);
  for (const [type, count] of Object.entries(r.removedByType).sort((a, b) => b[1] - a[1])) console.log(`  ${type}: ${count}`);

  const after = new Map(r.months.after.map((m) => [m.month, m]));
  const cols: [string, (m: MonthTotals) => number][] = [
    ["Số GD", (m) => m.count],
    ["Tiền vào", (m) => m.inflow],
    ["Tiền ra", (m) => m.outflow],
    ["Nạp quảng cáo", (m) => m.ads],
    ["Phí vận chuyển trừ ví", (m) => m.freeship],
    ["Rút tiền", (m) => m.withdrawn],
  ];
  console.log(`\nTheo tháng (trước → sau):\nTháng    | ${cols.map(([name]) => name).join(" | ")}`);
  for (const b of r.months.before) {
    const a = after.get(b.month)!;
    console.log(`${b.month}  | ${cols.map(([, get]) => cell(get(b), get(a))).join(" | ")}`);
  }

  if (r.written) console.log(`\nĐã sao lưu tệp gốc: ${r.backup}\nĐã ghi tệp sạch.`);
  else if (r.removed === 0) console.log("\nKhông có dòng trùng, không ghi gì.");
  else console.log("\nChạy thử: chưa sao lưu, chưa ghi.");
} catch (error) {
  console.error(`Lỗi: ${(error as Error).message}`);
  process.exit(1);
}
