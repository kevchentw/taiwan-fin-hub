import type {
  BankAccount,
  BankBalanceSnapshot,
  BankTransaction,
  Connector,
  InvestmentPosition,
  InvestmentTransaction,
  NetWorthHistoryPoint
} from "@taiwan-fin-hub/core";
import { z } from "zod";
import { EPassbookClient, EPassbookError, type EPassbookSession } from "./tdcc-epassbook-client";

const tdccHoldingSchema = z.object({
  accountId: z.string().min(1).optional(),
  brokerNo: z.string().min(1).optional(),
  brokerAccount: z.string().min(1).optional(),
  brokerName: z.string().min(1).optional(),
  accountName: z.string().min(1).optional(),
  securityName: z.string().min(1),
  symbol: z.string().optional(),
  securityType: z.enum(["stock", "etf", "fund", "bond", "unknown"]).optional(),
  quantity: z.union([z.string(), z.number()]),
  marketValue: z.union([z.string(), z.number()]).optional(),
  cashBalance: z.union([z.string(), z.number()]).optional(),
  currency: z.string().optional(),
  asOfDate: z.string().min(1),
  raw: z.unknown().optional()
});

const tdccCashMovementSchema = z.object({
  accountId: z.string().min(1).optional(),
  brokerNo: z.string().min(1).optional(),
  brokerAccount: z.string().min(1).optional(),
  brokerName: z.string().min(1).optional(),
  accountName: z.string().min(1).optional(),
  sourceId: z.string().min(1).optional(),
  postedDate: z.string().min(1).optional(),
  authorizedAt: z.string().min(1).optional(),
  amount: z.union([z.string(), z.number()]),
  currency: z.string().optional(),
  description: z.string().optional(),
  counterparty: z.string().optional(),
  raw: z.unknown().optional()
});

const tdccCashBalanceSchema = z.object({
  accountId: z.string().min(1).optional(),
  brokerNo: z.string().min(1).optional(),
  brokerAccount: z.string().min(1).optional(),
  brokerName: z.string().min(1).optional(),
  accountName: z.string().min(1).optional(),
  sourceId: z.string().min(1).optional(),
  balance: z.union([z.string(), z.number()]),
  availableBalance: z.union([z.string(), z.number()]).optional(),
  currency: z.string().optional(),
  asOfAt: z.string().min(1),
  raw: z.unknown().optional()
});

export const tdccConfigSchema = z.object({
  holdings: z.array(tdccHoldingSchema).default([]),
  cashBalances: z.array(tdccCashBalanceSchema).default([]),
  cashMovements: z.array(tdccCashMovementSchema).default([]),
  userId: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  deviceId: z.string().min(1).optional(),
  devType: z.string().min(1).optional(),
  devModel: z.string().min(1).optional(),
  otp: z.string().min(1).optional(),
  otpChannel: z.enum(["email", "sms"]).optional(),
  tradeHistoryMaxPages: z.number().int().min(1).max(100).default(20)
});

export type TdccConfig = z.infer<typeof tdccConfigSchema>;
export function parseTdccConfig(config: unknown) {
  return tdccConfigSchema.parse(config);
}

export type TdccHolding = TdccConfig["holdings"][number];
export type TdccCashBalance = TdccConfig["cashBalances"][number];
export type TdccCashMovement = TdccConfig["cashMovements"][number];

export interface TdccClient {
  fetchStockHoldings(): Promise<TdccHolding[]>;
  fetchFundHoldings(): Promise<TdccHolding[]>;
  fetchCashBalances?(): Promise<TdccCashBalance[]>;
  fetchCashMovements?(): Promise<TdccCashMovement[]>;
}

