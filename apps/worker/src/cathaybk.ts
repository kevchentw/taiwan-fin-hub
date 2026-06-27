import puppeteer, { type Page } from "@cloudflare/puppeteer";
import type { BankAccount, BankBalanceSnapshot, BankTransaction, CreditCardBill, SyncResult } from "@taiwan-fin-hub/core";
import type { CathaybkConfig } from "@taiwan-fin-hub/connectors";

const LOGIN_URL = "https://www.cathaybk.com.tw/MyBank/";
const DEPOSIT_OVERVIEW_URL = "https://www.cathaybk.com.tw/OnlineBanking/AcctInq/B0101_DepInq";
const CREDIT_CARD_OVERVIEW_URL = "https://www.cathaybk.com.tw/OnlineBanking/CQuery/C0101_BillOverview";
const CREDIT_CARD_BILL_URL = "https://www.cathaybk.com.tw/OnlineBanking/CQuery/C0102_BillInq";

const API_DEPOSIT_TX = "B_ACCT_Q_TransferDetail";

type Scraped = {
  bankAccounts: Array<Omit<BankAccount, "id" | "connectorId">>;
  bankBalanceSnapshots: Array<Omit<BankBalanceSnapshot, "id" | "connectorId">>;
  bankTransactions: Array<Omit<BankTransaction, "id" | "connectorId">>;
  creditCardBills: Array<Omit<CreditCardBill, "id" | "connectorId">>;
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

      const { bankAccounts, bankBalanceSnapshots, bankTransactions, creditCardBills, freshCookies } =
        await scrapeWithBrowser(browser, config);

      const expiresAt = new Date(Date.now() + 8 * 60 * 1000).toISOString();

      return {
        records: [],
        bankAccounts,
        bankBalanceSnapshots,
        bankTransactions,
        creditCardBills,
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
  const lookbackDays = config.lookbackMonths ? config.lookbackMonths * 30 : 30;

  try {
    await page.setViewport({ width: 1280, height: 800 });

    // ponytail: session cookie reuse disabled — bank fingerprints the browser (citrix_bot_id)
    await login(page, config);

    console.log("[cathaybk] collecting deposit accounts");
    const deposits = await scrapeDeposits(page, lookbackDays);

    console.log("[cathaybk] collecting credit cards");
    const cards = await scrapeCreditCards(page, config.lookbackMonths ?? 1);

    const freshCookies = JSON.stringify(await page.cookies());

    return {
      bankAccounts: [...deposits.bankAccounts, ...cards.bankAccounts],
      bankBalanceSnapshots: [...deposits.bankBalanceSnapshots, ...cards.bankBalanceSnapshots],
      bankTransactions: [...deposits.bankTransactions, ...cards.bankTransactions],
      creditCardBills: cards.creditCardBills,
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
    // Always logout so next run doesn't hit the "未完成正常的登出" interstitial
    console.log("[cathaybk] logging out");
    await page.goto("https://www.cathaybk.com.tw/OnlineBanking/Logout/Index", {
      waitUntil: "networkidle2", timeout: 30000
    }).catch(() => null);
    await b.close();
  }
}

async function dismissInterstitialIfPresent(page: Page): Promise<boolean> {
  const hasWarning = await page.evaluate(() =>
    document.body.innerText.includes("未完成正常的登出程序")
  ).catch(() => false);
  if (hasWarning) {
    console.log("[cathaybk] dismissing logout warning interstitial");
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll<HTMLElement>("a, button"))
        .find(el => el.textContent?.includes("回登入頁"));
      btn?.click();
    });
    await page.waitForSelector("#CustID", { timeout: 15000 });
  }
  return hasWarning as boolean;
}

