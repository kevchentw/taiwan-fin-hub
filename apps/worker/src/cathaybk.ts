import puppeteer, { type Page, type CookieParam } from "@cloudflare/puppeteer";
import type { BankAccount, BankBalanceSnapshot, BankTransaction, SyncResult } from "@taiwan-fin-hub/core";
import type { CathaybkConfig } from "@taiwan-fin-hub/connectors";

const LOGIN_URL = "https://www.cathaybk.com.tw/MyBank/";
const HOME_URL = "https://www.cathaybk.com.tw/OnlineBanking/Home/Asset";
const DEPOSIT_OVERVIEW_URL = "https://www.cathaybk.com.tw/OnlineBanking/AcctInq/B0101_DepInq";
const CREDIT_CARD_URL = "https://www.cathaybk.com.tw/OnlineBanking/CQuery/C0108_BillDetail";

const API_DEPOSIT_OVERVIEW = "B_ACCT_Q_DepositOverview";
const API_DEPOSIT_TX = "B_ACCT_Q_TransferDetail";
const API_CARD_LIST = "C_CardInfo_Q_CardNameList";
const API_CARD_CONSUME = "C_BILL_Q_CardCurrentConsume";

type Scraped = {
  bankAccounts: Array<Omit<BankAccount, "id" | "connectorId">>;
  bankBalanceSnapshots: Array<Omit<BankBalanceSnapshot, "id" | "connectorId">>;
  bankTransactions: Array<Omit<BankTransaction, "id" | "connectorId">>;
};

export function createCathaybkConnector(browser?: Fetcher) {
  return {
    id: "cathaybk" as const,
    name: "國泰世華銀行 Cathay United Bank",

    async sync(config: CathaybkConfig, _cursor?: string): Promise<SyncResult<never>> {
      if (!config.userId || !config.account || !config.password) {
        throw new Error("Cathay United Bank requires userId (身分證字號), account (用戶代號), and password.");
      }

      if (!browser) {
        throw new Error("Cathay United Bank requires the BROWSER binding.");
      }

      const { bankAccounts, bankBalanceSnapshots, bankTransactions, freshCookies } =
        await scrapeWithBrowser(browser, config);

      const expiresAt = new Date(Date.now() + 8 * 60 * 1000).toISOString();

      return {
        records: [],
        bankAccounts,
        bankBalanceSnapshots,
        bankTransactions,
        cursor: JSON.stringify({
          sessionCookies: freshCookies,
          sessionExpiresAt: expiresAt,
          syncedAt: new Date().toISOString()
        })
      };
    }
  };
}

async function scrapeWithBrowser(browserBinding: Fetcher, config: CathaybkConfig) {
  console.log("[cathaybk] launching browser");
  const b = await puppeteer.launch(browserBinding);
  const page = await b.newPage();

  try {
    await page.setViewport({ width: 1280, height: 800 });

    if (config.sessionCookies && config.sessionExpiresAt && new Date(config.sessionExpiresAt) > new Date()) {
      console.log("[cathaybk] trying stored session cookies");
      const cookies = parseCookies(config.sessionCookies);
      if (cookies.length > 0) {
        await page.setCookie(...cookies);
        await page.goto(HOME_URL, { waitUntil: "networkidle0", timeout: 30000 });
        if (!page.url().includes("/MyBank/")) {
          console.log("[cathaybk] stored session valid, skipping login");
        } else {
          console.log("[cathaybk] stored session expired, logging in fresh");
          await login(page, config);
        }
      } else {
        await login(page, config);
      }
    } else {
      await login(page, config);
    }

    console.log("[cathaybk] collecting deposit accounts");
    const deposits = await scrapeDeposits(page);

    console.log("[cathaybk] collecting credit cards");
    const cards = await scrapeCreditCards(page);

    const freshCookies = JSON.stringify(await page.cookies());

    return {
      bankAccounts: [...deposits.bankAccounts, ...cards.bankAccounts],
      bankBalanceSnapshots: [...deposits.bankBalanceSnapshots, ...cards.bankBalanceSnapshots],
      bankTransactions: [...deposits.bankTransactions, ...cards.bankTransactions],
      freshCookies
    };
  } catch (error) {
    const url = page.url();
    const text = await page
      .evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 300))
      .catch(() => "<unavailable>");
    console.log(`[cathaybk] error at url=${url} body="${text}"`);
    throw error;
  } finally {
    await b.close();
  }
}