export function createTdccConnector(
  client?: TdccClient
): Connector<TdccConfig, Omit<InvestmentPosition, "id" | "connectorId">> {
  return {
    id: "tdcc",
    name: "TDCC ePassbook",
    async sync(config, cursor) {
      let liveHoldings: TdccHolding[] = [];
      let liveCashBalances: TdccCashBalance[] = [];
      let liveCashMovements: TdccCashMovement[] = [];
      let liveNetWorthHistory: NetWorthHistoryPoint[] = [];
      let nextCursor = cursor;

      if (client) {
        liveHoldings = [...(await client.fetchStockHoldings()), ...(await client.fetchFundHoldings())];
        liveCashBalances = client.fetchCashBalances ? await client.fetchCashBalances() : [];
        liveCashMovements = client.fetchCashMovements ? await client.fetchCashMovements() : [];
      } else if (config.userId && config.password) {
        const live = await syncTdccLive(config, cursor);
        liveHoldings = live.holdings;
        liveCashBalances = live.cashBalances;
        liveCashMovements = live.cashMovements;
        liveNetWorthHistory = live.netWorthHistory;
        nextCursor = live.cursor;
      }
      const holdings = [...config.holdings, ...liveHoldings];
      const cashBalances = [...config.cashBalances, ...liveCashBalances];
      const cashMovements = [...config.cashMovements, ...liveCashMovements];
      const bankAccounts = dedupeBySourceId([
        ...holdings.filter((holding) => holding.cashBalance !== undefined).map(toSettlementBankAccount),
        ...cashBalances.map(toSettlementBankAccount),
        ...cashMovements.map(toSettlementBankAccount)
      ]);

      return {
        records: dedupeBySourceId(holdings.map(toInvestmentPosition)),
        bankAccounts,
        bankBalanceSnapshots: dedupeByAccountAndSourceId([
          ...holdings.flatMap(toSettlementBalanceSnapshot),
          ...cashBalances.map(toBankBalanceSnapshot)
        ]),
        bankTransactions: dedupeByAccountAndSourceId(cashMovements.map(toBankTransaction)),
        netWorthHistory: liveNetWorthHistory,
        cursor: nextCursor
      };
    }
  };
}

export const tdccConnector = createTdccConnector();

type TdccCursorState = {
  deviceId: string;
  devType: string;
  devModel: string;
  session: EPassbookSession;
  tradeCursors?: Record<string, TdccTradeCursor>;
};

type TdccTradeCursor = {
  newest?: string;
  oldest?: string;
  backfillComplete?: boolean;
};

function readTdccCursor(cursor: string | undefined): TdccCursorState | undefined {
  if (!cursor) return undefined;
  try {
    return JSON.parse(cursor) as TdccCursorState;
  } catch {
    return undefined;
  }
}

// ponytail: TDCC signals "new/unrecognized device" two ways — a successful
// login response with isDiffDevice/isEmailValid flags, or these error codes
// thrown directly from the login call. Both mean "go through OTP".
const DEVICE_VERIFICATION_CODES = new Set(["C9999", "D0005"]);
// A previously-trusted session can go stale between syncs; these codes mean
// "the stored tokenId is dead", not "the account/credentials are wrong".
const SESSION_EXPIRED_CODES = new Set(["D0006", "D0007", "A0001", "A0002", "T8000"]);
// The stored OTP timed out before this sync ran; it's now dead, so the caller
// must drop it from config and have the user request a fresh one.
const OTP_EXPIRED_CODES = new Set(["V0017"]);

export class TdccOtpExpiredError extends Error {}

type TdccIdentity = { deviceId: string; devType: string; devModel: string; session?: EPassbookSession };

async function syncTdccLive(config: TdccConfig, cursor?: string) {
  const previous = readTdccCursor(cursor);
  const identity = {
    deviceId: config.deviceId ?? previous?.deviceId ?? crypto.randomUUID().replace(/-/g, "").slice(0, 16),
    devType: config.devType ?? previous?.devType ?? "Android:14",
    devModel: config.devModel ?? previous?.devModel ?? "SM-G991B"
  };

  try {
    return await runTdccLogin(config, { ...identity, session: previous?.session }, previous);
  } catch (error) {
    const isStaleSession =
      error instanceof EPassbookError && SESSION_EXPIRED_CODES.has(error.code) && Boolean(previous?.session?.tokenId);
    if (!isStaleSession) return wrapTdccError(error);
  }

  // Stored session was rejected as expired/invalid — drop it and force one fresh login
  // (which re-enters device verification if TDCC no longer trusts this device either).
  return runTdccLogin(config, { ...identity, session: undefined }, previous).catch(wrapTdccError);
}

