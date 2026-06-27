import puppeteer, { type Page } from "@cloudflare/puppeteer";
import type { BankAccount, BankBalanceSnapshot, BankTransaction, CreditCardBill, SyncResult } from "@taiwan-fin-hub/core";
import type { EsunConfig } from "@taiwan-fin-hub/connectors";

const HOME_URL = "https://ebank.esunbank.com.tw/indexMobile.jsp";
const CREDIT_CARD_DETAIL_URL = "https://ebank.esunbank.com.tw/fcm01/fcm01003/home/detail/processDetail.json";
const CREDIT_CARD_TIMELINE_URL = "https://ebank.esunbank.com.tw/fcm01/fcm01003/home/detail/1Y/getTimelineList.json";
const CREDIT_CARD_OVERVIEW_URL = "https://ebank.esunbank.com.tw/fcm01/fcm01010/home/initData.json";
const CREDIT_CARD_BILLS_URL = "https://ebank.esunbank.com.tw/fcm01/fcm01003/bill/bills.json";
const ACCOUNT_OVERVIEW_URL = "https://ebank.esunbank.com.tw/fms01/fms01029/home/initData.json";
const ACCOUNT_TX_INIT_URL = "https://ebank.esunbank.com.tw/fao01/fao01013/home/initData.json";
const ACCOUNT_TX_URL = "https://ebank.esunbank.com.tw/fao01/fao01002/search/findTxDetails.json";

export function createEsunConnector(browser?: Fetcher) {
  return {
    id: "esun" as const,
    name: "E.SUN Bank 玉山銀行",

    async sync(config: EsunConfig, cursor?: string): Promise<SyncResult<never>> {
      if (!config.userId || !config.account || !config.password) {
        throw new Error("E.SUN Bank requires userId (身分證字號), account (使用者名稱), and password.");
      }

      const client = new EsunHttpClient();

      if (config.sessionCookies && config.sessionExpiresAt && new Date(config.sessionExpiresAt) > new Date()) {
        client.importCookies(config.sessionCookies);
      }

      if (!(await client.hasAuthenticatedSession())) {
        if (!browser) {
          throw new Error("E.SUN Bank requires the BROWSER binding for interactive login.");
        }
        await loginWithBrowser(browser, client, config);
      }

      const cursorState = readCursor(cursor);
      const depositWatermarks = (cursorState.depositWatermarks as Record<string, string> | undefined) ?? {};

      console.log("[esun debug] scraping credit cards");
      const creditCards = await scrapeCreditCards(client, config.lookbackMonths ?? 3);
      console.log("[esun debug] scraping deposit accounts");
      const deposits = await scrapeDepositAccounts(client, depositWatermarks, config.lookbackMonths ?? 3);
      const freshCookies = client.exportCookies();
      const expiresAt = new Date(Date.now() + 25 * 60 * 1000).toISOString();

      return {
        records: [],
        bankAccounts: [...creditCards.bankAccounts, ...deposits.bankAccounts],
        bankBalanceSnapshots: [...creditCards.bankBalanceSnapshots, ...deposits.bankBalanceSnapshots],
        bankTransactions: [...creditCards.bankTransactions, ...deposits.bankTransactions],
        creditCardBills: creditCards.creditCardBills,
        cursor: JSON.stringify({
          ...cursorState,
          sessionCookies: freshCookies,
          sessionExpiresAt: expiresAt,
          depositWatermarks: deposits.watermarks,
          syncedAt: new Date().toISOString()
        })
      };
    }
  };
}

async function loginWithBrowser(browserBinding: Fetcher, client: EsunHttpClient, config: EsunConfig) {
  console.log("[esun debug] launching browser");
  const browser = await puppeteer.launch(browserBinding);
  const page = await browser.newPage();
  let txnDupToken: string | undefined;

  try {
    page.on("response", (response) => {
      const token = response.headers().txnduptoken;
      if (token) txnDupToken = token;
    });
    await page.setViewport({ width: 390, height: 844, isMobile: true });
    await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/147.0.0.0 Mobile/15E148 Safari/604.1");
    console.log(`[esun debug] navigating to ${HOME_URL}`);
    await page.goto(HOME_URL, { waitUntil: "networkidle0", timeout: 30000 });
    console.log(`[esun debug] navigated, page url=${page.url()}`);
    await loginMobilePage(page, config);
    console.log("[esun debug] login succeeded, setting up credit card session");
    await setupCreditCardBrowserSession(page);

    client.importCookies(JSON.stringify(await page.cookies()));
    if (txnDupToken) {
      client.setTxnDupToken(txnDupToken);
    }
    console.log("[esun debug] browser login complete");
  } catch (error) {
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 300)).catch(() => "<unavailable>");
    console.log(`[esun debug] browser login failed at url=${page.url()} body="${text}"`);
    throw error;
  } finally {
    await browser.close();
  }
}

async function loginMobilePage(page: Page, config: EsunConfig) {
  console.log("[esun debug] waiting for #custid field");
  await page.waitForSelector("#custid", { timeout: 30000 });
  await page.click("#custid", { clickCount: 3 });
  await page.type("#custid", config.userId!.toUpperCase());
  await page.click("#name", { clickCount: 3 });
  await page.type("#name", config.account!);
  await page.click("#pxsswd", { clickCount: 3 });
  await page.type("#pxsswd", config.password!);

  console.log("[esun debug] submitting login form");
  await page.click(".btn-submit");
  await waitForMobileLogin(page);
}

