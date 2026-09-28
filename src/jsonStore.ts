/**
 * Tep JSON luu tren may, tach theo moi truong: data/<ten>-<vung>-<partner_id>.json.
 * Ghi co khoa va ghi nguyen tu (ghi tep tam roi doi ten), giong tep token.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { withLock } from "./tokenStore.js";

export interface JsonStore<T> {
  file: string;
  read(): Promise<T>;
  update(mutate: (data: T) => void | Promise<void>): Promise<T>;
}

export function jsonStore<T>(name: string, defaults: () => T): JsonStore<T> {
  const file = path.join(path.dirname(config.tokenFile), `${name}-${config.region.toLowerCase()}-${config.partnerId}.json`);

  async function read(): Promise<T> {
    try {
      return { ...defaults(), ...(JSON.parse(await fs.readFile(file, "utf8")) as Partial<T>) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return defaults();
      if (error instanceof SyntaxError) throw new Error(`Tệp ${file} bị hỏng. Đổi tên hoặc xóa tệp này rồi thử lại.`);
      throw error;
    }
  }

  async function update(mutate: (data: T) => void | Promise<void>): Promise<T> {
    return withLock(`${file}.lock`, async () => {
      const data = await read();
      await mutate(data);
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(temp, JSON.stringify(data), { mode: 0o600 });
      await fs.rename(temp, file);
      return data;
    });
  }

  return { file, read, update };
}