export async function syncTdccTradeHistory(config: TdccConfig, cursor?: string) {
  const previous = readTdccCursor(cursor);
  const identity = {
    deviceId: config.deviceId ?? previous?.deviceId ?? crypto.randomUUID().replace(/-/g, "").slice(0, 16),
    devType: config.devType ?? previous?.devType ?? "Android:14",
    devModel: config.devModel ?? previous?.devModel ?? "SM-G991B"
  };

  try {
    return await runTdccTradeHistory(config, { ...identity, session: previous?.session }, previous);
  } catch (error) {
    const isStaleSession =
      error instanceof EPassbookError && SESSION_EXPIRED_CODES.has(error.code) && Boolean(previous?.session?.tokenId);
    if (!isStaleSession) return wrapTdccError(error);
  }

  return runTdccTradeHistory(config, { ...identity, session: undefined }, previous).catch(wrapTdccError);
}

async function runTdccLogin(config: TdccConfig, identity: TdccIdentity, previous?: TdccCursorState) {
  const client = new EPassbookClient({
    devId: identity.deviceId,
    devType: identity.devType,
    devModel: identity.devModel,
    session: identity.session
  });

  if (!identity.session?.tokenId) {
    await client.getInitialToken();
    await loginWithDeviceVerification(client, config);
  }

  const [stockPayload, fundPayload, bankBalancesPayload, trendPayload] = await Promise.all([
    client.getPositions(),
    client.getFundPositions(),
    client.getBankBalances(),
    client.getAssetTrend("1Y").catch(() => null)
  ]);

  const tspInfos = bankBalancesPayload.tspAccountInfos ?? [];
  console.log(`[tdcc] getBankBalances: ${tspInfos.length} bank(s) in tspAccountInfos`);
  for (const info of tspInfos) {
    const accounts = (info.tspAccount ?? []) as Array<Record<string, unknown>>;
    const hidden = accounts.filter((a) => a.isShow === false);
    console.log(`[tdcc] bank ${info.bankId}: ${accounts.length} account(s), ${hidden.length} hidden (isShow=false) — ${JSON.stringify(accounts.map((a) => ({ accountNo: a.accountNo, currency: a.currency, isShow: a.isShow, accountType: a.accountType })))}`);
  }
  const bankEntries = tspInfos.flatMap((info) =>
    (info.tspAccount ?? []).filter((a) => a.isShow !== false).map((acct) => ({
      bankId: info.bankId,
      accountNo: acct.accountNo,
      accountType: acct.accountType,
      currency: acct.currency || "TWD",
      balanceAmt: acct.balanceAmt,
      availableBalance: acct.availableBalance
    }))
  );
  console.log(`[tdcc] bankEntries after isShow filter: ${bankEntries.length} — ${JSON.stringify(bankEntries.map((e) => ({ bankId: e.bankId, accountNo: e.accountNo, currency: e.currency })))}`);

  const txnPayloads = await Promise.all(
    bankEntries.map((e) =>
      client.getBankTransactions(e.bankId, e.accountNo, e.currency).catch((err: unknown) => {
        console.log(`[tdcc] getBankTransactions failed for ${e.bankId}:${e.accountNo}:${e.currency} — ${err instanceof Error ? err.message : String(err)}`);
        return { transactions: [] as never[] };
      })
    )
  );

  const cashBalances: TdccCashBalance[] = bankEntries.map((e) => ({
    accountId: `${e.bankId}:${e.accountNo}:${e.currency}`,
    brokerName: e.accountType || undefined,
    balance: e.balanceAmt,
    availableBalance: e.availableBalance || undefined,
    currency: e.currency.toUpperCase(),
    asOfAt: new Date().toISOString(),
    raw: e
  }));

  const cashMovements: TdccCashMovement[] = txnPayloads.flatMap((p, i) => {
    const entry = bankEntries[i]!;
    const accountId = `${entry.bankId}:${entry.accountNo}:${entry.currency}`;
    const txns = p.transactions.map((tx) => ({
      accountId,
      sourceId: tx.txnId,
      postedDate: tx.occurredAt,
      amount: tx.amount,
      currency: entry.currency.toUpperCase(),
      description: tx.memo,
      raw: tx
    }));
    const uniqueSourceIds = new Set(txns.map((t) => t.sourceId));
    if (uniqueSourceIds.size < txns.length) {
      const dupes = txns.map((t) => t.sourceId).filter((id, idx, arr) => arr.indexOf(id) !== idx);
      console.log(`[tdcc] ${accountId}: ${txns.length} txns but only ${uniqueSourceIds.size} unique sourceIds — duplicate stan values: ${JSON.stringify([...new Set(dupes)])}`);
    }
    return txns;
  });

  const toDate = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  const netWorthHistory: NetWorthHistoryPoint[] = trendPayload
    ? [
        ...trendPayload.chartDate.map((d, i) => ({
          date: toDate(d),
          netWorth: trendPayload.chartVal[i] ?? 0,
          assetType: "total" as const
        })),
        ...trendPayload.chartDate.map((d, i) => ({
          date: toDate(d),
          netWorth: (trendPayload.chartVal[i] ?? 0) - (trendPayload.fundChartVal[i] ?? 0),
          assetType: "stock" as const
        })),
        ...trendPayload.fundChartDate.map((d, i) => ({
          date: toDate(d),
          netWorth: trendPayload.fundChartVal[i] ?? 0,
          assetType: "fund" as const
        }))
      ]
    : [];

  return {
    holdings: [...parseStockHoldings(stockPayload), ...parseFundHoldings(fundPayload)],
    cashBalances,
    cashMovements,
    netWorthHistory,
    cursor: JSON.stringify({
      deviceId: identity.deviceId,
      devType: identity.devType,
      devModel: identity.devModel,
      session: client.exportSession(),
      tradeCursors: previous?.tradeCursors
    })
  };
}

