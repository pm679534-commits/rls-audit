import 'server-only';

import {createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {getServerEnv} from '@/lib/env';

export type EncryptedValue = {key_version: number; ciphertext: string; iv: string; tag: string};

function keyForVersion(version: number): Buffer {
  const env = getServerEnv();
  let encoded: string | undefined;
  if (version === env.ENCRYPTION_KEY_VERSION) encoded = env.ENCRYPTION_MASTER_KEY;
  else if (env.ENCRYPTION_PREVIOUS_KEYS) {
    try {
      const parsed: unknown = JSON.parse(env.ENCRYPTION_PREVIOUS_KEYS);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const value = (parsed as Record<string, unknown>)[String(version)];
        if (typeof value === 'string') encoded = value;
      }
    } catch { throw new Error('Invalid encryption key configuration'); }
  }
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error('Encryption key version unavailable');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('Invalid encryption key configuration');
  return key;
}

function fromBytea(value: string): Buffer {
  if (!/^\\x(?:[0-9a-fA-F]{2})*$/.test(value)) throw new Error('Invalid encrypted value');
  return Buffer.from(value.slice(2), 'hex');
}

function toBytea(value: Buffer): string { return `\\x${value.toString('hex')}`; }

export function encryptSecret(plaintext: string, associatedData: string): EncryptedValue {
  if (!plaintext || !associatedData) throw new Error('Secret and associated data are required');
  const version = getServerEnv().ENCRYPTION_KEY_VERSION;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyForVersion(version), iv);
  cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {key_version: version, ciphertext: toBytea(ciphertext), iv: toBytea(iv), tag: toBytea(cipher.getAuthTag())};
}

export function decryptSecret(value: EncryptedValue, associatedData: string): string {
  try {
    const iv = fromBytea(value.iv);
    const tag = fromBytea(value.tag);
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', keyForVersion(value.key_version), iv);
    decipher.setAAD(Buffer.from(associatedData, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(fromBytea(value.ciphertext)), decipher.final()]).toString('utf8');
  } catch { throw new Error('Unable to decrypt secret'); }
}

export function secureRandomToken(bytes = 32): string {
  if (!Number.isInteger(bytes) || bytes < 16 || bytes > 128) throw new RangeError('Invalid token size');
  return randomBytes(bytes).toString('base64url');
}

export function sha256Bytea(value: string): string { return toBytea(createHash('sha256').update(value, 'utf8').digest()); }

export function constantTimeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const left = Buffer.isBuffer(a) ? a : Buffer.from(a);
  const right = Buffer.isBuffer(b) ? b : Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function generateApiKey(): {key: string; prefix: string; hash: string} {
  const prefix = randomBytes(8).toString('hex');
  const key = `sg_${prefix}_${secureRandomToken(32)}`;
  return {key, prefix, hash: sha256Bytea(key)};
}

export function parseApiKey(key: string): {prefix: string; validFormat: boolean} {
  const match = /^sg_([0-9a-f]{16})_([A-Za-z0-9_-]{43})$/.exec(key);
  return {prefix: match?.[1] ?? '', validFormat: Boolean(match)};
}

export function verifyApiKey(key: string, expectedHash: string): boolean {
  if (!parseApiKey(key).validFormat) return false;
  try { return constantTimeEqual(fromBytea(sha256Bytea(key)), fromBytea(expectedHash)); }
  catch { return false; }
}

export function signWebhook(payload: string | Buffer, secret: string, timestamp: number): string {
  if (!Number.isSafeInteger(timestamp) || !secret) throw new Error('Invalid webhook signature inputs');
  return createHmac('sha256', secret).update(String(timestamp)).update('.').update(payload).digest('hex');
}

export function verifyWebhookSignature(payload: string | Buffer, secret: string, timestamp: number, signature: string, maxAgeSeconds = 300): boolean {
  if (!Number.isSafeInteger(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > maxAgeSeconds || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  return constantTimeEqual(Buffer.from(signWebhook(payload, secret, timestamp), 'hex'), Buffer.from(signature, 'hex'));
}
