// ponytail: no test framework in this repo yet — run with `npx tsx packages/connectors/src/tdcc.selfcheck.ts`.
// Mocks the TDCC ePassbook API and exercises login -> OTP gate -> holdings/cash -> session reuse,
// plus device-verification-by-error-code and stale-session recovery.
import assert from "node:assert/strict";
import { createTdccConnector, parseTdccConfig, TdccOtpExpiredError } from "./tdcc";

const calls: string[] = [];
let mode: "flag_otp" | "error_code_otp" | "stale_session" | "otp_expired" = "flag_otp";
let fundUpdateTime = "20240615090000";

function errorResponse(returnCode: string) {
  return new Response(JSON.stringify({ responseHeader: { returnCode, returnMsg: "device not trusted" } }), { status: 200 });
}

(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (url: string, init: RequestInit) => {
  const endpoint = url.toString().split("/rest/")[1];
  const body = JSON.parse(init.body as string);
  calls.push(endpoint!);

  const respond = (returnCode: string, responseBody: unknown, tokenID?: string) =>
    new Response(
      JSON.stringify({
        responseHeader: { returnCode, tokenID: tokenID ?? body.requestHeader.tokenID ?? "TKN-1" },
        responseBody
      }),
      { status: 200 }
    );

  if (endpoint === "CM001") return respond("0000", { tokenID: "TKN-1" }, "TKN-1");
  if (endpoint === "AU001") {
    if (mode === "error_code_otp") return errorResponse("C9999");
    return respond("0000", { isDiffDevice: "Y", isEmailValid: "Y" });
  }
  if (endpoint === "AU013") return respond("0000", { otpValidSec: 300 });
  if (endpoint === "AU015") {
    if (mode === "otp_expired") return errorResponse("V0017");
    return respond("0000", { isMobileValid: "Y" });
  }
  if (endpoint === "TR001") {
    if (mode === "stale_session" && body.requestHeader.tokenID === "STALE-TKN") {
      // session is dead; the connector should drop it and retry fresh, at which point
      // the token will no longer be "STALE-TKN" so this branch won't fire again
      return errorResponse("D0006");
    }
    return respond("0000", {
      lastServerTime: "20240615",
      accounts: [
        {
          brokerNo: "9A92",
          brokerAccount: "1234567",
          brokerName: "Test Broker",
          items: [
            ["2330", "TSMC", null, null, null, null, "11", "1000", null, null, null, null, null, null, null, null, null, "600", "20240615", "TWD", null, "20240615"],
            ["0050", "ETF50", null, null, null, null, "11", "500", null, null, null, null, null, null, null, null, null, "140", "20240615", "TWD", null, "20240615"]
          ]
        }
      ]
    });
  }
  if (endpoint === "TR051V1") {
    return respond("0000", {
      // updateTime carries a time-of-day suffix that changes between syncs on the
      // live API; sourceId must be derived from the date-truncated value or every
      // sync mints a new id and the upsert can never match the prior row.
      updateTime: fundUpdateTime,
      fundDetails: [{ fundNo: "FUND1", fundCHName: "Test Fund", fundSHR: "100", refTWDValue: "12345", currAlias: "TWD", saleOrgCode: "ORG1" }]
    });
  }
  if (endpoint === "tsp/TSP006") {
    return respond("0000", {
      tspAccountInfos: [
        {
          bankId: "004",
          tspAccount: [{ accountNo: "1234567890", accountType: "活期儲蓄存款", currency: "TWD", balanceAmt: "45678", availableBalance: "45678", isShow: true }]
        }
      ]
    });
  }
  if (endpoint === "tsp/TSP007") {
    return respond("0000", {
      transactionDetails: [
        { stan: "live-cash-move-1", txnDateTime: "20240614120000", transferInAmount: "1000", transferOutAmount: "0", summary: "Settlement credit" }
      ]
    });
  }
  throw new Error(`unexpected endpoint ${endpoint}`);
}) as typeof fetch;

