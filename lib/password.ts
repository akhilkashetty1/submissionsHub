import "server-only";
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

/** Format: scrypt.<salt>.<hash>, base64url, with no `$`, so env files can't mangle it. */
export function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt.${salt.toString("base64url")}.${scryptSync(password, salt, 64).toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split(".");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

/** A hash nobody has the password for: checked when the username is unknown, so timing doesn't reveal it. */
export const DUMMY_HASH = hashPassword(randomBytes(16).toString("hex"));

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const MIN_PASSWORD = 10;

/** Easy to read out loud: no 0/O or 1/l/I. Looks like `kf7m-9xqe-t4wz`. */
export function generatePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const group = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
  return `${group()}-${group()}-${group()}`;
}

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > 200) return "That password is too long.";
  return null;
}
