/**
 * Luu token cua shop vao tep, co khoa chong ghi dong thoi.
 *
 * Vi sao phai lam ky den vay:
 * Shopee cap refresh_token chi dung duoc DUNG MOT LAN. Moi lan gia han,
 * Shopee tra ve mot refresh_token moi va huy cai cu ngay lap tuc. Neu hai
 * tien trinh cung gia han mot luc, mot ben thang va mot ben thua; ban thua
 * co the ghi de mat token vua lay duoc. Hau qua: mat ket noi voi shop, phai
 * vao Shopee bam uy quyen lai tu dau.
 *
 * Hai lop bao ve o day:
 * 1. Khoa lien tien trinh (tep .lock tao bang co 'wx', thao tac nguyen tu).
 * 2. Ghi nguyen tu (ghi ra tep tam roi doi ten) de khong bao gio con lai
 *    mot tep token bi cat doi khi may tat dot ngot.
 */
import fs from "node:fs/promises";
import path from "node:path";
import type { AccessToken } from "@congminh1254/shopee-sdk/schemas";
import type { TokenStorage } from "@congminh1254/shopee-sdk/storage";

/** Token kem moc thoi gian de theo doi han 30 ngay cua refresh_token. */
export interface StoredToken extends AccessToken {
  /** Thoi diem lan cuoi lay hoac gia han token (milli giay). */
  obtained_at?: number;
}

const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 15_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Chay `fn` trong khi giu khoa tren `lockPath`.
 *
 * Khoa cu hon LOCK_STALE_MS bi coi la rac (tien trinh truoc chet giua chung)
 * va se bi don di, neu khong mot lan tat may dot ngot se lam ket he thong
 * vinh vien.
 */
export async function withLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;

  // Lan dau chay, thu muc data/ chua ton tai. Thieu buoc nay thi tao tep khoa
  // bao ENOENT va token Shopee vua cap bi mat ngay luc uy quyen.
  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  for (;;) {
    try {
      const handle = await fs.open(lockPath, "wx");
      try {
        await handle.writeFile(String(process.pid));
      } finally {
        await handle.close();
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

      const age = await lockAge(lockPath);
      if (age !== null && age > LOCK_STALE_MS) {
        await fs.rm(lockPath, { force: true });
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `Không lấy được khóa ${lockPath} sau ${LOCK_TIMEOUT_MS} mili giây. ` +
            "Có thể một tiến trình khác đang treo. Kiểm tra rồi xóa tệp khóa nếu cần.",
        );
      }
      await sleep(LOCK_RETRY_MS);
    }
  }

  try {
    return await fn();
  } finally {
    await fs.rm(lockPath, { force: true });
  }
}

async function lockAge(lockPath: string): Promise<number | null> {
  try {
    const stat = await fs.stat(lockPath);
    return Date.now() - stat.mtimeMs;
  } catch {
    // Khoa vua duoc tha ra giua chung - coi nhu chua cu.
    return null;
  }
}

/** Luu token vao tep, an toan khi nhieu tien trinh cung chay. */
export class FileTokenStorage implements TokenStorage {
  readonly filePath: string;
  readonly lockPath: string;

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
    this.lockPath = `${this.filePath}.lock`;
  }

  async store(token: StoredToken): Promise<void> {
    await withLock(this.lockPath, () => this.writeUnlocked(token));
  }

  /**
   * Ghi khi DA giu khoa san. Dung trong quy trinh gia han de khong tu khoa
   * chinh minh (khoa o day khong long nhau duoc).
   */
  async writeUnlocked(token: StoredToken): Promise<void> {
    // Token vua lay ve tu Shopee khong co obtained_at nen duoc dong dau bay gio.
    // Neu nguoi goi da tu dat obtained_at thi giu nguyen, vi ho biet ro hon.
    const stored: StoredToken = { ...token, obtained_at: token.obtained_at ?? Date.now() };
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(stored, null, 2), { mode: 0o600 });
    await fs.rename(tempPath, this.filePath);
  }

  async get(): Promise<StoredToken | null> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as StoredToken;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      if (error instanceof SyntaxError) {
        throw new Error(
          `Tệp token ${this.filePath} bị hỏng, không đọc được. ` +
            "Xóa tệp này rồi vào /auth/start để ủy quyền lại.",
        );
      }
      throw error;
    }
  }

  async clear(): Promise<void> {
    await withLock(this.lockPath, async () => {
      await fs.rm(this.filePath, { force: true });
    });
  }
}
