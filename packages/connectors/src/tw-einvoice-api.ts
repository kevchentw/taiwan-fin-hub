import * as forge from "node-forge";

const BASE_URL = "https://invoiceapp.nat.gov.tw/UIAPAPP/api/";
const DEFAULT_APP_VERSION = "6.0630.31";
const DEFAULT_OS = "Android";
const DEFAULT_API_KEY = "xkRT21hZ3uDJehRthVlDAdfzpAoPLEoKpTAKyR/eB2iMqErmM7U5IVC6G5eHD/MN";

export const RSA_PUBLIC_KEY = `<RSAKeyValue><Modulus>wWj/ElSXlSJCJv/ELn47aYNIx8pWec6RFgVWnW836DQwQjh7pL90av6Mvv5kPjNbM4njxeLeuXx9ZuNP2A+JUhVLkU6zdqB+T2Nyj+zhUa5szkmaJm0ntXJvGN7iAwIvLPE2BcMWGlsPBFhWMoRt8goM06AUcFIzI4dL3iDpUWvm/Og/bzeel7/rb0RVbV86zv4MzqIt7PJM7mnw+SCjH59nEBsKkR96kR3Ye6iwztvAZcIGyTihFW2J0GEq+sPO09XW+oobQt62qIaisbR7rVZcY5Qcu8g6qeVzoz1n77/SeG4BZo/hLR13I874ZUZ+rdbFNoOPj9mj+WSPFIPf6Q==</Modulus><Exponent>AQAB</Exponent></RSAKeyValue>`;

export type EInvoiceUser = {
  mobile?: string;
  userToken?: string;
  mobileBarcode?: string;
  [key: string]: unknown;
};

export type LoginParams =
  | {
      mobile: string;
      password: string;
      deviceId?: string;
      platform?: string;
      pushToken?: string;
    }
  | {
      Id: string;
      VerifyCode: string;
      DeviceID?: string;
      Platform?: string;
      PushToken?: string;
    };

export class EInvoiceClient {
  currentUser: EInvoiceUser | null;
  host: string;
  private headers: Record<string, string>;

  constructor({
    apiKey,
    appVersion,
    currentUser,
    host,
    os
  }: {
    apiKey?: string;
    appVersion?: string;
    currentUser?: EInvoiceUser | null;
    host?: string;
    os?: string;
  } = {}) {
    this.host = host ?? BASE_URL;
    this.currentUser = currentUser ?? null;
    this.headers = {
      "Content-Type": "application/json",
      ApiKey: apiKey ?? DEFAULT_API_KEY,
      AppVersion: appVersion ?? DEFAULT_APP_VERSION,
      OS: os ?? DEFAULT_OS
    };
  }

  async post(path: string, body?: unknown) {
    const payload = this.normalizeRequestBody(path, body);
    const { requestBody, cryptoKey, headers } = this.encryptRequest(payload);
    const res = await fetch(this.host + path, {
      method: "POST",
      headers: { ...this.headers, ...headers },
      body: requestBody
    });
    const data = await this.readResponse(res, path, cryptoKey);
    if (path === "User/Login") this.setCurrentUserFromLogin(data);
    return data;
  }

  login(params: LoginParams) {
    return this.post("User/Login", params);
  }

  checkCarrierInvoices(params: unknown) {
    return this.post("Invoice/ChkCarrierInv", params);
  }

  checkCarrierInvoiceDetail(params: unknown) {
    return this.post("Invoice/ChkCarrierInvDetail", params);
  }

  private normalizeRequestBody(path: string, body?: unknown) {
    if (path !== "User/Login") return body;
    const loginBody = body as Partial<Extract<LoginParams, { mobile: string }>> &
      Partial<Extract<LoginParams, { Id: string }>>;
    if (!loginBody || loginBody.Id || loginBody.VerifyCode) return body;

    return {
      Id: loginBody.mobile,
      VerifyCode: loginBody.password,
      DeviceID: loginBody.deviceId ?? "http://OpenUDID.org",
      Platform: loginBody.platform ?? DEFAULT_OS,
      PushToken: loginBody.pushToken ?? ""
    };
  }