async function runTdccTradeHistory(config: TdccConfig, identity: TdccIdentity, previous?: TdccCursorState) {
  const client = new EPassbookClient({
    devId: identity.deviceId,
    devType: identity.devType,
    devModel: identity.devModel,
    session: identity.session
  });

  if (!identity.session?.tokenId) {
    await client.getInitialToken();
    await loginWithDeviceVerification(client, config);
  }

  const positionsPayload = await client.getPositions();
  const accounts = stockAccountsFromPayload(positionsPayload);
  const tradeCursors = { ...(previous?.tradeCursors ?? {}) };
  const investmentTransactions: Array<Omit<InvestmentTransaction, "id" | "connectorId">> = [];

  for (const account of accounts) {
    const cursorKey = `${account.brokerNo}:${account.brokerAccount}`;
    const accountCursor = tradeCursors[cursorKey] ?? {};
    const updateType: "B" | "F" = accountCursor.backfillComplete ? "F" : "B";
    let txnSerNo = updateType === "F" ? accountCursor.newest ?? "" : accountCursor.oldest ?? "";
    let newest = accountCursor.newest;
    let oldest = accountCursor.oldest;
    let backfillComplete = accountCursor.backfillComplete ?? false;

    for (let page = 0; page < config.tradeHistoryMaxPages; page += 1) {
      const payload = await client.getTradeDetail({
        brokerNo: account.brokerNo,
        brokerAccount: account.brokerAccount,
        txnSerNo,
        updateType
      });

      if (payload._returnCode === "D0002") {
        if (updateType === "B") backfillComplete = true;
        break;
      }

      const rows = Array.isArray(payload.items) ? payload.items.filter(Array.isArray) : [];
      if (rows.length === 0) {
        if (updateType === "B") backfillComplete = true;
        break;
      }

      const parsed = rows.map((row) => toInvestmentTransaction(row, account));
      investmentTransactions.push(...parsed);
      newest = newest ?? parsed[0]?.sourceId;
      oldest = parsed.at(-1)?.sourceId ?? oldest;
      txnSerNo = updateType === "F" ? newest ?? "" : oldest ?? "";
    }

    tradeCursors[cursorKey] = { newest, oldest, backfillComplete };
  }

  return {
    investmentTransactions: dedupeByAccountAndSourceId(investmentTransactions),
    cursor: JSON.stringify({
      deviceId: identity.deviceId,
      devType: identity.devType,
      devModel: identity.devModel,
      session: client.exportSession(),
      tradeCursors
    })
  };
}

