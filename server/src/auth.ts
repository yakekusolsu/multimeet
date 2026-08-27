import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { Role } from '@multimeet/shared';
import { config } from './config.js';

const scrypt = promisify(scryptCallback);

export interface TokenPayload {
  roomId: string;
  role: Role;
  displayName: string;
  nonce: string;
  expiresAt: number;
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function signature(encodedPayload: string): string {
  return createHmac('sha256', config.tokenSecret).update(encodedPayload).digest('base64url');
}

export function createToken(
  payload: Omit<TokenPayload, 'nonce' | 'expiresAt'>,
  ttlMs = 12 * 60 * 60 * 1_000,
): string {
  const value: TokenPayload = {
    ...payload,
    nonce: randomBytes(12).toString('hex'),
    expiresAt: Date.now() + ttlMs,
  };
  const encoded = encode(JSON.stringify(value));
  return `${encoded}.${signature(encoded)}`;
}

export function verifyToken(token: unknown): TokenPayload | null {
  if (typeof token !== 'string') return null;
  const [encoded, provided] = token.split('.');
  if (!encoded || !provided) return null;
  const expected = signature(encoded);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  )
    return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    return payload.expiresAt > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export function createOpaqueToken(): string {
  return randomBytes(24).toString('base64url');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return password.length === 0;
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const actual = (await scrypt(password, Buffer.from(saltHex, 'hex'), 64)) as Buffer;
  const expected = Buffer.from(hashHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
