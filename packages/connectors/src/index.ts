import type { Connector, Invoice, InvoiceLineItem } from "@taiwan-fin-hub/core";
import { z } from "zod";
import { currentPeriodIndex, getDetailItems, getInvoices, periodFromIndex } from "./invoice-data";
import { EInvoiceClient } from "./tw-einvoice-api";

export { tdccConnector, createTdccConnector, tdccConfigSchema, parseTdccConfig, syncTdccTradeHistory, TdccOtpExpiredError } from "./tdcc";
export type { TdccConfig, TdccHolding, TdccCashBalance, TdccCashMovement, TdccClient } from "./tdcc";
import { tdccConfigSchema } from "./tdcc";

export { esunConfigSchema, parseEsunConfig } from "./esun";
export type { EsunConfig } from "./esun";
import { esunConfigSchema } from "./esun";

export { cathaybkConfigSchema, parseCathaybkConfig } from "./cathaybk";
export type { CathaybkConfig } from "./cathaybk";
import { cathaybkConfigSchema } from "./cathaybk";

const invoiceRecordSchema = z.object({
  sourceId: z.string().min(1),
  invoiceNumber: z.string().optional(),
  invoiceDate: z.string().min(1),
  sellerName: z.string().optional(),
  amount: z.number().int().nonnegative(),
  raw: z.unknown().optional()
});

export const invoiceConfigSchema = z.object({
  records: z.array(invoiceRecordSchema).default([]),
  mobile: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  mobileBarcode: z.string().min(1).optional(),
  userToken: z.string().min(1).optional(),
  periodsBack: z.number().int().min(1).max(24).default(1),
  fetchDetails: z.boolean().default(true)
});

export type InvoiceConfig = z.infer<typeof invoiceConfigSchema>;
export function parseInvoiceConfig(config: unknown) {
  return invoiceConfigSchema.parse(config);
}

export const einvoiceConnector: Connector<InvoiceConfig, Omit<Invoice, "id" | "connectorId">> = {
  id: "einvoice",
  name: "E-Invoice",
  async sync(config, cursor) {
    if (config.mobile && config.password) {
      return syncTaiwanEInvoices(config, cursor);
    }

    return {
      records: config.records.map((record) => ({
        sourceId: record.sourceId,
        invoiceNumber: record.invoiceNumber,
        invoiceDate: record.invoiceDate,
        sellerName: record.sellerName,
        amount: record.amount,
        raw: record.raw ?? record
      })),
      cursor
    };
  }
};

