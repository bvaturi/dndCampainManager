export const MAX_IMAGE_LENGTH = 180000;
export function isWebLink(value: string, image = false): boolean {
  if (value.length > 2048 || /\s/.test(value)) return false;
  try {
    const u = new URL(value);
    return !!u.hostname && !u.username && !u.password && (u.protocol === 'https:' || (!image && u.protocol === 'http:'));
  } catch { return false; }
}
export const validImage = (value: string) => value === '' || isWebLink(value, true) ||
  (value.length <= MAX_IMAGE_LENGTH && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value));
// Resize and re-encode uploads: strip metadata and bound the shared portrait size.
export async function characterImage(file: File): Promise<string> {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024)
    throw Error('Choose a PNG, JPEG, or WebP image up to 8 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 24000000) throw Error('Choose an image smaller than 24 megapixels.');
    for (const size of [600,400,256]) {
      const scale = Math.min(1,size / Math.max(bitmap.width,bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1,Math.round(bitmap.width * scale)); canvas.height = Math.max(1,Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d'); if (!ctx) throw Error('Image processing is unavailable in this browser.');
      ctx.fillStyle = '#14212c'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      for (const quality of [.85,.65,.45]) {
        const value = canvas.toDataURL('image/jpeg',quality);
        if (validImage(value)) return value;
      }
    }
    throw Error('This image is too large. Choose a smaller picture.');
  } finally { bitmap.close(); }
}