async function waitForMobileLogin(page: Page, depth = 0) {
  if (depth > 3) {
    throw new Error("E.SUN browser login: duplicate-login dialog kept reappearing.");
  }

  console.log("[esun debug] waiting for login result (LOGINKEY cookie, error text, or duplicate-login dialog)");
  const result = await Promise.race([
    page.waitForFunction(() => document.cookie.includes("LOGINKEY"), { timeout: 30000 }).then(() => "ok"),
    page.waitForFunction(() => /登入失敗|錯誤|無法|暫時/.test(document.body.innerText), { timeout: 30000 }).then(() => "error"),
    page.waitForFunction(() => document.body.innerText.includes("重複登入"), { timeout: 30000 }).then(() => "duplicate")
  ]);
  console.log(`[esun debug] login result=${result}`);

  if (result === "duplicate") {
    console.log("[esun debug] duplicate-login dialog detected, clicking 確定登入");
    await clickByText(page, "確定登入");
    return waitForMobileLogin(page, depth + 1);
  }

  if (result === "error" && !(await page.evaluate(() => document.cookie.includes("LOGINKEY")))) {
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 300));
    throw new Error(`E.SUN browser login failed: ${text}`);
  }
}

async function clickByText(page: Page, label: string) {
  const clicked = await page.evaluate((text) => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("button, a, div, span"));
    const target = elements.find((el) => el.textContent?.trim() === text);
    target?.click();
    return Boolean(target);
  }, label);

  if (!clicked) {
    throw new Error(`E.SUN browser login: could not find "${label}" button.`);
  }
}

async function setupCreditCardBrowserSession(page: Page) {
  console.log("[esun debug] waiting for window.$Utils");
  await page.waitForFunction(() => Boolean((window as Window & { $Utils?: unknown }).$Utils), { timeout: 30000 });
  const detailResponse = page.waitForResponse(
    (response) => response.url().includes("/fcm01/fcm01003/home/detail/processDetail.json"),
    { timeout: 30000 }
  ).catch(() => undefined);
  console.log("[esun debug] navigating to credit card detail via $Utils.navigate.goTxnById");
  await page.evaluate(() => {
    const utils = (window as Window & { $Utils?: { navigate?: { goTxnById?: (id: string, params?: unknown) => void } } }).$Utils;
    utils?.navigate?.goTxnById?.("FCM01003", { Tab: "01", List: "03" });
  });
  await detailResponse;
}

type Scraped = {
  bankAccounts: Array<Omit<BankAccount, "id" | "connectorId">>;
  bankBalanceSnapshots: Array<Omit<BankBalanceSnapshot, "id" | "connectorId">>;
  bankTransactions: Array<Omit<BankTransaction, "id" | "connectorId">>;
  creditCardBills: Array<Omit<CreditCardBill, "id" | "connectorId">>;
};

interface EsunApiResponse<T> {
  rsStatus?: {
    code?: string | null;
    message?: string | null;
  } | null;
  rsData?: T | null;
}

interface EsunApiStatus {
  code?: string | null;
  message?: string | null;
}

interface EsunMobileAesData {
  publickey?: string | null;
  iv?: string | null;
  factory?: string | null;
}

interface EsunMobileE2EData {
  enable?: boolean | null;
  publickey?: string | null;
  timefactor?: string | null;
}

interface EsunMobileLoginInitData {
  txn?: string | null;
  params?: unknown;
}

interface EsunMobileLoginData {
  targetTaskId?: string | null;
  releaseNo?: string | null;
  keepCust?: string | null;
  custCode?: string | null;
}

interface EsunCardRow {
  cardNo?: string | null;
  cardNoDesc?: string | null;
  cardType?: string | null;
  dm1Cano?: string | null;
  typeB?: boolean | null;
}

interface EsunCardDetailData {
  balance?: string | null;
  creditLimit?: string | null;
  availCreditAmt?: string | null;
  availableAmt?: string | null;
  creditCardList?: EsunCardRow[] | null;
  billList?: Array<{
    billYm?: string | null;
    billCur?: string | null;
    payAmt?: string | null;
    paidAmt?: string | null;
    payDueDate?: string | null;
    dueDate?: string | null;
  }> | null;
}

interface EsunCardOverviewData {
  trsam?: number | null;   // total credit limit (永久信用額度)
  useam?: number | null;   // usable/available credit remaining (可用額度)
  tamt?: number | null;    // current statement total amount (本期帳單)
  mimpy?: number | null;   // minimum payment
  paydt?: string | null;   // payment due date (繳款截止日), format "0YYYMMDD" (民國)
  intdt?: string | null;   // statement closing date (帳單截止日), format "0YYYMMDD"
  lstym?: number | null;   // latest billing period yymm
  bills?: Array<{
    bym6?: number | null;  // billing period (e.g. 11505 = 民國115年05月)
    tamt?: number | null;  // statement total
    mimpy?: number | null; // minimum payment
    payam?: number | null; // amount already paid
    cucid?: string | null; // currency
  }> | null;
}

interface EsunTimelineTransaction {
  payCur?: string | null;
  payAmt?: string | null;
  storeName?: string | null;
  consumerDt?: string | null;
  consumerCur?: string | null;
  consumerAmt?: string | null;
  postingDt?: string | null;
  cardNo?: string | null;
  cardNoDesc?: string | null;
  cardType?: string | null;
  acfg?: string | null;
}

interface EsunTimelineMonth {
  year?: string | null;
  month?: string | null;
  txnList?: EsunTimelineTransaction[] | null;
}

interface EsunTimelineData {
  timelineList?: EsunTimelineMonth[] | null;
  startDate?: string | null;
  endDate?: string | null;
  isNoData?: boolean | null;
}

