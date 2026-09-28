/**
 * Bien loi cua SDK thanh cau de doc.
 *
 * SDK nem ShopeeApiError, chi tiet cua Shopee nam trong truong `data`
 * (error, message). In ca hai de biet Shopee tu choi vi sao.
 */
export function describeError(error: unknown): string {
  const e = error as { message?: string; data?: { error?: string; message?: string } };
  const api = e.data?.error ? ` [${e.data.error}: ${e.data.message ?? ""}]` : "";
  return `${e.message ?? String(error)}${api}`;
}