async function login(page: Page, config: CathaybkConfig) {
  console.log("[cathaybk] navigating to login page");
  await page.goto(LOGIN_URL, { waitUntil: "networkidle0", timeout: 30000 });

  await page.waitForSelector("#CustID", { timeout: 15000 });
  await page.click("#CustID", { clickCount: 3 });
  await page.type("#CustID", config.userId!.toUpperCase());

  await page.click("#UserIdKeyin", { clickCount: 3 });
  await page.type("#UserIdKeyin", config.account!);

  await page.click("#PasswordKeyin", { clickCount: 3 });
  await page.type("#PasswordKeyin", config.password!);

  console.log("[cathaybk] submitting login form");
  await page.click(".js-login");

  await page.waitForFunction(
    () =>
      window.location.href.includes("/OnlineBanking/") ||
      document.body.innerText.includes("登入失敗") ||
      document.body.innerText.includes("錯誤"),
    { timeout: 30000 }
  );

  if (!page.url().includes("/OnlineBanking/")) {
    const text = await page
      .evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 300))
      .catch(() => "<unavailable>");
    throw new Error(`Cathay United Bank login failed at ${page.url()}: ${text}`);
  }
  console.log(`[cathaybk] login succeeded, url=${page.url()}`);
}

// ---- Deposit accounts ----

interface DepositAccount {
  accountNo?: string | null;
  accountType?: string | null;
  accountTypeName?: string | null;
  aliasName?: string | null;
  balance?: number | string | null;
  availableBalance?: number | string | null;
  currency?: string | null;
}

interface DepositOverviewResponse {
  TWDAccounts?: DepositAccount[] | null;
  accounts?: DepositAccount[] | null;
  depositList?: DepositAccount[] | null;
  [key: string]: unknown;
}

interface TransferRecord {
  txDate?: string | null;
  amount?: number | string | null;
  crAmount?: number | string | null;
  drAmount?: number | string | null;
  description?: string | null;
  memo?: string | null;
  [key: string]: unknown;
}

interface TransferDetailResponse {
  records?: TransferRecord[] | null;
  txList?: TransferRecord[] | null;
  details?: TransferRecord[] | null;
  [key: string]: unknown;
}