interface EsunTimelinePage {
  timelineList: EsunTimelineMonth[];
  startDate?: string;
  endDate?: string;
}

async function scrapeCreditCards(client: EsunHttpClient, lookbackMonths: number): Promise<Scraped> {
  const [detail, overview] = await Promise.all([
    fetchCreditCardDetail(client),
    client.postJson<EsunCardOverviewData>(CREDIT_CARD_OVERVIEW_URL, {})
  ]);
  const asOfAt = new Date().toISOString();

  const cards = getCreditCards(detail);
  const bankTransactions = await scrapeTransactions(client);
  const accountIds = new Set<string>([
    ...cards.map((card) => creditCardSourceId(card.cardNo)),
    ...bankTransactions.map((transaction) => transaction.accountId)
  ]);
  accountIds.delete("");

  const mainSourceId = "credit:esun:main";
  accountIds.add(mainSourceId);

  // overview fields:
  //   trsam = total credit limit (永久信用額度)
  //   useam = usable/available amount remaining (可用額度) — NOT "used" despite the name
  //   tamt  = current statement total (本期帳單)
  //   intdt = statement closing date (帳單截止日), format "0YYYMMDD"
  //   paydt = payment due date (繳款截止日), format "0YYYMMDD"
  const creditLimit = overview.trsam ?? undefined;
  const availableCredit = overview.useam ?? undefined;
  const outstanding = overview.trsam != null && overview.useam != null
    ? overview.trsam - overview.useam   // total charges outstanding across all cards
    : 0;
  const paymentDueDate = parseEsunCompactDate(overview.paydt) ?? undefined;
  const statementClosingDate = parseEsunCompactDate(overview.intdt) ?? undefined;
  const currentBill = overview.bills?.[0];
  const statementBalance = currentBill?.tamt ?? overview.tamt ?? undefined;
  const noPaymentNeeded = outstanding === 0;

  console.log(`[esun debug] creditLimit=${creditLimit} availableCredit=${availableCredit} outstanding=${outstanding} statementBalance=${statementBalance} paymentDueDate=${paymentDueDate} statementClosingDate=${statementClosingDate}`);

  const cardBySourceId = new Map(cards.map((card) => [creditCardSourceId(card.cardNo), card]));
  const bankAccounts: Scraped["bankAccounts"] = Array.from(accountIds).map((sourceId) => {
    const card = cardBySourceId.get(sourceId);
    return {
      sourceId,
      institutionName: "玉山銀行",
      accountName: card?.cardNoDesc || (sourceId === mainSourceId ? "玉山信用卡" : `玉山信用卡 ${sourceId.slice(-4)}`),
      accountType: "credit",
      currency: "TWD",
      creditLimit,
      raw: card ?? detail
    };
  });

  const bankBalanceSnapshots: Scraped["bankBalanceSnapshots"] = [{
    accountId: mainSourceId,
    sourceId: `${mainSourceId}:${asOfAt}`,
    balance: -outstanding,
    availableBalance: availableCredit,
    statementBalance,
    paymentDueDate,
    statementClosingDate,
    noPaymentNeeded,
    currency: "TWD",
    asOfAt,
    raw: { detail, overview }
  }];

  // Build credit card bills from overview.bills (all periods available)
  const creditCardBills: Scraped["creditCardBills"] = (overview.bills ?? []).map((bill) => {
    const bym6 = bill.bym6 ?? 0;
    const year = Math.floor(bym6 / 100) + 1911;
    const month = bym6 % 100;
    const billingPeriod = `${year}-${String(month).padStart(2, "0")}`;
    const tamt = bill.tamt ?? 0;
    const payam = bill.payam ?? 0;
    const isCurrentPeriod = bym6 === (overview.lstym ?? 0);
    return {
      accountId: mainSourceId,
      sourceId: `${mainSourceId}:bill:${billingPeriod}`,
      billingPeriod,
      statementAmount: tamt || undefined,
      minimumPayment: bill.mimpy ?? undefined,
      paidAmount: payam || undefined,
      isPaid: tamt > 0 && payam >= tamt,
      paymentDueDate: isCurrentPeriod ? paymentDueDate : undefined,
      statementClosingDate: isCurrentPeriod ? statementClosingDate : undefined,
      currency: bill.cucid?.trim() || "TWD",
      raw: bill
    };
  });

  return { bankAccounts, bankBalanceSnapshots, bankTransactions, creditCardBills };
}

interface EsunCardOverviewBillsData {
  payDT?: string | null;
  intDT?: string | null;
  billList?: Array<{ currency?: string | null; amount?: string | null }> | null;
}

async function fetchCreditCardDetail(client: EsunHttpClient): Promise<EsunCardDetailData> {
  return client.postJson<EsunCardDetailData>(CREDIT_CARD_DETAIL_URL, {
    detailCategoryId: "03"
  });
}

function getCreditCards(detail: EsunCardDetailData): EsunCardRow[] {
  return (detail.creditCardList ?? []).filter((card) => {
    const cardNo = card.cardNo?.trim();
    return Boolean(cardNo);
  });
}