async function login(page: Page, config: CathaybkConfig) {
  console.log("[cathaybk] navigating to login page");
  await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 60000 });

  // ponytail: bank shows "未完成正常的登出程序" both on page load AND after clicking login
  // if a prior session didn't log out — retry up to 3 times
  for (let attempt = 1; attempt <= 3; attempt++) {
    await dismissInterstitialIfPresent(page);
    await page.waitForSelector("#CustID", { timeout: 15000 });

    await page.click("#CustID", { clickCount: 3 });
    await page.type("#CustID", config.userId!.toUpperCase());
    await page.click("#UserIdKeyin", { clickCount: 3 });
    await page.type("#UserIdKeyin", config.account!);
    await page.click("#PasswordKeyin", { clickCount: 3 });
    await page.type("#PasswordKeyin", config.password!);

    console.log(`[cathaybk] submitting login form (attempt ${attempt}/3)`);
    await page.click(".js-login");

    await page.waitForFunction(
      () =>
        window.location.href.includes("/OnlineBanking/") ||
        document.body.innerText.includes("未完成正常的登出程序") ||
        document.body.innerText.includes("登入失敗") ||
        document.body.innerText.includes("錯誤"),
      { timeout: 60000 }
    );

    if (page.url().includes("/OnlineBanking/")) {
      console.log(`[cathaybk] login succeeded, url=${page.url()}`);
      return;
    }

    const bodyText = await page
      .evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 300))
      .catch(() => "");

    if (bodyText.includes("未完成正常的登出程序")) {
      console.log(`[cathaybk] interstitial after login (attempt ${attempt}/3), retrying`);
      continue;
    }

    throw new Error(`Cathay United Bank login failed at ${page.url()}: ${bodyText}`);
  }

  throw new Error("Cathay United Bank login failed after 3 attempts — persistent dirty session interstitial");
}

// ---- Deposit accounts ----

interface DomAccount {
  acctNo: string;
  accountTypeName: string;
  balance: number;
  availableBalance: number;
  currency: string;
}

// Actual API response structure from B_ACCT_Q_TransferDetail
interface TransferDetail {
  txnDateTime?: string | null;
  accountDate?: string | null;
  description?: string | null;
  expendAmt?: number | null;
  incomeAmt?: number | null;
  balance?: number | null;
  specialMemo?: string | null;
  memo?: string | null;
  [key: string]: unknown;
}

interface TransferDetailResponse {
  content?: {
    datas?: Array<{
      accountNumber?: string;
      details?: TransferDetail[];
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

async function scrapeDomAccounts(page: Page): Promise<DomAccount[]> {
  return page.evaluate(() => {
    const results: Array<{acctNo: string; accountTypeName: string; balance: number; availableBalance: number; currency: string}> = [];
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
    for (const btn of buttons) {
      const text = btn.textContent?.trim() ?? "";
      if (!/^\d{10,}$/.test(text)) continue;
      let el: Element | null = btn;
      for (let i = 0; i < 10; i++) {
        el = el?.parentElement ?? null;
        if (!el) break;
        const rowText = (el as HTMLElement).innerText?.trim() ?? "";
        if (rowText.includes("$") && rowText.length < 200) {
          const amounts = rowText.match(/\$([\d,]+)/g) ?? [];
          const parseAmt = (s: string) => parseInt(s.replace(/[$,]/g, ""), 10) || 0;
          results.push({
            acctNo: text,
            accountTypeName: rowText.split(text)[0]?.replace(/[●\s]+/g, " ").trim() || "臺幣存款",
            balance: amounts[0] ? parseAmt(amounts[0]) : 0,
            availableBalance: amounts[1] ? parseAmt(amounts[1]) : 0,
            currency: "TWD"
          });
          break;
        }
      }
    }
    return results;
  });
}

// Maps lookbackDays to the period dropdown label in the bank UI
function periodLabel(days: number): string {
  if (days <= 30) return "近 30 天";
  if (days <= 90) return "近 90 天";
  return "近 1 年";
}

async function selectTransactionPeriod(page: Page, days: number): Promise<void> {
  const label = periodLabel(days);
  if (label === "近 30 天") return; // default, no action needed

  // Open the period dropdown (find the one showing days/天)
  const opened = await page.evaluate(() => {
    const dropdowns = Array.from(document.querySelectorAll<HTMLElement>("[role='combobox'], button[aria-haspopup]"))
      .filter(el => (el as HTMLElement).innerText?.includes("天") || (el as HTMLElement).innerText?.includes("月"));
    if (!dropdowns[0]) return false;
    dropdowns[0].click();
    return true;
  });

  if (!opened) {
    console.log("[cathaybk] could not open period dropdown, using default");
    return;
  }

  await new Promise(r => setTimeout(r, 500));

  const clicked = await page.evaluate((targetLabel: string) => {
    const opts = Array.from(document.querySelectorAll<HTMLElement>("[role='option'], li"))
      .filter(el => el.textContent?.trim() === targetLabel);
    if (!opts[0]) return false;
    opts[0].click();
    return true;
  }, label);

  if (!clicked) {
    console.log(`[cathaybk] period option "${label}" not found, using default`);
    return;
  }

  await new Promise(r => setTimeout(r, 300));
  console.log(`[cathaybk] set period to "${label}"`);
}

async function scrapeDeposits(page: Page, lookbackDays: number): Promise<Scraped> {
  const bankAccounts: Scraped["bankAccounts"] = [];
  const bankBalanceSnapshots: Scraped["bankBalanceSnapshots"] = [];
  const bankTransactions: Scraped["bankTransactions"] = [];
  const asOfAt = new Date().toISOString();

  await page.goto(DEPOSIT_OVERVIEW_URL, { waitUntil: "networkidle2", timeout: 60000 });
  console.log(`[cathaybk] deposit page url: ${page.url()}`);
  if (page.url().includes("/logout/")) {
    throw new Error(`Cathay Bank forced logout on deposit page (url=${page.url()})`);
  }

  // Wait for account number buttons to render
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll("button")).some(b => /^\d{10,}$/.test(b.textContent?.trim() ?? "")),
    { timeout: 15000 }
  ).catch(() => null);

  const accounts = await scrapeDomAccounts(page);
  console.log(`[cathaybk] found ${accounts.length} deposit accounts: ${accounts.map(a => a.acctNo).join(", ")}`);

  for (const acct of accounts) {
    const sourceId = `bank:cathaybk:${acct.acctNo}`;

    bankAccounts.push({
      sourceId,
      institutionName: "國泰世華銀行",
      accountName: acct.accountTypeName || "國泰臺幣帳戶",
      accountType: "savings",
      currency: acct.currency,
      raw: acct
    });

    bankBalanceSnapshots.push({
      accountId: sourceId,
      sourceId: `${sourceId}:${asOfAt}`,
      balance: acct.balance,
      availableBalance: acct.availableBalance || undefined,
      currency: acct.currency,
      asOfAt,
      raw: acct
    });

    // Click account button → navigates to B0103 (transaction detail page)
    const initialTxPromise = page.waitForResponse(
      (r) => r.url().includes(API_DEPOSIT_TX) && r.status() === 200,
      { timeout: 30000 }
    ).catch(() => null);

    const clicked = await page.evaluate((acctNo: string) => {
      const btn = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
        .find(b => b.textContent?.trim() === acctNo);
      if (btn) { btn.click(); return true; }
      return false;
    }, acct.acctNo);

    if (!clicked) {
      console.log(`[cathaybk] no button found for account ${acct.acctNo}`);
      continue;
    }

    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => null);

    let txRsp = null;

    if (lookbackDays > 30) {
      // Initial page load triggered API with default 30-day period; re-query with desired period
      const reTxPromise = page.waitForResponse(
        (r) => r.url().includes(API_DEPOSIT_TX) && r.status() === 200,
        { timeout: 30000 }
      ).catch(() => null);

      await selectTransactionPeriod(page, lookbackDays);

      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
          .find(b => b.textContent?.trim() === "查詢");
        btn?.click();
      });

