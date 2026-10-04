import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { AppError } from '../errors.ts';

const COST = 16384;
const KEY_LENGTH = 64;
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: COST, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, value) => error ? reject(error) : resolve(value));
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password) > 256) {
    throw new AppError(400, 'INVALID_PASSWORD', '密码至少 12 个字符，且不超过 256 字节');
  }
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${COST}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, record: string): Promise<boolean> {
  if (typeof password !== 'string' || Buffer.byteLength(password) > 256) return false;
  const match = /^scrypt\$16384\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(record);
  if (!match) return false;
  const actual = await derive(password, Buffer.from(match[1], 'hex'));
  return timingSafeEqual(actual, Buffer.from(match[2], 'hex'));
}
