import "server-only";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { del, put } from "@vercel/blob";

/**
 * Where website photos are kept. On Vercel: a public Vercel Blob store connected to the
 * hub project (it sets BLOB_READ_WRITE_TOKEN). While developing without one: a folder on
 * disk (.local-uploads/), served by /api/site-file/<name>.
 */

const LOCAL_DIR = path.join(process.cwd(), ".local-uploads");
const LOCAL_NAME = /^[a-z0-9-]{1,40}-[0-9a-f-]{36}\.webp$/;

export const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
export const storageReady = () => blobConfigured() || !process.env.VERCEL;

/** Saves a processed WebP and returns its public address and the key to delete it by. */
export async function storeImage(site: string, data: Buffer, origin: string): Promise<{ url: string; key: string }> {
  const name = `${site}-${randomUUID()}.webp`;
  if (blobConfigured()) {
    const blob = await put(`site/${site}/${name}`, data, {
      access: "public",
      contentType: "image/webp",
      addRandomSuffix: false,
      cacheControlMaxAge: 60 * 60 * 24 * 365, // files never change; a new photo gets a new name
    });
    return { url: blob.url, key: blob.url };
  }
  if (process.env.VERCEL) throw new Error("Photo storage isn't connected yet (Vercel → hub project → Storage → Blob).");
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, name), data);
  return { url: `${origin}/api/site-file/${name}`, key: `local:${name}` };
}

export async function removeImage(key: string) {
  if (key.startsWith("local:")) {
    const name = key.slice(6);
    if (LOCAL_NAME.test(name)) await fs.rm(path.join(LOCAL_DIR, name), { force: true });
    return;
  }
  if (blobConfigured()) await del(key);
}

export async function readLocalImage(name: string): Promise<Buffer | null> {
  if (!LOCAL_NAME.test(name)) return null;
  return fs.readFile(path.join(LOCAL_DIR, name)).catch(() => null);
}
