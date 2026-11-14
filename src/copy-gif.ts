import type { GifItem } from './gif-search'

export const nativeGifClipboard = typeof ClipboardItem !== 'undefined' &&
  ClipboardItem.supports?.('image/gif') === true && Boolean(navigator.clipboard?.write)

export async function copyGifInBrowser({ gifUrl }: GifItem) {
  const content = fetch(gifUrl, { signal: AbortSignal.timeout(12000) }).then(async (response) => {
    if (!response.ok) throw new Error('GIF를 불러올 수 없어요.')
    return new Blob([await response.arrayBuffer()], { type: 'image/gif' })
  })
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/gif': content })])
  } catch (error) {
    void content.catch(() => {})
    throw error
  }
}

export async function prepareMacGifCopy({ gifUrl }: GifItem) {
  const text = fetch(gifUrl, { signal: AbortSignal.timeout(15000) }).then(async (response) => {
    if (!response.ok) throw new Error('GIF를 불러올 수 없어요.')
    const blob = await response.blob()
    if (blob.size > 24 * 1024 * 1024) throw new Error('GIF가 너무 커요.')
    return await new Promise<Blob>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(reader.error)
      reader.onload = () => resolve(new Blob(['JJALKKAK-GIF:' + String(reader.result).split(',')[1]], { type: 'text/plain' }))
      reader.readAsDataURL(blob)
    })
  })
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text })])
  } catch (error) {
    void text.catch(() => {})
    throw error
  }
}
