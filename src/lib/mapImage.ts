/**
 * Shrinks an uploaded map in the browser so it fits in a Firestore document (max 1 MB) — the project has no
 * Cloud Storage on the free plan. Longest side ≤ 2000 px, WebP (JPEG where the browser can't encode WebP), < 700 KB.
 */
import { fitSize } from './battleMap'

export const MAX_IMAGE_CHARS = 700_000
const SIDES = [2000, 1800, 1600, 1400, 1200, 1000]
const QUALITIES = [0.85, 0.75, 0.65, 0.55]

export class MapImageError extends Error {
  constructor(readonly code: 'mapTooBig' | 'mapBadImage') { super(code) }
}

function draw(img: ImageBitmap, max: number) {
  const { width, height } = fitSize(img.width, img.height, max)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const g = canvas.getContext('2d')!
  g.fillStyle = '#f5ecd9' // parchment behind transparent areas (JPEG has no alpha)
  g.fillRect(0, 0, width, height)
  g.imageSmoothingQuality = 'high'
  g.drawImage(img, 0, 0, width, height)
  return canvas
}

function encode(canvas: HTMLCanvasElement, quality: number) {
  const webp = canvas.toDataURL('image/webp', quality)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality)
}

export async function compressMapImage(file: Blob) {
  let img: ImageBitmap
  try {
    img = await createImageBitmap(file)
  } catch {
    throw new MapImageError('mapBadImage')
  }
  try {
    const thumb = draw(img, 320).toDataURL('image/jpeg', 0.7)
    for (const side of SIDES) {
      const canvas = draw(img, side)
      for (const q of QUALITIES) {
        const image = encode(canvas, q)
        if (image.length <= MAX_IMAGE_CHARS) return { image, thumb, width: canvas.width, height: canvas.height }
      }
    }
    throw new MapImageError('mapTooBig')
  } finally {
    img.close()
  }
}
