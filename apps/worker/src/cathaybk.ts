import puppeteer, { type Page } from "@cloudflare/puppeteer";
import type { BankAccount, BankBalanceSnapshot, BankTransaction, SyncResult } from "@taiwan-fin-hub/core";
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
  const lookbackDays = config.lookbackMonths ? config.lookbackMonths * 30 : 30;

  try {
    await page.setViewport({ width: 1280, height: 800 });

    // ponytail: session cookie reuse disabled — bank fingerprints the browser (citrix_bot_id)
    await login(page, config);

    console.log("[cathaybk] collecting deposit accounts");
    const deposits = await scrapeDeposits(page, lookbackDays);

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

  return { bankAccounts, bankBalanceSnapshots, bankTransactions };
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

async function scrapeCreditCards(page: Page): Promise<Scraped> {
  const bankAccounts: Scraped["bankAccounts"] = [];
  const bankBalanceSnapshots: Scraped["bankBalanceSnapshots"] = [];
  const bankTransactions: Scraped["bankTransactions"] = [];
  const asOfAt = new Date().toISOString();

  // Card overview (C0101) — scrape from DOM
  await page.goto(CREDIT_CARD_OVERVIEW_URL, { waitUntil: "networkidle2", timeout: 60000 });
  console.log(`[cathaybk] credit card page url: ${page.url()}`);
  await new Promise(r => setTimeout(r, 2000));

  const cardOverview = await page.evaluate(() => {
    const text = document.body.innerText;
    const parseAmt = (s: string | undefined) => parseInt((s ?? "").replace(/[^\d]/g, ""), 10) || 0;

    const last4Match = text.match(/卡片末四碼[：:]\s*(\d{4})/);
    const cardNameMatch = text.match(/([^\n]+?(?:MasterCard|VISA|JCB|銀聯)[^\n]*)/);
    const limitMatch = text.match(/永久信用額度\s*(?:TWD\s*)?([\d,]+)/);
    const availMatch = text.match(/剩餘可用額度[\s\S]{0,20}?(?:TWD\s*)?([\d,]+)/);
    const dueDateMatch = text.match(/繳款截止日[\s\S]{0,10}?(\d{4}[\/\-]\d{2}[\/\-]\d{2})/);

    // Statement balance from most recent bill line (e.g. "2026年06月 臺幣帳單 ... -TWD 1,135")
    const billLineMatch = text.match(/\d{4}年\d{2}月[\s\S]{0,60}?(-?TWD\s*[\d,]+)/);
    const billRaw = billLineMatch?.[1]?.trim() ?? "";
    const billIsNeg = billRaw.startsWith("-");
    const statementBalance = billIsNeg ? -parseAmt(billRaw) : parseAmt(billRaw);

    // 未繳餘額: "無需繳費" → 0, otherwise extract from 應繳/未繳 line
    const noPaymentNeeded = text.includes("無需繳費");
    const unpaidMatch = !noPaymentNeeded
      ? text.match(/(?:應繳|未繳)(?:金額|餘額)?[\s\S]{0,20}?(?:TWD\s*)?([\d,]+)/)
      : null;
    const unpaidAmount = noPaymentNeeded ? 0 : parseAmt(unpaidMatch?.[1]);

    return {
      last4: last4Match?.[1] ?? "",
      cardName: last4Match ? `國泰信用卡 末四碼 ${last4Match[1]}` : (cardNameMatch?.[1]?.trim() ?? "國泰信用卡"),
      creditLimit: parseAmt(limitMatch?.[1]),
      availableCredit: parseAmt(availMatch?.[1]),
      statementBalance,    // 帳單金額（負數 = 消費；正數 = 退刷回沖）
      unpaidAmount,         // 未繳餘額（0 = 無需繳費）
      paymentDueDate: dueDateMatch?.[1]?.replace(/\//g, "-") ?? null,
      noPaymentNeeded
    };
  });

  console.log(`[cathaybk] card overview: ${JSON.stringify(cardOverview)}`);

  const sourceId = cardOverview.last4 ? `credit:cathaybk:${cardOverview.last4}` : "credit:cathaybk:main";

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
    // balance = unpaid amount (negative = money owed); 0 when no payment needed
    balance: -cardOverview.unpaidAmount,
    availableBalance: cardOverview.availableCredit || undefined,
    statementBalance: cardOverview.statementBalance || undefined,
    paymentDueDate: cardOverview.paymentDueDate ?? undefined,
    noPaymentNeeded: cardOverview.noPaymentNeeded,
    currency: "TWD",
    asOfAt,
    raw: cardOverview
  });

  // Bill transactions (C0102) — scrape from DOM table
  await page.goto(CREDIT_CARD_BILL_URL, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise(r => setTimeout(r, 2000));

  const billTxns = await page.evaluate(() => {
    const results: Array<{date: string; desc: string; amount: number}> = [];
    const rows = Array.from(document.querySelectorAll("tr, [role='row']"));
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td, [role='cell']"));
      if (cells.length < 3) continue;
      const dateText = cells[0]?.textContent?.trim() ?? "";
      const descText = cells[1]?.textContent?.trim() ?? "";
      const amtText = cells[2]?.textContent?.trim() ?? "";
      if (!/\d{4}[\/\-]\d{2}/.test(dateText)) continue;
      const amt = parseInt(amtText.replace(/[^\d]/g, ""), 10) || 0;
      if (amt === 0 || !descText) continue;
      results.push({ date: dateText, desc: descText, amount: amt });
    }
    return results;
  });

  console.log(`[cathaybk] credit card bill transactions: ${billTxns.length}`);

  const seen = new Map<string, number>();
  for (const txn of billTxns) {
    const date = normalizeDateStr(txn.date);
    const key = [date, sourceId, txn.amount, txn.desc].join(":");
    const occ = (seen.get(key) ?? 0) + 1;
    seen.set(key, occ);
    bankTransactions.push({
      accountId: sourceId,
      sourceId: `${key}:${occ}`,
      postedDate: date,
      amount: -txn.amount, // spending = negative
      currency: "TWD",
      description: txn.desc,
      raw: { ...txn, duplicateOccurrence: occ }
    });
  }

  return { bankAccounts, bankBalanceSnapshots, bankTransactions };
}

// ---- Utilities ----

function normalizeDateStr(value: unknown): string {
  if (typeof value !== "string") return new Date().toISOString();
  const s = value.trim().replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`;
  return s || new Date().toISOString();
}
