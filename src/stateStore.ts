/**
 * Luu cai dat cua cac tinh nang (danh sach day san pham, mau tra loi danh
 * gia...) vao mot tep JSON, tach rieng theo moi truong va theo ung dung.
 *
 * Tep nam canh tep token: data/state-<vung>-<partner_id>.json, nen cai dat
 * cua shop thu nghiem va shop that khong bao gio lan nhau. Ghi co khoa va
 * ghi nguyen tu, giong tep token.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { withLock } from "./tokenStore.js";

export interface BoostState {
  /** Tu dong day theo lich hay khong. */
  enabled: boolean;
  /** Danh sach san pham xoay vong, theo thu tu nguoi dung chon. */
  itemIds: number[];
  /** Lan cuoi moi san pham duoc day (mili giay), de xoay vong cong bang. */
  lastBoosted: Record<string, number>;
  lastRunAt?: number;
  lastResult?: string;
}

export interface AppState {
  boost: BoostState;
}

const DEFAULT_STATE: AppState = {
  boost: { enabled: false, itemIds: [], lastBoosted: {} },
};

export const stateFile = path.join(
  path.dirname(config.tokenFile),
  `state-${config.region.toLowerCase()}-${config.partnerId}.json`,
);

function withDefaults(raw: Partial<AppState>): AppState {
  return {
    ...DEFAULT_STATE,
    ...raw,
    boost: { ...DEFAULT_STATE.boost, ...raw.boost },
  };
}

export async function readState(): Promise<AppState> {
  try {
    return withDefaults(JSON.parse(await fs.readFile(stateFile, "utf8")) as Partial<AppState>);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return withDefaults({});
    if (error instanceof SyntaxError) {
      throw new Error(`Tệp cài đặt ${stateFile} bị hỏng. Xóa tệp này để dùng cài đặt mặc định.`);
    }
    throw error;
  }
}

/** Doc, sua va ghi lai trong cung mot khoa de hai thao tac khong de len nhau. */
export async function updateState(mutate: (state: AppState) => void): Promise<AppState> {
  return withLock(`${stateFile}.lock`, async () => {
    const state = await readState();
    mutate(state);
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    const temp = `${stateFile}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
    await fs.rename(temp, stateFile);
    return state;
  });
}