async function scrapeTransactions(client: EsunHttpClient): Promise<Array<Omit<BankTransaction, "id" | "connectorId">>> {
  const pages = await fetchTimelinePages(client);
  const transactions: Array<Omit<BankTransaction, "id" | "connectorId">> = [];
  const sourceIdOccurrences = new Map<string, number>();

  for (const timelinePage of pages) {
    for (const month of timelinePage.timelineList) {
      const year = month.year?.trim();
      if (!year) continue;

      for (const txn of month.txnList ?? []) {
        const postedDate = normalizeEsunMonthDay(year, txn.consumerDt ?? txn.postingDt ?? "");
        const amount = parseTwd(txn.payAmt ?? txn.consumerAmt ?? "0");
        const currency = txn.payCur?.trim() || txn.consumerCur?.trim() || "TWD";
        const description = txn.storeName?.trim() || "玉山信用卡交易";
        const accountId = creditCardSourceId(txn.cardNo);
        const sourceKey = [
          postedDate,
          accountId,
          description,
          amount,
          currency,
          txn.acfg?.trim() ?? ""
        ].join(":");
        const occurrence = (sourceIdOccurrences.get(sourceKey) ?? 0) + 1;
        sourceIdOccurrences.set(sourceKey, occurrence);

        transactions.push({
          accountId,
          sourceId: `${sourceKey}:${occurrence}`,
          postedDate,
          amount,
          currency,
          description,
          counterparty: description,
          raw: {
            ...txn,
            timelineYear: month.year,
            timelineMonth: month.month,
            timelineStartDate: timelinePage.startDate,
            timelineEndDate: timelinePage.endDate,
            duplicateOccurrence: occurrence
          }
        });
      }
    }
  }

  return transactions;
}

