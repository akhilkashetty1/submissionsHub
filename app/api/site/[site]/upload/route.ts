import sharp from "sharp";
import { authoriseSite } from "@/lib/access";
import { addMedia } from "@/lib/site-photos";
import { storageReady, storeImage } from "@/lib/site-storage";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4_400_000; // under Vercel's 4.5 MB request limit; the browser shrinks photos first
const MAX_SIDE = 2400;

/**
 * Uploads one photo to a website's library (Contributor or above). Whatever arrives is decoded
 * and re-encoded here, so only a real image is ever stored: turned upright, at most 2400 px on
 * its longest side, as WebP, with camera details (location etc.) stripped.
 */
export async function POST(request: Request, { params }: { params: Promise<{ site: string }> }) {
  const auth = await authoriseSite((await params).site, "write");
  if (!auth.ok) return Response.json(auth, { status: 403 });
  if (!storageReady()) return Response.json({ ok: false, error: "Photo storage isn't connected yet (Vercel → hub project → Storage → Blob)." }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ ok: false, error: "No photo received." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ ok: false, error: "That photo is too large (max 4 MB after resizing)." }, { status: 413 });

  let out: { data: Buffer; info: { width: number; height: number } };
  try {
    out = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    return Response.json({ ok: false, error: "That file isn't a photo we can use (JPG, PNG, WebP or HEIC)." }, { status: 415 });
  }

  try {
    const origin = new URL(request.url).origin;
    const stored = await storeImage(auth.site.id, out.data, origin);
    const media = await addMedia(
      auth.site.id,
      { ...stored, w: out.info.width, h: out.info.height, bytes: out.data.length, name: file.name || "photo" },
      auth.user.displayName,
    );
    return Response.json({ ok: true, media });
  } catch (err) {
    console.error("Photo upload failed", err);
    return Response.json({ ok: false, error: (err as Error).message.includes("storage") ? (err as Error).message : "Could not save the photo. Try again." }, { status: 500 });
  }
}
