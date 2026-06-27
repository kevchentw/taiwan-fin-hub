# Taiwan Fin Hub

自架個人理財整合工具，將銀行、投資、信用卡、電子發票集中在同一個介面查看。

**支援資料來源：**

1. 集保 e 存摺（股票基金持倉、三個月交易紀錄、銀行餘額與明細）
   - 支援銀行列表：https://epassbook.tdcc.com.tw/zh/g1.aspx
2. 電子發票載具
3. 玉山銀行
4. 國泰世華銀行
5. 中國信託銀行

| 總覽 | 投資 | 銀行 |
|---|---|---|
| <img src="images/screenshots/01-dashboard.png"> | <img src="images/screenshots/03-investments.png"> | <img src="images/screenshots/04-bank.png"> |

---

## 部署

**需要：** [Cloudflare 帳號](https://dash.cloudflare.com/signup)、[GitHub 帳號](https://github.com/signup)

### 步驟一：啟用 Cloudflare Access

前往 https://one.dash.cloudflare.com/ 開啟 Cloudflare Access，Free Plan 即可。本應用以此作為登入與存取保護。

### 步驟二：一鍵部署

點擊下方按鈕，程式碼會自動複製到你的 GitHub 並部署至 Cloudflare Workers：

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kevchentw/taiwan-fin-hub)

首次使用需透過 **Git account → New Github Connection** 授權 Cloudflare 存取 GitHub：

<img src="images/deploy-github-install.png" width="500">

選擇帳號後點 **Install & Authorize**：

<img src="images/deploy-github-authorize.png" width="400">

接著填寫部署設定，在表單下方輸入以下 secret：

<img src="images/deploy-setup.png" width="450">

| Secret | 說明 |
| --- | --- |
| `CONFIG_ENCRYPTION_KEY` | 加密連接器帳密的金鑰，至少 32 字元，**設定後不可更換**。可用此指令產生：`openssl rand -base64 32` |

其他兩個設定值待會才會設定

點擊 **Deploy**，等待約 1 分鐘，看到綠色勾勾即表示部署成功：

<img src="images/deploy-success.png" width="700">

### 步驟三：啟用登入保護

1. 前往 [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages，確認 `taiwan-fin-hub` 已出現
2. 點進去後切到 **Domains** 頁籤，將 Worker URL 旁的存取模式從 **Public** 改為 **Restricted**
   （若此步驟失敗，請確認 Cloudflare Access 已啟用）

   <img src="images/deploy-domains-restricted.png" width="700">

3. 切換後會彈出「This Worker URL requires Access sign-in」對話框，記下以下兩個值：
   - **Audience (aud)**：一串 hex 字串，對應 `POLICY_AUD`
   - **JWKs URL**：格式為 `https://xxxxxxxx.cloudflareaccess.com/cdn-cgi/access/certs`，其中 `https://xxxxxxxx.cloudflareaccess.com` 即 `TEAM_DOMAIN`
4. 前往 **Settings → Variables and secrets**，對以下兩個 Secret 點選 **Rotate** 填入對應值：

<img src="images/deploy-secrets.png" width="700">

| Secret | 值 |
| --- | --- |
| `TEAM_DOMAIN` | JWKs URL 的網域，例如 `https://yourteam.cloudflareaccess.com` |
| `POLICY_AUD` | Audience (aud) 的 hex 值 |
| `POLICY_AUDS` | 選填，多個 Audience (aud) 的 hex 值，以逗號或空白分隔 |

---

## 使用

1. 開啟部署完成的網址，確認需要登入才能進入（若能直接存取，請回到步驟三確認 Restricted 設定）
2. 登入後前往「連接器」頁面設定資料來源
3. 點擊同步以取得最新資料

---

## 更新

目前 Deploy to Cloudflare 尚不支援 Fork，無法在 GitHub 上直接同步新版的程式碼，請擇一使用以下兩種方式：

**方法一：透過 Git 更新（推薦）**

```bash
git remote add upstream git@github.com:kevchentw/taiwan-fin-hub.git
git fetch upstream
git merge upstream/main
```

推送後 Cloudflare 會自動部署新版本。

**方法二：重新部署**

點擊下方按鈕重新走一次部署流程：

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kevchentw/taiwan-fin-hub)

1. **Project Name** 填新名稱，例如 `taiwan-fin-hub-v2`
2. **Select D1 Database** 選擇原有資料庫（`taiwan-fin-hub` 或你自訂的名稱）
3. **CONFIG_ENCRYPTION_KEY** 若有保留原本的值請填入相同值；填新值則需重新設定所有連接器
4. 其餘步驟同首次部署。新版本會有新的 Worker URL，但資料庫沿用原有的，資料不會遺失

---

## 安全機制

### 登入保護

本應用以 [Cloudflare Access](https://www.cloudflare.com/zero-trust/products/access/) 作為唯一登入閘道，不自行管理帳號密碼或 session。每個請求都必須附帶 Cloudflare 簽發的 JWT，Worker 端會：

1. 從 Cloudflare Access JWKS 端點取得公鑰（`/cdn-cgi/access/certs`）
2. 以 **RS256（RSA + SHA-256）** 驗證 JWT 簽章
3. 確認 issuer、audience 正確且 JWT 未過期

若同一個 Worker 需要接受多個 Cloudflare Access Application 的 JWT，可設定 `POLICY_AUDS`，例如：

```env
POLICY_AUDS=production-aud-hex,private-aud-hex
```

`POLICY_AUD` 仍可保留作為單一 audience 設定；兩者同時存在時，任一 audience 符合即通過驗證。

驗證失敗一律回傳 `401`。

### 連接器帳密保護

銀行帳號、密碼等敏感資料在寫入資料庫前一律加密：

1. 以 `CONFIG_ENCRYPTION_KEY` 透過 **SHA-256** 衍生 256-bit 金鑰
2. 使用 **AES-GCM** 加密，每次產生隨機 96-bit IV
3. 資料庫只儲存密文（版本號、演算法、IV、ciphertext 均 Base64 編碼），明文從不落地

> **注意**：`CONFIG_ENCRYPTION_KEY` 設定後不可更換，否則既有的加密資料將無法解密。

---

## 免責聲明

本程式僅供個人研究與自用，未與臺灣集中保管結算所、財政部、金融監督管理委員會、各銀行或任何金融機構合作，亦未獲前述機構授權或背書。本程式所呈現之資料以您自行提供之憑證取得，作者不保證資料之即時性、正確性與完整性，亦不對因使用本程式所產生之任何直接或間接損失負責。請勿將本程式用於任何商業用途。
