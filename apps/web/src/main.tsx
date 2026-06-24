import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  CreditCard,
  Database,
  FileText,
  KeyRound,
  Landmark,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  Trash2,
  TrendingUp,
  WalletCards
} from "lucide-react";
import { type ReactNode, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

interface NetWorthHistoryRow {
  date: string;
  netWorth: number;
  assetType: string;
  source: string;
}

interface ExchangeRateRow {
  currency: string;
  rateTwd: number;
  updatedAt: string;
}

interface ManualAssetRow {
  id: string;
  name: string;
  category: string;
  note: string | null;
  createdAt: string;
  value?: number;
  date?: string;
}

interface ManualAssetHistoryEntry {
  date: string;
  value: number;
}

type View = "dashboard" | "invoices" | "investments" | "cards" | "bank" | "assets" | "settings";
type ConnectorId = "einvoice" | "tdcc" | "esun";
type SyncTarget = "default" | "investments" | "bank" | "trades";

interface Summary {
  invoiceCount: number;
  investmentCount: number;
  totalInvestmentValue: number;
  bankAccountCount: number;
  totalBankBalance: number;
}

interface InvoiceLineItemRow {
  id: string;
  invoiceId?: string;
  sourceId: string;
  lineNumber: number;
  description: string;
  quantity?: number;
  unitPrice?: number;
  amount: number;
}

interface InvoiceRow {
  id: string;
  connectorId: ConnectorId;
  sourceId: string;
  invoiceDate: string;
  invoiceNumber?: string;
  sellerName?: string;
  amount: number;
  items: InvoiceLineItemRow[];
}

interface InvestmentRow {
  id: string;
  assetType: "stock" | "etf" | "fund";
  symbol?: string;
  name: string;
  quantity?: number;
  marketValue?: number;
  cashBalance?: number;
  currency: string;
  asOfDate: string;
}

interface InvestmentTransactionRow {
  id: string;
  connectorId: ConnectorId;
  accountId: string;
  sourceId: string;
  brokerNo?: string;
  brokerAccount?: string;
  brokerName?: string;
  symbol?: string;
  name?: string;
  assetType?: "stock" | "etf" | "fund" | "bond" | "unknown";
  tradeDate?: string;
  postedDate?: string;
  transactionCode?: string;
  transactionName?: string;
  quantity?: number;
  price?: number;
  amount?: number;
  currency: string;
}

interface BankAccountRow {
  id: string;
  connectorId: ConnectorId;
  sourceId: string;
  institutionName?: string;
  accountName?: string;
  accountType?: string;
  currency: string;
  bankCode?: string;
  accountLast4?: string;
  balance?: number;
  availableBalance?: number;
  asOfAt?: string;
}

interface BankTransactionRow {
  id: string;
  connectorId: ConnectorId;
  accountId: string;
  accountSourceId?: string;
  accountName?: string;
  institutionName?: string;
  accountType?: string;
  bankCode?: string;
  accountLast4?: string;
  sourceId: string;
  postedDate?: string;
  authorizedAt?: string;
  amount: number;
  currency: string;
  description?: string;
  counterparty?: string;
  status: "pending" | "posted";
  classification?: {
    categoryId: string;
    label: string;
    source: "override" | "user_rule" | "system_rule" | "fallback";
    ruleId?: string;
  };
}

interface BankData {
  accounts: BankAccountRow[];
  transactions: BankTransactionRow[];
}

interface ConnectorSettings {
  connectorId: ConnectorId;
  configured: boolean;
  updatedAt?: string;
}

interface SyncJobRow {
  id: string;
  connectorId: ConnectorId;
  scope: string;
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt: string;
  lockedUntil: string | null;
  lockedBy: string | null;
  lockTrigger: "manual" | "scheduled" | null;
  lockScope: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: "success" | "failed" | "needs_user_action" | null;
  lastError: string | null;
  updatedAt: string;
  running: boolean;
}

interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

const queryClient = new QueryClient();
const totalAssetsScopeStorageKey = "taiwan-fin-hub-total-assets-scope";
const netWorthChartIncludedAssetsStorageKey = "taiwan-fin-hub-net-worth-chart-included-assets";

const navItems: {
  view: View;
  label: string;
  shortLabel: string;
  description: string;
  icon: ReactNode;
}[] = [
  { view: "dashboard", label: "總覽", shortLabel: "總覽", description: "資產、現金流與最近交易集中檢視。", icon: <BarChart3 /> },
  { view: "invoices", label: "發票", shortLabel: "發票", description: "搜尋電子發票、商家與品項明細。", icon: <FileText /> },
  { view: "investments", label: "投資", shortLabel: "投資", description: "追蹤 TDCC 持倉與交易歷史。", icon: <WalletCards /> },
  { view: "cards", label: "信用卡", shortLabel: "卡片", description: "查看信用卡帳戶與刷卡交易。", icon: <CreditCard /> },
  { view: "bank", label: "銀行", shortLabel: "銀行", description: "管理銀行帳戶餘額與交易流水。", icon: <Building2 /> },
  { view: "assets", label: "其他資產", shortLabel: "資產", description: "維護保險、不動產、交通工具與其他資產估值。", icon: <Landmark /> },
  { view: "settings", label: "設定", shortLabel: "設定", description: "設定連接器、同步資料與匯率。", icon: <Settings /> }
];

function App() {
  const [view, setView] = useState<View>("dashboard");
  const currentView = navItems.find((item) => item.view === view) ?? navItems[0]!;

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-paper text-ink lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
        <aside className="hidden border-r border-ink/10 bg-white/90 px-4 py-5 shadow-sm lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
          <div className="px-2">
            <h1 className="text-xl font-semibold tracking-normal">Taiwan Fin Hub</h1>
            <p className="mt-1 text-sm text-ink/55">個人財務工作區</p>
          </div>
          <nav className="mt-6 grid gap-1">
            {navItems.map((item) => (
              <NavButton
                key={item.view}
                active={view === item.view}
                icon={item.icon}
                label={item.label}
                onClick={() => setView(item.view)}
              />
            ))}
          </nav>
        </aside>

        <div className="min-w-0 pb-20 lg:pb-0">
          <header className="sticky top-0 z-20 border-b border-ink/10 bg-white/92 backdrop-blur lg:static lg:bg-transparent lg:backdrop-blur-0">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="hidden text-xs font-medium uppercase text-ink/40 lg:block">Taiwan Fin Hub</p>
                  <h1 className="truncate text-2xl font-semibold tracking-normal lg:text-3xl">{currentView.label}</h1>
                  <p className="mt-1 hidden text-sm text-ink/55 sm:block">{currentView.description}</p>
                </div>
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
            <ApiProvider view={view} onNavigate={setView} />
          </main>

          <footer className="mx-auto max-w-7xl border-t border-ink/8 px-4 py-6 sm:px-6 lg:px-8">
            <p className="text-xs leading-relaxed text-ink/35">
              <strong className="font-medium text-ink/50">免責聲明：</strong>
              本程式僅供個人研究與自用，未與臺灣集中保管結算所、財政部、金融監督管理委員會、各銀行或任何金融機構合作，亦未獲前述機構授權或背書。本程式所呈現之資料以您自行提供之憑證取得，作者不保證資料之即時性、正確性與完整性，亦不對因使用本程式所產生之任何直接或間接損失負責。請勿將本程式用於任何商業用途。
            </p>
          </footer>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-1 overflow-x-auto border-t border-ink/10 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-8px_28px_rgba(31,41,51,0.08)] backdrop-blur lg:hidden">
          {navItems.map((item) => (
            <BottomNavButton
              key={item.view}
              active={view === item.view}
              icon={item.icon}
              label={item.shortLabel}
              onClick={() => setView(item.view)}
            />
          ))}
        </nav>
      </div>
    </QueryClientProvider>
  );
}