async function fetchTimelinePages(client: EsunHttpClient): Promise<EsunTimelinePage[]> {
  const pages: EsunTimelinePage[] = [];
  const seenRanges = new Set<string>();
  let lastRange: { startDate?: string; endDate?: string } = {};

  for (let index = 0; index < 4; index += 1) {
    const rqData =
      index === 0
        ? { lastFlag: "N", cardNo: "" }
        : {
            lastStartDate: lastRange.startDate,
            lastEndDate: lastRange.endDate,
            lastFlag: "N",
            cardNo: ""
          };
    const data = await client.postJson<EsunTimelineData>(CREDIT_CARD_TIMELINE_URL, rqData);
    const timelineList = data.timelineList ?? [];
    const rangeKey = `${data.startDate ?? ""}:${data.endDate ?? ""}`;

    if (data.isNoData || timelineList.length === 0 || seenRanges.has(rangeKey)) {
      break;
    }

    pages.push({
      timelineList,
      startDate: data.startDate ?? undefined,
      endDate: data.endDate ?? undefined
    });
    seenRanges.add(rangeKey);

    if (!data.startDate || !data.endDate) {
      break;
    }
    lastRange = {
      startDate: data.startDate.replace(/\//g, "-"),
      endDate: data.endDate.replace(/\//g, "-")
    };
  }

  return pages;
}

interface EsunOverviewAccountRow {
  account?: string | null;
  accountType?: string | null;
  accountTypeName?: string | null;
  name?: string | null;
  aliasName?: string | null;
  amount?: number | null;
  currency?: string | null;
  currencyList?: Array<{ cur?: string | null; amount?: number | null }> | null;
}

interface EsunAccountOverviewData {
  twDetails?: EsunOverviewAccountRow[] | null;
  frDetails?: EsunOverviewAccountRow[] | null;
}

interface EsunTxDetailRow {
  txDate?: string | null;
  txTime?: string | null;
  chc?: string | null;
  amt?: string | null;
  balance?: string | null;
  memo1?: string | null;
  memo2?: string | null;
  showDbFlag?: string | null;
  showCrFlag?: string | null;
  displayCurrency?: string | null;
}

interface EsunTxMonth {
  year?: string | null;
  month?: string | null;
  details?: EsunTxDetailRow[] | null;
}

interface EsunTxDetailsData {
  txMasters?: EsunTxMonth[] | null;
  searchKxy?: string | null;
}

async function scrapeDepositAccounts(
  client: EsunHttpClient,
  watermarks: Record<string, string>,
  lookbackMonths: number
): Promise<Scraped & { watermarks: Record<string, string> }> {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - lookbackMonths);
  const cutoffDateStr = cutoffDate.toISOString().slice(0, 10).replace(/-/g, "/");
  // Required: initialize server-side session state before findTxDetails calls
  const txInit = await client.postJson<{ drActList?: unknown[] }>(ACCOUNT_TX_INIT_URL, {});
  console.log(`[esun debug] fao01013 init: drActList=${txInit.drActList?.length ?? 0}`);
  const overview = await client.postJson<EsunAccountOverviewData>(ACCOUNT_OVERVIEW_URL, {});
  console.log(`[esun debug] overview: twDetails=${overview.twDetails?.length ?? 0} frDetails=${overview.frDetails?.length ?? 0} lookbackMonths=${lookbackMonths} cutoffDateStr=${cutoffDateStr}`);
  const asOfAt = new Date().toISOString();

  const bankAccounts: Scraped["bankAccounts"] = [];
  const bankBalanceSnapshots: Scraped["bankBalanceSnapshots"] = [];
  const bankTransactions: Scraped["bankTransactions"] = [];
  const newWatermarks: Record<string, string> = {};

  for (const row of (overview.twDetails ?? []).filter((account) => account.account)) {
    const account = row.account!.trim();
    const accountId = depositSourceId(account);
    const currency = row.currency?.trim() || "TWD";

    bankAccounts.push({
      sourceId: accountId,
      institutionName: "玉山銀行",
      accountName: row.aliasName?.trim() || row.name?.trim() || row.accountTypeName?.trim() || "玉山臺幣帳戶",
      accountType: "savings",
      currency,
      raw: row
    });
    bankBalanceSnapshots.push({
      accountId,
      sourceId: `${accountId}:${asOfAt}`,
      balance: row.amount ?? 0,
      currency,
      asOfAt,
      raw: row
    });

    console.log(`[esun debug] tw account ${account} (${row.accountType ?? "401"}): watermark=${watermarks[account] ?? "none"} cutoff=${cutoffDateStr}`);
    const rows = await fetchAccountTransactionPages(client, account, row.accountType ?? "401", false, watermarks[account], cutoffDateStr);
    console.log(`[esun debug] tw account ${account}: fetched ${rows.length} transaction rows`);
    appendDepositTransactions(bankTransactions, rows, accountId, currency);
    newWatermarks[account] = rows[0] ? txDateTimeKey(rows[0]) : watermarks[account];
  }

  for (const row of (overview.frDetails ?? []).filter((account) => account.account)) {
    const account = row.account!.trim();
    const currencies = row.currencyList?.length ? row.currencyList : [{ cur: row.currency, amount: row.amount }];
    const primaryCurrency = currencies[0]?.cur?.trim() || "USD";

    for (const entry of currencies) {
      const currency = entry.cur?.trim() || primaryCurrency;
      const accountId = depositSourceId(account, currency);

      bankAccounts.push({
        sourceId: accountId,
        institutionName: "玉山銀行",
        accountName: `${row.aliasName?.trim() || row.name?.trim() || row.accountTypeName?.trim() || "玉山外幣帳戶"} (${currency})`,
        accountType: "savings",
        currency,
        raw: row
      });
      bankBalanceSnapshots.push({
        accountId,
        sourceId: `${accountId}:${asOfAt}`,
        balance: entry.amount ?? 0,
        currency,
        asOfAt,
        raw: row
      });
    }

    console.log(`[esun debug] fr account ${account} (${row.accountType ?? "A01"}): watermark=${watermarks[account] ?? "none"} cutoff=${cutoffDateStr}`);
    const rows = await fetchAccountTransactionPages(client, account, row.accountType ?? "A01", true, watermarks[account], cutoffDateStr);
    console.log(`[esun debug] fr account ${account}: fetched ${rows.length} transaction rows`);
    for (const detail of rows) {
      const currency = detail.displayCurrency?.trim() || primaryCurrency;
      appendDepositTransactions(bankTransactions, [detail], depositSourceId(account, currency), currency);
    }
    newWatermarks[account] = rows[0] ? txDateTimeKey(rows[0]) : watermarks[account];
  }

  return { bankAccounts, bankBalanceSnapshots, bankTransactions, creditCardBills: [], watermarks: newWatermarks };
}

async function fetchAccountTransactionPages(
  client: EsunHttpClient,
  account: string,
  accountType: string,
  isForeign: boolean,
  watermark: string | undefined,
  cutoffDateStr: string
): Promise<EsunTxDetailRow[]> {
  const rows: EsunTxDetailRow[] = [];
  let searchKxy = "";

  for (let page = 0; page < 12; page += 1) {
    const data = await client.postJson<EsunTxDetailsData>(ACCOUNT_TX_URL, {
      act: JSON.stringify({ act: account, type: accountType, fr: isForeign ? "true" : "false", lna: "0", inh: "0" }),
      txDateOrder: 1,
      startRow: 0,
      searchKxy,
      counter: 0
    });

    let reachedCutoff = false;
    let skippedCutoff = 0;
    let skippedWatermark = 0;
    for (const month of data.txMasters ?? []) {
      for (const detail of month.details ?? []) {
        const dateStr = detail.txDate?.trim().replace(/-/g, "/") ?? "";
        if (dateStr && dateStr < cutoffDateStr) {
          reachedCutoff = true;
          skippedCutoff++;
          continue;
        }
        if (watermark && txDateTimeKey(detail) <= watermark) {
          reachedCutoff = true;
          skippedWatermark++;
          continue;
        }
        rows.push(detail);
      }
    }
    const months = (data.txMasters ?? []).map((m) => `${m.year}/${m.month}(${m.details?.length ?? 0})`).join(",");
    console.log(`[esun debug] ${account} page ${page}: months=[${months}] added=${rows.length} skippedCutoff=${skippedCutoff} skippedWatermark=${skippedWatermark} searchKxy=${data.searchKxy ?? "null"} reachedCutoff=${reachedCutoff}`);

    if (reachedCutoff || !data.searchKxy) break;
    searchKxy = data.searchKxy;
  }

  return rows;
}

function appendDepositTransactions(
  target: Scraped["bankTransactions"],
  rows: EsunTxDetailRow[],
  accountId: string,
  defaultCurrency: string
) {
  const occurrences = new Map<string, number>();

  for (const detail of rows) {
    const postedDate = normalizeEsunTxDateTime(detail.txDate, detail.txTime);
    const isCredit = detail.showCrFlag !== "hide";
    const amount = parseTwd(detail.amt ?? "0") * (isCredit ? 1 : -1);
    const description = detail.chc?.trim() || "玉山銀行交易";
    const counterparty = detail.memo1?.trim() || description;
    const sourceKey = [
      postedDate,
      accountId,
      description,
      amount,
      detail.balance?.trim() ?? "",
      detail.memo1?.trim() ?? "",
      detail.memo2?.trim() ?? ""
    ].join(":");
    const occurrence = (occurrences.get(sourceKey) ?? 0) + 1;
    occurrences.set(sourceKey, occurrence);

    target.push({
      accountId,
      sourceId: `${sourceKey}:${occurrence}`,
      postedDate,
      amount,
      currency: detail.displayCurrency?.trim() || defaultCurrency,
      description,
      counterparty,
      raw: { ...detail, duplicateOccurrence: occurrence }
    });
  }
}

function depositSourceId(account: string, currency?: string) {
  return currency ? `bank:esun:${account}:${currency}` : `bank:esun:${account}`;
}

function txDateTimeKey(detail: EsunTxDetailRow) {
  return `${detail.txDate ?? ""} ${detail.txTime ?? ""}`;
}

function normalizeEsunTxDateTime(txDate: string | null | undefined, txTime: string | null | undefined) {
  const date = txDate?.trim().replace(/\//g, "-") || "";
  const time = txTime?.trim() || "00:00:00";
  return `${date}T${time}.000Z`;
}

function parseTwd(text: string): number {
  const n = Number(text.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

// Format "0YYYMMDD" where YYY = 民國 year (e.g. "01150629" → "2026/06/29")
function parseEsunCompactDate(value: string | null | undefined): string | null {
  const match = value?.match(/^0?(\d{3})(\d{2})(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1]) + 1911;
  return `${year}/${match[2]}/${match[3]}`;
}

// bym6 e.g. 11505 = 民國115年05月 → use last day of that month as the snapshot date
function parseEsunBym6ToDate(bym6: number): string {
  const year = Math.floor(bym6 / 100) + 1911;
  const month = bym6 % 100;
  const lastDay = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, lastDay).toISOString();
}

function readOutstandingBalance(detail: EsunCardDetailData) {
  if (detail.balance) return parseTwd(detail.balance);

  const latestBill = detail.billList?.find((bill) => bill.payAmt);
  return latestBill?.payAmt ? parseTwd(latestBill.payAmt) : undefined;
}

function creditCardSourceId(cardNo: string | null | undefined) {
  const last4 = cardNo?.match(/(\d{4})$/)?.[1];
  return last4 ? `credit:esun:${last4}` : "credit:esun:main";
}

function normalizeEsunMonthDay(year: string, monthDay: string) {
  const match = monthDay.trim().replace(/\./g, "/").match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!match) return monthDay;

  const fullYear = year.length === 3 ? Number(year) + 1911 : Number(year);
  const month = match[1].padStart(2, "0");
  const day = match[2].padStart(2, "0");
  return `${fullYear}-${month}-${day}T00:00:00.000Z`;
}

function readCursor(cursor: string | undefined): Record<string, unknown> {
  if (!cursor) return {};
  try {
    return JSON.parse(cursor) as Record<string, unknown>;
  } catch {
    return {};
  }
}

class EsunHttpClient {
  private readonly cookies = new Map<string, string>();
  private txnDupToken: string | undefined;

  importCookies(serialized: string) {
    try {
      const parsed = JSON.parse(serialized) as unknown;
      if (Array.isArray(parsed)) {
        for (const cookie of parsed) {
          if (isCookieRecord(cookie)) {
            this.cookies.set(cookie.name, cookie.value);
          }
        }
        return;
      }

      if (parsed && typeof parsed === "object") {
        for (const [name, value] of Object.entries(parsed)) {
          if (typeof value === "string") {
            this.cookies.set(name, value);
          }
        }
      }
    } catch {
      // Ignore stale or malformed stored cookies; login will refresh them.
    }
  }

  exportCookies() {
    return JSON.stringify(
      Array.from(this.cookies.entries()).map(([name, value]) => ({
        name,
        value,
        domain: "ebank.esunbank.com.tw",
        path: "/"
      }))
    );
  }

  setTxnDupToken(token: string) {
    this.txnDupToken = token;
  }

  async hasAuthenticatedSession() {
    if (this.cookies.size === 0) {
      console.log("[esun debug] hasAuthenticatedSession: no stored cookies, will log in");
      return false;
    }
    try {
      await this.postJson<EsunCardDetailData>(CREDIT_CARD_DETAIL_URL, {
        detailCategoryId: "03"
      });
      console.log("[esun debug] hasAuthenticatedSession: stored session still valid");
      return true;
    } catch (error) {
      console.log(`[esun debug] hasAuthenticatedSession: stored session invalid (${error instanceof Error ? error.message : error}), will log in`);
      return false;
    }
  }

  async login(config: EsunConfig) {
    await this.requestText(HOME_URL);
    const initData = await this.postMobileJson<EsunMobileLoginInitData>("fco08/fco08001/home/initData.json", {});
    const aesData = await this.getMobileJson<EsunMobileAesData>("sys/loadAesData.do");
    const e2eData = await this.getMobileJson<EsunMobileE2EData>("sys/loadE2EData.do");

    if (!aesData.publickey || !aesData.iv || !aesData.factory || !e2eData.publickey || !e2eData.timefactor) {
      throw new Error("E.SUN mobile login did not return expected encryption fields.");
    }

    const payload = {
      custid: config.userId!.toUpperCase(),
      name: await encryptEsunUsername(config.account!, aesData.publickey, aesData.iv, aesData.factory),
      pxsswd: encryptEsunPassword(config.password!, e2eData.timefactor, e2eData.publickey),
      magicNumber: "",
      loginType: "GENERAL",
      srcChannel: "MB",
      targetTaskId: initData.txn ?? undefined
    };

    let loginResponse = await this.postMobileEnvelope<EsunMobileLoginData>("fco08/fco08001/home/FCO08001_LoginCheck.do", payload);
    if (loginResponse.rsStatus?.code === "9017") {
      loginResponse = await this.postMobileEnvelope<EsunMobileLoginData>("fco08/fco08001/home/FCO08001_LoginCheck.do", {
        ...payload,
        duplicateLogin: "Y"
      });
    }

    this.assertOkStatus(loginResponse.rsStatus, "E.SUN mobile API");
    const loginData = (loginResponse.rsData ?? {}) as EsunMobileLoginData;

    if (!loginData.targetTaskId && this.cookies.size === 0) {
      throw new Error("E.SUN mobile login did not establish a session.");
    }
  }

  async postJson<T>(url: string, rqData: Record<string, unknown> | null): Promise<T> {
    const response = await this.requestJson<EsunApiResponse<T>>(url, {
      method: "POST",
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "content-type": "application/json",
        referer: "https://ebank.esunbank.com.tw/indexMobile.jsp",
        txnduptoken: this.txnDupToken ?? "",
        "x-requested-with": "XMLHttpRequest"
      },
      body: JSON.stringify({
        clientTime: Date.now(),
        rqData
      })
    });

    if (response.rsStatus?.code === "3018") {
      console.log(`[esun debug] ${url} returned 3018 (no data), treating as empty result`);
      return {} as T;
    }

    if (response.rsStatus?.code && response.rsStatus.code !== "0000") {
      console.log(`[esun debug] ${url} error`, JSON.stringify({ rqData, rsStatus: response.rsStatus }));
      throw new Error(`E.SUN API error ${response.rsStatus.code}: ${response.rsStatus.message ?? ""}`.trim());
    }

    return (response.rsData ?? {}) as T;
  }

  async getMobileJson<T>(path: string): Promise<T> {
    return this.mobileRequest<T>(path, { method: "GET" });
  }

  async postMobileJson<T>(path: string, rqData: Record<string, unknown>): Promise<T> {
    const response = await this.postMobileEnvelope<T>(path, rqData);
    this.assertOkStatus(response.rsStatus, "E.SUN mobile API");
    return (response.rsData ?? {}) as T;
  }

  async postMobileEnvelope<T>(path: string, rqData: Record<string, unknown>): Promise<EsunApiResponse<T>> {
    return this.mobileEnvelope<T>(path, {
      method: "POST",
      body: JSON.stringify({
        clientTime: Date.now(),
        rqData
      })
    });
  }

  private async mobileRequest<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.mobileEnvelope<T>(path, init);
    this.assertOkStatus(response.rsStatus, "E.SUN mobile API");

    return (response.rsData ?? {}) as T;
  }

  private async mobileEnvelope<T>(path: string, init: RequestInit): Promise<EsunApiResponse<T>> {
    return this.requestJson<EsunApiResponse<T>>(new URL(path, HOME_URL).toString(), {
      ...init,
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "content-type": "application/json",
        referer: "https://ebank.esunbank.com.tw/indexMobile.jsp",
        txnduptoken: this.txnDupToken ?? "",
        "x-requested-with": "XMLHttpRequest",
        ...init.headers
      }
    });
  }

  private async requestJson<T>(url: string, init: RequestInit = {}) {
    const response = await this.request(url, init);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("json")) {
      const body = await response.text();
      throw new Error(`E.SUN expected JSON from ${url}, got ${contentType || "unknown content type"}: ${body.slice(0, 120).replace(/\s+/g, " ").trim()}`);
    }
    return (await response.json()) as T;
  }

  private async requestText(url: string, init: RequestInit = {}) {
    const response = await this.request(url, init);
    return response.text();
  }

  private async request(url: string, init: RequestInit = {}, redirectCount = 0): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("user-agent", "Mozilla/5.0 AppleWebKit/537.36 Chrome/147 Safari/537.36");
    headers.set("accept-language", "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7");
    if (this.cookies.size > 0) {
      headers.set("cookie", this.cookieHeader());
    }

    const response = await fetch(url, {
      ...init,
      headers,
      redirect: "manual"
    });
    this.storeSetCookies(response.headers);
    const txnDupToken = response.headers.get("txnduptoken");
    if (txnDupToken) {
      this.txnDupToken = txnDupToken;
    }

    if (isRedirect(response.status)) {
      if (redirectCount >= 5) {
        throw new Error("E.SUN login redirected too many times.");
      }
      const location = response.headers.get("location");
      if (!location) return response;
      return this.request(new URL(location, url).toString(), { method: "GET" }, redirectCount + 1);
    }

    if (!response.ok) {
      throw new Error(`E.SUN request failed with HTTP ${response.status}`);
    }

    return response;
  }

  private cookieHeader() {
    return Array.from(this.cookies.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
  }

  private storeSetCookies(headers: Headers) {
    const values = getSetCookieValues(headers);
    for (const value of values) {
      const [pair] = value.split(";");
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const cookieValue = pair.slice(separator + 1).trim();
      if (cookieValue) {
        this.cookies.set(name, cookieValue);
      } else {
        this.cookies.delete(name);
      }
    }
  }

  private assertOkStatus(status: EsunApiStatus | null | undefined, label: string) {
    if (status?.code && status.code !== "0000") {
      throw new Error(`${label} error ${status.code}: ${status.message ?? ""}`.trim());
    }
  }
}

