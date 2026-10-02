/**
 * Kiem thu lam sach tep tai chinh cu: sao luu truoc khi ghi, khong ghi de ban
 * sao da co, chi dong vao vi va tien da ve, chay lai lan hai thi khong lam gi.
 * Chi dung tep gia trong thu muc tam, so lieu gia.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { cleanFinanceFile, walletByMonth } from "../src/financeCleanup.js";
import type { FinanceData, WalletTx } from "../src/finance.js";

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shopee-cleanup-test-"));
after(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

const t = (iso: string) => Date.parse(iso) / 1000;

/** Tep kieu that: 150 giao dich, 100 dong moi nhat bi luu hai lan lien nhau, mot khoan tien ve trung. */
function staleData(): FinanceData {
  let balance = 5_000_000;
  const txs: WalletTx[] = Array.from({ length: 150 }, (_, i): WalletTx => {
    const ads = i % 4 === 0;
    const amount = ads ? -216_000 : 120_000 + i;
    balance += amount;
    return { time: t("2026-08-01T01:00:00Z") + i * 5000, type: ads ? "SPM_DEDUCT" : "ESCROW_VERIFIED_ADD", title: ads ? "Nạp tiền quảng cáo" : "Doanh thu đơn hàng", amount, balance };
  }).reverse();
  const paid = { sn: "A1", amount: 99_000, time: t("2026-08-03T02:00:00Z") };
  return {
    orders: { A1: { sn: "A1", status: "COMPLETED", createTime: t("2026-08-01T02:00:00Z") } },
    wallet: [...txs.slice(0, 100), ...txs],
    released: [paid, paid],
    syncedDays: { "2026-08-01": 1 },
  };
}

async function newFile(name: string): Promise<{ file: string; original: string }> {
  const dir = await fs.mkdtemp(path.join(tmpRoot, `${name}-`));
  const file = path.join(dir, "finance-global-1000001.json");
  const original = JSON.stringify(staleData());
  await fs.writeFile(file, original, { mode: 0o600 });
  return { file, original };
}

const backupsIn = async (file: string) => (await fs.readdir(path.dirname(file))).filter((f) => f.includes(".backup-"));

test("chay thu: bao so dong trung theo loai, khong sao luu, khong ghi", async () => {
  const { file, original } = await newFile("thu");
  const r = await cleanFinanceFile(file, { dryRun: true });

  assert.deepEqual([r.before.wallet, r.after.wallet, r.before.released, r.after.released], [250, 150, 2, 1]);
  assert.equal(r.removed, 101);
  // 100 dong moi nhat: i = 50..149, trong do i chia het cho 4 la nap quang cao.
  assert.deepEqual(r.removedByType, { ESCROW_VERIFIED_ADD: 75, SPM_DEDUCT: 25 });
  assert.equal(r.written, false);
  assert.equal(await fs.readFile(file, "utf8"), original, "tep khong doi");
  assert.deepEqual(await backupsIn(file), []);
});

test("ghi that: sao luu nguyen ban truoc, chi bo dong trung, giu don va ngay da lay; chay lai thi khong lam gi", async () => {
  const { file, original } = await newFile("that");
  const now = new Date(2026, 8, 29, 18, 5, 9);
  const r = await cleanFinanceFile(file, { expectRemoved: 101, now });

  assert.equal(r.written, true);
  assert.equal(path.basename(r.backup!), "finance-global-1000001.backup-20260929-180509.json");
  assert.equal(await fs.readFile(r.backup!, "utf8"), original, "ban sao la tep goc nguyen ven");
  assert.equal((await fs.stat(r.backup!)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);

  const before = JSON.parse(original) as FinanceData;
  const saved = JSON.parse(await fs.readFile(file, "utf8")) as FinanceData;
  assert.equal(saved.wallet.length, 150);
  assert.equal(new Set(saved.wallet.map((x) => JSON.stringify(x))).size, 150);
  assert.deepEqual(saved.wallet, before.wallet.slice(100), "giu dung thu tu, bo ban lap dau");
  assert.deepEqual(saved.released, [before.released[0]]);
  assert.deepEqual(saved.orders, before.orders);
  assert.deepEqual(saved.syncedDays, before.syncedDays);

  const again = await cleanFinanceFile(file, { now: new Date(2026, 8, 29, 18, 30, 0) });
  assert.equal(again.removed, 0);
  assert.equal(again.written, false);
  assert.equal((await backupsIn(file)).length, 1, "lan hai khong tao them ban sao");
});

test("so dong du kien lech thi dung, khong sao luu, khong ghi", async () => {
  const { file, original } = await newFile("lech");
  await assert.rejects(() => cleanFinanceFile(file, { expectRemoved: 2200 }), /Dự kiến bỏ 2200 dòng nhưng tính ra 101/);
  assert.equal(await fs.readFile(file, "utf8"), original);
  assert.deepEqual(await backupsIn(file), []);
});

test("khong bao gio ghi de ban sao luu da co", async () => {
  const { file, original } = await newFile("trungten");
  const now = new Date(2026, 8, 29, 15, 22, 1);
  const existing = path.join(path.dirname(file), "finance-global-1000001.backup-20260929-152201.json");
  await fs.writeFile(existing, "ban sao cu");

  await assert.rejects(() => cleanFinanceFile(file, { now }), { code: "EEXIST" });
  assert.equal(await fs.readFile(existing, "utf8"), "ban sao cu");
  assert.equal(await fs.readFile(file, "utf8"), original, "khong sao luu duoc thi khong ghi");
});

test("tong vi theo thang tinh theo gio Ha Noi", () => {
  const rows = walletByMonth([
    { time: t("2026-08-31T17:30:00Z"), type: "SPM_DEDUCT", title: "", amount: -100, balance: 0 }, // 00:30 ngay 1/9 o Ha Noi
    { time: t("2026-08-31T16:30:00Z"), type: "ESCROW_VERIFIED_ADD", title: "", amount: 300, balance: 0 },
    { time: t("2026-08-31T16:40:00Z"), type: "WITHDRAWAL_CREATED", title: "", amount: -200, balance: 0 },
    { time: t("2026-08-31T16:50:00Z"), type: "FSF_COST_PASSING_DEDUCT", title: "", amount: -20, balance: 0 },
  ]);
  assert.deepEqual(rows, [
    { month: "2026-08", count: 3, inflow: 300, outflow: 220, ads: 0, freeship: 20, withdrawn: 200 },
    { month: "2026-09", count: 1, inflow: 0, outflow: 100, ads: 100, freeship: 0, withdrawn: 0 },
  ]);
});