async function loginWithDeviceVerification(client: EPassbookClient, config: TdccConfig) {
  let needsOtp = false;

  try {
    const loginResult = await client.login(config.userId!, config.password!);
    needsOtp = loginResult.isDiffDevice === "Y" || loginResult.isEmailValid === "N";
  } catch (error) {
    if (!(error instanceof EPassbookError) || !DEVICE_VERIFICATION_CODES.has(error.code)) throw error;
    needsOtp = true;
  }

  if (!needsOtp) return;

  if (!config.otp) {
    await client.requestEmailOtp(config.userId!);
    throw new Error(
      "TDCC requires OTP verification for this device. Check your email and retry sync with config.otp set."
    );
  }

  const otpResult = await client.verifyOtp(config.userId!, config.otp, config.otpChannel ?? "email");
  if (otpResult.isMobileValid === "N" && config.otpChannel !== "sms") {
    await client.requestMobileOtp(config.userId!);
    throw new Error(
      'TDCC also requires SMS verification. Check your phone and retry sync with config.otp set to the SMS code and config.otpChannel: "sms".'
    );
  }
}

function wrapTdccError(error: unknown): never {
  if (error instanceof EPassbookError) {
    const message = `TDCC ePassbook login/sync failed: ${error.message}`;
    if (OTP_EXPIRED_CODES.has(error.code)) throw new TdccOtpExpiredError(message);
    throw new Error(message);
  }
  throw error;
}

type TdccStockAccount = {
  brokerNo: string;
  brokerAccount: string;
  brokerName?: string;
};

function stockAccountsFromPayload(payload: Record<string, unknown>): TdccStockAccount[] {
  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  const byId = new Map<string, TdccStockAccount>();

  for (const account of accounts) {
    if (typeof account !== "object" || account === null) continue;
    const record = account as Record<string, unknown>;
    const brokerNo = stringField(record.brokerNo);
    const brokerAccount = stringField(record.brokerAccount) || stringField(record.acctSerNo);
    if (!brokerNo || !brokerAccount) continue;
    byId.set(`${brokerNo}:${brokerAccount}`, {
      brokerNo,
      brokerAccount,
      brokerName: stringField(record.brokerName) || stringField(record.broker) || undefined
    });
  }

  return Array.from(byId.values());
}

function toInvestmentTransaction(
  row: unknown[],
  account: TdccStockAccount
): Omit<InvestmentTransaction, "id" | "connectorId"> {
  const postDate = stringField(row[0]);
  const txnSerNo = stringField(row[1]);
  const symbol = stringField(row[2]);
  const name = stringField(row[3]);
  const stockType = stringField(row[8]);
  const txnDate = stringField(row[9]);
  const quantity = parseOptionalTdccNumber(stringField(row[12]));
  const price = parseOptionalTdccNumber(stringField(row[18]));
  const amount = quantity !== undefined && price !== undefined ? Math.trunc(quantity * price) : undefined;
  const sourceId = [txnDate, postDate, txnSerNo].filter(Boolean).join("") || row.map(stringField).join(":");

  return {
    accountId: `${account.brokerNo}:${account.brokerAccount}`,
    sourceId,
    brokerNo: account.brokerNo,
    brokerAccount: account.brokerAccount,
    brokerName: account.brokerName,
    symbol: symbol || undefined,
    name: name || undefined,
    assetType: symbol.startsWith("00") ? "etf" : stockType === "12" ? "fund" : "stock",
    tradeDate: txnDate ? normalizeTdccDate(txnDate) : undefined,
    postedDate: postDate ? normalizeTdccDate(postDate) : undefined,
    transactionCode: stringField(row[10]) || undefined,
    transactionName: stringField(row[11]) || undefined,
    quantity,
    price,
    amount,
    currency: stringField(row[20]) || "TWD",
    raw: {
      brokerNo: account.brokerNo,
      brokerAccount: account.brokerAccount,
      fields: {
        postDate,
        txnSerNo,
        stockNo: symbol,
        stockName: name,
        stockExcg: stringField(row[4]),
        stockStus: stringField(row[5]),
        stockUnit: stringField(row[6]),
        crType: stringField(row[7]),
        stockType,
        txnDate,
        txnCode: stringField(row[10]),
        txnName: stringField(row[11]),
        txnSHR: stringField(row[12]),
        txnPBBal: stringField(row[13]),
        dbCRCode: stringField(row[14]),
        txnType: stringField(row[15]),
        othAcctNo: stringField(row[16]),
        bankingNo: stringField(row[17]),
        price: stringField(row[18]),
        pdate: stringField(row[19]),
        stockCurrency: stringField(row[20]),
        stockRate: stringField(row[21]),
        stockIndustry: stringField(row[22])
      },
      row
    }
  };
}