async function main() {
  const connector = createTdccConnector();
  const config = parseTdccConfig({ userId: "A123456789", password: "secret" });

  await assert.rejects(connector.sync(config, undefined), /OTP/, "first sync without OTP should be rejected");

  const configWithOtp = parseTdccConfig({ userId: "A123456789", password: "secret", otp: "123456" });
  const result = await connector.sync(configWithOtp, undefined);

  assert.equal(result.records.length, 3);
  assert.ok(result.records.some((r) => r.symbol === "2330" && r.assetType === "stock"));
  assert.ok(result.records.some((r) => r.symbol === "0050" && r.assetType === "etf"));
  assert.ok(result.records.some((r) => r.symbol === "FUND1" && r.assetType === "fund"));
  assert.equal(result.bankAccounts?.length, 1);
  assert.equal(result.bankAccounts?.[0]?.sourceId, "settlement:004:1234567890:TWD");
  assert.equal(result.bankBalanceSnapshots?.length, 1);
  assert.equal(result.bankBalanceSnapshots?.[0]?.balance, 45678);
  assert.equal(result.bankTransactions?.length, 1);
  assert.equal(result.bankTransactions?.[0]?.sourceId, "live-cash-move-1");
  assert.equal(result.bankTransactions?.[0]?.amount, 1000);
  assert.equal(JSON.parse(result.cursor!).session.tokenId, "TKN-1");

  const manualWithMovement = parseTdccConfig({
    holdings: [
      {
        brokerNo: "9A92",
        brokerAccount: "1234567",
        securityName: "TSMC",
        symbol: "2330",
        quantity: "1000",
        cashBalance: "50000",
        asOfDate: "20240615"
      }
    ],
    cashMovements: [
      {
        brokerNo: "9A92",
        brokerAccount: "1234567",
        sourceId: "cash-move-1",
        postedDate: "20240614",
        amount: "-1000",
        description: "Settlement debit"
      }
    ]
  });
  const manualResult = await connector.sync(manualWithMovement, undefined);
  assert.equal(manualResult.bankAccounts?.length, 1);
  assert.equal(manualResult.bankBalanceSnapshots?.length, 1);
  assert.equal(manualResult.bankTransactions?.length, 1);
  assert.equal(manualResult.bankTransactions?.[0]?.sourceId, "cash-move-1");

  calls.length = 0;
  await connector.sync(configWithOtp, result.cursor);
  assert.ok(!calls.includes("AU001"), "second sync should reuse session and skip login");

  // Re-sync with a different time-of-day suffix on the fund's updateTime: the
  // fund's sourceId must stay identical or the upsert dedupe breaks (the bug
  // this check guards against).
  const fund = result.records.find((r) => r.symbol === "FUND1")!;
  fundUpdateTime = "20240615153000";
  const resynced = await connector.sync(configWithOtp, result.cursor);
  const refund = resynced.records.find((r) => r.symbol === "FUND1")!;
  assert.equal(refund.sourceId, fund.sourceId, "fund sourceId must be stable across syncs despite time-of-day suffix");

  // Device verification can also arrive as an error code thrown from the login call
  // itself, instead of a flag on a successful response.
  mode = "error_code_otp";
  await assert.rejects(connector.sync(config, undefined), /OTP/, "error-code device verification should also gate on OTP");
  const errorCodeResult = await connector.sync(configWithOtp, undefined);
  assert.equal(errorCodeResult.records.length, 3, "error-code OTP path should still fetch holdings once verified");

  // A previously-trusted session can go stale between syncs; the connector should
  // drop it and retry with a fresh login rather than fail forever.
  mode = "stale_session";
  const staleCursor = JSON.stringify({
    deviceId: "dev-1",
    devType: "Android:14",
    devModel: "SM-G991B",
    session: { tokenId: "STALE-TKN", richUrl: null }
  });
  const recovered = await connector.sync(configWithOtp, staleCursor);
  assert.equal(recovered.records.length, 3, "stale session should recover via fresh login");
  assert.equal(JSON.parse(recovered.cursor!).session.tokenId, "TKN-1", "fresh login should replace the stale token");

  // An expired OTP must surface as a distinguishable error so the caller can
  // drop it from stored config instead of retrying with the same dead code.
  mode = "otp_expired";
  await assert.rejects(connector.sync(configWithOtp, undefined), TdccOtpExpiredError, "expired OTP should throw TdccOtpExpiredError");

  console.log("tdcc.selfcheck: ok");
}

main();
