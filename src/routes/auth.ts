/**
 * Duong dan uy quyen shop.
 *
 * Luong chay:
 *   /auth/start     -> chuyen huong sang Shopee de nguoi ban bam dong y
 *   /auth/callback  -> Shopee goi nguoc ve kem code + shop_id
 *                      doi code lay access_token + refresh_token roi luu lai
 */
import crypto from "node:crypto";
import { Router } from "express";
import { config } from "../config.js";
import { sdk, tokenStorage, tokenStatus } from "../shopee.js";

/**
 * Cac ma `state` dang cho Shopee tra ve.
 *
 * Muc dich: chan tan cong gia mao yeu cau (CSRF). Neu khong kiem tra, ke khac
 * co the du nguoi ban bam vao mot duong dan callback gia de noi shop cua ho
 * vao he thong nay.
 */
const pendingStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;

function issueState(): string {
  const state = crypto.randomBytes(16).toString("hex");
  pendingStates.set(state, Date.now() + STATE_TTL_MS);
  return state;
}

function consumeState(state: unknown): boolean {
  if (typeof state !== "string") return false;
  const expiresAt = pendingStates.get(state);
  pendingStates.delete(state);
  return expiresAt !== undefined && expiresAt > Date.now();
}

/** Don cac ma state qua han de Map khong phinh mai. */
function pruneStates(): void {
  const now = Date.now();
  for (const [state, expiresAt] of pendingStates) {
    if (expiresAt <= now) pendingStates.delete(state);
  }
}

export const authRouter: Router = Router();

authRouter.get("/start", (_req, res) => {
  pruneStates();
  const url = sdk.getAuthorizationUrl(config.redirectUri, {
    auth_type: "seller",
    state: issueState(),
  });
  res.redirect(url);
});

authRouter.get("/callback", async (req, res) => {
  const { code, shop_id: shopIdRaw, state } = req.query;

  if (!consumeState(state)) {
    res
      .status(400)
      .send(
        "Ma state khong hop le hoac da qua han. Hay bat dau lai tu /auth/start " +
          "thay vi mo truc tiep duong dan callback.",
      );
    return;
  }

  if (typeof code !== "string" || code === "") {
    res.status(400).send("Shopee khong tra ve code. Thu uy quyen lai tu /auth/start.");
    return;
  }

  const shopId = typeof shopIdRaw === "string" ? Number(shopIdRaw) : undefined;
  if (shopId !== undefined && !Number.isInteger(shopId)) {
    res.status(400).send(`shop_id khong hop le: ${String(shopIdRaw)}`);
    return;
  }

  try {
    const token = await sdk.authenticateWithCode(code, shopId);
    if (!token || token.error) {
      res
        .status(502)
        .send(
          `Doi code lay token that bai: ${token?.error ?? "khong ro"} - ${token?.message ?? ""}. ` +
            "Kiem tra lai SHOPEE_REDIRECT_URI da khai dung trong Console cua Shopee chua.",
        );
      return;
    }
    res.redirect("/?connected=1");
  } catch (error) {
    res.status(502).send(`Loi khi doi code lay token: ${(error as Error).message}`);
  }
});

authRouter.get("/status", async (_req, res) => {
  res.json(await tokenStatus());
});

/** Ngat ket noi: xoa token da luu. Shop van con tren Shopee, chi la het uy quyen o day. */
authRouter.post("/disconnect", async (_req, res) => {
  await tokenStorage.clear();
  res.json({ ok: true });
});
