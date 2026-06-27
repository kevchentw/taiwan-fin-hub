import puppeteer, { type Page } from "@cloudflare/puppeteer";
import type { BankAccount, BankBalanceSnapshot, BankTransaction, SyncResult } from "@taiwan-fin-hub/core";
import type { CtbcbankConfig } from "@taiwan-fin-hub/connectors";

const LOGIN_URL = "https://www.ctbcbank.com/twrbo/zh_tw/index.html";
const DEPOSIT_OVERVIEW_URL = "https://www.ctbcbank.com/twrbc/twrbc-deposit/qu001/010";

// ponytail: credit cards TODO — user only has bank accounts currently

const CTBC_INSTITUTION = "中國信託商業銀行";

type Scraped = {
  bankAccounts: Array<Omit<BankAccount, "id" | "connectorId">>;
  bankBalanceSnapshots: Array<Omit<BankBalanceSnapshot, "id" | "connectorId">>;
  bankTransactions: Array<Omit<BankTransaction, "id" | "connectorId">>;
};

export function createCtbcbankConnector(browser?: Fetcher) {
  return {
    id: "ctbcbank" as const,
    name: "中國信託商業銀行 CTBC Bank",

    async sync(config: CtbcbankConfig, _cursor?: string): Promise<SyncResult<never>> {
      if (!config.userId || !config.account || !config.password) {
        throw new Error("CTBC Bank requires userId (身分證字號), account (使用者代碼), and password.");
      }
      if (!browser) {
        throw new Error("CTBC Bank requires the BROWSER binding.");
      }

      const { bankAccounts, bankBalanceSnapshots, bankTransactions, freshCookies } =
        await scrapeWithBrowser(browser, config);

      const expiresAt = new Date(Date.now() + 8 * 60 * 1000).toISOString();

      return {
        records: [],
        bankAccounts,
        bankBalanceSnapshots,
        bankTransactions,
        creditCardBills: [],
        cursor: JSON.stringify({
          sessionCookies: freshCookies,
          sessionExpiresAt: expiresAt,
          syncedAt: new Date().toISOString()
        })
      };
    }
  };
}

async function scrapeWithBrowser(browserBinding: Fetcher, config: CtbcbankConfig) {
  console.log("[ctbcbank] launching browser");
  const b = await puppeteer.launch(browserBinding);
  const page = await b.newPage();
  const lookbackMonths = Math.min(config.lookbackMonths ?? 1, 6);

  try {
    await page.setViewport({ width: 1280, height: 800 });
    await login(page, config);

    console.log("[ctbcbank] collecting deposit accounts");
    const result = await scrapeDeposits(page, lookbackMonths);
    const freshCookies = JSON.stringify(await page.cookies());
    return { ...result, freshCookies };
  } catch (error) {
    const url = page.url();
    const text = await page
      .evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 300))
      .catch(() => "<unavailable>");
    console.log(`[ctbcbank] error at url=${url} body="${text}"`);
    throw error;
  } finally {
    console.log("[ctbcbank] logging out");
    await logout(page).catch(() => null);
    await b.close();
  }
}

async function login(page: Page, config: CtbcbankConfig) {
  console.log("[ctbcbank] navigating to login page");
  await page.goto(LOGIN_URL, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForSelector('[name="personalId"]', { timeout: 15000 });

  await page.click('[name="personalId"]', { clickCount: 3 });
  await page.type('[name="personalId"]', config.userId!.toUpperCase());
  await page.click('[name="userId"]', { clickCount: 3 });
  await page.type('[name="userId"]', config.account!);
  await page.click('[name="password"]', { clickCount: 3 });
  await page.type('[name="password"]', config.password!);

  console.log("[ctbcbank] submitting login form");
  await page.click(".enterSubmit");

  await page.waitForFunction(
    () =>
      window.location.href.includes("/twrbc/") ||
      document.body.innerText.includes("登入失敗") ||
      document.body.innerText.includes("錯誤"),
    { timeout: 60000 }
  );

  if (!page.url().includes("/twrbc/")) {
    const bodyText = await page
      .evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 300))
      .catch(() => "");
    throw new Error(`CTBC Bank login failed at ${page.url()}: ${bodyText}`);
  }

  console.log(`[ctbcbank] login succeeded, url=${page.url()}`);
}

