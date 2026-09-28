/**
 * Kiem thu viec chon tep cau hinh: thu nghiem dung .env, shop that dung
 * .env.live qua bien ENV_FILE. Chay lenh cli trong tien trinh rieng de moi
 * lan nap cau hinh doc lap.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shopee-config-test-"));
after(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

function runStatus(env: Record<string, string>): string {
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("SHOPEE_") && k !== "TOKEN_FILE"));
  return execFileSync(process.execPath, ["--import", "tsx", "src/cli.ts", "status"], {
    env: { ...clean, ...env },
    encoding: "utf8",
    stdio: "pipe",
  });
}

test("ENV_FILE tro toi tep cau hinh shop that thi dung dung vung GLOBAL va tep token rieng", async () => {
  const live = path.join(tmpRoot, ".env.live");
  await fs.writeFile(
    live,
    [
      "SHOPEE_PARTNER_ID=2000002",
      "SHOPEE_PARTNER_KEY=khoa-that-gia-lap",
      "SHOPEE_REGION=GLOBAL",
      "SHOPEE_REDIRECT_URI=http://localtest.me:3000/auth/callback",
      `TOKEN_FILE=${path.join(tmpRoot, "token-live.json")}`,
      "TOKEN_KEEPALIVE_MINUTES=0",
    ].join("\n"),
  );

  const output = runStatus({ ENV_FILE: live });
  assert.match(output, new RegExp(`Tep cau hinh:\\s+${live.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(output, /Vung:\s+GLOBAL/);
  assert.match(output, /Da ket noi:\s+chua/, "tep token shop that rieng, chua co gi");
  assert.doesNotMatch(output, /chay 'npm start'/, "che do shop that khong duoc nhac lenh cua moi truong thu nghiem");
});

test("thieu khoa trong tep cau hinh thi bao ro ten tep", async () => {
  const broken = path.join(tmpRoot, ".env.thieu");
  await fs.writeFile(broken, "SHOPEE_PARTNER_ID=2000002\nSHOPEE_REDIRECT_URI=http://localtest.me:3000/auth/callback\n");

  let output = "";
  try {
    runStatus({ ENV_FILE: broken });
  } catch (error) {
    const e = error as { stdout: string; stderr: string };
    output = e.stdout + e.stderr;
  }
  assert.match(output, /Thieu bien moi truong SHOPEE_PARTNER_KEY trong tep .*\.env\.thieu/);
});
