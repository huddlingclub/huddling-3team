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

export function macGifCopyUrl({ gifUrl }: GifItem) {
  return `jjalkkak-copy://gif?${new URLSearchParams({ source: gifUrl })}`
}
