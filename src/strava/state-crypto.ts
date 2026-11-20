import * as crypto from 'node:crypto';

/** Authenticated encryption (AES-256-GCM, scrypt-derived key) for the state file kept in git. */
interface Envelope {
  v: 1;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

const b64 = (b: Buffer): string => b.toString('base64');

export function generateKey(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function encrypt(plain: string, passphrase: string): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', crypto.scryptSync(passphrase, salt, 32), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const envelope: Envelope = { v: 1, salt: b64(salt), iv: b64(iv), tag: b64(cipher.getAuthTag()), data: b64(data) };
  return JSON.stringify(envelope);
}

export function decrypt(payload: string, passphrase: string): string {
  try {
    const e = JSON.parse(payload) as Envelope;
    const key = crypto.scryptSync(passphrase, Buffer.from(e.salt, 'base64'), 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(e.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(e.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(e.data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Cannot decrypt the state file: wrong STATE_KEY or corrupted file');
  }
}