      txRsp = await reTxPromise;
    } else {
      txRsp = await initialTxPromise;
    }

    const txData: TransferDetailResponse = txRsp
      ? await txRsp.json().catch(() => ({})) as TransferDetailResponse
      : {};

    const datas = txData.content?.datas ?? [];
    const details: TransferDetail[] = datas.flatMap(d => d.details ?? []);
    console.log(`[cathaybk] account ${acct.acctNo}: ${details.length} tx (period=${periodLabel(lookbackDays)})`);

    appendDepositTransactions(bankTransactions, details, sourceId, acct.currency);

    // Return to deposit overview for next account
    await page.goto(DEPOSIT_OVERVIEW_URL, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("button")).some(b => /^\d{10,}$/.test(b.textContent?.trim() ?? "")),
      { timeout: 10000 }
    ).catch(() => null);
  }

  return { bankAccounts, bankBalanceSnapshots, bankTransactions, creditCardBills: [] };
}

function appendDepositTransactions(
  target: Scraped["bankTransactions"],
  details: TransferDetail[],
  accountId: string,
  currency: string
) {
  const seen = new Map<string, number>();
  for (const d of details) {
    const date = normalizeDateStr(d.txnDateTime ?? d.accountDate);
    // incomeAmt = money in (positive), expendAmt = money out (positive value = debit)
    const income = typeof d.incomeAmt === "number" ? d.incomeAmt : 0;
    const expend = typeof d.expendAmt === "number" ? d.expendAmt : 0;
    const amount = income > 0 ? income : expend > 0 ? -expend : 0;
    const desc = [d.description, d.memo].filter(Boolean).join(" ").trim() || "國泰世華交易";
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
      raw: { ...d, duplicateOccurrence: occ }
    });
  }
}

// ---- Credit cards ----

interface HistoryBillItem {
  billDate: string;
  twdAmount: number | null;
  usdAmount: number | null;
  billStatus: string;
}

