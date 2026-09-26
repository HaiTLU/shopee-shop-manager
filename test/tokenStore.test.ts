import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { FileTokenStorage, withLock } from "../src/tokenStore.js";

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "shopee-token-test-"));
let counter = 0;

function newStore(): FileTokenStorage {
  counter += 1;
  return new FileTokenStorage(path.join(tmpRoot, `token-${counter}.json`));
}

const sampleToken = {
  access_token: "acc-1",
  refresh_token: "ref-1",
  expire_in: 14_400,
  request_id: "req-1",
  error: "",
  message: "",
  shop_id: 12345,
};

after(async () => {
  await fs.rm(tmpRoot, { recursive: true, force: true });
});

test("get tra ve null khi chua co tep token", async () => {
  const store = newStore();
  assert.equal(await store.get(), null);
});

test("store roi get tra lai dung token va co dong dau thoi gian", async () => {
  const store = newStore();
  await store.store(sampleToken);

  const loaded = await store.get();
  assert.equal(loaded?.access_token, "acc-1");
  assert.equal(loaded?.shop_id, 12345);
  assert.ok(typeof loaded?.obtained_at === "number", "phai ghi obtained_at de theo doi han 30 ngay");
  assert.ok(loaded.obtained_at <= Date.now());
});

test("tep token chi cho chu so huu doc, khong lo ra ngoai", async () => {
  const store = newStore();
  await store.store(sampleToken);

  const stat = await fs.stat(store.filePath);
  assert.equal(stat.mode & 0o077, 0, "token khong duoc cho nhom hoac nguoi khac doc");
});

test("clear xoa tep token", async () => {
  const store = newStore();
  await store.store(sampleToken);
  await store.clear();
  assert.equal(await store.get(), null);
});

test("tep token hong thi bao loi ro rang thay vi vo tinh nuot", async () => {
  const store = newStore();
  await fs.mkdir(path.dirname(store.filePath), { recursive: true });
  await fs.writeFile(store.filePath, "{ day khong phai json");

  await assert.rejects(() => store.get(), /bi hong/);
});

test("ghi nhieu lan cung luc khong bao gio de lai tep do dang", async () => {
  const store = newStore();

  // 30 lan ghi dong thoi. Neu ghi khong nguyen tu, mot lan doc xen giua se
  // gap tep bi cat doi va JSON.parse se vo.
  await Promise.all(
    Array.from({ length: 30 }, (_, i) =>
      store.store({ ...sampleToken, access_token: `acc-${i}`, refresh_token: `ref-${i}` }),
    ),
  );

  const loaded = await store.get();
  assert.ok(loaded?.access_token?.startsWith("acc-"), "tep phai luon la JSON hop le");
});

test("khoa chan hai viec chay chong len nhau", async () => {
  const lockPath = path.join(tmpRoot, "mutual.lock");
  const order: string[] = [];
  let concurrent = 0;
  let maxConcurrent = 0;

  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      withLock(lockPath, async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        order.push(`vao-${i}`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push(`ra-${i}`);
        concurrent -= 1;
      }),
    ),
  );

  assert.equal(maxConcurrent, 1, "chi duoc mot viec chay tai mot thoi diem");
  assert.equal(order.length, 16);
  // Moi cap vao/ra phai lien nhau, khong bi xen ke.
  for (let i = 0; i < order.length; i += 2) {
    const id = order[i]!.split("-")[1];
    assert.equal(order[i + 1], `ra-${id}`, "khong duoc xen ke giua hai viec");
  }
});

test("khoa duoc tha ra ngay ca khi cong viec nem loi", async () => {
  const lockPath = path.join(tmpRoot, "throwing.lock");

  await assert.rejects(() =>
    withLock(lockPath, async () => {
      throw new Error("loi co y");
    }),
  );

  // Neu khoa khong duoc tha, lan goi sau se treo cho den khi het gio.
  let ran = false;
  await withLock(lockPath, async () => {
    ran = true;
  });
  assert.ok(ran, "khoa phai duoc tha sau khi cong viec nem loi");
});

test("khoa cu bi bo lai do may tat dot ngot se duoc don di", async () => {
  const lockPath = path.join(tmpRoot, "stale.lock");
  await fs.writeFile(lockPath, "999999");

  // Gia lam khoa da nam do 60 giay - qua nguong 30 giay coi la rac.
  const old = new Date(Date.now() - 60_000);
  await fs.utimes(lockPath, old, old);

  let ran = false;
  await withLock(lockPath, async () => {
    ran = true;
  });
  assert.ok(ran, "khoa qua cu phai bi don, neu khong he thong ket vinh vien");
});

test("lan dau luu token khi thu muc chua ton tai thi tu tao thu muc", async () => {
  // Tai hien loi that tren may PM: data/ chua co, khoa duoc tao TRUOC khi tao
  // thu muc nen bao ENOENT va token Shopee vua cap bi mat.
  const store = new FileTokenStorage(path.join(tmpRoot, `chua-co-${Date.now()}`, "data", "token.json"));
  await store.store(sampleToken);
  assert.equal((await store.get())?.access_token, "acc-1");
});
