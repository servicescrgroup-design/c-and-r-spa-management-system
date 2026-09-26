/**
 * Shrinks a photo in the browser before upload so phone pictures (often
 * 4-10 MB) fit under the server upload limit. Returns the original file if
 * it is already small or can't be decoded (e.g. HEIC in some browsers).
 */
export async function resizeImage(file: File, maxSide = 2400, quality = 0.85): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size < 900 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