async function logout(page: Page) {
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll<HTMLElement>("a, button"))
      .find(el => el.textContent?.trim() === "登出");
    btn?.click();
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(() => {
    const confirmBtn = Array.from(document.querySelectorAll<HTMLElement>("button"))
      .find(el => el.textContent?.trim() === "確認");
    confirmBtn?.click();
  });
}

// ---- Deposit accounts ----

interface DomAccount {
  acctNo: string;
  balance: number;
  currency: string;
}

interface TxRow {
  date: string;
  summary: string;
  debit: number;
  credit: number;
  remark: string;
  counterpart: string;
  note: string;
}

async function scrapeOverviewAccounts(page: Page): Promise<DomAccount[]> {
  await page.goto(DEPOSIT_OVERVIEW_URL, { waitUntil: "networkidle2", timeout: 60000 });

  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll<HTMLSpanElement>(".td.hd span")).some(s =>
        /^\d{10,}$/.test(s.textContent?.trim() ?? "")
      ),
    { timeout: 15000 }
  ).catch(() => null);

  return page.evaluate(() => {
    const results: Array<{ acctNo: string; balance: number; currency: string }> = [];
    const spans = Array.from(document.querySelectorAll<HTMLSpanElement>(".td.hd span"));
    for (const span of spans) {
      const text = span.textContent?.trim() ?? "";
      if (!/^\d{10,}$/.test(text)) continue;

      // Sibling .td (no .hd) in the same .div-tb row holds the balance
      const divTb = span.closest<HTMLElement>(".div-tb");
      if (!divTb) continue;
      const tds = Array.from(divTb.querySelectorAll<HTMLElement>(".td"));
      const balTd = tds.find(
        td => !td.classList.contains("hd") && /^\d[\d,]*$/.test(td.textContent?.trim() ?? "")
      );
      const balance = parseInt((balTd?.textContent?.trim() ?? "0").replace(/,/g, ""), 10) || 0;
      results.push({ acctNo: text, balance, currency: "TWD" });
    }
    return results;
  });
}

async function scrapeDeposits(page: Page, lookbackMonths: number): Promise<Scraped> {
  const bankAccounts: Scraped["bankAccounts"] = [];
  const bankBalanceSnapshots: Scraped["bankBalanceSnapshots"] = [];
  const bankTransactions: Scraped["bankTransactions"] = [];
  const asOfAt = new Date().toISOString();

  const accounts = await scrapeOverviewAccounts(page);
  console.log(`[ctbcbank] found ${accounts.length} deposit accounts: ${accounts.map(a => a.acctNo).join(", ")}`);

  for (const acct of accounts) {
    const sourceId = `bank:ctbcbank:${acct.acctNo}`;

    bankAccounts.push({
      sourceId,
      institutionName: CTBC_INSTITUTION,
      accountName: "中信活期存款",
      accountType: "savings",
      currency: acct.currency,
      raw: acct
    });

    bankBalanceSnapshots.push({
      accountId: sourceId,
      sourceId: `${sourceId}:${asOfAt}`,
      balance: acct.balance,
      currency: acct.currency,
      asOfAt,
      raw: acct
    });

    // Return to overview if needed, then click the account link into qu002
    if (!page.url().includes("/qu001/")) {
      await page.goto(DEPOSIT_OVERVIEW_URL, { waitUntil: "networkidle2", timeout: 60000 });
      await page
        .waitForFunction(
          () =>
            Array.from(document.querySelectorAll<HTMLSpanElement>(".td.hd span")).some(s =>
              /^\d{10,}$/.test(s.textContent?.trim() ?? "")
            ),
          { timeout: 10000 }
        )
        .catch(() => null);
    }

    const clicked = await page.evaluate((acctNo: string) => {
      const span = Array.from(document.querySelectorAll<HTMLSpanElement>(".td.hd span")).find(
        s => s.textContent?.trim() === acctNo
      );
      const link = span?.closest<HTMLAnchorElement>("a");
      if (link) {
        link.click();
        return true;
      }
      return false;
    }, acct.acctNo);

    if (!clicked) {
      console.log(`[ctbcbank] no link found for account ${acct.acctNo}, skipping transactions`);
      continue;
    }

    await page
      .waitForFunction(() => window.location.href.includes("/qu002/"), { timeout: 15000 })
      .catch(() => null);

    if (!page.url().includes("/qu002/")) {
      console.log(`[ctbcbank] did not navigate to qu002 for ${acct.acctNo}`);
      continue;
    }

    await new Promise(r => setTimeout(r, 1500));

    const txs = await scrapeTransactionTabs(page, acct.acctNo, sourceId, acct.currency, lookbackMonths);
    bankTransactions.push(...txs);
    console.log(`[ctbcbank] account ${acct.acctNo}: ${txs.length} transactions`);
  }

  return { bankAccounts, bankBalanceSnapshots, bankTransactions };
}