async function scrapeDeposits(page: Page): Promise<Scraped> {
  const bankAccounts: Scraped["bankAccounts"] = [];
  const bankBalanceSnapshots: Scraped["bankBalanceSnapshots"] = [];
  const bankTransactions: Scraped["bankTransactions"] = [];
  const asOfAt = new Date().toISOString();

  const overviewPromise = page.waitForResponse(
    (r) => r.url().includes(API_DEPOSIT_OVERVIEW) && r.status() === 200,
    { timeout: 30000 }
  ).catch(() => null);

  await page.goto(DEPOSIT_OVERVIEW_URL, { waitUntil: "networkidle0", timeout: 30000 });
  const overviewRsp = await overviewPromise;
  const overviewData: DepositOverviewResponse = overviewRsp
    ? await overviewRsp.json().catch(() => ({})) as DepositOverviewResponse
    : {};

  console.log(`[cathaybk] deposit overview keys: ${Object.keys(overviewData).join(", ")}`);

  const accountList: DepositAccount[] = [
    ...(overviewData.TWDAccounts ?? []),
    ...(overviewData.accounts ?? []),
    ...(overviewData.depositList ?? [])
  ];

  // Fallback: scrape account numbers from DOM if API response shape is unexpected
  if (accountList.length === 0) {
    const domAccounts = await page.evaluate((): DepositAccount[] =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>("a"))
        .filter((a) => /^\d{8,}$/.test(a.textContent?.trim() ?? ""))
        .map((a) => ({ accountNo: a.textContent?.trim() }))
    );
    accountList.push(...domAccounts);
    console.log(`[cathaybk] fallback DOM accounts: ${domAccounts.length}`);
  }

  console.log(`[cathaybk] total deposit accounts: ${accountList.length}`);

  for (const acct of accountList) {
    const accountNo = acct.accountNo?.trim();
    if (!accountNo) continue;

    const sourceId = `bank:cathaybk:${accountNo}`;
    const currency = acct.currency?.trim() || "TWD";
    const balance = parseAmount(acct.balance);

    bankAccounts.push({
      sourceId,
      institutionName: "國泰世華銀行",
      accountName:
        acct.aliasName?.trim() ||
        acct.accountTypeName?.trim() ||
        acct.accountType?.trim() ||
        "國泰臺幣帳戶",
      accountType: "savings",
      currency,
      raw: acct
    });

    bankBalanceSnapshots.push({
      accountId: sourceId,
      sourceId: `${sourceId}:${asOfAt}`,
      balance,
      availableBalance: parseAmount(acct.availableBalance) || undefined,
      currency,
      asOfAt,
      raw: acct
    });

    // Click the account number link to trigger transaction fetch
    const txPromise = page.waitForResponse(
      (r) => r.url().includes(API_DEPOSIT_TX) && r.status() === 200,
      { timeout: 15000 }
    ).catch(() => null);

    const clicked = await page
      .evaluate(
        (no: string) => {
          const el = Array.from(document.querySelectorAll<HTMLElement>("a, button")).find(
            (e) => e.textContent?.trim() === no
          );
          el?.click();
          return Boolean(el);
        },
        accountNo
      )
      .catch(() => false);

    if (!clicked) {
      console.log(`[cathaybk] no clickable link found for account ${accountNo}`);
      continue;
    }

    const txRsp = await txPromise;
    const txData: TransferDetailResponse = txRsp
      ? await txRsp.json().catch(() => ({})) as TransferDetailResponse
      : {};

    const txList: TransferRecord[] = [
      ...(txData.records ?? []),
      ...(txData.txList ?? []),
      ...(txData.details ?? [])
    ];
    console.log(`[cathaybk] account ${accountNo}: ${txList.length} transactions`);
    appendTransactions(bankTransactions, txList, sourceId, currency);

    // Return to overview for next account
    const backPromise = page.waitForResponse(
      (r) => r.url().includes(API_DEPOSIT_OVERVIEW) && r.status() === 200,
      { timeout: 15000 }
    ).catch(() => null);
    await page.goto(DEPOSIT_OVERVIEW_URL, { waitUntil: "networkidle0", timeout: 30000 });
    await backPromise;
  }

  return { bankAccounts, bankBalanceSnapshots, bankTransactions };
}

function appendTransactions(
  target: Scraped["bankTransactions"],
  records: TransferRecord[],
  accountId: string,
  currency: string
) {
  const seen = new Map<string, number>();
  for (const r of records) {
    const date = normalizeDateStr(r.txDate);
    const crAmt = parseAmount(r.crAmount);
    const drAmt = parseAmount(r.drAmount);
    const rawAmt = parseAmount(r.amount);
    const amount = crAmt !== 0 ? crAmt : drAmt !== 0 ? -drAmt : rawAmt;
    const desc = (r.description ?? r.memo ?? "國泰世華交易").toString().trim();
    const key = [date, accountId, amount, desc].join(":");
    const occ = (seen.get(key) ?? 0) + 1;
    seen.set(key, occ);
    target.push({
      accountId,
      sourceId: `${key}:${occ}`,
      postedDate: date,
      amount,
      currency,
      description: desc,
      raw: { ...r, duplicateOccurrence: occ }
    });
  }
}

// ---- Credit cards ----

interface CardInfo {
  cardNo?: string | null;
  cardName?: string | null;
  [key: string]: unknown;
}