interface TradeItem {
  consumeDate: string | null;
  transDesc: string;
  amount: number;
  currency: string;
}

interface BillDetailSection {
  detailType: string;
  tradeData: TradeItem[] | null;
}

interface MonthDetail {
  billDate: string;
  twdAmount: number | null;
  sections: BillDetailSection[];
}

async function scrapeCreditCards(page: Page, lookbackMonths: number): Promise<Scraped> {
  const bankAccounts: Scraped["bankAccounts"] = [];
  const bankBalanceSnapshots: Scraped["bankBalanceSnapshots"] = [];
  const bankTransactions: Scraped["bankTransactions"] = [];
  const creditCardBills: Scraped["creditCardBills"] = [];
  const asOfAt = new Date().toISOString();

  // ── C0101: card overview (DOM) ─────────────────────────────────────────
  await page.goto(CREDIT_CARD_OVERVIEW_URL, { waitUntil: "networkidle2", timeout: 60000 });
  console.log(`[cathaybk] credit card overview url: ${page.url()}`);
  await new Promise(r => setTimeout(r, 2000));

  const cardOverview = await page.evaluate(() => {
    const text = document.body.innerText;
    const parseAmt = (s: string | undefined) => parseInt((s ?? "").replace(/[^\d]/g, ""), 10) || 0;
    const last4Match = text.match(/卡片末四碼[：:]\s*(\d{4})/);
    const cardNameMatch = text.match(/([^\n]+?(?:MasterCard|VISA|JCB|銀聯)[^\n]*)/);
    const limitMatch = text.match(/永久信用額度\s*(?:TWD\s*)?([\d,]+)/);
    const availMatch = text.match(/剩餘可用額度[\s\S]{0,20}?(?:TWD\s*)?([\d,]+)/);
    const dueDateMatch = text.match(/繳款截止日[\s\S]{0,10}?(\d{4}[\/\-]\d{2}[\/\-]\d{2})/);
    const noPaymentNeeded = text.includes("無需繳費");
    const unpaidMatch = !noPaymentNeeded
      ? text.match(/(?:應繳|未繳)(?:金額|餘額)?[\s\S]{0,20}?(?:TWD\s*)?([\d,]+)/)
      : null;
    return {
      last4: last4Match?.[1] ?? "",
      cardName: last4Match ? `國泰信用卡 末四碼 ${last4Match[1]}` : (cardNameMatch?.[1]?.trim() ?? "國泰信用卡"),
      creditLimit: parseAmt(limitMatch?.[1]),
      availableCredit: parseAmt(availMatch?.[1]),
      unpaidAmount: noPaymentNeeded ? 0 : parseAmt(unpaidMatch?.[1]),
      paymentDueDate: dueDateMatch?.[1]?.replace(/\//g, "-") ?? null,
      noPaymentNeeded,
    };
  });

  console.log(`[cathaybk] card overview: ${JSON.stringify(cardOverview)}`);

  // ponytail: always use main — CathayBK pools limit across all cards
  const sourceId = "credit:cathaybk:main";

  bankAccounts.push({
    sourceId,
    institutionName: "國泰世華銀行",
    accountName: cardOverview.cardName,
    accountType: "credit",
    currency: "TWD",
    creditLimit: cardOverview.creditLimit || undefined,
    raw: cardOverview
  });

  bankBalanceSnapshots.push({
    accountId: sourceId,
    sourceId: `${sourceId}:${asOfAt}`,
    balance: -cardOverview.unpaidAmount,
    availableBalance: cardOverview.availableCredit || undefined,
    paymentDueDate: cardOverview.paymentDueDate ?? undefined,
    noPaymentNeeded: cardOverview.noPaymentNeeded,
    currency: "TWD",
    asOfAt,
    raw: cardOverview
  });

  // ── C0102: bill history + transactions via OnlineBankingApi ───────────
  await page.goto(CREDIT_CARD_BILL_URL, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));

  const apiResult = await page.evaluate(async (maxMonths: number) => {
    // Get JWT + customerId
    const jwtData = await new Promise<{ token: string; customerId: string }>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/MyBank/Customized/GetJWT");
      xhr.withCredentials = true;
      xhr.onload = () => {
        try {
          const d = JSON.parse(xhr.responseText).Data;
          resolve({ token: d.JwtToken, customerId: d.CustomerId });
        } catch { resolve({ token: "", customerId: "" }); }
      };
      xhr.onerror = () => resolve({ token: "", customerId: "" });
      xhr.send();
    });

    if (!jwtData.token) return null;

    const { token: jwt, customerId } = jwtData;

    // ponytail: functionSeqNo format observed from browser: YYYYMMDDHHmmss + UUID
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const functionSeqNo = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}${crypto.randomUUID()}`;

    function xhrPost(endpoint: string, extra: Record<string, unknown> = {}): Promise<unknown> {
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/OnlineBankingApi/ClientCard/Api/ClientCard/${endpoint}`);
        xhr.withCredentials = true;
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.setRequestHeader("Authorization", `Bearer ${jwt}`);
        xhr.onload = () => { try { resolve(JSON.parse(xhr.responseText)); } catch { resolve(null); } };
        xhr.onerror = () => resolve(null);
        xhr.send(JSON.stringify({ functionSeqNo, content: { customerId, ...extra } }));
      });
    }

    // 1. Get list of available historical months (bank provides up to 12)
    const historyResp = await xhrPost("C_BILL_Q_HistoryBillList") as {
      content?: { historyBillInfoList?: unknown[] };
    } | null;
    const allBills = (historyResp?.content?.historyBillInfoList ?? []) as Array<{
      billDate: string; twdAmount: number | null; usdAmount: number | null; billStatus: string;
    }>;

    const targetBills = allBills.slice(0, maxMonths);

    // 2. Get transaction details for each month
    const monthDetails: Array<{ billDate: string; twdAmount: number | null; sections: unknown[] }> = [];
    for (const bill of targetBills) {
      const detail = await xhrPost("C_BILL_Q_RecentBillDetail", { billDate: bill.billDate }) as {
        content?: { twdBillDetailInfo?: unknown[] };
      } | null;
      monthDetails.push({
        billDate: bill.billDate,
        twdAmount: bill.twdAmount,
        sections: detail?.content?.twdBillDetailInfo ?? []
      });
    }

    return { allBills: targetBills, monthDetails };
  }, lookbackMonths) as { allBills: HistoryBillItem[]; monthDetails: MonthDetail[] } | null;

  if (!apiResult) {
    console.log("[cathaybk] credit card API failed — no bill data");
    return { bankAccounts, bankBalanceSnapshots, bankTransactions, creditCardBills };
  }

  console.log(`[cathaybk] fetched ${apiResult.allBills.length} historical bills`);

  // Build creditCardBills from history list
  const latestBillDate = apiResult.allBills[0]?.billDate;
  for (const bill of apiResult.allBills) {
    const period = bill.billDate.slice(0, 7); // "YYYY-MM"
    const isLatest = bill.billDate === latestBillDate;
    creditCardBills.push({
      accountId: sourceId,
      sourceId: `${sourceId}:bill:${period}`,
      billingPeriod: period,
      statementAmount: bill.twdAmount != null ? Math.abs(bill.twdAmount) : undefined,
      statementClosingDate: bill.billDate.slice(0, 10),
      paymentDueDate: isLatest ? (cardOverview.paymentDueDate ?? undefined) : undefined,
      isPaid: isLatest ? cardOverview.noPaymentNeeded : true,
      currency: "TWD",
      raw: bill
    });
  }

  console.log(`[cathaybk] credit card bills: ${creditCardBills.length}`);

  // Build bankTransactions from bill details (skip carry-forward summary rows)
  const seen = new Map<string, number>();
  for (const month of apiResult.monthDetails) {
    for (const section of (month.sections as BillDetailSection[])) {
      if (section.detailType === "LastBillAmount") continue;
      for (const trade of (section.tradeData ?? [])) {
        if (!trade.amount) continue;
        const date = normalizeDateStr(trade.consumeDate ?? month.billDate);
        const desc = trade.transDesc || "國泰信用卡消費";
        const key = [date, sourceId, trade.amount, desc].join(":");
        const occ = (seen.get(key) ?? 0) + 1;
        seen.set(key, occ);
        bankTransactions.push({
          accountId: sourceId,
          sourceId: `${key}:${occ}`,
          postedDate: date,
          amount: trade.amount < 0 ? trade.amount : -trade.amount,
          currency: "TWD",
          description: desc,
          raw: { ...trade, billDate: month.billDate, detailType: section.detailType, duplicateOccurrence: occ }
        });
      }
    }
  }

  console.log(`[cathaybk] credit card transactions: ${bankTransactions.length}`);

  return { bankAccounts, bankBalanceSnapshots, bankTransactions, creditCardBills };
}

// ---- Utilities ----

function normalizeDateStr(value: unknown): string {
  if (typeof value !== "string") return new Date().toISOString();
  const s = value.trim().replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`;
  return s || new Date().toISOString();
}