function parseStockHoldings(payload: Record<string, unknown>): TdccHolding[] {
  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  const holdings: TdccHolding[] = [];

  for (const account of accounts) {
    if (typeof account !== "object" || account === null) continue;
    const accountRecord = account as Record<string, unknown>;
    const accountId = [stringField(accountRecord.brokerNo), stringField(accountRecord.brokerAccount) || stringField(accountRecord.acctSerNo)]
      .filter(Boolean)
      .join(":");
    const cashBalance =
      stringField(accountRecord.cashBalance) ||
      stringField(accountRecord.settlementCashBalance) ||
      stringField(accountRecord.availableCashBalance);
    const items = Array.isArray(accountRecord.items) ? accountRecord.items : [];

    for (const item of items) {
      if (!Array.isArray(item)) continue;
      const symbol = stringField(item[0]);
      if (!symbol) continue;

      holdings.push({
        accountId: accountId || undefined,
        brokerNo: stringField(accountRecord.brokerNo) || undefined,
        brokerAccount: stringField(accountRecord.brokerAccount) || stringField(accountRecord.acctSerNo) || undefined,
        brokerName: stringField(accountRecord.brokerName) || stringField(accountRecord.broker) || undefined,
        accountName: stringField(accountRecord.accountName) || undefined,
        securityName: stringField(item[1]) || symbol,
        symbol,
        securityType: symbol.startsWith("00") ? "etf" : stringField(item[6]) === "12" ? "fund" : "stock",
        quantity: stringField(item[7]) || "0",
        marketValue: marketValueFromTradeItem(item),
        cashBalance: cashBalance || undefined,
        currency: stringField(item[19]) || "TWD",
        asOfDate: stringField(item[21]) || stringField(item[18]) || stringField(payload.lastServerTime) || "19000101",
        raw: item
      });
    }
  }

  return holdings;
}


function marketValueFromTradeItem(item: unknown[]) {
  const quantity = Number(stringField(item[7]) || "0");
  const price = Number(stringField(item[17]) || "0");
  return Number.isFinite(quantity) && Number.isFinite(price) ? quantity * price : undefined;
}

function parseFundHoldings(payload: Record<string, unknown>): TdccHolding[] {
  const funds = Array.isArray(payload.fundDetails) ? payload.fundDetails : [];
  const asOfDate = stringField(payload.updateTime) || "19000101";

  return funds
    .filter((fund): fund is Record<string, unknown> => typeof fund === "object" && fund !== null)
    .map((fund) => {
      const symbol = stringField(fund.fundNo) || stringField(fund.symbol);
      return {
        accountId: stringField(fund.saleOrgCode) || stringField(fund.saleOrgCodeShort) || undefined,
        securityName: stringField(fund.fundCHName) || stringField(fund.name) || symbol,
        symbol,
        securityType: "fund" as const,
        quantity: stringField(fund.fundSHR) || "0",
        marketValue: stringField(fund.refORIValue) || stringField(fund.refTWDValue) || undefined,
        currency: (stringField(fund.currAlias) || stringField(fund.currency) || "TWD").toUpperCase(),
        asOfDate,
        raw: fund
      };
    });
}

