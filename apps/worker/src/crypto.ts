const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptJson(value: unknown, secret: string) {
  const key = await encryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(value))
  );

  return JSON.stringify({
    v: 1,
    alg: "AES-GCM",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  });
}

export async function decryptJson<TValue>(encrypted: string, secret: string) {
  const parsed = JSON.parse(encrypted) as {
    v: number;
    alg: "AES-GCM";
    iv: string;
    ciphertext: string;
  };

  if (parsed.v !== 1 || parsed.alg !== "AES-GCM") {
    throw new Error("Unsupported encrypted config format.");
  }

  const key = await encryptionKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(parsed.iv) },
    key,
    base64ToBytes(parsed.ciphertext)
  );

  return JSON.parse(decoder.decode(plaintext)) as TValue;
}
