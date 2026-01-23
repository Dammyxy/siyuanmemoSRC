const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getDeviceFingerprint() {
  const nav = window.navigator;
  return [nav.userAgent, nav.language, nav.platform].filter(Boolean).join('|');
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function xorEncrypt(data: string, key: string) {
  const dataBytes = encoder.encode(data);
  const keyBytes = encoder.encode(key);
  for (let i = 0; i < dataBytes.length; i += 1) {
    dataBytes[i] ^= keyBytes[i % keyBytes.length];
  }
  return bytesToBase64(dataBytes);
}

function xorDecrypt(data: string, key: string) {
  const dataBytes = base64ToBytes(data);
  const keyBytes = encoder.encode(key);
  for (let i = 0; i < dataBytes.length; i += 1) {
    dataBytes[i] ^= keyBytes[i % keyBytes.length];
  }
  return decoder.decode(dataBytes);
}

async function getAesKey() {
  const cryptoObj = window.crypto;
  if (!cryptoObj?.subtle) return null;
  const fingerprint = getDeviceFingerprint();
  const baseKey = await cryptoObj.subtle.importKey(
    'raw',
    encoder.encode(fingerprint),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return cryptoObj.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('fsrs-block-practice'),
      iterations: 120000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptPayload(payload: any) {
  const cryptoObj = window.crypto;
  const data = JSON.stringify(payload);
  const key = await getAesKey();
  if (cryptoObj?.subtle && key) {
    const iv = cryptoObj.getRandomValues(new Uint8Array(12));
    const encrypted = await cryptoObj.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(data),
    );
    return JSON.stringify({
      v: 1,
      alg: 'AES-GCM',
      iv: bytesToBase64(iv),
      data: bytesToBase64(new Uint8Array(encrypted)),
    });
  }
  return JSON.stringify({
    v: 1,
    alg: 'XOR',
    data: xorEncrypt(data, getDeviceFingerprint()),
  });
}

async function decryptPayload(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.alg === 'AES-GCM') {
      const key = await getAesKey();
      if (!key) return null;
      const iv = base64ToBytes(parsed.iv);
      const dataBytes = base64ToBytes(parsed.data);
      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        dataBytes,
      );
      return JSON.parse(decoder.decode(new Uint8Array(decrypted)));
    }
    if (parsed?.alg === 'XOR') {
      const decrypted = xorDecrypt(parsed.data, getDeviceFingerprint());
      return JSON.parse(decrypted);
    }
  } catch {}
  return null;
}

function getBlockPracticeStorageKey() {
  return 'fsrs.blockPractice.progress.v1';
}

export async function readBlockPracticeProgress() {
  try {
    const raw = localStorage.getItem(getBlockPracticeStorageKey());
    if (!raw) return null;
    const data = await decryptPayload(raw);
    if (!data?.expiresAt || Date.now() > data.expiresAt) {
      localStorage.removeItem(getBlockPracticeStorageKey());
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export async function writeBlockPracticeProgress(payload: any) {
  const savedAt = Date.now();
  const expiresAt = savedAt + 7 * 24 * 60 * 60 * 1000;
  const encrypted = await encryptPayload({ ...payload, savedAt, expiresAt });
  localStorage.setItem(getBlockPracticeStorageKey(), encrypted);
}

export function clearBlockPracticeProgress() {
  try {
    localStorage.removeItem(getBlockPracticeStorageKey());
  } catch {}
}

