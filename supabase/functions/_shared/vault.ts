// AES-256-GCM helpers usando CFO_VAULT_ENC_KEY (32 bytes hex)
// Formato encriptado: "<iv_base64>:<ciphertext_base64>" (ciphertext inclui tag GCM)

function getKeyBytes(): Uint8Array {
  const keyHex = Deno.env.get("CFO_VAULT_ENC_KEY");
  if (!keyHex) throw new Error("CFO_VAULT_ENC_KEY missing");
  const matches = keyHex.match(/.{2}/g);
  if (!matches || matches.length !== 32) {
    throw new Error("CFO_VAULT_ENC_KEY must be 32 bytes hex (64 chars)");
  }
  return Uint8Array.from(matches.map((b) => parseInt(b, 16)));
}

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encryptVault(plaintext: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    getKeyBytes(),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${b64(iv)}:${b64(new Uint8Array(ct))}`;
}

export async function decryptVault(encrypted: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    getKeyBytes(),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const [ivB64, ctB64] = encrypted.split(":");
  if (!ivB64 || !ctB64) throw new Error("Invalid encrypted payload");
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64) },
    key,
    fromB64(ctB64),
  );
  return new TextDecoder().decode(pt);
}