async function encryptEsunUsername(username: string, base64Key: string, base64Iv: string, factory: string) {
  const key = base64ToBytes(base64Key);
  const iv = base64ToBytes(base64Iv);
  const encrypted = Buffer.from(await aesCbcPkcs7Encrypt(username, key, iv)).toString("base64");
  return `${encrypted}__${factory}`;
}

function encryptEsunPassword(password: string, serverTime: string, publicKey: string) {
  const payload = `${password}${serverTime}`;
  const encrypted = rsaPkcs1v15Encrypt(publicKey, new TextEncoder().encode(payload));
  return `${password.length},${encrypted.toString("base64")}`;
}

async function aesCbcPkcs7Encrypt(value: string, key: Uint8Array<ArrayBuffer>, iv: Uint8Array<ArrayBuffer>) {
  const cryptoKey = await crypto.subtle.importKey("raw", key.buffer, "AES-CBC", false, ["encrypt"]);
  return crypto.subtle.encrypt(
    {
      name: "AES-CBC",
      iv
    },
    cryptoKey,
    new TextEncoder().encode(value)
  );
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const buffer = Buffer.from(value, "base64");
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return copy;
}

function rsaPkcs1v15Encrypt(publicKeyPem: string, message: Uint8Array) {
  const key = parseRsaPublicKey(publicKeyPem);
  const keyLength = Math.ceil(byteLength(key.modulus) / 8);
  if (message.byteLength > keyLength - 11) {
    throw new Error("E.SUN RSA login payload is too long.");
  }

  const paddingLength = keyLength - message.byteLength - 3;
  const encoded = new Uint8Array(keyLength);
  encoded[0] = 0;
  encoded[1] = 2;
  encoded.set(nonZeroRandomBytes(paddingLength), 2);
  encoded[2 + paddingLength] = 0;
  encoded.set(message, 3 + paddingLength);

  const encrypted = modPow(bytesToBigInt(encoded), key.exponent, key.modulus);
  return bigIntToFixedLengthBuffer(encrypted, keyLength);
}