  private encryptRequest(body?: unknown) {
    const json = JSON.stringify(body ?? { "": "" });
    const user = this.currentUser;
    if (user?.mobile && user?.userToken) {
      const cryptoKey = aesEncryptString(user.mobile, user.userToken);
      return {
        cryptoKey,
        requestBody: aesEncryptString(json, cryptoKey),
        headers: {
          encrypt: "mixed",
          ValidationToken: cryptoKey,
          Token: user.userToken,
          UUID: "http://OpenUDID.org",
          ...(user.mobileBarcode ? { CarrierCode: user.mobileBarcode } : {})
        }
      };
    }

    return {
      cryptoKey: singleResponseKey(),
      requestBody: rsaEncrypt(json),
      headers: { encrypt: "single" }
    };
  }

  private async readResponse(res: Response, path: string, cryptoKey?: string) {
    const encrypted = res.headers.get("encrypt");
    const raw = await res.text();
    let text = raw;

    if (raw && encrypted === "single") text = aesDecryptString(raw, singleResponseKey());
    if (raw && encrypted === "mixed" && cryptoKey) text = aesDecryptString(raw, cryptoKey);

    let data: unknown = text;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      const message =
        typeof data === "object" && data && "Message" in data
          ? `: ${String((data as { Message: unknown }).Message)}`
          : "";
      throw new Error(`HTTP ${res.status} - ${path}${message}`);
    }

    return data;
  }

  private setCurrentUserFromLogin(data: unknown) {
    const response = data as {
      result?: { user?: EInvoiceUser };
      Result?: { User?: EInvoiceUser; user?: EInvoiceUser };
    };
    const user = response?.result?.user ?? response?.Result?.User ?? response?.Result?.user;
    const r = response as any;
    console.log("[einvoice debug] ReturnCode:", r?.ReturnCode, "Message:", r?.Message);
    console.log("[einvoice debug] Result:", JSON.stringify(r?.Result));
    console.log("[einvoice debug] user object:", JSON.stringify(user));
    if (user?.mobile && user?.userToken) this.currentUser = user;
  }
}

function aesEncryptString(text: string, keyText: string) {
  const cipher = createAesCipher("encrypt", keyText);
  cipher.update(forge.util.createBuffer(text, "utf8"));
  cipher.finish();
  return forge.util.encode64(cipher.output.getBytes());
}

function aesDecryptString(text: string, keyText: string) {
  const cipher = createAesCipher("decrypt", keyText);
  cipher.update(forge.util.createBuffer(forge.util.decode64(text), "raw"));
  cipher.finish();
  return cipher.output.toString();
}

function createAesCipher(direction: "encrypt" | "decrypt", keyText: string) {
  const key = forge.md.sha256.create().update(keyText, "utf8").digest().getBytes();
  const iv = forge.md.md5.create().update(keyText, "utf8").digest().getBytes();
  const cipher =
    direction === "encrypt"
      ? forge.cipher.createCipher("AES-CBC", key)
      : forge.cipher.createDecipher("AES-CBC", key);
  cipher.start({ iv });
  return cipher;
}

function rsaEncrypt(text: string) {
  const publicKey = forge.pki.publicKeyFromPem(rsaPublicKeyPem());
  const bytes = forge.util.encodeUtf8(text);
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 245) {
    chunks.push(publicKey.encrypt(bytes.slice(offset, offset + 245), "RSAES-PKCS1-V1_5"));
  }
  return forge.util.encode64(chunks.join(""));
}

function rsaPublicKeyPem() {
  const key = forge.pki.setRsaPublicKey(
    new forge.jsbn.BigInteger(forge.util.bytesToHex(forge.util.decode64(rsaXmlValue("Modulus"))), 16),
    new forge.jsbn.BigInteger(forge.util.bytesToHex(forge.util.decode64(rsaXmlValue("Exponent"))), 16)
  );
  return forge.pki.publicKeyToPem(key);
}

function rsaXmlValue(name: string) {
  const match = RSA_PUBLIC_KEY.match(new RegExp(`<${name}>([^<]+)</${name}>`));
  if (!match) throw new Error(`Missing RSA key field: ${name}`);
  return match[1];
}

function singleResponseKey() {
  return forge.util.encode64(
    forge.md.sha256.create().update(RSA_PUBLIC_KEY.slice(0, 16), "utf8").digest().getBytes()
  );
}
