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

export class MacBridgeUnavailable extends Error {}

const bridgeUrl = 'http://127.0.0.1:47653'

export async function copyGifThroughMac({ gifUrl }: GifItem) {
  // The explicit loopback address works with Chrome's local-network permission.
  let token: string
  try {
    const response = await fetch(`${bridgeUrl}/session`, {
      signal: AbortSignal.timeout(12000), cache: 'no-store', credentials: 'omit',
    })
    const session = await response.json()
    if (!response.ok || session.service !== 'jjalkkak' || session.version !== 1 || typeof session.token !== 'string') {
      throw new Error('Invalid companion')
    }
    token = session.token
  } catch {
    throw new MacBridgeUnavailable('새 맥 연결 앱을 실행하고 브라우저의 로컬 네트워크 연결을 허용해 주세요.')
  }
  const original = await fetch(gifUrl, { signal: AbortSignal.timeout(15000) })
  if (!original.ok) throw new Error('GIF 원본을 가져오지 못했어요.')
  const bytes = await original.arrayBuffer()
  if (bytes.byteLength > 24 * 1024 * 1024) throw new Error('24MB 이하 GIF를 선택해 주세요.')
  if (!['GIF87a', 'GIF89a'].includes(new TextDecoder().decode(bytes.slice(0, 6)))) {
    throw new Error('움직이는 GIF 원본을 찾지 못했어요.')
  }
  const response = await fetch(`${bridgeUrl}/copy`, {
    method: 'POST', credentials: 'omit', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'image/gif', 'X-Jjalkkak-Session': token }, body: bytes,
  })
  const result = await response.json()
  if (!response.ok || result.copied !== true || !(result.frames > 0)) throw new Error('GIF 파일을 복사하지 못했어요.')
}
