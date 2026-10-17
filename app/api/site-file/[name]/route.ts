import { blobConfigured, readLocalImage } from "@/lib/site-storage";

/** Serves photos uploaded while developing without a Blob store. Does nothing once Blob is connected. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  if (blobConfigured() || process.env.VERCEL) return new Response("Not found", { status: 404 });
  const data = await readLocalImage((await params).name);
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" } });
}
