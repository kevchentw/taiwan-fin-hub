export type InvoiceItem = {
  amount: number;
  id: string;
  invDate: string;
  invNum: string;
  sellerName: string;
};

export type InvoiceDetailItem = {
  amount: string;
  description: string;
  id: string;
  quantity: string;
  unitPrice: string;
};

export function formatDate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

export function currentPeriodIndex(date = new Date()) {
  return date.getFullYear() * 6 + Math.floor(date.getMonth() / 2);
}

export function periodFromIndex(index: number, now = new Date()) {
  const year = Math.floor(index / 6);
  const pair = index % 6;
  const startMonthIndex = pair * 2;
  const start = new Date(year, startMonthIndex, 1);
  const end = new Date(year, startMonthIndex + 2, 0);
  const boundedEnd = end.getTime() > now.getTime() ? now : end;

  return {
    endDate: formatDate(boundedEnd),
    label: `${year}/${String(startMonthIndex + 1).padStart(2, "0")}-${String(
      startMonthIndex + 2
    ).padStart(2, "0")}`,
    startDate: formatDate(start)
  };
}

export function getInvoices(result: unknown): InvoiceItem[] {
  const response = result as { result?: unknown };
  const rows = Array.isArray(response?.result) ? response.result : [];

  return rows
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, index) => {
      const invNum = typeof item.invNum === "string" ? item.invNum : "";
      const invDate = typeof item.invDate === "string" ? item.invDate : "";
      const sellerName = typeof item.sellerName === "string" ? item.sellerName : "未知商店";
      const amount = typeof item.amount === "number" ? item.amount : Number(item.amount ?? 0);

      return {
        amount: Number.isFinite(amount) ? amount : 0,
        id: invNum || `${invDate}-${index}`,
        invDate,
        invNum,
        sellerName
      };
    })
    .sort((a, b) => new Date(b.invDate).getTime() - new Date(a.invDate).getTime());
}

export function getDetailItems(detail: unknown): InvoiceDetailItem[] {
  const response = detail as { result?: { details?: unknown } };
  const rows = Array.isArray(response?.result?.details) ? response.result.details : [];

  return rows
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, index) => ({
      amount: String(item.amount ?? ""),
      description: String(item.description ?? "未命名品項"),
      id: String(item.rowNum ?? index),
      quantity: String(item.quantity ?? ""),
      unitPrice: String(item.unitPrice ?? "")
    }));
}
