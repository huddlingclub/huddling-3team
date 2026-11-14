import type { GifItem } from './gif-search'

async function fetchImage(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error('이미지를 불러올 수 없어요.')
  return response.blob()
}

async function asPng({ gifUrl, previewUrl }: GifItem): Promise<Blob> {
  const source = await fetchImage(previewUrl).catch(() => fetchImage(gifUrl))
  const url = URL.createObjectURL(source)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) throw new Error('이미지를 변환할 수 없어요.')
    context.drawImage(image, 0, 0)
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('이미지를 변환할 수 없어요.')), 'image/png')
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function copyGifInBrowser(item: GifItem): Promise<'gif' | 'png'> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('이 브라우저에서는 이미지 복사를 지원하지 않아요.')
  }
  const gifSupported = ClipboardItem.supports?.('image/gif') === true
  // Start the clipboard write inside the click or Enter event for Safari.
  const content = gifSupported ? fetchImage(item.gifUrl).then((blob) => new Blob([blob], { type: 'image/gif' })) : asPng(item)
  try {
    await navigator.clipboard.write([new ClipboardItem({ [gifSupported ? 'image/gif' : 'image/png']: content })])
  } catch (error) {
    void content.catch(() => {})
    throw error
  }
  return gifSupported ? 'gif' : 'png'
}
