# Taiwan Fin Hub

自架個人理財整合工具，集中查看銀行、投資、信用卡、電子發票。

支援：
1. 集保 e 存摺（股票基金持倉、三個月交易紀錄、銀行餘額與交易紀錄）
   - 支援銀行請參考：https://epassbook.tdcc.com.tw/zh/g1.aspx
2. 電子發票載具
3. 玉山銀行

## 部署

需要：Cloudflare 帳號、GitHub 帳號

**步驟一：啟用 Cloudflare Access**

如果還沒啟用過，先到 https://one.dash.cloudflare.com/ 開啟，Free Plan 即可。這是本應用的登入與存取保護系統。

**步驟二：一鍵部署**

點擊下方按鈕，它會將程式碼複製到你的 GitHub 帳號並部署到 Cloudflare Workers：

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kevchentw/taiwan-fin-hub)

部署時設定以下 secret：

| Secret | 說明 |
| --- | --- |
| `CONFIG_ENCRYPTION_KEY` | 加密連接器帳密用的金鑰，至少 32 字元，**設定後不可更換**。可用以下指令產生：`openssl rand -base64 32` |

**步驟三：啟用登入保護**

1. 到 [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages，確認 `taiwan-fin-hub` 出現
2. 點進去後切到 **Domains** 頁籤，將 Worker URL 旁的下拉選單從 **Public** 改為 **Restricted**
   （若此步驟失敗，請確認 Cloudflare Access 已啟用 Free Plan）
3. 切換後會彈出「This Worker URL requires Access sign-in」對話框，記下以下兩個值：
   - **Audience (aud)**：一串 hex 字串，對應 `POLICY_AUD`
   - **JWKs URL**：格式為 `https://xxxxxxxx.cloudflareaccess.com/cdn-cgi/access/certs`，網域部分（`https://xxxxxxxx.cloudflareaccess.com`）即 `TEAM_DOMAIN`
4. 到 **Settings → Variables and secrets**，新增以下兩個 Secret：

| Secret | 填入值 |
| --- | --- |
| `TEAM_DOMAIN` | JWKs URL 的網域，例如 `https://yourteam.cloudflareaccess.com` |
| `POLICY_AUD` | Audience (aud) 的 hex 值 |

5. 將 Preview 網址右側的開關**關閉**，避免繞過登入直接存取

## 使用

1. 開啟部署完成的網址，確認需要通過 Cloudflare Access 登入才能進入網站（若能直接進入請回到步驟三確認 Restricted 設定）
2. 登入後到「連接器」頁面設定資料來源
3. 按同步取得最新資料


## 更新

目前 Deploy to Cloudflare 尚不支援 Fork，無法在 GitHub 上快速 sync，請擇一使用以下兩種方式更新：

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
2. **Select D1 Database** 選擇原有的資料庫（`taiwan-fin-hub` 或你自訂的名稱）
3. **CONFIG_ENCRYPTION_KEY** 若有保留原本的值請填入相同值；填新值則連接器帳密需重新設定
4. 其餘步驟同首次部署；新版本會有新的 Worker URL，但資料庫沿用原有的，資料不會遺失


## 安全機制

### 登入保護

本應用使用 [Cloudflare Access](https://www.cloudflare.com/zero-trust/products/access/) 作為唯一的登入閘道，不自行管理帳號密碼或 session。每個請求都必須附帶 Cloudflare 簽發的 JWT（`Cf-Access-Jwt-Assertion` header 或 `CF_Authorization` cookie），Worker 端會：

1. 從 Cloudflare Access JWKS 端點取得公鑰（`/cdn-cgi/access/certs`）
2. 以 **RS256（RSA + SHA-256）** 驗證 JWT 簽章
3. 確認 issuer 符合 team domain、audience 符合 Audience Tag，且 JWT 未過期

驗證失敗一律回傳 `401`。

### 連接器帳密保護

銀行帳號、密碼等敏感資料在寫入資料庫前一律加密：

1. 以 `CONFIG_ENCRYPTION_KEY` 為 secret，透過 **SHA-256** 衍生 256-bit 金鑰
2. 使用 **AES-GCM** 加密，每次加密產生隨機 96-bit IV
3. 資料庫只儲存密文（含版本號、演算法、IV、ciphertext，均 Base64 編碼），明文從不落地

> **注意**：`CONFIG_ENCRYPTION_KEY` 設定後不可更換，否則既有的加密資料將無法解密。


## 免責聲明

本程式僅供個人研究與自用，未與臺灣集中保管結算所、財政部、金融監督管理委員會、各銀行或任何金融機構合作，亦未獲前述機構授權或背書。本程式所呈現之資料以您自行提供之憑證取得，作者不保證資料之即時性、正確性與完整性，亦不對因使用本程式所產生之任何直接或間接損失負責。請勿將本程式用於任何商業用途。