function parseRsaPublicKey(publicKeyPem: string) {
  const der = base64ToBytes(
    publicKeyPem
      .replace(/-----BEGIN RSA PUBLIC KEY-----/g, "")
      .replace(/-----END RSA PUBLIC KEY-----/g, "")
      .replace(/\s+/g, "")
  );
  const root = readDerNode(der, 0);
  const rootChildren = readDerChildren(root.value);

  // E.SUN currently serves a PKCS#1 "RSA PUBLIC KEY" PEM: SEQUENCE(INTEGER n, INTEGER e).
  // Accept SPKI too in case the header and body change later.
  const rsaSequence =
    rootChildren.length >= 2 && rootChildren[0].tag === 0x02
      ? root
      : readDerNode(rootChildren[1].value.slice(1), 0);
  const [modulusNode, exponentNode] = readDerChildren(rsaSequence.value);

  return {
    modulus: bytesToBigInt(stripLeadingZero(modulusNode.value)),
    exponent: bytesToBigInt(stripLeadingZero(exponentNode.value))
  };
}

function readDerChildren(bytes: Uint8Array) {
  const children: DerNode[] = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    const child = readDerNode(bytes, offset);
    children.push(child);
    offset = child.nextOffset;
  }
  return children;
}

interface DerNode {
  tag: number;
  value: Uint8Array;
  nextOffset: number;
}

