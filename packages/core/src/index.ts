export interface NetWorthHistoryPoint {
  date: string; // YYYY-MM-DD
  netWorth: number;
  assetType?: "total" | "stock" | "fund";
}

export interface SyncResult<TResult> {
  records: TResult[];
  cursor?: string;
  invoiceLineItems?: Array<Omit<InvoiceLineItem, "id" | "connectorId" | "invoiceId">>;
  bankAccounts?: Array<Omit<BankAccount, "id" | "connectorId">>;
  bankBalanceSnapshots?: Array<Omit<BankBalanceSnapshot, "id" | "connectorId">>;
  bankTransactions?: Array<Omit<BankTransaction, "id" | "connectorId">>;
  investmentTransactions?: Array<Omit<InvestmentTransaction, "id" | "connectorId">>;
  netWorthHistory?: NetWorthHistoryPoint[];
}

export interface Connector<TConfig, TResult> {
  id: string;
  name: string;
  sync(config: TConfig, cursor?: string): Promise<SyncResult<TResult>>;
}

export interface Invoice {
  id: string;
  connectorId: string;
  sourceId: string;
  invoiceNumber?: string;
  invoiceDate: string;
  sellerName?: string;
  amount: number;
  raw?: unknown;
}

export interface InvoiceLineItem {
  id: string;
  connectorId: string;
  invoiceId: string;
  invoiceSourceId: string;
  sourceId: string;
  lineNumber: number;
  description: string;
  quantity?: number;
  unitPrice?: number;
  amount: number;
  raw?: unknown;
}

export type AssetType = "stock" | "etf" | "fund";

export interface InvestmentPosition {
  id: string;
  connectorId: string;
  sourceId: string;
  assetType: AssetType;
  symbol?: string;
  name: string;
  quantity?: number;
  marketValue?: number;
  cashBalance?: number;
  currency: string;
  asOfDate: string;
  raw?: unknown;
}

export interface InvestmentTransaction {
  id: string;
  connectorId: string;
  accountId: string;
  sourceId: string;
  brokerNo?: string;
  brokerAccount?: string;
  brokerName?: string;
  symbol?: string;
  name?: string;
  assetType?: AssetType | "bond" | "unknown";
  tradeDate?: string;
  postedDate?: string;
  transactionCode?: string;
  transactionName?: string;
  quantity?: number;
  price?: number;
  amount?: number;
  currency: string;
  raw?: unknown;
}

export type BankAccountType =
  | "checking"
  | "savings"
  | "credit"
  | "loan"
  | "settlement_cash"
  | "time_deposit"
  | "stored_value"
  | "unknown";

export interface BankAccount {
  id: string;
  connectorId: string;
  sourceId: string;
  institutionName?: string;
  accountName?: string;
  accountType?: BankAccountType;
  currency: string;
  raw?: unknown;
}

export interface BankBalanceSnapshot {
  id: string;
  connectorId: string;
  accountId: string;
  sourceId: string;
  balance: number;
  availableBalance?: number;
  currency: string;
  asOfAt: string;
  raw?: unknown;
}

export interface BankTransaction {
  id: string;
  connectorId: string;
  accountId: string;
  sourceId: string;
  postedDate?: string;
  authorizedAt?: string;
  amount: number;
  currency: string;
  description?: string;
  counterparty?: string;
  raw?: unknown;
}

export interface Summary {
  invoiceCount: number;
  investmentCount: number;
  totalInvestmentValue: number;
}

export interface ConnectorSettingsMetadata {
  connectorId: string;
  configured: boolean;
  updatedAt?: string;
}

export interface SyncResponse {
  success: true;
  records: number;
  detailRecords?: number;
  cursorUpdated: boolean;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

export const supportedConnectorIds = ["einvoice", "tdcc", "esun"] as const;
export type ConnectorId = (typeof supportedConnectorIds)[number];

export function isConnectorId(value: string): value is ConnectorId {
  return supportedConnectorIds.includes(value as ConnectorId);
}