function stringField(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function stockAccountId(accountRecord: Record<string, unknown>) {
  return [stringField(accountRecord.brokerNo), stringField(accountRecord.brokerAccount) || stringField(accountRecord.acctSerNo)]
    .filter(Boolean)
    .join(":");
}

function toInvestmentPosition(holding: TdccConfig["holdings"][number]): Omit<InvestmentPosition, "id" | "connectorId"> {
  const asOfDate = normalizeTdccDate(holding.asOfDate);
  return {
    sourceId: [holding.accountId, holding.symbol || holding.securityName, asOfDate]
      .filter(Boolean)
      .join(":"),
    assetType:
      holding.securityType === "etf" || holding.securityType === "fund" ? holding.securityType : "stock",
    symbol: holding.symbol,
    name: holding.securityName,
    quantity: parseTdccNumber(holding.quantity),
    marketValue:
      holding.marketValue !== undefined ? Math.max(0, Math.trunc(parseTdccNumber(holding.marketValue))) : undefined,
    cashBalance:
      holding.cashBalance !== undefined ? Math.max(0, Math.trunc(parseTdccNumber(holding.cashBalance))) : undefined,
    currency: holding.currency || "TWD",
    asOfDate,
    raw: holding.raw ?? holding
  };
}

// Common Taiwan financial institution codes used by TDCC settlement accounts.
const SETTLEMENT_BANK_NAMES: Record<string, string> = {
  "004": "台灣銀行",
  "005": "土地銀行",
  "006": "合作金庫銀行",
  "007": "第一銀行",
  "008": "華南銀行",
  "009": "彰化銀行",
  "011": "上海商銀",
  "012": "台北富邦銀行",
  "013": "國泰世華銀行",
  "016": "高雄銀行",
  "017": "兆豐銀行",
  "021": "花旗銀行",
  "048": "王道銀行",
  "050": "台灣企銀",
  "052": "渣打銀行",
  "053": "台中銀行",
  "054": "京城銀行",
  "081": "匯豐銀行",
  "101": "瑞興銀行",
  "102": "華泰銀行",
  "103": "新光銀行",
  "108": "陽信銀行",
  "118": "板信銀行",
  "147": "三信銀行",
  "700": "中華郵政",
  "803": "聯邦銀行",
  "805": "遠東銀行",
  "806": "元大銀行",
  "807": "永豐銀行",
  "808": "玉山銀行",
  "809": "凱基銀行",
  "810": "星展銀行",
  "812": "台新銀行",
  "815": "日盛銀行",
  "816": "安泰銀行",
  "822": "中國信託銀行",
  "823": "將來銀行",
  "824": "連線銀行",
  "826": "樂天銀行"
};

function toSettlementBankAccount(input: TdccHolding | TdccCashBalance | TdccCashMovement): Omit<BankAccount, "id" | "connectorId"> {
  const sourceId = settlementAccountSourceId(input);
  const settlement = parseSettlementSourceId(sourceId);
  const bankName = settlement.bankCode ? SETTLEMENT_BANK_NAMES[settlement.bankCode] : undefined;
  const accountName = settlement.accountLast5 ? `末五碼 ${settlement.accountLast5}` : "末五碼 -";
  return {
    sourceId,
    institutionName: bankName || (settlement.bankCode ? `銀行代碼 ${settlement.bankCode}` : input.brokerName) || "TDCC ePassbook",
    accountName,
    accountType: "checking",
    currency: input.currency || "TWD",
    raw: input.raw ?? input
  };
}

function toSettlementBalanceSnapshot(
  holding: TdccHolding
): Array<Omit<BankBalanceSnapshot, "id" | "connectorId">> {
  if (holding.cashBalance === undefined) return [];

  const accountSourceId = settlementAccountSourceId(holding);
  const asOfAt = normalizeTdccDate(holding.asOfDate);
  return [
    {
      accountId: accountSourceId,
      sourceId: `${accountSourceId}:${asOfAt}`,
      balance: Math.trunc(parseTdccNumber(holding.cashBalance)),
      currency: holding.currency || "TWD",
      asOfAt,
      raw: holding.raw ?? holding
    }
  ];
}

function toBankBalanceSnapshot(balance: TdccCashBalance): Omit<BankBalanceSnapshot, "id" | "connectorId"> {
  const accountSourceId = settlementAccountSourceId(balance);
  const asOfAt = normalizeTdccDate(balance.asOfAt);
  return {
    accountId: accountSourceId,
    sourceId: balance.sourceId || `${accountSourceId}:${asOfAt}`,
    balance: Math.trunc(parseTdccNumber(balance.balance)),
    availableBalance:
      balance.availableBalance !== undefined ? Math.trunc(parseTdccNumber(balance.availableBalance)) : undefined,
    currency: balance.currency || "TWD",
    asOfAt,
    raw: balance.raw ?? balance
  };
}

function toBankTransaction(movement: TdccCashMovement): Omit<BankTransaction, "id" | "connectorId"> {
  const accountSourceId = settlementAccountSourceId(movement);
  const postedDate = movement.postedDate ? normalizeTdccDate(movement.postedDate) : undefined;
  const authorizedAt = movement.authorizedAt ? normalizeTdccDate(movement.authorizedAt) : undefined;
  const amount = Math.trunc(parseTdccNumber(movement.amount));
  const sourceId =
    movement.sourceId ||
    [
      accountSourceId,
      postedDate || authorizedAt || "undated",
      amount,
      movement.currency || "TWD",
      movement.description || "",
      movement.counterparty || ""
    ].join(":");

  return {
    accountId: accountSourceId,
    sourceId,
    postedDate,
    authorizedAt,
    amount,
    currency: movement.currency || "TWD",
    description: movement.description,
    counterparty: movement.counterparty,
    raw: movement.raw ?? movement
  };
}

function settlementAccountSourceId(input: {
  brokerNo?: string;
  brokerAccount?: string;
  accountId?: string;
}) {
  if (input.brokerNo && input.brokerAccount) {
    return `settlement:${input.brokerNo}:${input.brokerAccount}`;
  }

  if (input.accountId) {
    return `settlement:${input.accountId}`;
  }

  return "settlement:unknown";
}

function parseSettlementSourceId(sourceId: string) {
  const match = sourceId.match(/^settlement:([^:]+):([^:]+)/);
  if (!match) return { bankCode: undefined, accountLast5: undefined };

  const accountDigits = match[2].replace(/\D/g, "");
  return {
    bankCode: match[1],
    accountLast5: accountDigits ? accountDigits.slice(-5) : undefined
  };
}

function parseTdccNumber(value: string | number) {
  if (typeof value === "number") return value;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOptionalTdccNumber(value: string) {
  const parsed = Number(value.replace(/,/g, ""));
  return value && Number.isFinite(parsed) ? parsed : undefined;
}

// ponytail: manual exports use 7-digit ROC dates ("1130615" = 2024/06/15); the
// live API also returns 8-digit Gregorian dates and 13/14-digit timestamps
// (ROC/Gregorian year + time-of-day suffix) — same ROC-offset rule throughout.
function normalizeTdccDate(value: string) {
  const trimmed = value.trim();

  if (/^\d{7}$|^\d{8}$|^\d{13}$|^\d{14}$/.test(trimmed)) {
    const yearLength = trimmed.length === 7 || trimmed.length === 13 ? 3 : 4;
    const rawYear = Number(trimmed.slice(0, yearLength));
    const year = yearLength === 3 ? rawYear + 1911 : rawYear;
    const month = Number(trimmed.slice(yearLength, yearLength + 2));
    const day = Number(trimmed.slice(yearLength + 2, yearLength + 4));
    return new Date(year, month - 1, day).toISOString();
  }

  const normalized = trimmed.replace(/\//g, "-");
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(normalized) ? `${normalized}T00:00:00` : normalized);
  return Number.isNaN(date.getTime()) ? normalized : date.toISOString();
}

function dedupeBySourceId<T extends { sourceId: string }>(records: T[]) {
  const bySourceId = new Map<string, T>();
  for (const record of records) {
    bySourceId.set(record.sourceId, record);
  }
  return Array.from(bySourceId.values());
}

function dedupeByAccountAndSourceId<T extends { accountId: string; sourceId: string }>(records: T[]) {
  const bySourceId = new Map<string, T>();
  for (const record of records) {
    bySourceId.set(`${record.accountId}:${record.sourceId}`, record);
  }
  return Array.from(bySourceId.values());
}
