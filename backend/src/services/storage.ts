import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";

const root = path.resolve(env.UPLOAD_DIR);
const useDb = env.STORAGE_DRIVER === "db";

/** Saves a buffer under a random name. Returns the storage key (relative path). */
export async function saveFile(
  buffer: Buffer,
  folder: string,
  ext: string
): Promise<string> {
  const key = `${folder}/${crypto.randomUUID()}.${ext}`;
  if (useDb) {
    await prisma.storedFile.create({
      data: { key, data: new Uint8Array(buffer) },
    });
    return key;
  }
  const full = resolvePath(key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buffer, { mode: 0o600 });
  return key;
}

/** Absolute path for a key, with a guard against path traversal (disk driver). */
export function resolvePath(key: string): string {
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

/** Returns the stored bytes, or null if the file no longer exists. */
export async function readFile(key: string): Promise<Buffer | null> {
  if (useDb) {
    const row = await prisma.storedFile.findUnique({ where: { key } });
    return row ? Buffer.from(row.data) : null;
  }
  return fs.readFile(resolvePath(key)).catch(() => null);
}

export async function removeFile(key: string): Promise<void> {
  if (useDb) {
    await prisma.storedFile
      .deleteMany({ where: { key } })
      .catch(() => undefined);
    return;
  }
  await fs.rm(resolvePath(key), { force: true }).catch(() => undefined);
}