async function scrapeTransactionTabs(
  page: Page,
  acctNo: string,
  sourceId: string,
  currency: string,
  lookbackMonths: number
): Promise<Scraped["bankTransactions"]> {
  const result: Scraped["bankTransactions"] = [];

  // Find month tab labels — leaf text nodes matching YYYY/MM
  const tabs = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("*"))
      .filter(el => /^\d{4}\/\d{2}$/.test(el.textContent?.trim() ?? "") && el.children.length === 0)
      .map(el => el.textContent?.trim() ?? "")
  );

  const months = [...new Set(tabs)].filter(Boolean).slice(0, lookbackMonths);
  console.log(`[ctbcbank] account ${acctNo}: tabs = ${months.join(", ")}`);

  for (let i = 0; i < months.length; i++) {
    const month = months[i];

    if (i > 0) {
      const clicked = await page.evaluate((monthText: string) => {
        const el = Array.from(document.querySelectorAll<HTMLElement>("*")).find(
          e => e.textContent?.trim() === monthText && e.children.length === 0
        );
        if (el) {
          el.click();
          return true;
        }
        return false;
      }, month);

      if (!clicked) {
        console.log(`[ctbcbank] tab "${month}" not found`);
        continue;
      }

      await new Promise(r => setTimeout(r, 1500));
    }

    const rows = await scrapeTransactionTable(page);
    result.push(...buildTransactions(rows, sourceId, currency));
    console.log(`[ctbcbank] ${month}: ${rows.length} rows`);
  }

  return result;
}

async function scrapeTransactionTable(page: Page): Promise<TxRow[]> {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>("table tbody tr"));
    const results: Array<{
      date: string;
      summary: string;
      debit: number;
      credit: number;
      remark: string;
      counterpart: string;
      note: string;
    }> = [];

    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll("td")).map(td => td.textContent?.trim() ?? "");
      // Valid transaction row: 8 cells, first is YYYY/MM/DD
      if (cells.length !== 8 || !/^\d{4}\/\d{2}\/\d{2}$/.test(cells[0])) continue;
      const parseAmt = (s: string) => parseInt(s.replace(/[^\d]/g, ""), 10) || 0;
      results.push({
        date: cells[0],
        summary: cells[1],
        debit: parseAmt(cells[2]),
        credit: parseAmt(cells[3]),
        remark: cells[5],
        counterpart: cells[6],
        note: cells[7]
      });
    }
    return results;
  });
}

function buildTransactions(
  rows: TxRow[],
  sourceId: string,
  currency: string
): Scraped["bankTransactions"] {
  const seen = new Map<string, number>();
  const result: Scraped["bankTransactions"] = [];

  for (const row of rows) {
    const date = normalizeDateStr(row.date);
    const amount = row.credit > 0 ? row.credit : row.debit > 0 ? -row.debit : 0;
    const desc = [row.summary, row.remark, row.note].filter(Boolean).join(" ").trim() || "中信交易";
    const key = [date, sourceId, amount, desc].join(":");
    const occ = (seen.get(key) ?? 0) + 1;
    seen.set(key, occ);

    result.push({
      accountId: sourceId,
      sourceId: `${key}:${occ}`,
      postedDate: date,
      amount,
      currency,
      description: desc,
      raw: { ...row, duplicateOccurrence: occ }
    });
  }

  return result;
}

function normalizeDateStr(value: unknown): string {
  if (typeof value !== "string") return new Date().toISOString();
  const s = value.trim().replace(/\//g, "-");
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00.000Z`;
  return s || new Date().toISOString();
}
