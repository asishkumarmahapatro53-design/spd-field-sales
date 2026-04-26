import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, hash: string) {
  // Guard against malformed hashes (e.g. manually created users in Firestore)
  // If the hash doesn't have a colon, we treat it as a plain-text password for testing/manual entry.
  if (!hash || !hash.includes(":")) {
    return password === hash;
  }

  const [salt, expectedHex] = hash.split(":");

  if (!salt || !expectedHex) {
    return false;
  }

  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");

  // timingSafeEqual throws if buffers have different byte lengths
  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(actual, expected);
}