function readDerNode(bytes: Uint8Array, offset: number): DerNode {
  const tag = bytes[offset];
  let lengthByte = bytes[offset + 1];
  let length = lengthByte;
  let cursor = offset + 2;

  if (lengthByte & 0x80) {
    const lengthBytes = lengthByte & 0x7f;
    length = 0;
    for (let index = 0; index < lengthBytes; index += 1) {
      length = (length << 8) + bytes[cursor + index];
    }
    cursor += lengthBytes;
  }

  return {
    tag,
    value: bytes.slice(cursor, cursor + length),
    nextOffset: cursor + length
  };
}

function stripLeadingZero(bytes: Uint8Array) {
  return bytes[0] === 0 ? bytes.slice(1) : bytes;
}

function bytesToBigInt(bytes: Uint8Array) {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return BigInt(`0x${hex || "0"}`);
}

function bigIntToFixedLengthBuffer(value: bigint, length: number) {
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const bytes = Buffer.from(hex, "hex");
  if (bytes.byteLength > length) {
    return bytes.subarray(bytes.byteLength - length);
  }
  if (bytes.byteLength === length) {
    return bytes;
  }
  return Buffer.concat([Buffer.alloc(length - bytes.byteLength), bytes]);
}

function byteLength(value: bigint) {
  return value.toString(2).length;
}

function modPow(base: bigint, exponent: bigint, modulus: bigint) {
  if (modulus === 1n) return 0n;
  let result = 1n;
  let currentBase = base % modulus;
  let currentExponent = exponent;

  while (currentExponent > 0n) {
    if (currentExponent % 2n === 1n) {
      result = (result * currentBase) % modulus;
    }
    currentExponent /= 2n;
    currentBase = (currentBase * currentBase) % modulus;
  }

  return result;
}

function nonZeroRandomBytes(length: number) {
  const bytes = new Uint8Array(length);
  let index = 0;
  while (index < length) {
    const chunk = new Uint8Array(length - index);
    crypto.getRandomValues(chunk);
    for (const byte of chunk) {
      if (byte === 0) continue;
      bytes[index] = byte;
      index += 1;
      if (index === length) break;
    }
  }
  return bytes;
}

function isRedirect(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function getSetCookieValues(headers: Headers) {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof withGetter.getSetCookie === "function") {
    return withGetter.getSetCookie();
  }

  const combined = headers.get("set-cookie");
  return combined ? splitCombinedSetCookie(combined) : [];
}

function splitCombinedSetCookie(value: string) {
  return value.split(/,(?=\s*[^;,=]+=[^;,]+)/g).map((cookie) => cookie.trim()).filter(Boolean);
}

function isCookieRecord(value: unknown): value is { name: string; value: string } {
  return Boolean(
    value &&
      typeof value === "object" &&
      "name" in value &&
      "value" in value &&
      typeof value.name === "string" &&
      typeof value.value === "string"
  );
}