async function syncTaiwanEInvoices(config: InvoiceConfig, cursor?: string) {
  const client = new EInvoiceClient({
    apiKey: config.apiKey,
    currentUser:
      config.mobile && config.userToken && config.mobileBarcode
        ? {
            mobile: config.mobile,
            userToken: config.userToken,
            mobileBarcode: config.mobileBarcode
          }
        : null
  });

  if (!client.currentUser) {
    try {
      await client.login({
        mobile: config.mobile!,
        password: config.password!
      });
    } catch (error) {
      throw new Error(`E-Invoice login failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  if (client.currentUser?.userToken) {
    config.userToken = client.currentUser.userToken;
  }

  if (client.currentUser?.mobileBarcode) {
    config.mobileBarcode = client.currentUser.mobileBarcode;
  }

  const carrierId = config.mobileBarcode ?? client.currentUser?.mobileBarcode;
  if (!carrierId) {
    throw new Error("E-Invoice login did not return a mobile barcode.");
  }

  const now = new Date();
  const currentIndex = currentPeriodIndex(now);
  const periodIndexes = Array.from({ length: config.periodsBack }, (_, index) => currentIndex - index);
  const records: Array<Omit<Invoice, "id" | "connectorId">> = [];
  const invoiceLineItems: Array<Omit<InvoiceLineItem, "id" | "connectorId" | "invoiceId">> = [];
  let detailErrorCount = 0;

  for (const periodIndex of periodIndexes) {
    const period = periodFromIndex(periodIndex, now);
    const payload = await client.checkCarrierInvoices({
      carrierId,
      carrierType: "3J0002",
      cardEncrypt: config.password,
      startDate: period.startDate,
      endDate: period.endDate
    });

    const invoices = getInvoices(payload);
    for (const invoice of invoices) {
      let detail: unknown;
      let detailItems: ReturnType<typeof getDetailItems> = [];
      const sourceId = invoiceSourceId(invoice.invNum, invoice.invDate, invoice.id);

      if (config.fetchDetails && invoice.invNum && invoice.invDate) {
        try {
          detail = await client.checkCarrierInvoiceDetail({
            carrierId,
            carrierType: "3J0002",
            cardEncrypt: config.password,
            invNum: invoice.invNum,
            invDate: invoice.invDate
          });
          detailItems = getDetailItems(detail);
          detailItems.forEach((item, index) => {
            invoiceLineItems.push({
              invoiceSourceId: sourceId,
              sourceId: item.id || String(index + 1),
              lineNumber: index + 1,
              description: item.description || "未命名品項",
              quantity: parseOptionalNumber(item.quantity),
              unitPrice: parseOptionalInteger(item.unitPrice),
              amount: parseRequiredInteger(item.amount),
              raw: item
            });
          });
        } catch (error) {
          detailErrorCount += 1;
          detail = {
            error: error instanceof Error ? error.message : "Unable to fetch invoice detail."
          };
        }
      }

      records.push({
        sourceId,
        invoiceNumber: invoice.invNum || undefined,
        invoiceDate: normalizeInvoiceDate(invoice.invDate),
        sellerName: invoice.sellerName,
        amount: Math.max(0, Math.trunc(invoice.amount)),
        raw: {
          invoice,
          period,
          detail,
          detailItems
        }
      });
    }
  }

  return {
    records: dedupeInvoices(records),
    invoiceLineItems: dedupeInvoiceLineItems(invoiceLineItems),
    detailErrorCount,
    cursor: JSON.stringify({
      syncedAt: now.toISOString(),
      previousSyncedAt: cursor ? readPreviousSyncedAt(cursor) : undefined,
      latestPeriodIndex: currentIndex,
      periodsBack: config.periodsBack
    })
  };
}

function parseOptionalNumber(value: string) {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalInteger(value: string) {
  const parsed = parseOptionalNumber(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

function parseRequiredInteger(value: string) {
  return parseOptionalInteger(value) ?? 0;
}

function readPreviousSyncedAt(cursor: string) {
  try {
    const parsed = JSON.parse(cursor) as { syncedAt?: unknown };
    return typeof parsed.syncedAt === "string" ? parsed.syncedAt : undefined;
  } catch {
    return undefined;
  }
}

function invoiceSourceId(invNum: string, invDate: string, fallback: string) {
  return [invNum || fallback, invDate].filter(Boolean).join(":");
}

function normalizeInvoiceDate(value: string) {
  const normalized = value.trim().replace(/\//g, "-");
  const withTime = /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? `${normalized}T00:00:00`
    : normalized.replace(" ", "T");
  const date = new Date(withTime);
  if (Number.isNaN(date.getTime())) return normalized || value;
  return date.toISOString();
}

function dedupeInvoices(records: Array<Omit<Invoice, "id" | "connectorId">>) {
  const bySourceId = new Map<string, Omit<Invoice, "id" | "connectorId">>();
  for (const record of records) {
    bySourceId.set(record.sourceId, record);
  }
  return Array.from(bySourceId.values());
}

function dedupeInvoiceLineItems(
  items: Array<Omit<InvoiceLineItem, "id" | "connectorId" | "invoiceId">>
) {
  const bySourceId = new Map<string, Omit<InvoiceLineItem, "id" | "connectorId" | "invoiceId">>();
  for (const item of items) {
    bySourceId.set(`${item.invoiceSourceId}:${item.sourceId}`, item);
  }
  return Array.from(bySourceId.values());
}

export function parseConnectorConfig(connectorId: string, config: unknown) {
  if (connectorId === "einvoice") {
    return invoiceConfigSchema.parse(config);
  }

  if (connectorId === "tdcc") {
    return tdccConfigSchema.parse(config);
  }

  if (connectorId === "esun") {
    return esunConfigSchema.parse(config);
  }

  if (connectorId === "cathaybk") {
    return cathaybkConfigSchema.parse(config);
  }

  throw new Error("Unsupported connector id.");
}