interface CardListResponse {
  cardList?: CardInfo[] | null;
  cards?: CardInfo[] | null;
  [key: string]: unknown;
}

interface CardConsumeResponse {
  totalAmount?: number | string | null;
  currentAmount?: number | string | null;
  consumeAmount?: number | string | null;
  currency?: string | null;
  [key: string]: unknown;
}

async function scrapeCreditCards(page: Page): Promise<Scraped> {
  const bankAccounts: Scraped["bankAccounts"] = [];
  const bankBalanceSnapshots: Scraped["bankBalanceSnapshots"] = [];
  const bankTransactions: Scraped["bankTransactions"] = [];
  const asOfAt = new Date().toISOString();

  const cardListPromise = page.waitForResponse(
    (r) => r.url().includes(API_CARD_LIST) && r.status() === 200,
    { timeout: 30000 }
  ).catch(() => null);
  const cardConsumePromise = page.waitForResponse(
    (r) => r.url().includes(API_CARD_CONSUME) && r.status() === 200,
    { timeout: 30000 }
  ).catch(() => null);

  await page.goto(CREDIT_CARD_URL, { waitUntil: "networkidle0", timeout: 30000 });
  const [cardListRsp, cardConsumeRsp] = await Promise.all([cardListPromise, cardConsumePromise]);

  const cardListData: CardListResponse = cardListRsp
    ? await cardListRsp.json().catch(() => ({})) as CardListResponse
    : {};
  const consumeData: CardConsumeResponse = cardConsumeRsp
    ? await cardConsumeRsp.json().catch(() => ({})) as CardConsumeResponse
    : {};

  console.log(`[cathaybk] card list keys: ${Object.keys(cardListData).join(", ")}`);
  console.log(`[cathaybk] consume keys: ${Object.keys(consumeData).join(", ")}`);

  const cards: CardInfo[] = [...(cardListData.cardList ?? []), ...(cardListData.cards ?? [])];
  const mainSourceId = "credit:cathaybk:main";
  const cardSourceIds = new Set<string>([mainSourceId]);

  for (const card of cards) {
    const last4 = card.cardNo?.replace(/\D/g, "").slice(-4);
    if (last4) cardSourceIds.add(`credit:cathaybk:${last4}`);
  }

  for (const sourceId of cardSourceIds) {
    const last4 = sourceId === mainSourceId ? undefined : sourceId.slice(-4);
    const card = last4 ? cards.find((c) => c.cardNo?.replace(/\D/g, "").endsWith(last4)) : undefined;
    bankAccounts.push({
      sourceId,
      institutionName: "國泰世華銀行",
      accountName:
        card?.cardName?.trim() ||
        (sourceId === mainSourceId ? "國泰信用卡" : `國泰信用卡 末四碼 ${last4}`),
      accountType: "credit",
      currency: "TWD",
      raw: card ?? consumeData
    });
  }

  const outstanding =
    parseAmount(consumeData.totalAmount) ||
    parseAmount(consumeData.currentAmount) ||
    parseAmount(consumeData.consumeAmount);

  if (outstanding !== 0) {
    bankBalanceSnapshots.push({
      accountId: mainSourceId,
      sourceId: `${mainSourceId}:${asOfAt}`,
      balance: -outstanding,
      currency: consumeData.currency?.trim() || "TWD",
      asOfAt,
      raw: consumeData
    });
  }

  return { bankAccounts, bankBalanceSnapshots, bankTransactions };
}

// ---- Utilities ----

function parseAmount(value: unknown): number {
  if (typeof value === "number") return Math.round(value);
  if (typeof value === "string") {
    const n = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? Math.round(n) : 0;
  }
  return 0;
}

function normalizeDateStr(value: unknown): string {
  if (typeof value !== "string") return new Date().toISOString();
  const s = value.trim().replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`;
  return s || new Date().toISOString();
}

function parseCookies(serialized: string): CookieParam[] {
  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (c): c is CookieParam =>
          typeof c === "object" && c !== null && "name" in c && "value" in c
      );
    }
  } catch {}
  return [];
}
