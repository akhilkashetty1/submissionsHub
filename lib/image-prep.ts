/**
 * Shrinks a photo in the browser before upload: phone photos are often 5–12 MB, the upload
 * limit is 4.5 MB, and the site never needs more than 2400 px. The hub re-encodes it again
 * on arrival, so this is only about size and speed.
 */
export async function prepareImage(file: File, maxSide = 2400): Promise<Blob> {
  if (file.size < 1_500_000 && /^image\/(jpeg|webp)$/.test(file.type)) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // a format the browser can't open (e.g. HEIC on some browsers): let the server try
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.9, 0.8, 0.7]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", quality));
    if (blob && blob.size < 4_000_000) return blob;
  }
  return file;
}

/** A starting description from the file name, unless it's a camera name like IMG_2041. */
export function altFromName(name: string) {
  const base = name.replace(/\.[a-z0-9]+$/i, "").replace(/^\d+[-_ ]*/, "");
  if (!base || /^(img|dsc|dscn|pxl|photo|image|whatsapp|screenshot|mvimg|wa)\b|^[\d_\- ]+$/i.test(base)) return "";
  const text = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
