import crypto from "crypto";
import { env } from "../config/env";

// Derive a fixed 32-byte key from whatever string is configured
const key = crypto.createHash("sha256").update(env.ENCRYPTION_KEY).digest();

/** AES-256-GCM. Output format: iv.tag.ciphertext (all base64). */
export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc]
    .map((b) => b.toString("base64"))
    .join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload
    .split(".")
    .map((p) => Buffer.from(p, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8"
  );
}

/** Keyed hash for OTPs, so a leaked table can't be brute-forced without the secret. */
export function hashOtp(code: string): string {
  return crypto.createHmac("sha256", env.JWT_SECRET).update(code).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