function ApiProvider({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const api = useMemo(() => createApiClient(), []);

  if (view === "dashboard") {
    return <Dashboard api={api} onNavigate={onNavigate} />;
  }

  if (view === "invoices") {
    return <Invoices api={api} />;
  }

  if (view === "investments") {
    return <Investments api={api} />;
  }

  if (view === "cards") {
    return <Cards api={api} />;
  }

  if (view === "bank") {
    return <Bank api={api} onNavigate={onNavigate} />;
  }

  if (view === "assets") {
    return (
      <div className="grid gap-6">
        <ManualAssetsPanel api={api} />
      </div>
    );
  }

  return <SettingsView api={api} />;
}

function Dashboard({ api, onNavigate }: { api: ApiClient; onNavigate: (v: View) => void }) {
  const summary = useQuery({ queryKey: ["summary"], queryFn: () => api.get<Summary>("/api/summary") });
  const bank = useQuery({ queryKey: ["bank"], queryFn: () => api.get<BankData>("/api/bank") });
  const investments = useQuery({ queryKey: ["investments"], queryFn: () => api.get<InvestmentRow[]>("/api/investments") });
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: () => api.get<InvoiceRow[]>("/api/invoices") });
  const netWorthHistory = useQuery({ queryKey: ["netWorthHistory"], queryFn: () => api.get<NetWorthHistoryRow[]>("/api/history/net-worth") });
  const trades = useQuery({ queryKey: ["investment-transactions"], queryFn: () => api.get<InvestmentTransactionRow[]>("/api/investment-transactions") });
  const manualAssets = useQuery({ queryKey: ["manualAssets"], queryFn: () => api.get<ManualAssetRow[]>("/api/manual-assets") });
  const fxRates = useQuery({ queryKey: ["exchange-rates"], queryFn: () => api.get<ExchangeRateRow[]>("/api/exchange-rates") });
  const [includeManualAssets, setIncludeManualAssets] = useState(() => {
    return localStorage.getItem(totalAssetsScopeStorageKey) !== "financial";
  });

  if (summary.isLoading) {
    return <EmptyState title="載入總覽中" body="正在讀取最新本機紀錄。" />;
  }

  if (summary.isError) {
    return <EmptyState title="無法載入總覽" body={messageFromError(summary.error)} />;
  }

  const s = summary.data ?? {
    invoiceCount: 0,
    investmentCount: 0,
    totalInvestmentValue: 0,
    bankAccountCount: 0,
    totalBankBalance: 0
  };

  const rateMap = Object.fromEntries((fxRates.data ?? []).map((r) => [r.currency, r.rateTwd]));
  const bankData = bank.data ?? { accounts: [], transactions: [] };
  const depositAccounts = bankData.accounts.filter((a) => a.accountType !== "credit");
  // convert each account balance to TWD using manual rates; skip foreign accounts with no rate
  const totalDeposits = depositAccounts.reduce((sum, a) => {
    const bal = a.balance ?? 0;
    const cur = a.currency || "TWD";
    if (cur === "TWD") return sum + bal;
    const rate = rateMap[cur];
    return rate ? sum + bal * rate : sum;
  }, 0);
  const totalManualAssets = (manualAssets.data ?? []).reduce((sum, a) => sum + (a.value ?? 0), 0);

  function updateIncludeManualAssets(include: boolean) {
    setIncludeManualAssets(include);
    localStorage.setItem(totalAssetsScopeStorageKey, include ? "all" : "financial");
  }

  // Group deposit accounts by institution
  const byBank = depositAccounts.reduce<Record<string, BankAccountRow[]>>((acc, account) => {
    const key = account.institutionName ?? account.connectorId;
    (acc[key] ??= []).push(account);
    return acc;
  }, {});

  // Recent 5 transactions (sorted by date desc)
  const recentTxns = [...bankData.transactions]
    .sort((a, b) => {
      const dateA = a.postedDate ?? a.authorizedAt ?? "";
      const dateB = b.postedDate ?? b.authorizedAt ?? "";
      return dateB.localeCompare(dateA);
    })
    .slice(0, 5);

  const missingRateCurrencies = [...new Set(depositAccounts.map(a => a.currency).filter(c => c && c !== "TWD" && !rateMap[c]))] as string[];

  return (
    <div className="grid gap-6">
      {missingRateCurrencies.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>帳戶含外幣（{missingRateCurrencies.join("、")}）尚未設定匯率，TWD 總額可能不準確。</span>
          <button onClick={() => onNavigate("settings")} className="shrink-0 font-medium underline underline-offset-2 hover:text-amber-900">前往設定</button>
        </div>
      )}
      <NetWorthHero
        depositAccounts={depositAccounts}
        totalDeposits={totalDeposits}
        totalInvestmentValue={s.totalInvestmentValue}
        totalManualAssets={totalManualAssets}
        manualAssets={manualAssets.data ?? []}
        includeManualAssets={includeManualAssets}
        onIncludeManualAssetsChange={updateIncludeManualAssets}
        investmentCount={s.investmentCount}
        investmentPositions={investments.data ?? []}
        investmentsLoading={investments.isLoading}
        rateMap={rateMap}
      />

      <NetWorthHistoryPanel data={netWorthHistory.data} loading={netWorthHistory.isLoading} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Bank Balances */}
        <section className="rounded-xl border border-ink/10 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-ink/8 px-5 py-4">
            <Building2 className="h-4 w-4 text-steel" />
            <h2 className="text-base font-semibold">各銀行餘額</h2>
          </div>
          {Object.keys(byBank).length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink/50">同步銀行連接器後顯示餘額。</p>
          ) : (
            <div className="divide-y divide-ink/8">
              {Object.entries(byBank).map(([name, accounts]) => {
                const lastUpdated = accounts.reduce<string>((latest, a) => {
                  return a.asOfAt && a.asOfAt > latest ? a.asOfAt : latest;
                }, "");
                // group by currency within this institution
                const byCurrency = Object.entries(
                  accounts.reduce<Record<string, number>>((acc, a) => {
                    const c = a.currency || "TWD";
                    acc[c] = (acc[c] ?? 0) + (a.balance ?? 0);
                    return acc;
                  }, {})
                );
                return (
                  <div key={name} className="px-5 py-3.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{name}</p>
                        <p className="text-xs text-ink/45">
                          {accounts.length} 個帳戶{lastUpdated ? ` · ${formatDate(lastUpdated)}` : ""}
                        </p>
                      </div>
                      {byCurrency.length === 1 && (
                        <p className="text-base font-semibold tabular-nums">
                          {formatCurrency(byCurrency[0]![1], byCurrency[0]![0])}
                        </p>
                      )}
                    </div>
                    {byCurrency.length > 1 && (
                      <div className="mt-2 grid gap-1 border-l-2 border-ink/8 pl-3">
                        {byCurrency.map(([currency, amount]) => (
                          <div key={currency} className="flex items-center justify-between">
                            <span className="text-xs text-ink/55">{currency}</span>
                            <span className="text-sm font-medium tabular-nums">{formatCurrency(amount, currency)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Recent Bank Transactions */}
        <section className="rounded-xl border border-ink/10 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-ink/8 px-5 py-4">
            <TrendingUp className="h-4 w-4 text-steel" />
            <h2 className="text-base font-semibold">最新銀行交易</h2>
          </div>
          {recentTxns.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink/50">同步銀行連接器後顯示交易。</p>
          ) : (
            <div className="divide-y divide-ink/8">
              {recentTxns.map((txn) => {
                const date = txn.postedDate ?? txn.authorizedAt;
                const isCredit = txn.amount > 0;
                return (
                  <div key={txn.id} className="flex items-center gap-3 px-5 py-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isCredit ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                      {isCredit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{txn.description ?? txn.counterparty ?? "交易"}</p>
                      <p className="text-xs text-ink/45">
                        {formatBankAccountName(txn) || txn.institutionName || ""}{date ? ` · ${formatDate(date)}` : ""}
                      </p>
                    </div>
                    <p className={`shrink-0 text-sm font-semibold tabular-nums ${isCredit ? "text-emerald-600" : "text-red-500"}`}>
                      {isCredit ? "+" : ""}{formatCurrency(txn.amount, txn.currency)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <MonthlySnapshotPanel
        bankTxns={bankData.transactions}
        loading={bank.isLoading}
      />

      <RecentTradesPanel data={trades.data} loading={trades.isLoading} />
    </div>
  );
}

const ASSET_CATEGORIES: Record<string, string> = {
  real_estate: "不動產",
  vehicle: "交通工具",
  insurance: "保單",
  other: "其他",
};

function todayStr() { return new Date().toISOString().slice(0, 10); }

const INPUT_CLS = "rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm outline-none";
const BTN_PRIMARY = "rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-ink/80";
const BTN_GHOST = "rounded-lg border border-ink/15 px-4 py-2 text-sm font-medium text-ink/60 hover:text-ink";

function AssetRow({ asset, api, onDeleted }: { asset: ManualAssetRow; api: ApiClient; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: asset.name, category: asset.category, note: asset.note ?? "" });
  const [addingEntry, setAddingEntry] = useState(false);
  const [entryForm, setEntryForm] = useState({ value: "", date: todayStr() });
  const [editEntryDate, setEditEntryDate] = useState<string | null>(null);
  const [editEntryValue, setEditEntryValue] = useState("");

  const { data: history = [] } = useQuery({
    queryKey: ["manualAssetHistory", asset.id],
    queryFn: () => api.get<ManualAssetHistoryEntry[]>(`/api/manual-assets/${asset.id}/history`),
    enabled: expanded,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["manualAssets"] });
    qc.invalidateQueries({ queryKey: ["netWorthHistory"] });
    qc.invalidateQueries({ queryKey: ["manualAssetHistory", asset.id] });
  };

  const updateMetaMut = useMutation({
    mutationFn: () => api.put<{ success: true }>(`/api/manual-assets/${asset.id}`, { name: editForm.name, category: editForm.category, note: editForm.note || undefined }),
    onSuccess: () => { invalidate(); setEditing(false); },
  });

  const deleteAssetMut = useMutation({
    mutationFn: () => api.delete<{ success: true }>(`/api/manual-assets/${asset.id}`),
    onSuccess: onDeleted,
  });

  const addEntryMut = useMutation({
    mutationFn: () => api.post<{ success: true }>(`/api/manual-assets/${asset.id}/history`, { value: Number(entryForm.value), date: entryForm.date }),
    onSuccess: () => { invalidate(); setAddingEntry(false); setEntryForm({ value: "", date: todayStr() }); },
  });

  const editEntryMut = useMutation({
    mutationFn: (date: string) => api.post<{ success: true }>(`/api/manual-assets/${asset.id}/history`, { value: Number(editEntryValue), date }),
    onSuccess: () => { invalidate(); setEditEntryDate(null); },
  });

  const deleteEntryMut = useMutation({
    mutationFn: (date: string) => api.delete<{ success: true }>(`/api/manual-assets/${asset.id}/history/${date}`),
    onSuccess: invalidate,
  });

  const displayName = editing ? asset.name : (editForm.name || asset.name);

  return (
    <div className="border-b border-ink/8 last:border-b-0">
      {/* Asset header row */}
      {editing ? (
        <div className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">名稱</span>
            <input className={INPUT_CLS} value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">類別</span>
            <select className={INPUT_CLS} value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}>
              {Object.entries(ASSET_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">備註</span>
            <input className={INPUT_CLS} placeholder="選填" value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => updateMetaMut.mutate()} disabled={!editForm.name || updateMetaMut.isPending} className={BTN_PRIMARY}>
              {updateMetaMut.isPending ? "儲存中…" : "儲存"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className={BTN_GHOST}>取消</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-5 py-3">
          <button type="button" onClick={() => setExpanded(e => !e)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <ChevronDown className={`h-4 w-4 shrink-0 text-ink/40 transition-transform ${expanded ? "rotate-180" : ""}`} />
            <div className="min-w-0">
              <p className="text-sm font-medium">{asset.name}</p>
              <p className="text-xs text-ink/50">{ASSET_CATEGORIES[asset.category] ?? asset.category}{asset.note ? ` · ${asset.note}` : ""}</p>
            </div>
          </button>
          <div className="flex items-center gap-3 pl-4">
            {asset.value != null ? (
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">{formatCurrency(asset.value)}</p>
                <p className="text-xs text-ink/40">{asset.date}</p>
              </div>
            ) : (
              <span className="text-xs text-ink/40">未設定估值</span>
            )}
            <button type="button" onClick={() => { setEditing(true); setEditForm({ name: asset.name, category: asset.category, note: asset.note ?? "" }); }}
              className="rounded-md p-1 text-ink/30 hover:text-ink">
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => deleteAssetMut.mutate()} disabled={deleteAssetMut.isPending}
              className="rounded-md p-1 text-ink/30 hover:text-red-500">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Expanded history section */}
      {expanded && (
        <div className="bg-paper/50 px-5 pb-4">
          <div className="flex items-center justify-between py-3">
            <span className="text-xs font-medium text-ink/50">估值歷史</span>
            <button type="button" onClick={() => { setAddingEntry(true); setEntryForm({ value: String(asset.value ?? ""), date: todayStr() }); }}
              className="flex items-center gap-1 rounded-md border border-ink/15 px-2.5 py-1 text-xs font-medium text-ink/60 hover:text-ink">
              <Plus className="h-3 w-3" /> 新增紀錄
            </button>
          </div>

          {addingEntry && (
            <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-ink/10 bg-white p-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-ink/50">估值 (TWD)</span>
                <input className={INPUT_CLS} type="number" value={entryForm.value} onChange={e => setEntryForm(f => ({ ...f, value: e.target.value }))} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-ink/50">日期</span>
                <input className={INPUT_CLS} type="date" value={entryForm.date} onChange={e => setEntryForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => addEntryMut.mutate()} disabled={!entryForm.value || addEntryMut.isPending} className={BTN_PRIMARY}>
                  {addEntryMut.isPending ? "儲存中…" : "確認"}
                </button>
                <button type="button" onClick={() => setAddingEntry(false)} className={BTN_GHOST}>取消</button>
              </div>
            </div>
          )}

          {history.length === 0 && !addingEntry ? (
            <p className="py-2 text-xs text-ink/40">尚無紀錄</p>
          ) : (
            <div className="divide-y divide-ink/8 rounded-lg border border-ink/10 bg-white">
              {history.map(entry => (
                <div key={entry.date}>
                  {editEntryDate === entry.date ? (
                    <div className="flex flex-wrap items-end gap-3 px-4 py-2">
                      <input className={INPUT_CLS} type="number" value={editEntryValue} onChange={e => setEditEntryValue(e.target.value)} />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => editEntryMut.mutate(entry.date)} disabled={!editEntryValue || editEntryMut.isPending} className={BTN_PRIMARY}>
                          {editEntryMut.isPending ? "…" : "儲存"}
                        </button>
                        <button type="button" onClick={() => setEditEntryDate(null)} className={BTN_GHOST}>取消</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between px-4 py-2">
                      <span className="text-xs text-ink/50 tabular-nums">{entry.date}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium tabular-nums">{formatCurrency(entry.value)}</span>
                        <button type="button" onClick={() => { setEditEntryDate(entry.date); setEditEntryValue(String(entry.value)); }}
                          className="rounded p-0.5 text-ink/30 hover:text-ink">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" onClick={() => deleteEntryMut.mutate(entry.date)} disabled={deleteEntryMut.isPending}
                          className="rounded p-0.5 text-ink/30 hover:text-red-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ManualAssetsPanel({ api }: { api: ApiClient }) {
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ["manualAssets"],
    queryFn: () => api.get<ManualAssetRow[]>("/api/manual-assets"),
  });

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", category: "real_estate", value: "", date: todayStr(), note: "" });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["manualAssets"] });
    qc.invalidateQueries({ queryKey: ["netWorthHistory"] });
  };

  const addMutation = useMutation({
    mutationFn: () => api.post<{ id: string }>("/api/manual-assets", { ...form, value: Number(form.value) }),
    onSuccess: () => { invalidate(); setAdding(false); setForm({ name: "", category: "real_estate", value: "", date: todayStr(), note: "" }); },
  });

  return (
    <section className="rounded-xl border border-ink/10 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-ink/8 px-5 py-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-steel" />
          <h2 className="text-base font-semibold">其他資產</h2>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="flex items-center gap-1 rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-ink/80">
            <Plus className="h-3.5 w-3.5" /> 新增
          </button>
        )}
      </div>

      {adding && (
        <div className="flex flex-wrap items-end gap-3 border-b border-ink/8 px-5 py-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">名稱</span>
            <input className={INPUT_CLS} placeholder="台北市XX路房子" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">類別</span>
            <select className={INPUT_CLS} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {Object.entries(ASSET_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">估值 (TWD)</span>
            <input className={INPUT_CLS} type="number" placeholder="5000000" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">日期</span>
            <input className={INPUT_CLS} type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-ink/50">備註</span>
            <input className={INPUT_CLS} placeholder="選填" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => addMutation.mutate()} disabled={!form.name || !form.value || addMutation.isPending} className={BTN_PRIMARY}>
              {addMutation.isPending ? "儲存中…" : "確認"}
            </button>
            <button type="button" onClick={() => setAdding(false)} className={BTN_GHOST}>取消</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="px-5 py-8 text-center text-sm text-ink/50">載入中…</p>
      ) : data.length === 0 && !adding ? (
        <p className="px-5 py-8 text-center text-sm text-ink/50">尚無其他資產，點擊「新增」加入保險、不動產、交通工具或其他資產。</p>
      ) : (
        <div>
          {data.map(asset => (
            <AssetRow key={asset.id} asset={asset} api={api} onDeleted={invalidate} />
          ))}
        </div>
      )}
    </section>
  );
}

// hex colors for inline chart segments (Tailwind classes don't work reliably in style attributes)
const INV_SEGMENTS: Record<string, { hex: string; tw: string; label: string }> = {
  deposit: { hex: "#60a5fa", tw: "bg-blue-400",   label: "存款" },
  stock:   { hex: "#818cf8", tw: "bg-indigo-400", label: "股票" },
  etf:     { hex: "#34d399", tw: "bg-emerald-400",label: "ETF"  },
  fund:    { hex: "#c084fc", tw: "bg-purple-400", label: "基金" },
  cash:    { hex: "#60a5fa", tw: "bg-blue-400",   label: "現金" },
  invest:  { hex: "#818cf8", tw: "bg-indigo-400", label: "投資" },
  insurance: { hex: "#f97316", tw: "bg-orange-500", label: "保險" },
  tangible:  { hex: "#a16207", tw: "bg-yellow-700", label: "實體資產" },
  other:     { hex: "#64748b", tw: "bg-slate-500",  label: "其他" },
};

type AssetAllocationSegment = {
  key: string;
  label: string;
  value: number;
  hex: string;
};

type AssetTreemapNode = AssetAllocationSegment & {
  detail?: string;
  layoutValue?: number;
  children?: AssetTreemapNode[];
};

type TreemapRect = {
  node: AssetTreemapNode;
  x: number;
  y: number;
  w: number;
  h: number;
};

type ManualAssetGroupKey = "insurance" | "tangible" | "other";

function manualAssetGroup(category: string): ManualAssetGroupKey {
  if (category === "insurance") return "insurance";
  if (category === "real_estate" || category === "vehicle") return "tangible";
  return "other";
}

function treemapLayout(nodes: AssetTreemapNode[], x = 0, y = 0, w = 100, h = 100): TreemapRect[] {
  const visible = nodes.filter((node) => node.value > 0).sort((a, b) => b.value - a.value);
  const total = visible.reduce((sum, node) => sum + (node.layoutValue ?? node.value), 0);
  if (visible.length === 0 || total <= 0) return [];
  if (visible.length === 1) return [{ node: visible[0]!, x, y, w, h }];

  let splitIndex = 0;
  let leftSum = 0;
  for (let i = 0; i < visible.length; i += 1) {
    const nextValue = visible[i]!.layoutValue ?? visible[i]!.value;
    if (leftSum + nextValue > total / 2 && i > 0) break;
    leftSum += nextValue;
    splitIndex = i + 1;
  }

  const first = visible.slice(0, splitIndex);
  const second = visible.slice(splitIndex);
  const firstShare = leftSum / total;

  if (w >= h) {
    const firstW = w * firstShare;
    return [
      ...treemapLayout(first, x, y, firstW, h),
      ...treemapLayout(second, x + firstW, y, w - firstW, h),
    ];
  }

  const firstH = h * firstShare;
  return [
    ...treemapLayout(first, x, y, w, firstH),
    ...treemapLayout(second, x, y + firstH, w, h - firstH),
  ];
}

function AssetTreemap({ nodes, total }: { nodes: AssetTreemapNode[]; total: number }) {
  const minTopValue = total * 0.08;
  const visibleNodes = nodes
    .filter((node) => node.value > 0)
    .map((node) => ({ ...node, layoutValue: Math.max(node.value, minTopValue) }));
  const tiles = treemapLayout(visibleNodes);

  return (
    <div
      aria-label="資產配置 treemap"
      className="relative h-72 overflow-hidden rounded-lg border border-ink/10 bg-ink/[0.03] sm:h-80"
    >
      {tiles.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-ink/45">尚無資產資料</div>
      ) : (
        tiles.map((tile) => <AssetTreemapTile key={tile.node.key} rect={tile} total={total} />)
      )}
    </div>
  );
}

function AssetTreemapTile({ rect, total }: { rect: TreemapRect; total: number }) {
  const { node, x, y, w, h } = rect;
  const share = total > 0 ? (node.value / total) * 100 : 0;
  const area = w * h;
  const isNarrow = w < 18;
  const showAmount = area > 650 && !isNarrow;
  const minChildValue = node.value * 0.12;
  const childTiles = node.children && area > 1100
    ? treemapLayout(node.children.map((child) => ({ ...child, layoutValue: Math.max(child.value, minChildValue) })))
    : [];

  return (
    <div
      className="absolute overflow-hidden p-1"
      style={{ left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }}
      title={`${node.label} ${formatCurrency(node.value)} ${share.toFixed(1)}%${node.detail ? ` · ${node.detail}` : ""}`}
    >
      <div
        className="relative h-full overflow-hidden rounded-md border p-2"
        style={{ borderColor: node.hex, backgroundColor: `${node.hex}1A` }}
      >
        <div className="relative z-10 min-w-0">
          <div className={isNarrow ? "grid min-w-0 gap-0.5 leading-tight" : "flex min-w-0 items-baseline justify-between gap-2"}>
            <span className="truncate text-sm font-semibold text-ink">{node.label}</span>
            <span className={isNarrow ? "block text-xs font-semibold tabular-nums text-ink/70" : "shrink-0 text-xs font-semibold tabular-nums text-ink/70"}>
              {isNarrow ? `${Math.round(share)}%` : `${share.toFixed(1)}%`}
            </span>
          </div>
          {showAmount && (
            <div className="mt-1 truncate text-xs font-medium tabular-nums text-ink/55">
              {formatCompactTwd(node.value)}
              {node.detail ? ` · ${node.detail}` : ""}
            </div>
          )}
        </div>
        {childTiles.length > 0 && (
          <div className="absolute inset-x-2 bottom-2 top-14">
            {childTiles.map((tile) => (
              <div
                key={tile.node.key}
                className="absolute overflow-hidden rounded border border-white/60 px-2 py-1 text-white"
                style={{
                  left: `${tile.x}%`,
                  top: `${tile.y}%`,
                  width: `${tile.w}%`,
                  height: `${tile.h}%`,
                  backgroundColor: tile.node.hex,
                }}
                title={`${tile.node.label} ${formatCurrency(tile.node.value)} ${total > 0 ? ((tile.node.value / total) * 100).toFixed(1) : "-"}%`}
              >
                {tile.w * tile.h > 360 && tile.w >= 16 && (
                  <>
                    <div className="truncate text-xs font-semibold">{tile.node.label}</div>
                    <div className="truncate text-[11px] font-medium tabular-nums text-white/85">
                      {formatCompactTwd(tile.node.value)} · {total > 0 ? `${((tile.node.value / total) * 100).toFixed(1)}%` : "-"}
                    </div>
                  </>
                )}
                {tile.w * tile.h > 360 && tile.w < 16 && (
                  <>
                    <div className="truncate text-xs font-semibold leading-tight">{tile.node.label}</div>
                    <div className="block truncate text-[11px] font-medium leading-tight tabular-nums text-white/85">
                      {total > 0 ? `${Math.round((tile.node.value / total) * 100)}%` : "-"}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NetWorthHero({
  depositAccounts,
  totalDeposits,
  totalInvestmentValue,
  totalManualAssets,
  manualAssets,
  includeManualAssets,
  onIncludeManualAssetsChange,
  investmentCount,
  investmentPositions,
  investmentsLoading,
  rateMap = {},
}: {
  depositAccounts: BankAccountRow[];
  totalDeposits: number;
  totalInvestmentValue: number;
  totalManualAssets: number;
  manualAssets: ManualAssetRow[];
  includeManualAssets: boolean;
  onIncludeManualAssetsChange: (include: boolean) => void;
  investmentCount: number;
  investmentPositions: InvestmentRow[];
  investmentsLoading: boolean;
  rateMap?: Record<string, number>;
}) {
  const financialTotal = totalDeposits + totalInvestmentValue;
  const total = financialTotal + (includeManualAssets ? totalManualAssets : 0);

  const depositsByCurrency = Object.entries(
    depositAccounts.reduce<Record<string, { raw: number; valueTwd: number }>>((acc, a) => {
      const c = a.currency || "TWD";
      const balance = a.balance ?? 0;
      const rate = c === "TWD" ? 1 : rateMap[c];
      if (!rate) return acc;
      const current = acc[c] ?? { raw: 0, valueTwd: 0 };
      acc[c] = { raw: current.raw + balance, valueTwd: current.valueTwd + balance * rate };
      return acc;
    }, {})
  ).filter(([, v]) => v.valueTwd !== 0);

  const byType = investmentPositions.reduce<Record<string, number>>((acc, inv) => {
    if (inv.marketValue) acc[inv.assetType] = (acc[inv.assetType] ?? 0) + inv.marketValue;
    return acc;
  }, {});

  const manualByCategory = manualAssets.reduce<Record<string, number>>((acc, asset) => {
    const value = asset.value ?? 0;
    if (value > 0) acc[asset.category] = (acc[asset.category] ?? 0) + value;
    return acc;
  }, {});
  const manualByGroup = manualAssets.reduce<Record<ManualAssetGroupKey, number>>((acc, asset) => {
    const value = asset.value ?? 0;
    if (value <= 0) return acc;
    const group = manualAssetGroup(asset.category);
    acc[group] = (acc[group] ?? 0) + value;
    return acc;
  }, { insurance: 0, tangible: 0, other: 0 });

  const manualCategoryChildren = (group: ManualAssetGroupKey) => Object.entries(manualByCategory)
    .filter(([category]) => manualAssetGroup(category) === group)
    .map(([category, value]) => ({
      key: `${group}-${category}`,
      label: ASSET_CATEGORIES[category] ?? category,
      value,
      hex: INV_SEGMENTS[group]!.hex,
    }));
  const manualSubRowsByGroup = (group: ManualAssetGroupKey) => Object.entries(manualByCategory)
    .filter(([, value]) => value > 0)
    .filter(([category]) => manualAssetGroup(category) === group);

  const treemapNodes: AssetTreemapNode[] = [
    {
      key: "cash",
      label: "現金",
      value: totalDeposits,
      hex: INV_SEGMENTS.cash!.hex,
      children: depositsByCurrency.map(([currency, value]) => ({
        key: `cash-${currency}`,
        label: currency,
        value: value.valueTwd,
        detail: currency === "TWD" ? undefined : formatCurrency(value.raw, currency),
        hex: INV_SEGMENTS.cash!.hex,
      })),
    },
    {
      key: "invest",
      label: "投資",
      value: totalInvestmentValue,
      hex: INV_SEGMENTS.invest!.hex,
      detail: `${investmentCount} 個持倉`,
      children: (["stock", "etf", "fund"] as const).map((key) => ({
        key: `invest-${key}`,
        label: INV_SEGMENTS[key]!.label,
        value: byType[key] ?? 0,
        hex: INV_SEGMENTS[key]!.hex,
      })),
    },
    {
      key: "insurance",
      label: "保險",
      value: includeManualAssets ? manualByGroup.insurance : 0,
      hex: INV_SEGMENTS.insurance!.hex,
      children: manualCategoryChildren("insurance"),
    },
    {
      key: "tangible",
      label: "實體資產",
      value: includeManualAssets ? manualByGroup.tangible : 0,
      hex: INV_SEGMENTS.tangible!.hex,
      children: manualCategoryChildren("tangible"),
    },
    {
      key: "other",
      label: "其他",
      value: includeManualAssets ? manualByGroup.other : 0,
      hex: INV_SEGMENTS.other!.hex,
      children: manualCategoryChildren("other"),
    },
  ];

  function pct(value: number) {
    return total > 0 ? `${((value / total) * 100).toFixed(1)}%` : "-";
  }

  const invSubRows = (["stock", "etf", "fund"] as const).filter(k => (byType[k] ?? 0) > 0);

  return (
    <section className="rounded-xl border border-ink/10 bg-white p-6 shadow-sm">
      <div className="grid gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink/50">總資產</p>
            <p className="mt-1 text-4xl font-bold tracking-tight">{formatCurrency(total)}</p>
          </div>
          <div className="inline-flex w-fit rounded-lg border border-ink/10 bg-ink/[0.03] p-1 text-xs font-medium">
            {[
              { label: "流動資產", include: false },
              { label: "全部資產", include: true },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => onIncludeManualAssetsChange(option.include)}
                className={`rounded-md px-3 py-1.5 transition ${
                  includeManualAssets === option.include
                    ? "bg-white text-ink shadow-sm"
                    : "text-ink/55 hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <AssetTreemap nodes={treemapNodes} total={total} />

        <div className="grid gap-3">
          {/* Deposits */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full bg-blue-400" />
              <span className="text-sm font-medium">存款</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-semibold tabular-nums">{formatCurrency(totalDeposits)}</span>
              <span className="ml-2 text-xs text-ink/40">{pct(totalDeposits)}</span>
            </div>
          </div>
          {/* Deposit currency sub-breakdown */}
          {depositsByCurrency.length > 1 && (
            <div className="ml-5 grid gap-1.5 border-l-2 border-ink/8 pl-3">
              {depositsByCurrency.map(([currency, amount]) => {
                const rate = currency !== "TWD" ? rateMap[currency] : undefined;
                return (
                  <div key={currency} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-ink/55">{currency}</span>
                    <span className="text-xs font-medium tabular-nums">
                      {formatCurrency(amount.raw, currency)}
                      {currency !== "TWD" && <span className="ml-1 text-ink/40">≈ {formatCurrency(amount.valueTwd)}</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Investments total */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 shrink-0 rounded-full bg-indigo-400" />
              <div>
                <span className="text-sm font-medium">投資</span>
                <span className="ml-2 text-xs text-ink/45">{investmentCount} 個持倉</span>
              </div>
            </div>
            <div className="text-right">
              {investmentsLoading ? (
                <span className="text-xs text-ink/40">載入中…</span>
              ) : (
                <>
                  <span className="text-sm font-semibold">{formatCurrency(totalInvestmentValue)}</span>
                  <span className="ml-2 text-xs text-ink/40">{pct(totalInvestmentValue)}</span>
                </>
              )}
            </div>
          </div>

          {/* Investment sub-breakdown */}
          {!investmentsLoading && invSubRows.length > 0 && (
            <div className="ml-5 grid gap-2 border-l-2 border-ink/8 pl-3">
              {invSubRows.map(k => {
                const seg = INV_SEGMENTS[k]!;
                const val = byType[k] ?? 0;
                return (
                  <div key={k} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${seg.tw}`} />
                      <span className="text-xs text-ink/65">{seg.label}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-medium">{formatCurrency(val)}</span>
                      <span className="ml-1 text-xs text-ink/40">
                        {totalInvestmentValue > 0 ? `${((val / totalInvestmentValue) * 100).toFixed(1)}%` : "-"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {totalManualAssets > 0 && (
            <>
              {(["insurance", "tangible", "other"] as const)
                .filter((key) => manualByGroup[key] > 0)
                .map((key) => {
                  const seg = INV_SEGMENTS[key]!;
                  const value = manualByGroup[key];
                  return (
                    <div key={key} className="grid gap-2">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <span className={`h-3 w-3 shrink-0 rounded-full ${seg.tw}`} />
                          <div>
                            <span className="text-sm font-medium">{seg.label}</span>
                            {!includeManualAssets && <span className="ml-2 text-xs text-ink/45">未納入</span>}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-semibold tabular-nums">{formatCurrency(value)}</span>
                          <span className="ml-2 text-xs text-ink/40">{includeManualAssets ? pct(value) : "-"}</span>
                        </div>
                      </div>
                      {manualSubRowsByGroup(key).length > (key === "tangible" ? 0 : 1) && (
                        <div className="ml-5 grid gap-2 border-l-2 border-ink/8 pl-3">
                          {manualSubRowsByGroup(key).map(([category, subValue]) => (
                            <div key={category} className="flex items-center justify-between gap-4">
                              <span className="text-xs text-ink/65">{ASSET_CATEGORIES[category] ?? category}</span>
                              <div className="text-right">
                                <span className="text-xs font-medium">{formatCurrency(subValue)}</span>
                                <span className="ml-1 text-xs text-ink/40">
                                  {includeManualAssets && value > 0 ? `${((subValue / value) * 100).toFixed(1)}%` : "-"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function buildMonthKeys(n = 6): { key: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { key, label: `${d.getMonth() + 1}月` };
  });
}

function fmtCompact(v: number): string {
  const a = Math.abs(v);
  if (a >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}億`;
  if (a >= 10_000)      return `${(v / 10_000).toFixed(0)}萬`;
  if (a >= 1_000)       return `${(v / 1_000).toFixed(1)}K`;
  return `${Math.round(v)}`;
}

function MonthlySnapshotPanel({
  bankTxns,
  loading,
}: {
  bankTxns: BankTransactionRow[];
  loading: boolean;
}) {
  const months = buildMonthKeys(6);

  const incomeMap: Record<string, number> = {};
  const expenseMap: Record<string, number> = {};
  for (const txn of bankTxns) {
    const date = txn.postedDate ?? txn.authorizedAt;
    if (!date) continue;
    const m = date.slice(0, 7);
    if (txn.amount > 0) incomeMap[m] = (incomeMap[m] ?? 0) + txn.amount;
    else expenseMap[m] = (expenseMap[m] ?? 0) + Math.abs(txn.amount);
  }

  return (
    <section className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <BarChart3 className="h-4 w-4 text-steel" />
        每月收支
      </h2>

      {loading ? (
        <p className="mt-4 text-sm text-ink/50">載入中…</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr>
                <th className="w-14 text-left text-xs font-normal text-ink/40" />
                {months.map((m) => (
                  <th key={m.key} className="pb-2 text-xs font-normal text-ink/40">{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {[
                { label: "收入", map: incomeMap, cls: "text-emerald-600" },
                { label: "支出", map: expenseMap, cls: "text-red-500" },
              ].map(({ label, map, cls }) => (
                <tr key={label}>
                  <td className="py-2 text-left text-xs text-ink/40">{label}</td>
                  {months.map((m, i) => {
                    const val = map[m.key];
                    const isLatest = i === months.length - 1;
                    return (
                      <td key={m.key} className={`py-2 tabular-nums ${cls} ${isLatest ? "font-semibold" : "opacity-50"}`}>
                        {val ? fmtCompact(val) : <span className="text-ink/20">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td className="py-2 text-left text-xs text-ink/40">差額</td>
                {months.map((m, i) => {
                  const inc = incomeMap[m.key] ?? 0;
                  const exp = expenseMap[m.key] ?? 0;
                  const net = inc - exp;
                  const isLatest = i === months.length - 1;
                  const hasData = inc > 0 || exp > 0;
                  return (
                    <td key={m.key} className={`py-2 tabular-nums ${net >= 0 ? "text-emerald-600" : "text-red-500"} ${isLatest ? "font-semibold" : "opacity-50"}`}>
                      {hasData ? (net >= 0 ? "+" : "") + fmtCompact(net) : <span className="text-ink/20">—</span>}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

type Timeframe = "1M" | "3M" | "6M" | "1Y" | "ALL";
const TIMEFRAMES: Timeframe[] = ["1M", "3M", "6M", "1Y", "ALL"];
const TIMEFRAME_MONTHS: Record<Timeframe, number | null> = { "1M": 1, "3M": 3, "6M": 6, "1Y": 12, "ALL": null };

type NwIncludedAssetType = "stock" | "fund" | "deposit" | "manual";
type NwDisplayMode = "sum" | "breakdown";
type NwSeriesKey = NwIncludedAssetType | "selectedTotal";

const NW_DEFAULT_INCLUDED_ASSETS: NwIncludedAssetType[] = ["stock", "fund", "deposit"];
const NW_DISPLAY_MODES: { key: NwDisplayMode; label: string }[] = [
  { key: "sum", label: "總和" },
  { key: "breakdown", label: "細分" },
];
const NW_ASSET_SERIES: { key: NwIncludedAssetType; color: string; label: string }[] = [
  { key: "stock", color: "#818cf8", label: "股票/ETF" },
  { key: "fund", color: "#c084fc", label: "基金" },
  { key: "deposit", color: "#38bdf8", label: "存款" },
  { key: "manual", color: "#f59e0b", label: "其他資產" },
];
const NW_SUM_SERIES = { key: "selectedTotal" as const, color: "#10b981", label: "已選總和" };

function niceYTicks(min: number, max: number, count = 4): number[] {
  if (max <= min) return [min];
  const raw = (max - min) / (count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = Math.ceil(raw / mag) * mag;
  const base = Math.floor(min / step) * step;
  return Array.from({ length: count + 1 }, (_, i) => base + i * step).filter(v => v >= min - step * 0.01 && v <= max + step * 0.99).slice(0, count);
}

function latestSeriesValue(rows: NetWorthHistoryRow[], date: string) {
  let value = 0;
  for (const row of rows) {
    if (row.date > date) break;
    value = row.netWorth;
  }
  return value;
}

function formatWan(v: number): string {
  const wan = v / 10000;
  return wan >= 10000 ? `${(wan / 10000).toFixed(0)}億` : wan >= 100 ? `${Math.round(wan / 10) * 10}萬` : `${Math.round(wan)}萬`;
}

function NetWorthHistoryPanel({ data, loading }: { data?: NetWorthHistoryRow[]; loading: boolean }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1Y");
  const [displayMode, setDisplayMode] = useState<NwDisplayMode>("sum");
  const [includedAssets, setIncludedAssets] = useState<NwIncludedAssetType[]>(() => {
    const saved = localStorage.getItem(netWorthChartIncludedAssetsStorageKey);
    if (!saved) return NW_DEFAULT_INCLUDED_ASSETS;
    try {
      const parsed = JSON.parse(saved);
      const validKeys = new Set<NwIncludedAssetType>(NW_ASSET_SERIES.map((s) => s.key));
      const next = Array.isArray(parsed)
        ? parsed.filter((key): key is NwIncludedAssetType => validKeys.has(key))
        : [];
      return next.length > 0 ? next : NW_DEFAULT_INCLUDED_ASSETS;
    } catch {
      return NW_DEFAULT_INCLUDED_ASSETS;
    }
  });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const availableAssetTypes = useMemo(() => {
    const rows = data ?? [];
    return new Set<NwIncludedAssetType>([
      ...(rows.some(r => r.assetType === "stock") ? ["stock" as const] : []),
      ...(rows.some(r => r.assetType === "fund") ? ["fund" as const] : []),
      ...(rows.some(r => r.source === "bank" && r.assetType === "deposit") ? ["deposit" as const] : []),
      ...(rows.some(r => r.source === "manual") ? ["manual" as const] : []),
    ]);
  }, [data]);

  const selectedAssetSet = useMemo(() => new Set(includedAssets), [includedAssets]);

  function updateIncludedAssets(next: NwIncludedAssetType[]) {
    setIncludedAssets(next);
    localStorage.setItem(netWorthChartIncludedAssetsStorageKey, JSON.stringify(next));
    setHoverIndex(null);
  }

  function toggleIncludedAsset(assetType: NwIncludedAssetType) {
    const next = selectedAssetSet.has(assetType)
      ? includedAssets.filter((key) => key !== assetType)
      : [...includedAssets, assetType];
    if (next.length > 0) updateIncludedAssets(next);
  }

  // Groups by asset type, with manual assets aggregated and selectedTotal synthesized.
  const seriesData = useMemo(() => {
    const all = (data ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const months = TIMEFRAME_MONTHS[timeframe];
    const now = new Date();
    const cutoff = months !== null
      ? new Date(now.getFullYear(), now.getMonth() - months, now.getDate()).toISOString().slice(0, 10)
      : null;

    function latestValue(rows: NetWorthHistoryRow[], date: string) {
      let value = 0;
      for (const row of rows) {
        if (row.date > date) break;
        value = row.netWorth;
      }
      return value;
    }

    const byType: Record<string, NetWorthHistoryRow[]> = {};
    for (const r of all.filter(r => !cutoff || r.date >= cutoff)) {
      (byType[r.assetType] ??= []).push(r);
    }

    const depositRows = all.filter(r => r.source === "bank" && r.assetType === "deposit");
    const manualRows = all.filter(r => r.source === "manual");
    const manualIds = [...new Set(manualRows.map(r => r.assetType))];
    const manualDates = [...new Set(manualRows.map(r => r.date).filter(date => !cutoff || date >= cutoff))].sort();
    byType["manual"] = manualDates.map(date => ({
      date,
      netWorth: manualIds.reduce((sum, assetId) => {
        return sum + latestValue(manualRows.filter(r => r.assetType === assetId), date);
      }, 0),
      assetType: "manual",
      source: "computed",
    }));

    const dates = [...new Set(
      all
        .filter(r => {
          if (selectedAssetSet.has("stock") && r.assetType === "stock") return true;
          if (selectedAssetSet.has("fund") && r.assetType === "fund") return true;
          if (selectedAssetSet.has("deposit") && r.source === "bank" && r.assetType === "deposit") return true;
          if (selectedAssetSet.has("manual") && r.source === "manual") return true;
          return false;
        })
        .map(r => r.date)
        .filter(date => !cutoff || date >= cutoff)
    )].sort();

    byType["selectedTotal"] = dates.map(date => {
      return {
        date,
        netWorth:
          (selectedAssetSet.has("stock") ? latestValue(byType["stock"] ?? [], date) : 0) +
          (selectedAssetSet.has("fund") ? latestValue(byType["fund"] ?? [], date) : 0) +
          (selectedAssetSet.has("deposit") ? latestValue(depositRows, date) : 0) +
          (selectedAssetSet.has("manual") ? latestValue(byType["manual"] ?? [], date) : 0),
        assetType: "selectedTotal",
        source: "computed",
      };
    });

    return byType;
  }, [data, timeframe, selectedAssetSet]);

  if (!loading && (data ?? []).length === 0) return null;

  const W = 600;
  const H = 120;
  const PAD_TOP = 8;

  const selectedAssetSeries = NW_ASSET_SERIES.filter(s => selectedAssetSet.has(s.key));
  const activeSeries = displayMode === "breakdown" ? selectedAssetSeries : [NW_SUM_SERIES];

  // Primary series for delta and date alignment. Breakdown still summarizes the selected assets.
  const primaryRows = seriesData["selectedTotal"] ?? [];

  // All values across all active series for Y scale
  const allValues = [
    ...activeSeries.flatMap(s => (seriesData[s.key] ?? []).map(r => r.netWorth)),
    ...(displayMode === "breakdown" ? primaryRows.map(r => r.netWorth) : []),
  ];
  const rawMax = Math.max(...allValues, 1);
  const rawMin = Math.min(...allValues, 0);
  const pad = (rawMax - rawMin) * 0.05 || rawMax * 0.05;
  const maxVal = rawMax + pad;
  const minVal = Math.max(0, rawMin - pad);
  const range = maxVal - minVal || 1;

  function svgY(v: number) { return H - ((v - minVal) / range) * (H - PAD_TOP); }
  function yPct(v: number) { return (svgY(v) / H) * 100; }

  const yTicks = niceYTicks(rawMin, rawMax, 4);

  // Build point arrays per active series (align on shared dates from primary rows)
  const dates = primaryRows.map(r => r.date);
  const xStep = dates.length > 1 ? W / (dates.length - 1) : W;

  const seriesPoints = activeSeries.map(s => {
    const rows = seriesData[s.key] ?? [];
    const pts = dates.map((d, i) => ({
      x: i * xStep,
      y: svgY(latestSeriesValue(rows, d)),
      v: latestSeriesValue(rows, d),
    }));
    return { ...s, pts };
  });

  // For breakdown mode, also show total as dashed reference line
  const totalPts = displayMode === "breakdown"
    ? dates.map((d, i) => ({ x: i * xStep, y: svgY(latestSeriesValue(primaryRows, d)) }))
    : null;

  const primaryPts = seriesPoints[0]?.pts ?? [];
  const first = primaryRows[0];
  const last = primaryRows.at(-1);
  const delta = last && first ? last.netWorth - first.netWorth : 0;
  const deltaPct = first?.netWorth ? ((delta / first.netWorth) * 100).toFixed(1) : null;
  const isUp = delta >= 0;

  const hoveredPts = hoverIndex !== null
    ? seriesPoints.map(s => ({ color: s.color, label: s.label, v: s.pts[hoverIndex]?.v, pt: s.pts[hoverIndex] }))
    : null;
  const hoveredDate = hoverIndex !== null ? dates[hoverIndex] : null;
  const hoverX = primaryPts[hoverIndex ?? 0]?.x;
  const tooltipPct = hoverX != null ? Math.max(5, Math.min(78, (hoverX / W) * 100)) : 0;

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!chartRef.current || dates.length === 0) return;
    const rect = chartRef.current.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverIndex(Math.round(fraction * (dates.length - 1)));
  }

  const xLabelStep = Math.max(1, Math.floor(dates.length / 6));
  const xLabelIdxs = dates.reduce<number[]>((acc, _, i) => {
    if (i === 0 || i === dates.length - 1 || i % xLabelStep === 0) acc.push(i);
    return acc;
  }, []);

  function formatXLabel(date: string) {
    const [, m, d] = date.split("-");
    return timeframe === "1M" || timeframe === "3M" ? `${m}/${d}` : timeframe === "ALL" ? date.slice(0, 7) : `${m}/${d}`;
  }

  const singleLineColor = seriesPoints[0]?.color ?? "#10b981";

  return (
    <section className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <TrendingUp className="h-4 w-4 text-steel" />
            資產走勢
          </h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-ink/40">包含</span>
            {NW_ASSET_SERIES.map(({ key, label, color }) => {
              const selected = selectedAssetSet.has(key);
              const hasData = availableAssetTypes.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleIncludedAsset(key)}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition ${
                    selected
                      ? "border-ink/15 bg-white text-ink shadow-sm"
                      : "border-ink/10 bg-paper text-ink/45 hover:text-ink"
                  } ${hasData ? "" : "opacity-60"}`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex rounded-md border border-ink/10 bg-paper p-0.5">
            {NW_DISPLAY_MODES.map(({ key, label }) => (
              <button key={key} type="button"
                onClick={() => { setDisplayMode(key); setHoverIndex(null); }}
                className={`rounded px-2 py-0.5 text-xs font-medium transition ${displayMode === key ? "bg-white shadow-sm text-ink" : "text-ink/50 hover:text-ink"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!loading && deltaPct !== null && (
            <div className={`flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold ${isUp ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
              {isUp ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
              {isUp ? "+" : ""}{deltaPct}%
            </div>
          )}
          <div className="flex rounded-lg border border-ink/10 bg-paper p-0.5">
            {TIMEFRAMES.map((tf) => (
              <button key={tf} type="button" onClick={() => { setTimeframe(tf); setHoverIndex(null); }}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${timeframe === tf ? "bg-white shadow-sm text-ink" : "text-ink/50 hover:text-ink"}`}>
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-ink/50">載入中…</p>
      ) : dates.length === 0 ? (
        <p className="mt-4 text-sm text-ink/50">此區間無資料</p>
      ) : (
        <div className="mt-4 flex gap-2">
          {/* Y-axis */}
          <div className="relative w-14 shrink-0" style={{ height: H * 1.6 }}>
            {yTicks.map((v) => (
              <span key={v} className="absolute right-0 -translate-y-1/2 text-right text-[11px] text-ink/40 tabular-nums"
                style={{ top: `${yPct(v)}%` }}>
                {formatWan(v)}
              </span>
            ))}
          </div>

          {/* Chart + X-axis */}
          <div className="min-w-0 flex-1">
            <div ref={chartRef} className="relative cursor-crosshair"
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoverIndex(null)}>

              {/* Hover tooltip */}
              {hoveredPts && hoveredDate && hoverX != null && (
                <div className="pointer-events-none absolute z-10 -translate-y-full rounded-lg border border-ink/10 bg-white px-3 py-1.5 shadow-md"
                  style={{ left: `${tooltipPct}%`, top: `${yPct(hoveredPts[0]?.v ?? 0)}%` }}>
                  <p className="text-xs text-ink/50">{hoveredDate}</p>
                  {hoveredPts.map(s => (
                    <div key={s.label} className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                      <span className="text-xs text-ink/60">{s.label}</span>
                      <span className="text-sm font-semibold tabular-nums">{s.v != null ? formatCurrency(s.v) : "-"}</span>
                    </div>
                  ))}
                </div>
              )}

              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H * 1.6 }} preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  {seriesPoints.map(s => (
                    <linearGradient key={s.key} id={`nw-grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
                      <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                    </linearGradient>
                  ))}
                </defs>

                {/* Grid lines */}
                {yTicks.map((v) => (
                  <line key={v} x1={0} y1={svgY(v)} x2={W} y2={svgY(v)} stroke="#e2e8f0" strokeWidth="1" />
                ))}

                {/* Total as dashed reference in breakdown mode */}
                {totalPts && totalPts.length > 1 && (
                  <polyline points={totalPts.map(p => `${p.x},${p.y}`).join(" ")}
                    fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" strokeLinecap="round" />
                )}

                {/* Active series — fill for single line only */}
                {seriesPoints.map(s => {
                  const pts = s.pts;
                  if (pts.length === 0) return null;
                  const linePts2 = pts.map(p => `${p.x},${p.y}`).join(" ");
                  const isSingle = seriesPoints.length === 1;
                  const fillPath2 = isSingle && pts.length > 0
                    ? `M${pts[0]!.x},${H} ` + pts.map(p => `L${p.x},${p.y}`).join(" ") + ` L${pts.at(-1)!.x},${H} Z`
                    : null;
                  return (
                    <g key={s.key}>
                      {fillPath2 && <path d={fillPath2} fill={`url(#nw-grad-${s.key})`} />}
                      {pts.length > 1 && (
                        <polyline points={linePts2} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      )}
                    </g>
                  );
                })}

                {/* Hover crosshair + dots */}
                {hoverIndex !== null && hoverX != null && (
                  <>
                    <line x1={hoverX} y1={PAD_TOP} x2={hoverX} y2={H} stroke={singleLineColor} strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.4" />
                    {seriesPoints.map(s => {
                      const pt = s.pts[hoverIndex];
                      if (!pt) return null;
                      return (
                        <g key={s.key}>
                          <circle cx={pt.x} cy={pt.y} r="7" fill={s.color} fillOpacity="0.18" />
                          <circle cx={pt.x} cy={pt.y} r="4" fill={s.color} />
                        </g>
                      );
                    })}
                  </>
                )}
              </svg>
            </div>

            {/* Breakdown legend */}
            {displayMode === "breakdown" && (
              <div className="mt-2 flex flex-wrap gap-3">
                <div className="flex items-center gap-1.5">
                  <svg width="18" height="6" aria-hidden="true"><line x1="0" y1="3" x2="18" y2="3" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
                  <span className="text-xs text-ink/50">已選總和</span>
                </div>
                {seriesPoints.map(s => (
                  <div key={s.key} className="flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded-sm inline-block" style={{ background: s.color }} />
                    <span className="text-xs text-ink/60">{s.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* X-axis labels */}
            <div className="relative mt-1" style={{ height: 16 }}>
              {xLabelIdxs.map(idx => (
                <span key={dates[idx]} className="absolute -translate-x-1/2 text-[11px] text-ink/40 tabular-nums"
                  style={{ left: `${(idx / Math.max(dates.length - 1, 1)) * 100}%` }}>
                  {formatXLabel(dates[idx]!)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const TRADE_TYPE_STYLE: Record<string, { label: string; cls: string }> = {
  buy:  { label: "買入", cls: "bg-red-50 text-red-500" },
  sell: { label: "賣出", cls: "bg-emerald-50 text-emerald-600" },
};

function tradeStyle(tx: InvestmentTransactionRow) {
  // TDCC transaction_name contains Chinese like "買進", "賣出", "轉入" etc.
  const name = (tx.transactionName ?? tx.transactionCode ?? "").toLowerCase();
  if (/賣|sell|s/i.test(name) && !/買|buy/i.test(name)) return TRADE_TYPE_STYLE.sell!;
  return TRADE_TYPE_STYLE.buy!;
}

function RecentTradesPanel({ data, loading }: { data?: InvestmentTransactionRow[]; loading: boolean }) {
  const recent = (data ?? []).slice(0, 10);

  return (
    <section className="rounded-xl border border-ink/10 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-ink/8 px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <WalletCards className="h-4 w-4 text-steel" />
          最近交易紀錄
        </h2>
        <span className="text-xs text-ink/40">{loading ? "載入中…" : `共 ${data?.length ?? 0} 筆`}</span>
      </div>
      {!loading && recent.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-ink/50">尚無交易紀錄，請先同步 TDCC 交易歷史。</p>
      ) : (
        <div className="divide-y divide-ink/8">
          {recent.map((tx) => {
            const style = tradeStyle(tx);
            const date = tx.tradeDate ?? tx.postedDate;
            return (
              <div key={tx.id} className="flex items-center gap-3 px-5 py-3">
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${style.cls}`}>{style.label}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {tx.symbol ? <span className="mr-1.5 text-ink/50">{tx.symbol}</span> : null}
                    {tx.name ?? "-"}
                  </p>
                  <p className="text-xs text-ink/45">
                    {tx.brokerName ?? tx.brokerNo ?? ""}
                    {date ? ` · ${formatDate(date)}` : ""}
                  </p>
                </div>
                {tx.quantity != null && (
                  <p className="shrink-0 text-sm font-medium tabular-nums">{tx.quantity.toLocaleString()} 股</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function groupInvoicesByMonth(invoices: InvoiceRow[]) {
  const groups: { month: string; label: string; invoices: InvoiceRow[] }[] = [];
  for (const inv of invoices) {
    const month = inv.invoiceDate.slice(0, 7);
    const last = groups.at(-1);
    if (last?.month === month) {
      last.invoices.push(inv);
    } else {
      const [y, m] = month.split("-");
      groups.push({ month, label: `${y} 年 ${parseInt(m!)} 月`, invoices: [inv] });
    }
  }
  return groups;
}

function Invoices({ api }: { api: ApiClient }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: () => api.get<InvoiceRow[]>("/api/invoices") });

  if (invoices.isLoading) {
    return <EmptyState title="載入發票中" body="從 D1 讀取發票記錄。" />;
  }

  if (invoices.isError) {
    return <EmptyState title="無法載入發票" body={messageFromError(invoices.error)} />;
  }

  const all = invoices.data ?? [];
  const filtered = filterInvoices(all, search);
  const sorted = [...filtered].sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
  const monthGroups = groupInvoicesByMonth(sorted);

  const allExpanded = sorted.length > 0 && sorted.every((inv) => expandedIds.has(inv.id));

  function toggle(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setExpandedIds(allExpanded ? new Set() : new Set(sorted.map((inv) => inv.id)));
  }

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonthInvoices = all.filter((inv) => inv.invoiceDate.slice(0, 7) === thisMonth);
  const thisMonthTotal = thisMonthInvoices.reduce((s, inv) => s + inv.amount, 0);

  return (
    <section className="grid gap-4">
      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-ink/10 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-ink/50">本月消費</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{formatCurrency(thisMonthTotal)}</p>
          <p className="text-xs text-ink/40">{thisMonthInvoices.length} 張發票</p>
        </div>
        <div className="rounded-xl border border-ink/10 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-ink/50">發票總數</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{all.length.toLocaleString()}</p>
          <p className="text-xs text-ink/40">張</p>
        </div>
        <div className="rounded-xl border border-ink/10 bg-white px-4 py-3 shadow-sm">
          <p className="text-xs text-ink/50">本月均消</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {thisMonthInvoices.length > 0 ? formatCurrency(thisMonthTotal / thisMonthInvoices.length) : "—"}
          </p>
          <p className="text-xs text-ink/40">每張平均</p>
        </div>
      </div>

      {/* Search + expand all */}
      <div className="flex gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-xl border border-ink/15 bg-white px-3 py-2 shadow-sm">
          <Search className="h-4 w-4 shrink-0 text-steel" aria-hidden="true" />
          <input
            className="w-full bg-transparent text-sm outline-none"
            placeholder="搜尋商店、發票號碼或品項"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {sorted.length > 0 && (
          <button
            type="button"
            onClick={toggleAll}
            className="shrink-0 rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm font-medium text-ink/60 shadow-sm transition hover:text-ink"
          >
            {allExpanded ? "全部收合" : "全部展開"}
          </button>
        )}
      </div>

      {/* Accordion list grouped by month */}
      {monthGroups.length === 0 ? (
        <EmptyState
          title={search.trim() ? "無符合結果" : "尚無發票記錄"}
          body={search.trim() ? "請調整搜尋條件。" : "同步電子發票連接器後顯示。"}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
          {monthGroups.map(({ month, label, invoices: group }) => {
            const monthTotal = group.reduce((s, inv) => s + inv.amount, 0);
            return (
              <div key={month}>
                <div className="flex items-center justify-between border-b border-ink/8 bg-paper px-4 py-2">
                  <span className="text-xs font-semibold text-ink/55">{label}</span>
                  <span className="text-xs font-semibold tabular-nums text-ink/55">{formatCurrency(monthTotal)}</span>
                </div>
                <div className="divide-y divide-ink/8">
                  {group.map((invoice) => {
                    const expanded = expandedIds.has(invoice.id);
                    return (
                      <div key={invoice.id}>
                        <button
                          type="button"
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${expanded ? "bg-blue-50" : "hover:bg-ink/3"}`}
                          onClick={() => toggle(invoice.id)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{invoice.sellerName ?? "未知商家"}</p>
                            <p className="text-xs text-ink/45">
                              {formatDate(invoice.invoiceDate)}
                              {invoice.invoiceNumber ? ` · ${invoice.invoiceNumber}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2 text-right">
                            <div>
                              <p className="text-sm font-semibold tabular-nums">{formatCurrency(invoice.amount)}</p>
                              {invoice.items.length > 0 && (
                                <p className="text-xs text-ink/40">{invoice.items.length} 項</p>
                              )}
                            </div>
                            <ChevronDown
                              className={`h-4 w-4 shrink-0 text-ink/30 transition-transform ${expanded ? "rotate-180" : ""}`}
                              aria-hidden="true"
                            />
                          </div>
                        </button>
                        {expanded && (
                          <div className="border-t border-ink/8 bg-paper/60">
                            {invoice.items.length > 0 ? (
                              <div className="divide-y divide-ink/6">
                                {invoice.items.map((item) => (
                                  <div key={item.id} className="flex items-start gap-3 px-5 py-2.5">
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm text-ink/80">{item.description}</p>
                                      {(item.quantity != null || item.unitPrice != null) && (
                                        <p className="mt-0.5 text-xs text-ink/45">
                                          {item.quantity != null ? `${item.quantity.toLocaleString()} × ` : ""}
                                          {item.unitPrice != null ? formatCurrency(item.unitPrice) : ""}
                                        </p>
                                      )}
                                    </div>
                                    <p className="shrink-0 text-sm font-medium tabular-nums">{formatCurrency(item.amount)}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="px-5 py-3 text-xs text-ink/40">無品項記錄</p>
                            )}
                            <div className="flex items-center justify-between border-t border-ink/8 px-5 py-2.5">
                              <p className="text-xs font-semibold text-ink/50">合計</p>
                              <p className="text-sm font-bold tabular-nums">{formatCurrency(invoice.amount)}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function filterInvoices(invoices: InvoiceRow[], search: string) {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return invoices;

  return invoices.filter((invoice) => {
    const haystack = [
      invoice.sellerName,
      invoice.invoiceNumber,
      invoice.sourceId,
      invoice.amount.toString(),
      ...invoice.items.flatMap((item) => [
        item.description,
        item.amount.toString(),
        item.quantity?.toString(),
        item.unitPrice?.toString()
      ])
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalized);
  });
}

const ASSET_TYPE_LABEL: Record<string, string> = { stock: "股票", etf: "ETF", fund: "基金" };
const ASSET_TYPE_BADGE: Record<string, string> = {
  stock:   "bg-indigo-50 text-indigo-600",
  etf:     "bg-emerald-50 text-emerald-600",
  fund:    "bg-purple-50 text-purple-600",
  bond:    "bg-amber-50 text-amber-600",
  unknown: "bg-ink/5 text-ink/50",
};

function Investments({ api }: { api: ApiClient }) {
  const [tradeSearch, setTradeSearch] = useState("");
  const [tradeTypeFilter, setTradeTypeFilter] = useState("all");
  const [tradeLimit, setTradeLimit] = useState(100);

  const investments = useQuery({
    queryKey: ["investments"],
    queryFn: () => api.get<InvestmentRow[]>("/api/investments")
  });
  const trades = useQuery({
    queryKey: ["investment-transactions"],
    queryFn: () => api.get<InvestmentTransactionRow[]>("/api/investment-transactions")
  });

  if (investments.isLoading) {
    return <EmptyState title="載入投資資料中" body="從 D1 讀取投資持倉。" />;
  }
  if (investments.isError) {
    return <EmptyState title="無法載入投資資料" body={messageFromError(investments.error)} />;
  }

  const positions = investments.data ?? [];
  const totalValue = positions.reduce((s, p) => s + (p.marketValue ?? 0), 0);
  const byType = positions.reduce<Record<string, InvestmentRow[]>>((acc, p) => {
    (acc[p.assetType] ??= []).push(p);
    return acc;
  }, {});

  const allTrades = trades.data ?? [];
  const filteredTrades = allTrades.filter((tx) => {
    if (tradeTypeFilter !== "all") {
      const style = tradeStyle(tx);
      if (tradeTypeFilter === "buy" && style.label !== "買入") return false;
      if (tradeTypeFilter === "sell" && style.label !== "賣出") return false;
    }
    if (!tradeSearch.trim()) return true;
    const q = tradeSearch.toLowerCase();
    return [tx.symbol, tx.name, tx.brokerName, tx.transactionName].filter(Boolean).join(" ").toLowerCase().includes(q);
  });
  const sortedTrades = [...filteredTrades].sort((a, b) =>
    (b.tradeDate ?? b.postedDate ?? "").localeCompare(a.tradeDate ?? a.postedDate ?? "")
  );

  const tradeGroups: { date: string; txns: InvestmentTransactionRow[] }[] = [];
  for (const tx of sortedTrades.slice(0, tradeLimit)) {
    const date = (tx.tradeDate ?? tx.postedDate ?? "").slice(0, 10);
    const last = tradeGroups.at(-1);
    if (last?.date === date) last.txns.push(tx);
    else tradeGroups.push({ date, txns: [tx] });
  }

  return (
    <section className="grid gap-5">
      {/* Summary */}
      <div className="grid gap-3 rounded-xl border border-ink/10 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-lg bg-paper px-3 py-2">
          <p className="text-xs text-ink/50">投資市值</p>
          <p className="text-lg font-semibold tabular-nums">{formatCurrency(totalValue)}</p>
        </div>
        <div className="rounded-lg bg-paper px-3 py-2">
          <p className="text-xs text-ink/50">持倉數</p>
          <p className="text-lg font-semibold tabular-nums">{positions.length}</p>
        </div>
        {(["stock", "etf", "fund"] as const).map((t) => {
          const group = byType[t];
          if (!group?.length) return null;
          const val = group.reduce((s, p) => s + (p.marketValue ?? 0), 0);
          return (
            <div key={t} className="rounded-lg bg-paper px-3 py-2">
              <p className="text-xs text-ink/50">{ASSET_TYPE_LABEL[t]}</p>
              <p className="text-base font-semibold tabular-nums">{formatCurrency(val)}</p>
              <p className="text-xs text-ink/40">{group.length} 檔</p>
            </div>
          );
        })}
      </div>

      {/* Positions grouped by asset type */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">持倉</h2>
          <span className="text-sm text-ink/45">{positions.length} 個持倉</span>
        </div>
        {positions.length === 0 ? (
          <EmptyState title="尚無持倉紀錄" body="同步 TDCC 連接器後顯示投資持倉。" />
        ) : (
          <div className="grid gap-3">
            {(["stock", "etf", "fund"] as const).filter(t => byType[t]?.length).map((t) => {
              const group = byType[t]!;
              const groupValue = group.reduce((s, p) => s + (p.marketValue ?? 0), 0);
              return (
                <article key={t} className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/8 bg-paper px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${ASSET_TYPE_BADGE[t]}`}>
                        {ASSET_TYPE_LABEL[t]}
                      </span>
                      <p className="text-xs text-ink/45">{group.length} 檔</p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums">{formatCurrency(groupValue)}</p>
                  </div>
                  <div className="divide-y divide-ink/8">
                    {group.map((pos) => (
                      <div key={pos.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_120px_120px] sm:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {pos.symbol && <span className="mr-1.5 font-mono text-xs text-ink/50">{pos.symbol}</span>}
                            {pos.name}
                          </p>
                          <p className="text-xs text-ink/40">{pos.currency} · {formatDate(pos.asOfDate)}</p>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-[11px] font-medium uppercase text-ink/40">數量</p>
                          <p className="text-sm font-semibold tabular-nums">{pos.quantity?.toLocaleString() ?? "-"}</p>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-[11px] font-medium uppercase text-ink/40">市值</p>
                          <p className="text-sm font-semibold tabular-nums">
                            {pos.marketValue != null ? formatCurrency(pos.marketValue, pos.currency) : "-"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Trade history */}
      <section className="rounded-xl border border-ink/10 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-ink/8 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">交易紀錄</h2>
            <p className="text-sm text-ink/45">
              顯示 {Math.min(filteredTrades.length, tradeLimit).toLocaleString()} / {allTrades.length.toLocaleString()} 筆
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_140px]">
            <label className="flex items-center gap-2 rounded-md border border-ink/15 bg-paper px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-steel" aria-hidden="true" />
              <input
                className="w-full bg-transparent text-sm outline-none"
                placeholder="搜尋股票代號或名稱"
                value={tradeSearch}
                onChange={(e) => { setTradeSearch(e.target.value); setTradeLimit(100); }}
              />
            </label>
            <select
              className="rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm outline-none"
              value={tradeTypeFilter}
              onChange={(e) => { setTradeTypeFilter(e.target.value); setTradeLimit(100); }}
            >
              <option value="all">全部</option>
              <option value="buy">買入</option>
              <option value="sell">賣出</option>
            </select>
          </div>
        </div>

        {trades.isError ? (
          <p className="px-4 py-8 text-center text-sm text-ink/50">{messageFromError(trades.error)}</p>
        ) : filteredTrades.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink/50">
            {allTrades.length === 0 ? "尚無交易紀錄，請先同步 TDCC 交易歷史。" : "沒有符合篩選條件的交易。"}
          </p>
        ) : (
          <>
            <div>
              {tradeGroups.map(({ date, txns }) => (
                <div key={date}>
                  <div className="border-b border-ink/8 bg-paper px-4 py-1.5">
                    <span className="text-xs font-medium text-ink/50">{date ? formatDate(date) : "未知日期"}</span>
                  </div>
                  <div className="divide-y divide-ink/8">
                    {txns.map((tx) => {
                      const style = tradeStyle(tx);
                      const isBuy = style.label === "買入";
                      return (
                        <div key={tx.id} className={`grid gap-3 py-3 pl-3.5 pr-4 sm:grid-cols-[minmax(0,1fr)_100px_120px] sm:items-center border-l-[3px] ${isBuy ? "border-l-red-400" : "border-l-emerald-400"}`}>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${style.cls}`}>{style.label}</span>
                              <p className="truncate text-sm font-medium">
                                {tx.symbol && <span className="mr-1 font-mono text-xs text-ink/50">{tx.symbol}</span>}
                                {tx.name ?? "-"}
                              </p>
                            </div>
                            <p className="mt-0.5 text-xs text-ink/45">{tx.brokerName ?? tx.brokerNo ?? ""}</p>
                          </div>
                          <p className="text-sm tabular-nums text-ink/70 sm:text-right">
                            {tx.quantity != null ? `${tx.quantity.toLocaleString()} 股` : "-"}
                          </p>
                          <p className="text-sm font-semibold tabular-nums sm:text-right">
                            {tx.amount != null ? formatCurrency(tx.amount, tx.currency) : "-"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {filteredTrades.length > tradeLimit && (
              <div className="border-t border-ink/8 px-4 py-3 text-center">
                <button
                  type="button"
                  onClick={() => setTradeLimit((n) => n + 100)}
                  className="text-sm text-steel hover:underline"
                >
                  顯示更多（剩 {(filteredTrades.length - tradeLimit).toLocaleString()} 筆）
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </section>
  );
}

function Cards({ api }: { api: ApiClient }) {
  const bank = useQuery({
    queryKey: ["bank"],
    queryFn: () => api.get<BankData>("/api/bank")
  });

  if (bank.isLoading) {
    return <EmptyState title="載入信用卡中" body="正在從 D1 讀取信用卡帳戶與交易。" />;
  }

  if (bank.isError) {
    return <EmptyState title="無法載入信用卡" body={messageFromError(bank.error)} />;
  }

  const data = bank.data ?? { accounts: [], transactions: [] };
  const cards = data.accounts.filter((account) => account.accountType === "credit");
  const cardIds = new Set(cards.map((card) => card.id));
  const cardTransactions = data.transactions.filter((transaction) => cardIds.has(transaction.accountId));
  const outstandingBalance = cards.reduce((total, card) => total + (card.balance ?? 0), 0);
  const availableCredit = cards.reduce((total, card) => total + (card.availableBalance ?? 0), 0);

  return (
    <section className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="信用卡數" value={cards.length.toLocaleString()} icon={<CreditCard />} />
        <Metric label="未繳餘額" value={formatCurrency(outstandingBalance)} icon={<CreditCard />} />
        <Metric label="可用額度" value={formatCurrency(availableCredit)} icon={<WalletCards />} />
      </div>
      <div>
        <h2 className="mb-3 text-lg font-semibold">信用卡</h2>
        <Table
          columns={["機構", "卡片", "餘額", "可用額度", "截至時間"]}
          rows={cards.map((card) => [
            card.institutionName ?? "-",
            card.accountName ?? card.sourceId,
            card.balance === undefined || card.balance === null ? "-" : formatCurrency(card.balance, card.currency),
            card.availableBalance === undefined || card.availableBalance === null
              ? "-"
              : formatCurrency(card.availableBalance, card.currency),
            card.asOfAt ? formatDateTime(card.asOfAt) : "-"
          ])}
          empty="尚無信用卡資料。"
        />
      </div>
      <div>
        <h2 className="mb-3 text-lg font-semibold">刷卡交易</h2>
        <Table
          columns={["日期", "卡片", "說明", "交易對象", "金額", "狀態"]}
          rows={cardTransactions.map((transaction) => [
            transaction.postedDate
              ? formatDateTime(transaction.postedDate)
              : transaction.authorizedAt
                ? formatDateTime(transaction.authorizedAt)
                : "-",
            transaction.accountName ?? transaction.accountId,
            transaction.description ?? "-",
            transaction.counterparty ?? "-",
            formatCurrency(transaction.amount, transaction.currency),
            transaction.status ?? "-"
          ])}
          empty="尚無刷卡交易。"
        />
      </div>
    </section>
  );
}

function Bank({ api, onNavigate }: { api: ApiClient; onNavigate: (v: View) => void }) {
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [flowFilter, setFlowFilter] = useState<"all" | "inflow" | "outflow">("all");
  const [dateRange, setDateRange] = useState<BankDateRange>("month");
  const [txnLimit, setTxnLimit] = useState(100);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const bankQueryClient = useQueryClient();
  const bank = useQuery({
    queryKey: ["bank"],
    queryFn: () => api.get<BankData>("/api/bank")
  });
  const overrideMutation = useMutation({
    mutationFn: ({ transactionId, categoryId }: { transactionId: string; categoryId: string }) =>
      api.put(`/api/classification/overrides/bank_transaction/${transactionId}`, { categoryId }),
    onSuccess: () => bankQueryClient.invalidateQueries({ queryKey: ["bank"] })
  });
  const clearOverrideMutation = useMutation({
    mutationFn: (transactionId: string) =>
      api.delete(`/api/classification/overrides/bank_transaction/${transactionId}`),
    onSuccess: () => bankQueryClient.invalidateQueries({ queryKey: ["bank"] })
  });
  const [ruleFormFor, setRuleFormFor] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState({ pattern: "", operator: "contains" });
  const addRuleMutation = useMutation({
    mutationFn: ({ categoryId, pattern, operator }: { categoryId: string; pattern: string; operator: string }) =>
      api.post("/api/classification/rules", { categoryId, targetType: "bank_transaction", field: "any_text", operator, pattern, priority: 200 }),
    onSuccess: () => {
      bankQueryClient.invalidateQueries({ queryKey: ["bank"] });
      bankQueryClient.invalidateQueries({ queryKey: ["classification-rules"] });
      setRuleFormFor(null);
    }
  });
  const fxRates = useQuery({ queryKey: ["exchange-rates"], queryFn: () => api.get<ExchangeRateRow[]>("/api/exchange-rates") });
  const rateMap = Object.fromEntries((fxRates.data ?? []).map((r) => [r.currency, r.rateTwd]));

  if (bank.isLoading) {
    return <EmptyState title="載入銀行資料中" body="正在從 D1 讀取銀行帳戶與交易。" />;
  }

  if (bank.isError) {
    return <EmptyState title="無法載入銀行資料" body={messageFromError(bank.error)} />;
  }

  const data = bank.data ?? { accounts: [], transactions: [] };
  const bankAccounts = data.accounts.filter((account) => account.accountType !== "credit");
  const bankAccountIds = new Set(bankAccounts.map((account) => account.id));
  const bankTransactions = data.transactions.filter((transaction) => bankAccountIds.has(transaction.accountId));
  const periodTransactions = filterTransactionsByDateRange(bankTransactions, dateRange);
  const filteredTransactions = filterBankTransactions(periodTransactions, search, accountFilter, flowFilter);
  const sortedFiltered = [...filteredTransactions].sort((a, b) => {
    const da = a.postedDate ?? a.authorizedAt ?? "";
    const db = b.postedDate ?? b.authorizedAt ?? "";
    return db.localeCompare(da);
  });
  const txnGroups = groupTransactionsByDate(sortedFiltered.slice(0, txnLimit), rateMap);
  const bankGroups = groupBankAccounts(bankAccounts);
  const totalBalanceByCurrency = sumAccountsByCurrency(bankAccounts, "balance");
  const totalBalanceTwd = sumAccountValueTwd(bankAccounts, rateMap);
  const cashFlow = summarizeCashFlow(filterTransactionsByDateRange(bankTransactions, "month"), rateMap);
  const spendingCategories = summarizeSpendingByCategory(periodTransactions, rateMap);
  const cashFlowTrend = buildMonthlyCashFlow(bankTransactions, rateMap);
  const currencyBreakdown = Object.entries(totalBalanceByCurrency)
    .sort(([a], [b]) => (a === "TWD" ? -1 : b === "TWD" ? 1 : a.localeCompare(b)))
    .slice(0, 4);
  const latestAsOf = bankAccounts.reduce<string>((latest, account) => {
    return account.asOfAt && account.asOfAt > latest ? account.asOfAt : latest;
  }, "");

  const missingRateCurrencies = [...new Set(bankAccounts.map(a => a.currency).filter(c => c && c !== "TWD" && !rateMap[c]))] as string[];

  return (
    <section className="grid gap-5">
      {missingRateCurrencies.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>帳戶含外幣（{missingRateCurrencies.join("、")}）尚未設定匯率，TWD 金額可能不準確。</span>
          <button onClick={() => onNavigate("settings")} className="shrink-0 font-medium underline underline-offset-2 hover:text-amber-900">前往設定</button>
        </div>
      )}
      <section className="grid gap-4 rounded-xl border border-ink/10 bg-white p-5 shadow-sm lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-ink/50">
            <Building2 className="h-4 w-4 text-steel" />
            <span>現金總覽</span>
            {latestAsOf && <span>更新 {formatDate(latestAsOf)}</span>}
          </div>
          <p className="mt-3 text-3xl font-bold tracking-normal tabular-nums sm:text-4xl">
            {totalBalanceTwd == null ? formatCurrencyTotals(totalBalanceByCurrency) : formatCurrency(totalBalanceTwd)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {currencyBreakdown.length === 0 ? (
              <span className="rounded-md bg-paper px-2.5 py-1 text-xs font-medium text-ink/45">尚無餘額</span>
            ) : (
              currencyBreakdown.map(([currency, amount]) => (
                <span key={currency} className="rounded-md bg-paper px-2.5 py-1 text-xs font-medium tabular-nums text-ink/65">
                  {formatCurrency(amount, currency)}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          <div className="grid grid-cols-3 gap-2">
            <BankSummaryTile label="帳戶" value={bankAccounts.length.toLocaleString()} />
            <BankSummaryTile label="本月收入" value={formatCurrency(cashFlow.inflow)} tone="positive" />
            <BankSummaryTile label="本月支出" value={formatCurrency(Math.abs(cashFlow.outflow))} tone="negative" />
          </div>
          <div className="rounded-lg bg-paper px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-ink/50">本月淨現金流</p>
              <CalendarDays className="h-4 w-4 text-steel" />
            </div>
            <p className={`mt-1 text-lg font-semibold tabular-nums ${cashFlow.net >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {cashFlow.net >= 0 ? "+" : ""}{formatCurrency(cashFlow.net)}
            </p>
          </div>
        </div>
      </section>

      <CashFlowTrendPanel data={cashFlowTrend} />

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">帳戶</h2>
          <span className="text-sm text-ink/45">{bankGroups.length.toLocaleString()} 家機構</span>
        </div>
        {bankGroups.length === 0 ? (
          <EmptyState title="尚無銀行帳戶" body="同步銀行連接器後顯示帳戶。" />
        ) : (
          <div className="grid gap-3">
            {bankGroups.map((group) => (
              <article key={group.name} className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/8 bg-ink px-4 py-3 text-white">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{group.name}</h3>
                    <p className="text-xs text-white/65">
                      {group.accounts.length.toLocaleString()} 個帳戶{group.latestAsOf ? ` · 更新 ${formatDate(group.latestAsOf)}` : ""}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums text-white">{formatCurrencyTotals(group.totalBalanceByCurrency)}</p>
                </div>
                <div className="divide-y divide-ink/8">
                  {group.accounts.map((account) => {
                    const showAvailable = account.availableBalance != null && account.availableBalance !== account.balance;
                    return (
                      <div key={account.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_200px_120px] sm:items-center">
                        <div className="min-w-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-paper text-xs font-semibold text-steel">
                              {account.currency}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{formatBankAccountName(account)}</p>
                              <p className="text-xs text-ink/45">{formatAccountType(account.accountType)}{account.accountLast4 ? ` · 末四 ${account.accountLast4}` : ""}</p>
                            </div>
                          </div>
                        </div>
                        <div className="sm:text-right">
                          <p className="text-[11px] font-medium uppercase tracking-normal text-ink/40">餘額</p>
                          <p className="text-sm font-semibold tabular-nums">
                            {account.balance == null ? "-" : formatCurrency(account.balance, account.currency)}
                          </p>
                          {account.balance != null && account.currency !== "TWD" && rateMap[account.currency] && (
                            <p className="text-xs text-ink/40 tabular-nums">≈ {formatCurrency(account.balance * rateMap[account.currency]!)}</p>
                          )}
                          {showAvailable && (
                            <p className="text-xs text-ink/40 tabular-nums">可用 {formatCurrency(account.availableBalance!, account.currency)}</p>
                          )}
                        </div>
                        <p className="text-xs text-ink/45 sm:text-right">{account.asOfAt ? formatDate(account.asOfAt) : "-"}</p>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-ink/10 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-ink/8 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold">交易</h2>
            <p className="text-sm text-ink/45">
              顯示 {Math.min(filteredTransactions.length, txnLimit).toLocaleString()} / {periodTransactions.length.toLocaleString()} 筆
            </p>
          </div>
          <div className="grid gap-2 lg:w-[760px]">
            <label className="flex items-center gap-2 rounded-md border border-ink/15 bg-paper px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-steel" aria-hidden="true" />
              <input
                className="w-full bg-transparent text-sm outline-none"
                placeholder="搜尋說明或對手方"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setTxnLimit(100); }}
              />
            </label>
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {BANK_DATE_RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => { setDateRange(range); setTxnLimit(100); }}
                  className={`shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium ${dateRange === range ? "border-ink bg-ink text-white" : "border-ink/15 bg-paper text-ink/60"}`}
                >
                  {dateRangeLabel(range)}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <select
                className="min-w-0 rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm outline-none"
                value={accountFilter}
                onChange={(e) => { setAccountFilter(e.target.value); setTxnLimit(100); }}
              >
                <option value="all">全部帳戶</option>
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {[account.institutionName, formatBankAccountName(account)].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-3 rounded-md border border-ink/15 bg-paper p-0.5">
                {BANK_FLOW_FILTERS.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => { setFlowFilter(filter.key); setTxnLimit(100); }}
                    className={`rounded px-3 py-1.5 text-sm font-medium ${flowFilter === filter.key ? "bg-white text-ink shadow-sm" : "text-ink/50"}`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        {spendingCategories.length > 0 && (
          <div className="border-b border-ink/8 px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{dateRangeLabel(dateRange)}支出分類</h3>
                <p className="text-xs text-ink/45">依規則分類，可點擊標籤手動調整。</p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-red-500">
                {formatCurrency(spendingCategories.reduce((sum, category) => sum + category.amount, 0))}
              </p>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {spendingCategories.map((category) => (
                <div key={category.key} className="rounded-lg border border-ink/8 bg-paper px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${category.dotClass}`} />
                      <span className="truncate text-sm font-medium">{category.label}</span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(category.amount)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
                    <div className={category.barClass} style={{ width: `${category.share}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {filteredTransactions.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink/60">
            {periodTransactions.length === 0 ? "這個期間尚無銀行交易。" : "沒有符合篩選條件的交易。"}
          </p>
        ) : (
          <>
            <div>
              {txnGroups.map(({ date, transactions: txns, netTwd }) => (
                <div key={date}>
                  <div className="flex items-center justify-between gap-3 border-b border-ink/8 bg-paper px-4 py-1.5">
                    <span className="text-xs font-medium text-ink/50">{date ? formatDate(date) : "未知日期"}</span>
                    <span className={`text-xs font-semibold tabular-nums ${netTwd >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      淨額 {netTwd >= 0 ? "+" : ""}{formatCurrency(netTwd)}
                    </span>
                  </div>
                  <div className="divide-y divide-ink/8">
                    {txns.map((transaction) => {
                      const isInflow = transaction.amount > 0;
                      const myAccount = formatBankAccountName(transaction) || transaction.accountId;
                      const showAccount = accountFilter === "all";
                      let flow: string;
                      if (transaction.counterparty && showAccount) {
                        flow = isInflow
                          ? `${transaction.counterparty} → ${myAccount}`
                          : `${myAccount} → ${transaction.counterparty}`;
                      } else if (transaction.counterparty) {
                        flow = transaction.counterparty;
                      } else {
                        flow = showAccount ? myAccount : "";
                      }
                      const subLabel = [transaction.institutionName ?? "", flow].filter(Boolean).join(" · ");
                      const catKey = transactionCategoryKey(transaction);
                      const category = { key: catKey, ...BANK_CATEGORIES[catKey] };
                      const expanded = selectedTransactionId === transaction.id;
                      const classifSource = transaction.classification?.source;
                      const sourceLabel = classifSource === "override" ? "手動" : classifSource === "user_rule" ? "規則" : classifSource === "system_rule" ? "系統" : classifSource === "fallback" ? "預設" : undefined;
                      return (
                        <div key={transaction.id} className={`border-l-[3px] ${isInflow ? "border-l-emerald-400" : "border-l-red-400"}`}>
                          <button
                            type="button"
                            onClick={() => setSelectedTransactionId(expanded ? null : transaction.id)}
                            className="grid w-full gap-3 py-3 pl-3.5 pr-4 text-left hover:bg-paper/70 sm:grid-cols-[minmax(0,1fr)_150px_140px] sm:items-center"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{transaction.description ?? transaction.counterparty ?? "交易"}</p>
                              {subLabel && <p className="truncate text-xs text-ink/45">{subLabel}</p>}
                            </div>
                            <div className="flex items-center gap-1.5 sm:justify-end">
                              <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${category.className}`}>
                                {category.label}
                              </span>
                              {sourceLabel && <span className="text-xs text-ink/35">{sourceLabel}</span>}
                            </div>
                            <p className={`text-sm font-semibold tabular-nums sm:text-right ${isInflow ? "text-emerald-600" : "text-red-500"}`}>
                              {isInflow ? "+" : ""}{formatCurrency(transaction.amount, transaction.currency)}
                            </p>
                          </button>
                          {expanded && (
                            <div className="border-t border-ink/8 bg-paper/60 px-4 py-3 text-xs text-ink/55">
                              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                <TransactionDetail label="日期" value={formatDateTime(transaction.postedDate ?? transaction.authorizedAt) || "-"} />
                                <TransactionDetail label="帳戶" value={myAccount} />
                                <TransactionDetail label="機構" value={transaction.institutionName ?? "-"} />
                                <TransactionDetail label="對手方" value={transaction.counterparty ?? "-"} />
                                <TransactionDetail label="狀態" value={transaction.status ?? "-"} />
                                <TransactionDetail label="幣別" value={transaction.currency} />
                                <TransactionDetail label="來源 ID" value={transaction.sourceId} />
                              </div>
                              <div className="mt-3 border-t border-ink/8 pt-3">
                                <p className="mb-2 text-xs font-medium text-ink/50">分類</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {(Object.entries(BANK_CATEGORIES) as Array<[BankCategoryKey, typeof BANK_CATEGORIES[BankCategoryKey]]>).map(([key, cat]) => (
                                    <button
                                      key={key}
                                      type="button"
                                      disabled={overrideMutation.isPending}
                                      onClick={() => overrideMutation.mutate({ transactionId: transaction.id, categoryId: key })}
                                      className={`rounded-md px-2 py-0.5 text-xs font-semibold transition-opacity ${cat.className} ${catKey === key ? "ring-2 ring-current ring-offset-1" : "opacity-50 hover:opacity-80"}`}
                                    >
                                      {cat.label}
                                    </button>
                                  ))}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-3">
                                  {classifSource === "override" && (
                                    <button
                                      type="button"
                                      disabled={clearOverrideMutation.isPending}
                                      onClick={() => clearOverrideMutation.mutate(transaction.id)}
                                      className="text-xs text-ink/40 hover:text-ink/60 hover:underline"
                                    >
                                      恢復預設
                                    </button>
                                  )}
                                  {ruleFormFor !== transaction.id && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const pattern = transaction.description || transaction.counterparty || "";
                                        setRuleForm({ pattern, operator: "contains" });
                                        setRuleFormFor(transaction.id);
                                      }}
                                      className="text-xs text-blue-500 hover:underline"
                                    >
                                      套用到類似交易…
                                    </button>
                                  )}
                                </div>
                                {ruleFormFor === transaction.id && (
                                  <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                                    <p className="mb-2 text-xs font-medium text-blue-700">建立規則：將「{category.label}」套用到符合條件的交易</p>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <select
                                        value={ruleForm.operator}
                                        onChange={(e) => setRuleForm((f) => ({ ...f, operator: e.target.value }))}
                                        className="rounded border border-ink/15 bg-white px-2 py-1 text-xs"
                                      >
                                        <option value="contains">包含</option>
                                        <option value="regex">正規表達式</option>
                                      </select>
                                      <input
                                        className="flex-1 rounded border border-ink/15 bg-white px-2 py-1 text-xs min-w-32"
                                        value={ruleForm.pattern}
                                        onChange={(e) => setRuleForm((f) => ({ ...f, pattern: e.target.value }))}
                                        placeholder="關鍵字"
                                      />
                                    </div>
                                    {ruleForm.pattern.trim() && (
                                      <p className="mt-1.5 text-xs text-blue-600">
                                        符合目前已載入的 {countRuleMatches(bankTransactions, ruleForm.pattern, ruleForm.operator)} 筆交易
                                      </p>
                                    )}
                                    <div className="mt-2 flex gap-2">
                                      <button
                                        type="button"
                                        disabled={!ruleForm.pattern.trim() || addRuleMutation.isPending}
                                        onClick={() => addRuleMutation.mutate({ categoryId: catKey, pattern: ruleForm.pattern.trim(), operator: ruleForm.operator })}
                                        className="rounded bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-40"
                                      >
                                        {addRuleMutation.isPending ? "儲存中…" : "儲存規則"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setRuleFormFor(null)}
                                        className="text-xs text-ink/40 hover:text-ink/60"
                                      >
                                        取消
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {filteredTransactions.length > txnLimit && (
              <div className="border-t border-ink/8 px-4 py-3 text-center">
                <button
                  type="button"
                  onClick={() => setTxnLimit((n) => n + 100)}
                  className="text-sm text-steel hover:underline"
                >
                  顯示更多（剩 {(filteredTransactions.length - txnLimit).toLocaleString()} 筆）
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </section>
  );
}


type BankDateRange = "month" | "threeMonths" | "year" | "all";
type BankCategoryKey = "salary" | "transfer" | "food" | "transport" | "shopping" | "housing" | "health" | "education" | "entertainment" | "investment" | "insurance" | "fee" | "tax" | "other";
type BankFlowFilter = "all" | "inflow" | "outflow";
type MonthlyCashFlowPoint = {
  month: string;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
};

const BANK_DATE_RANGES: BankDateRange[] = ["month", "threeMonths", "year", "all"];
const BANK_FLOW_FILTERS: { key: BankFlowFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "inflow", label: "收入" },
  { key: "outflow", label: "支出" }
];

const BANK_CATEGORIES: Record<BankCategoryKey, { label: string; className: string; dotClass: string; barClass: string }> = {
  salary: {
    label: "薪資",
    className: "bg-emerald-50 text-emerald-700",
    dotClass: "bg-emerald-500",
    barClass: "h-full rounded-full bg-emerald-500"
  },
  transfer: {
    label: "轉帳",
    className: "bg-blue-50 text-blue-700",
    dotClass: "bg-blue-500",
    barClass: "h-full rounded-full bg-blue-500"
  },
  food: {
    label: "餐飲",
    className: "bg-orange-50 text-orange-700",
    dotClass: "bg-orange-500",
    barClass: "h-full rounded-full bg-orange-500"
  },
  transport: {
    label: "交通",
    className: "bg-cyan-50 text-cyan-700",
    dotClass: "bg-cyan-500",
    barClass: "h-full rounded-full bg-cyan-500"
  },
  investment: {
    label: "投資",
    className: "bg-indigo-50 text-indigo-700",
    dotClass: "bg-indigo-500",
    barClass: "h-full rounded-full bg-indigo-500"
  },
  fee: {
    label: "手續費",
    className: "bg-red-50 text-red-700",
    dotClass: "bg-red-500",
    barClass: "h-full rounded-full bg-red-500"
  },
  shopping: {
    label: "購物",
    className: "bg-purple-50 text-purple-700",
    dotClass: "bg-purple-500",
    barClass: "h-full rounded-full bg-purple-500"
  },
  housing: {
    label: "居住",
    className: "bg-teal-50 text-teal-700",
    dotClass: "bg-teal-500",
    barClass: "h-full rounded-full bg-teal-500"
  },
  health: {
    label: "醫療",
    className: "bg-rose-50 text-rose-700",
    dotClass: "bg-rose-500",
    barClass: "h-full rounded-full bg-rose-500"
  },
  education: {
    label: "教育",
    className: "bg-amber-50 text-amber-700",
    dotClass: "bg-amber-500",
    barClass: "h-full rounded-full bg-amber-500"
  },
  entertainment: {
    label: "娛樂",
    className: "bg-fuchsia-50 text-fuchsia-700",
    dotClass: "bg-fuchsia-500",
    barClass: "h-full rounded-full bg-fuchsia-500"
  },
  insurance: {
    label: "保險",
    className: "bg-sky-50 text-sky-700",
    dotClass: "bg-sky-500",
    barClass: "h-full rounded-full bg-sky-500"
  },
  tax: {
    label: "稅務",
    className: "bg-zinc-100 text-zinc-600",
    dotClass: "bg-zinc-400",
    barClass: "h-full rounded-full bg-zinc-400"
  },
  other: {
    label: "其他",
    className: "bg-slate-100 text-slate-700",
    dotClass: "bg-slate-500",
    barClass: "h-full rounded-full bg-slate-500"
  }
};

function BankSummaryTile({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "positive" | "negative" }) {
  const toneClass = tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-red-500" : "text-ink";
  return (
    <div className="min-w-0 rounded-lg bg-paper px-3 py-2">
      <p className="truncate text-xs text-ink/50">{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function TransactionDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-ink/35">{label}</p>
      <p className="mt-0.5 truncate font-medium text-ink/70" title={value}>{value}</p>
    </div>
  );
}

function CashFlowTrendPanel({ data }: { data: MonthlyCashFlowPoint[] }) {
  if (data.length === 0 || data.every((point) => point.inflow === 0 && point.outflow === 0)) return null;

  const [hovered, setHovered] = useState<number | null>(null);

  const TW = 660;
  const YAXIS = 60;
  const W = TW - YAXIS;
  const H = 150;
  const PAD = 14;
  const maxBar = Math.max(...data.flatMap((point) => [point.inflow, point.outflow]), 1);
  const maxNetAbs = Math.max(...data.map((point) => Math.abs(point.net)), 1);
  const colW = W / data.length;
  const barW = Math.min(24, colW * 0.28);
  const barY = (v: number) => H - PAD - (v / maxBar) * (H - PAD * 2);
  const netY = (value: number) => PAD + ((maxNetAbs - value) / (maxNetAbs * 2 || 1)) * (H - PAD * 2);
  const netPoints = data.map((point, index) => ({
    x: YAXIS + index * colW + colW / 2,
    y: netY(point.net),
    value: point.net
  }));

  const yTicks = [maxBar, maxBar / 2, 0];
  const fmtK = (v: number) => v >= 10000 ? `${(v / 10000).toFixed(v >= 100000 ? 0 : 1)}萬` : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;

  const latest = data.at(-1);
  const totalInflow = data.reduce((sum, point) => sum + point.inflow, 0);
  const totalOutflow = data.reduce((sum, point) => sum + point.outflow, 0);

  const hovPoint = hovered !== null ? data[hovered] : null;
  const hovX = hovered !== null ? YAXIS + hovered * colW + colW / 2 : 0;

  return (
    <section className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <TrendingUp className="h-4 w-4 text-steel" />
            現金流趨勢
          </h2>
          <p className="mt-1 text-sm text-ink/45">最近 6 個月收入、支出與淨現金流。</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-right">
          <BankSummaryTile label="6月收入" value={formatCurrency(totalInflow)} tone="positive" />
          <BankSummaryTile label="6月支出" value={formatCurrency(totalOutflow)} tone="negative" />
          <BankSummaryTile label="最近淨額" value={`${(latest?.net ?? 0) >= 0 ? "+" : ""}${formatCurrency(latest?.net ?? 0)}`} tone={(latest?.net ?? 0) >= 0 ? "positive" : "negative"} />
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <svg viewBox={`0 0 ${TW} ${H + 24}`} className="min-w-[560px] w-full" aria-label="現金流趨勢圖">
          {/* Y軸刻度線與標籤 */}
          {yTicks.map((tick) => {
            const y = barY(tick);
            return (
              <g key={tick}>
                <line x1={YAXIS - 4} y1={y} x2={TW} y2={y} stroke="#e2e8f0" strokeWidth="1" />
                <text x={YAXIS - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">{fmtK(tick)}</text>
              </g>
            );
          })}
          {/* 淨額零線 */}
          <line x1={YAXIS} y1={netY(0)} x2={TW} y2={netY(0)} stroke="#cbd5e1" strokeDasharray="4 4" />
          {/* Y軸線 */}
          <line x1={YAXIS} y1={PAD} x2={YAXIS} y2={H} stroke="#e2e8f0" strokeWidth="1" />

          {data.map((point, index) => {
            const center = YAXIS + index * colW + colW / 2;
            const inflowH = (point.inflow / maxBar) * (H - PAD * 2);
            const outflowH = (point.outflow / maxBar) * (H - PAD * 2);
            return (
              <g key={point.month} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)} style={{ cursor: "default" }}>
                {/* 透明 hit area */}
                <rect x={YAXIS + index * colW} y={PAD} width={colW} height={H - PAD} fill="transparent" />
                <rect x={center - barW - 2} y={H - PAD - inflowH} width={barW} height={inflowH} rx="3" fill="#10b981" opacity={hovered === index ? 1 : 0.85} />
                <rect x={center + 2} y={H - PAD - outflowH} width={barW} height={outflowH} rx="3" fill="#ef4444" opacity={hovered === index ? 1 : 0.75} />
                <text x={center} y={H + 14} textAnchor="middle" fontSize="11" fill="#64748b">{point.label}</text>
              </g>
            );
          })}
          {netPoints.length > 1 && (
            <polyline
              points={netPoints.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke="#0f172a"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {netPoints.map((point) => (
            <circle key={point.x} cx={point.x} cy={point.y} r="3.5" fill={point.value >= 0 ? "#10b981" : "#ef4444"} stroke="white" strokeWidth="1.5" />
          ))}

          {/* Hover tooltip */}
          {hovPoint && (() => {
            const tipW = 130;
            const tipH = 62;
            const tipX = Math.min(Math.max(hovX - tipW / 2, YAXIS + 2), TW - tipW - 2);
            const tipY = PAD + 4;
            const net = hovPoint.net;
            return (
              <g pointerEvents="none">
                <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="6" fill="white" stroke="#e2e8f0" strokeWidth="1" filter="drop-shadow(0 2px 4px rgb(0 0 0/0.08))" />
                <text x={tipX + 10} y={tipY + 16} fontSize="11" fontWeight="600" fill="#0f172a">{hovPoint.label}</text>
                <circle cx={tipX + 10} cy={tipY + 29} r="3.5" fill="#10b981" />
                <text x={tipX + 18} y={tipY + 33} fontSize="10" fill="#475569">收入 {formatCurrency(hovPoint.inflow)}</text>
                <circle cx={tipX + 10} cy={tipY + 44} r="3.5" fill="#ef4444" />
                <text x={tipX + 18} y={tipY + 48} fontSize="10" fill="#475569">支出 {formatCurrency(hovPoint.outflow)}</text>
                <text x={tipX + 10} y={tipY + 60} fontSize="10" fontWeight="600" fill={net >= 0 ? "#10b981" : "#ef4444"}>淨 {net >= 0 ? "+" : ""}{formatCurrency(net)}</text>
              </g>
            );
          })()}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink/50">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />收入</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />支出</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded-full bg-ink" />淨額</span>
      </div>
    </section>
  );
}

function groupBankAccounts(accounts: BankAccountRow[]) {
  return Object.entries(
    accounts.reduce<Record<string, BankAccountRow[]>>((groups, account) => {
      const key = account.institutionName ?? account.connectorId;
      (groups[key] ??= []).push(account);
      return groups;
    }, {})
  )
    .map(([name, groupAccounts]) => ({
      name,
      accounts: groupAccounts,
      totalBalanceByCurrency: sumAccountsByCurrency(groupAccounts, "balance"),
      totalAvailableByCurrency: sumAccountsByCurrency(groupAccounts, "availableBalance"),
      latestAsOf: groupAccounts.reduce<string>((latest, account) => {
        return account.asOfAt && account.asOfAt > latest ? account.asOfAt : latest;
      }, "")
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-TW"));
}

function sumAccountsByCurrency(accounts: BankAccountRow[], field: "balance" | "availableBalance") {
  return accounts.reduce<Record<string, number>>((totals, account) => {
    const value = account[field];
    if (value === undefined || value === null) return totals;
    const currency = account.currency || "TWD";
    totals[currency] = (totals[currency] ?? 0) + value;
    return totals;
  }, {});
}

function formatCurrencyTotals(totals: Record<string, number>) {
  const entries = Object.entries(totals).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return "-";
  if (entries.length === 1) {
    const [currency, amount] = entries[0]!;
    return formatCurrency(amount, currency);
  }
  return entries.map(([currency, amount]) => `${currency} ${formatNumber(amount)}`).join(" / ");
}

function groupTransactionsByDate(transactions: BankTransactionRow[], rateMap: Record<string, number>) {
  const groups: { date: string; transactions: BankTransactionRow[]; netTwd: number }[] = [];
  for (const txn of transactions) {
    const date = (txn.postedDate ?? txn.authorizedAt ?? "").slice(0, 10);
    const last = groups.at(-1);
    if (last?.date === date) {
      last.transactions.push(txn);
      last.netTwd += transactionValueTwd(txn, rateMap);
    } else {
      groups.push({ date, transactions: [txn], netTwd: transactionValueTwd(txn, rateMap) });
    }
  }
  return groups;
}

function filterTransactionsByDateRange(transactions: BankTransactionRow[], range: BankDateRange) {
  if (range === "all") return transactions;

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (range === "month") {
    start.setDate(1);
  } else if (range === "threeMonths") {
    start.setMonth(start.getMonth() - 3);
  } else {
    start.setMonth(0, 1);
  }

  const startKey = start.toISOString().slice(0, 10);
  return transactions.filter((transaction) => {
    const date = (transaction.postedDate ?? transaction.authorizedAt ?? "").slice(0, 10);
    return date >= startKey;
  });
}

function sumAccountValueTwd(accounts: BankAccountRow[], rateMap: Record<string, number>) {
  let total = 0;
  for (const account of accounts) {
    if (account.balance == null) continue;
    const currency = account.currency || "TWD";
    if (currency === "TWD") {
      total += account.balance;
    } else if (rateMap[currency]) {
      total += account.balance * rateMap[currency]!;
    } else {
      return null;
    }
  }
  return total;
}

function summarizeCashFlow(transactions: BankTransactionRow[], rateMap: Record<string, number>) {
  return transactions.reduce(
    (summary, transaction) => {
      const value = transactionValueTwd(transaction, rateMap);
      if (value > 0) summary.inflow += value;
      if (value < 0) summary.outflow += value;
      summary.net += value;
      return summary;
    },
    { inflow: 0, outflow: 0, net: 0 }
  );
}

function buildMonthlyCashFlow(transactions: BankTransactionRow[], rateMap: Record<string, number>, months = 6): MonthlyCashFlowPoint[] {
  const now = new Date();
  const buckets = Array.from({ length: months }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - 1 - index), 1);
    const month = date.toISOString().slice(0, 7);
    return {
      month,
      label: `${date.getMonth() + 1}月`,
      inflow: 0,
      outflow: 0,
      net: 0
    };
  });
  const bucketMap = Object.fromEntries(buckets.map((bucket) => [bucket.month, bucket]));

  for (const transaction of transactions) {
    const date = (transaction.postedDate ?? transaction.authorizedAt ?? "").slice(0, 10);
    const month = date.slice(0, 7);
    const bucket = bucketMap[month];
    if (!bucket) continue;

    const value = transactionValueTwd(transaction, rateMap);
    if (value > 0) bucket.inflow += value;
    if (value < 0) bucket.outflow += Math.abs(value);
    bucket.net += value;
  }

  return buckets;
}

function transactionValueTwd(transaction: BankTransactionRow, rateMap: Record<string, number>) {
  const currency = transaction.currency || "TWD";
  if (currency === "TWD") return transaction.amount;
  const rate = rateMap[currency];
  return rate ? transaction.amount * rate : transaction.amount;
}

function summarizeSpendingByCategory(transactions: BankTransactionRow[], rateMap: Record<string, number>) {
  const totals = transactions.reduce<Record<BankCategoryKey, number>>((acc, transaction) => {
    if (transaction.amount >= 0) return acc;
    const category = transactionCategoryKey(transaction);
    acc[category] = (acc[category] ?? 0) + Math.abs(transactionValueTwd(transaction, rateMap));
    return acc;
  }, {} as Record<BankCategoryKey, number>);
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0);

  return (Object.entries(totals) as Array<[BankCategoryKey, number]>)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([key, amount]) => ({
      key,
      amount,
      share: total > 0 ? Math.max(4, Math.round((amount / total) * 100)) : 0,
      ...BANK_CATEGORIES[key]
    }));
}

function countRuleMatches(transactions: BankTransactionRow[], pattern: string, operator: string): number {
  if (!pattern.trim()) return 0;
  return transactions.filter((t) => {
    const text = [t.description, t.counterparty, t.sourceId].filter(Boolean).join(" ").toLowerCase();
    if (operator === "contains") return text.includes(pattern.toLowerCase());
    if (operator === "regex") { try { return new RegExp(pattern, "i").test(text); } catch { return false; } }
    return false;
  }).length;
}

function transactionCategoryKey(transaction: BankTransactionRow): BankCategoryKey {
  const id = transaction.classification?.categoryId;
  if (id && id in BANK_CATEGORIES) return id as BankCategoryKey;
  return categorizeBankTransaction(transaction).key;
}

function categorizeBankTransaction(transaction: BankTransactionRow) {
  const text = [
    transaction.description,
    transaction.counterparty,
    transaction.sourceId,
    transaction.accountName,
    transaction.institutionName
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const key: BankCategoryKey =
    /薪|salary|payroll|工資|獎金|bonus/.test(text) ? "salary" :
    /轉帳|轉入|轉出|匯款|transfer|remit|atm|跨行/.test(text) ? "transfer" :
    /餐|飯|咖啡|飲|food|restaurant|cafe|mcdonald|starbucks|ubereats|foodpanda/.test(text) ? "food" :
    /交通|捷運|高鐵|台鐵|加油|停車|uber|taxi|metro|rail|parking|fuel/.test(text) ? "transport" :
    /投資|證券|股票|基金|etf|broker|tdcc|交割/.test(text) ? "investment" :
    /手續|管理費|利息|fee|charge|interest/.test(text) ? "fee" :
    /購物|商店|百貨|超商|market|store|shop|momo|pchome|costco|全聯|統一|seven|family/.test(text) ? "shopping" :
    "other";

  return { key, ...BANK_CATEGORIES[key] };
}

function dateRangeLabel(range: BankDateRange) {
  const labels: Record<BankDateRange, string> = {
    month: "本月",
    threeMonths: "近 3 個月",
    year: "今年",
    all: "全部時間"
  };
  return labels[range];
}

function filterBankTransactions(
  transactions: BankTransactionRow[],
  search: string,
  accountId: string,
  flow: "all" | "inflow" | "outflow"
) {
  const normalized = search.trim().toLowerCase();
  return transactions.filter((transaction) => {
    if (accountId !== "all" && transaction.accountId !== accountId) return false;
    if (flow === "inflow" && transaction.amount <= 0) return false;
    if (flow === "outflow" && transaction.amount >= 0) return false;
    if (!normalized) return true;

    const haystack = [
      transaction.description,
      transaction.counterparty,
      transaction.accountName,
      transaction.institutionName,
      transaction.sourceId,
      transaction.amount.toString()
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalized);
  });
}

function formatAccountType(type?: string) {
  const labels: Record<string, string> = {
    checking: "活存",
    loan: "貸款",
    time_deposit: "定存",
    stored_value: "電子票證",
    unknown: "未知"
  };
  return type ? labels[type] ?? type : "帳戶";
}

interface ConnectorField {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "checkbox";
  placeholder?: string;
}

const connectorFields: Record<ConnectorId, ConnectorField[]> = {
  einvoice: [
    { key: "mobile", label: "手機號碼", type: "text", placeholder: "0912345678" },
    { key: "password", label: "密碼", type: "password" },
    { key: "apiKey", label: "API 金鑰 (不需填寫)", type: "password" },
    { key: "periodsBack", label: "回溯期數", type: "number", placeholder: "1" },
    { key: "fetchDetails", label: "同步明細", type: "checkbox" }
  ],
  tdcc: [
    { key: "userId", label: "身分證字號", type: "text", placeholder: "A123456789" },
    { key: "password", label: "密碼", type: "password" }
  ],
  esun: [
    { key: "userId", label: "身分證字號", type: "text", placeholder: "A123456789" },
    { key: "account", label: "使用者名稱", type: "text" },
    { key: "password", label: "密碼", type: "password" }
  ]
};

function ExchangeRatesPanel({ api }: { api: ApiClient }) {
  const queryClient = useQueryClient();
  const fxRates = useQuery({ queryKey: ["exchange-rates"], queryFn: () => api.get<ExchangeRateRow[]>("/api/exchange-rates") });
  const bank = useQuery({ queryKey: ["bank"], queryFn: () => api.get<BankData>("/api/bank") });

  const foreignCurrencies = [...new Set(
    (bank.data?.accounts ?? []).map(a => a.currency).filter(c => c && c !== "TWD")
  )].sort();

  const [rates, setRates] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  // Populate inputs from fetched rates (once)
  // ponytail: hardcoded sensible defaults, change when rates diverge significantly
  const DEFAULT_RATES: Record<string, number> = { JPY: 0.215, USD: 31.6, EUR: 34.5, HKD: 4.05 };
  const existingMap = { ...DEFAULT_RATES, ...Object.fromEntries((fxRates.data ?? []).map(r => [r.currency, r.rateTwd])) };

  const save = useMutation({
    mutationFn: async () => {
      const merged = { ...Object.fromEntries(Object.entries(existingMap).map(([k, v]) => [k, String(v)])), ...rates };
      const parsed = Object.fromEntries(
        Object.entries(merged).map(([k, v]) => [k, parseFloat(v)]).filter(([, v]) => !isNaN(v as number) && (v as number) > 0)
      );
      await api.put("/api/exchange-rates", { rates: parsed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exchange-rates"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  });

  if (foreignCurrencies.length === 0) return null;

  return (
    <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm lg:col-span-2">
      <h2 className="text-sm font-semibold text-ink/70 mb-4">匯率設定（手動）</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {foreignCurrencies.map(currency => (
          <div key={currency} className="flex items-center gap-3">
            <span className="w-12 text-sm font-medium">{currency}</span>
            <span className="text-xs text-ink/40">=</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder={String(existingMap[currency] ?? "")}
              value={rates[currency] ?? (existingMap[currency] != null ? String(existingMap[currency]) : "")}
              onChange={e => setRates(r => ({ ...r, [currency]: e.target.value }))}
              className="w-28 rounded-lg border border-ink/15 px-3 py-1.5 text-sm tabular-nums focus:border-blue-400 focus:outline-none"
            />
            <span className="text-xs text-ink/40">TWD</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-lg bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {saved ? "已儲存" : save.isPending ? "儲存中…" : "儲存"}
        </button>
        {fxRates.data && fxRates.data.length === 0 && (
          <p className="text-xs text-amber-600">首次使用請按下儲存，匯率才會套用至系統。</p>
        )}
      </div>
      {fxRates.data && fxRates.data.length > 0 && (
        <p className="mt-2 text-xs text-ink/35">
          上次更新：{new Date(fxRates.data[0]!.updatedAt).toLocaleString("zh-TW")}
        </p>
      )}
    </div>
  );
}

interface ClassificationRuleRow {
  id: string;
  categoryId: string;
  targetType: string | null;
  field: string;
  operator: string;
  pattern: string;
  priority: number;
  enabled: number;
  isSystem: number;
  source: string;
  description: string | null;
}

const RULE_FIELD_LABELS: Record<string, string> = {
  any_text: "任意欄位",
  description: "說明",
  counterparty: "對手方",
  source_id: "來源 ID"
};

const RULE_OPERATOR_LABELS: Record<string, string> = {
  contains: "包含",
  regex: "正規表達式",
  equals: "等於",
  starts_with: "開頭為"
};

const RULE_TARGET_LABELS: Record<string, string> = {
  bank_transaction: "銀行交易",
  invoice: "發票",
  invoice_line_item: "發票項目"
};

const EMPTY_RULE_FORM = { categoryId: "food", targetType: "", field: "any_text", operator: "contains", pattern: "", priority: "200" };

function ClassificationRulesPanel({ api }: { api: ApiClient }) {
  const queryClient = useQueryClient();
  const rules = useQuery({ queryKey: ["classification-rules"], queryFn: () => api.get<ClassificationRuleRow[]>("/api/classification/rules") });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_RULE_FORM);

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.put(`/api/classification/rules/${id}`, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["classification-rules"] })
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/classification/rules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["classification-rules"] })
  });
  const addMutation = useMutation({
    mutationFn: () => api.post("/api/classification/rules", {
      categoryId: form.categoryId,
      targetType: form.targetType || undefined,
      field: form.field,
      operator: form.operator,
      pattern: form.pattern.trim(),
      priority: parseInt(form.priority) || 200
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["classification-rules"] });
      setAdding(false);
      setForm(EMPTY_RULE_FORM);
    }
  });

  const allRules = rules.data ?? [];
  const systemRules = allRules.filter((r) => r.isSystem);
  const userRules = allRules.filter((r) => !r.isSystem);

  function RuleList({ items, allowDelete }: { items: ClassificationRuleRow[]; allowDelete: boolean }) {
    return (
      <div className="divide-y divide-ink/8">
        {items.map((rule) => {
          const cat = BANK_CATEGORIES[rule.categoryId as BankCategoryKey];
          const isEnabled = rule.enabled === 1;
          return (
            <div key={rule.id} className={`flex items-start gap-3 py-2.5 ${isEnabled ? "" : "opacity-40"}`}>
              <button
                type="button"
                title={isEnabled ? "停用" : "啟用"}
                disabled={toggleMutation.isPending}
                onClick={() => toggleMutation.mutate({ id: rule.id, enabled: !isEnabled })}
                className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${isEnabled ? "border-blue-500 bg-blue-500" : "border-ink/30 bg-white"} transition-colors`}
              >
                {isEnabled && <span className="block h-full w-full text-[10px] leading-4 text-white text-center">✓</span>}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {cat ? (
                    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${cat.className}`}>{cat.label}</span>
                  ) : (
                    <span className="text-xs font-medium">{rule.categoryId}</span>
                  )}
                  <span className="text-xs text-ink/40">{RULE_TARGET_LABELS[rule.targetType ?? ""] ?? "全部"}</span>
                  <span className="text-xs text-ink/40">·</span>
                  <span className="text-xs text-ink/40">{RULE_FIELD_LABELS[rule.field] ?? rule.field}</span>
                  <span className="text-xs text-ink/40">{RULE_OPERATOR_LABELS[rule.operator] ?? rule.operator}</span>
                </div>
                <p className="mt-0.5 truncate font-mono text-xs text-ink/70">{rule.pattern}</p>
                {rule.description && <p className="text-xs text-ink/35">{rule.description}</p>}
              </div>
              <span className="shrink-0 text-xs text-ink/30">p{rule.priority}</span>
              {allowDelete && (
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(rule.id)}
                  className="shrink-0 text-xs text-ink/30 hover:text-red-500"
                >
                  刪除
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm lg:col-span-2">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink/70">分類規則</h2>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-lg border border-ink/15 px-3 py-1 text-xs font-medium hover:bg-paper"
        >
          {adding ? "取消" : "+ 新增規則"}
        </button>
      </div>

      {adding && (
        <div className="mb-4 grid gap-3 rounded-lg border border-ink/10 bg-paper p-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-xs text-ink/50">分類</span>
            <select className={INPUT_CLS} value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}>
              {(Object.entries(BANK_CATEGORIES) as Array<[BankCategoryKey, typeof BANK_CATEGORIES[BankCategoryKey]]>).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-ink/50">目標類型（留空＝全部）</span>
            <select className={INPUT_CLS} value={form.targetType} onChange={(e) => setForm((f) => ({ ...f, targetType: e.target.value }))}>
              <option value="">全部</option>
              <option value="bank_transaction">銀行交易</option>
              <option value="invoice">發票</option>
              <option value="invoice_line_item">發票項目</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-ink/50">欄位</span>
            <select className={INPUT_CLS} value={form.field} onChange={(e) => setForm((f) => ({ ...f, field: e.target.value }))}>
              {Object.entries(RULE_FIELD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-ink/50">比對方式</span>
            <select className={INPUT_CLS} value={form.operator} onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value }))}>
              {Object.entries(RULE_OPERATOR_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="grid gap-1 sm:col-span-2">
            <span className="text-xs text-ink/50">模式</span>
            <input className={INPUT_CLS} value={form.pattern} onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value }))} placeholder="例：咖啡|cafe|starbucks" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-ink/50">優先順序（數字越大越優先）</span>
            <input className={INPUT_CLS} type="number" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={!form.pattern.trim() || addMutation.isPending}
              onClick={() => addMutation.mutate()}
              className="rounded-lg bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-40"
            >
              {addMutation.isPending ? "儲存中…" : "儲存"}
            </button>
          </div>
        </div>
      )}

      {rules.isLoading ? (
        <p className="py-4 text-center text-sm text-ink/40">載入中…</p>
      ) : (
        <>
          {userRules.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 text-xs font-medium uppercase text-ink/40">使用者規則</p>
              <RuleList items={userRules} allowDelete={true} />
            </div>
          )}
          <div>
            <p className="mb-1 text-xs font-medium uppercase text-ink/40">系統預設規則</p>
            <RuleList items={systemRules} allowDelete={false} />
          </div>
        </>
      )}
    </div>
  );
}

function SettingsView({ api }: { api: ApiClient }) {
  return (
    <div className="grid gap-5">
      <section className="grid gap-5 lg:grid-cols-2">
        <ConnectorPanel api={api} connectorId="einvoice" title="電子發票" />
        <ConnectorPanel api={api} connectorId="tdcc" title="集保e存摺" />
        <ConnectorPanel api={api} connectorId="esun" title="玉山銀行" />
        <ExchangeRatesPanel api={api} />
        <ClassificationRulesPanel api={api} />
      </section>
    </div>
  );
}

function ConnectorPanel({
  api,
  connectorId,
  title
}: {
  api: ApiClient;
  connectorId: ConnectorId;
  title: string;
}) {
  const queryClient = useQueryClient();
  const fields = connectorFields[connectorId];
  const [values, setValues] = useState<Record<string, string | boolean>>(() => {
    const defaults: Record<string, string | boolean> = {};
    if (connectorId === "einvoice") defaults.fetchDetails = true;
    return defaults;
  });
  const [otp, setOtp] = useState("");
  const [otpForced, setOtpForced] = useState(false);
  const [pendingSyncTarget, setPendingSyncTarget] = useState<SyncTarget>("default");
  const [error, setError] = useState("");
  const settings = useQuery({
    queryKey: ["connector-settings", connectorId],
    queryFn: () => api.get<ConnectorSettings>(`/api/connectors/${connectorId}/settings`)
  });
  const syncJobs = useQuery({
    queryKey: ["sync-jobs"],
    queryFn: () => api.get<SyncJobRow[]>("/api/sync-jobs")
  });
  const syncJob = syncJobs.data?.find((job) => job.connectorId === connectorId && job.scope === "all");

  function setValue(key: string, value: string | boolean) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function buildConfig() {
    const config: Record<string, unknown> = {};
    for (const field of fields) {
      const value = values[field.key];
      if (value === undefined || value === "") {
        continue;
      }
      config[field.key] = field.type === "number" ? Number(value) : value;
    }
    return config;
  }

  const save = useMutation({
    mutationFn: async () => {
      setError("");
      const config = buildConfig();
      if (Object.keys(config).length === 0) {
        throw new Error("請先填寫欄位再儲存。");
      }
      return api.put<ConnectorSettings>(`/api/connectors/${connectorId}/settings`, { config });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connector-settings", connectorId] });
    },
    onError: (mutationError) => setError(messageFromError(mutationError))
  });

  const updateSyncJob = useMutation({
    mutationFn: async (enabled: boolean) => {
      setError("");
      return api.patch<{ success: true; connectorId: ConnectorId; scope: string; enabled: boolean }>(
        `/api/sync-jobs/${connectorId}/all`,
        { enabled }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-jobs"] });
    },
    onError: (mutationError) => setError(messageFromError(mutationError))
  });

  function syncPath(target: SyncTarget) {
    if (connectorId !== "tdcc" || target === "default") {
      return `/api/connectors/${connectorId}/sync`;
    }
    return `/api/connectors/${connectorId}/sync/${target}`;
  }

  function invalidateAfterSync(target: SyncTarget) {
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    if (connectorId === "einvoice") {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice"] });
      return;
    }
    if (connectorId === "esun") {
      queryClient.invalidateQueries({ queryKey: ["bank"] });
      return;
    }
    if (target === "default" || target === "investments") {
      queryClient.invalidateQueries({ queryKey: ["investments"] });
    }
    if (target === "default" || target === "trades") {
      queryClient.invalidateQueries({ queryKey: ["investment-transactions"] });
    }
    if (target === "default" || target === "bank") {
      queryClient.invalidateQueries({ queryKey: ["bank"] });
    }
  }

  const sync = useMutation({
    mutationFn: (target: SyncTarget = "default") =>
      api.post<{ success: true; records: number; detailRecords?: number; cursorUpdated: boolean }>(
        syncPath(target),
        connectorId === "einvoice" ? { fetchDetails: true } : undefined
      ),
    onMutate: (target) => {
      setError("");
      setPendingSyncTarget(target ?? "default");
    },
    onSuccess: (_data, target) => {
      invalidateAfterSync(target ?? "default");
      queryClient.invalidateQueries({ queryKey: ["sync-jobs"] });
    },
    onError: (mutationError) => setError(messageFromError(mutationError))
  });
  const syncErrorMessage = sync.isError ? messageFromError(sync.error) : "";
  const otpRequired = connectorId === "tdcc" && (otpForced || /OTP/i.test(syncErrorMessage));
  const otpChannel: "email" | "sms" = /SMS/i.test(syncErrorMessage) ? "sms" : "email";
  const verifyOtp = useMutation({
    mutationFn: async () => {
      setError("");
      if (!otp.trim()) {
        throw new Error("請先輸入驗證碼。");
      }
      return api.post<{ success: true; records: number; cursorUpdated: boolean }>(
        syncPath(pendingSyncTarget),
        { otp: otp.trim(), otpChannel }
      );
    },
    onSuccess: () => {
      setOtp("");
      setOtpForced(false);
      sync.reset();
      queryClient.invalidateQueries({ queryKey: ["connector-settings", connectorId] });
      queryClient.invalidateQueries({ queryKey: ["sync-jobs"] });
      invalidateAfterSync(pendingSyncTarget);
    },
    onError: (mutationError) => setError(messageFromError(mutationError))
  });

  return (
    <article className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-ink/65">
            {settings.data?.configured
              ? `已設定於 ${formatDateTime(settings.data.updatedAt)}。機密資料不會在此顯示；重新填寫欄位即可覆寫。`
              : "尚未設定"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <IconButton label="儲存設定" icon={<Save />} busy={save.isPending} onClick={() => save.mutate()} />
          {connectorId === "tdcc" ? (
            <>
              <IconButton
                label="同步投資"
                icon={<WalletCards />}
                busy={sync.isPending && pendingSyncTarget === "investments"}
                onClick={() => sync.mutate("investments")}
              />
              <IconButton
                label="同步銀行"
                icon={<CreditCard />}
                busy={sync.isPending && pendingSyncTarget === "bank"}
                onClick={() => sync.mutate("bank")}
              />
              <IconButton
                label="同步交易"
                icon={<Database />}
                busy={sync.isPending && pendingSyncTarget === "trades"}
                onClick={() => sync.mutate("trades")}
              />
            </>
          ) : (
            <IconButton
              label="同步"
              icon={<RefreshCw />}
              busy={sync.isPending}
              onClick={() => sync.mutate("default")}
            />
          )}
          {connectorId === "tdcc" && !otpRequired && (
            <IconButton label="輸入 OTP" icon={<KeyRound />} busy={false} onClick={() => setOtpForced(true)} />
          )}
        </div>
      </div>
      {connectorId === "tdcc" && (
        <details className="mt-3 rounded-md border border-ink/10 bg-paper text-sm text-ink/70" open>
          <summary className="cursor-pointer select-none px-3 py-2 font-medium text-ink/80">使用說明</summary>
          <ol className="list-decimal space-y-1.5 px-3 pb-3 pt-1 pl-8">
            <li>在手機下載並登入「集保e存摺」，確認可看到股票與基金資料；若需連結銀行，請先在手機完成授權。</li>
            <li>在下方填入身分證字號與集保App密碼，按「儲存設定」後，再按「同步投資」。</li>
            <li>首次同步需驗證碼認證，請查看手機簡訊或電子信箱，在出現的輸入欄填入驗證碼並送出。</li>
            <li>完成後即可看到股票與基金持倉。日後同步不需重新輸入驗證碼。</li>
            <li>
              <span className="font-medium text-ink/85">注意：</span>
              集保App採單一裝置綁定。認證後手機App將無法使用；若在手機再次登入，本平台的認證會失效，下次同步需重新走驗證碼流程。
            </li>
          </ol>
        </details>
      )}
      {connectorId !== "tdcc" && (
        <p className="mt-3 text-xs text-ink/55">輸入完帳號密碼後，請先按「儲存設定」，再按「同步」。</p>
      )}
      <SyncJobStatus
        job={syncJob}
        loading={syncJobs.isLoading}
        updating={updateSyncJob.isPending}
        onToggle={(enabled) => updateSyncJob.mutate(enabled)}
      />
      <div className="mt-4 grid gap-3">
        {fields.map((field) =>
          field.type === "checkbox" ? (
            <label className="flex items-center gap-2 text-sm" key={field.key}>
              <input
                type="checkbox"
                checked={Boolean(values[field.key])}
                onChange={(event) => setValue(field.key, event.target.checked)}
              />
              {field.label}
            </label>
          ) : (
            <label className="grid gap-1 text-sm" key={field.key}>
              {field.label}
              <input
                className="rounded-md border border-ink/15 bg-paper px-3 py-2 text-sm outline-none focus:border-steel"
                type={field.type}
                placeholder={field.placeholder}
                value={(values[field.key] as string) ?? ""}
                onChange={(event) => setValue(field.key, event.target.value)}
              />
            </label>
          )
        )}
      </div>
      {otpRequired && (
        <div className="mt-3 rounded-md border border-coral/40 bg-coral/10 p-3">
          <p className="text-sm font-medium text-ink/80">
            TDCC 需要驗證碼，請查看{otpChannel === "sms" ? "手機簡訊" : "電子信箱"}。
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              className="min-w-40 flex-1 rounded-md border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-steel"
              placeholder="輸入驗證碼"
              autoFocus
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
            />
            <IconButton
              label="驗證並同步"
              icon={<RefreshCw />}
              busy={verifyOtp.isPending}
              onClick={() => verifyOtp.mutate()}
            />
          </div>
        </div>
      )}
      {(error || settings.isError || save.data || sync.data || verifyOtp.data) && (
        <p className="mt-3 rounded-md bg-paper px-3 py-2 text-sm text-ink/75">
          {error || (settings.isError ? messageFromError(settings.error) : "")}
          {save.data ? "設定已儲存。" : ""}
          {sync.data
            ? `已同步 ${sync.data.records} 筆資料${
                sync.data.detailRecords === undefined ? "" : `，含 ${sync.data.detailRecords} 筆明細`
              }。`
            : ""}
          {verifyOtp.data ? `驗證完成，已同步 ${verifyOtp.data.records} 筆資料。` : ""}
        </p>
      )}
    </article>
  );
}

function SyncJobStatus({
  job,
  loading,
  updating,
  onToggle
}: {
  job?: SyncJobRow;
  loading: boolean;
  updating: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const statusLabel =
    job?.running
      ? `同步中${job.lockScope ? `（${syncScopeLabel(job.lockScope)}）` : ""}`
      : job?.lastStatus === "success"
        ? "正常"
        : job?.lastStatus === "failed"
          ? "失敗"
          : job?.lastStatus === "needs_user_action"
            ? "需要處理"
            : "尚未同步";

  return (
    <div className="mt-3 rounded-md border border-ink/10 bg-paper px-3 py-2 text-sm text-ink/70">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-ink/80">自動同步：{loading ? "讀取中" : job?.enabled ? "開" : "關"}</span>
          {job && <span>狀態：{statusLabel}</span>}
          {job?.lastRunAt && <span>上次：{formatDateTime(job.lastRunAt)}</span>}
          {job?.enabled && job.nextRunAt && <span>下次：{formatDateTime(job.nextRunAt)}</span>}
        </div>
        {job && (
          <button
            className="rounded-md border border-ink/15 bg-white px-2.5 py-1 text-xs font-medium text-ink/75 transition hover:border-steel hover:text-steel disabled:opacity-60"
            disabled={updating}
            onClick={() => onToggle(!job.enabled)}
          >
            {job.enabled ? "關閉" : "開啟"}
          </button>
        )}
      </div>
      {job?.lastError && (
        <p className="mt-1 text-xs text-coral">{job.lastError}</p>
      )}
    </div>
  );
}

function syncScopeLabel(scope: string) {
  if (scope === "investments") return "投資";
  if (scope === "bank") return "銀行";
  if (scope === "trades") return "交易";
  return scope;
}

function NavButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex h-10 min-w-fit items-center gap-2 rounded-lg px-3 text-sm font-medium transition lg:min-w-0 ${
        active ? "bg-ink text-white shadow-sm" : "text-ink/70 hover:bg-ink/5 hover:text-ink"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="h-4 w-4 [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">
        {icon}
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function BottomNavButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex min-h-12 min-w-16 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[11px] font-medium transition ${
        active ? "bg-ink text-white" : "text-ink/55 hover:bg-ink/5 hover:text-ink"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="h-5 w-5 [&>svg]:h-5 [&>svg]:w-5" aria-hidden="true">
        {icon}
      </span>
      <span>{label}</span>
    </button>
  );
}

function IconButton({
  label,
  icon,
  busy,
  onClick
}: {
  label: string;
  icon: ReactNode;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-steel px-3 text-sm font-medium text-white transition hover:bg-steel/90 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={busy}
      onClick={onClick}
      title={label}
      type="button"
    >
      <span className={`h-4 w-4 [&>svg]:h-4 [&>svg]:w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true">
        {icon}
      </span>
      {label}
    </button>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <article className="rounded-xl border border-ink/10 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-medium text-ink/65">{label}</p>
        <span className="rounded-md bg-moss/10 p-2 text-moss [&>svg]:h-5 [&>svg]:w-5" aria-hidden="true">
          {icon}
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold">{value}</p>
    </article>
  );
}

function Table({ columns, rows, empty }: { columns: string[]; rows: string[][]; empty: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink/10 bg-white shadow-sm">
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-ink/10 text-left text-sm">
          <thead className="bg-paper">
            <tr>
              {columns.map((column) => (
                <th className="whitespace-nowrap px-4 py-3 font-semibold text-ink/75" key={column}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-ink/60" colSpan={columns.length}>
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td className="whitespace-nowrap px-4 py-3" key={`${rowIndex}-${cellIndex}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-ink/10 md:hidden">
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink/60">{empty}</p>
        ) : (
          rows.map((row, rowIndex) => (
            <div className="grid gap-2 px-4 py-3" key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <div className="grid grid-cols-[104px_minmax(0,1fr)] gap-3 text-sm" key={`${rowIndex}-${cellIndex}`}>
                  <span className="text-xs font-medium text-ink/45">{columns[cellIndex]}</span>
                  <span className="min-w-0 break-words text-right font-medium text-ink/80">{cell}</span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-xl border border-dashed border-ink/20 bg-white p-8 text-center shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-ink/65">{body}</p>
    </section>
  );
}

interface ApiClient {
  get<TValue>(path: string): Promise<TValue>;
  post<TValue>(path: string, body?: unknown): Promise<TValue>;
  put<TValue>(path: string, body: unknown): Promise<TValue>;
  patch<TValue>(path: string, body: unknown): Promise<TValue>;
  delete<TValue>(path: string): Promise<TValue>;
}

function createApiClient(): ApiClient {
  async function request<TValue>(path: string, init: RequestInit = {}) {
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init.headers
      }
    });
    const data = (await response.json()) as TValue | ApiError;
    if (!response.ok) {
      throw new Error(isApiError(data) ? data.error.message : "請求失敗。");
    }
    return data as TValue;
  }

  return {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
    put: (path, body) => request(path, { method: "PUT", body: JSON.stringify(body) }),
    patch: (path, body) => request(path, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (path) => request(path, { method: "DELETE" })
  };
}

function isApiError(value: unknown): value is ApiError {
  return typeof value === "object" && value !== null && "error" in value;
}

function formatCurrency(value: number, currency = "TWD") {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

function formatCompactTwd(value: number) {
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}億`;
  if (abs >= 10_000) return `${(value / 10_000).toFixed(0)}萬`;
  return formatNumber(Math.round(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(value);
}

function formatBankAccountName(account: { accountName?: string; sourceId?: string; accountSourceId?: string; accountType?: string }) {
  if (account.accountType === "credit") return account.accountName ?? account.sourceId ?? account.accountSourceId ?? "-";

  const sourceId = account.accountSourceId ?? account.sourceId ?? "";
  const last5 = bankAccountLast5(sourceId);
  if (last5) return last5;

  const name = account.accountName?.startsWith("末五碼 ") ? account.accountName.slice(4) : account.accountName;
  return name ?? sourceId ?? "-";
}

function bankAccountLast5(sourceId: string) {
  const settlement = sourceId.match(/^settlement:[^:]+:([^:]+)/);
  const esun = sourceId.match(/^bank:esun:([^:]+)/);
  const accountNo = settlement?.[1] ?? esun?.[1] ?? "";
  const digits = accountNo.replace(/\D/g, "");
  return digits ? digits.slice(-5) : undefined;
}

function formatDateTime(value?: string) {
  if (!value) {
    return "";
  }
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "short" }).format(new Date(value));
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "請求失敗。";
}

createRoot(document.getElementById("root")!).render(<App />);
