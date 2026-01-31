import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";

const KEY_PREFIX = "ugig_live_";
const BCRYPT_ROUNDS = 10;

/**
 * Generate a new API key in the format: ugig_live_<random_32_chars>
 */
export function generateApiKey(): string {
  const random = randomBytes(24).toString("base64url"); // 32 chars of URL-safe base64
  return `${KEY_PREFIX}${random}`;
}

/**
 * Hash an API key for secure storage using bcrypt
 */
export async function hashApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, BCRYPT_ROUNDS);
}

/**
 * Verify a raw API key against a bcrypt hash
 */
export async function verifyApiKey(
  key: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(key, hash);
}

/**
 * Extract the prefix (first 16 chars) of an API key for identification/lookup
 */
export function getKeyPrefix(key: string): string {
  return key.substring(0, 16);
}
