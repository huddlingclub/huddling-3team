/** Server-only KLIPY adapter. Never return provider bodies or exception messages. */
export async function searchKlipy(query, customerId, { key, fetcher = fetch }) {
  if (!key?.trim()) return { status: 503, body: { error: 'GIF 검색 연결을 준비 중이에요. 잠시 뒤 다시 시도해 주세요.' } }
  const secret = key.trim()
  const url = new URL(`https://api.klipy.com/api/v1/${encodeURIComponent(secret)}/gifs/${query ? 'search' : 'trending'}`)
  url.search = new URLSearchParams({ q: query, locale: 'kr', per_page: '12', customer_id: customerId,
    format_filter: 'gif,webp', content_filter: 'medium' }).toString()
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(12000), redirect: 'error' })
    if (response.status === 429) return { status: 429, body: { error: '검색 한도에 도달했어요. 잠시 뒤 다시 시도해 주세요.' } }
    if (!response.ok) throw new Error('Provider failed')
    const raw = await response.json()
    if (raw?.result !== true || !Array.isArray(raw.data?.data)) throw new Error('Invalid response')

    const safeUrl = (value) => {
      if (typeof value !== 'string') return undefined
      const media = new URL(value)
      return media.protocol === 'https:' && /^(static\d*\.)?klipy\.com$/.test(media.hostname) &&
        !media.username && !media.password && !media.port &&
        !decodeURIComponent(value).includes(secret) ? value : undefined
    }
    const clean = (value) => value.replaceAll(secret, '[redacted]').replaceAll(encodeURIComponent(secret), '[redacted]')
    const items = new Map()
    for (const item of raw.data.data.slice(0, 12)) {
      if (typeof item?.slug !== 'string' || (item.type && item.type !== 'gif')) continue
      try {
        const file = item.file
        const gifUrl = safeUrl(file?.hd?.gif?.url ?? file?.md?.gif?.url ?? file?.sm?.gif?.url ?? file?.xs?.gif?.url)
        if (!gifUrl) continue
        const previewUrl = safeUrl(file?.sm?.webp?.url ?? file?.sm?.gif?.url ?? file?.xs?.gif?.url) ?? gifUrl
        const id = clean(item.slug).slice(0, 200)
        items.set(id, { id, description: typeof item.title === 'string' ? clean(item.title).slice(0, 300) : 'GIF', gifUrl, previewUrl })
      } catch { /* Skip malformed media without leaking provider data. */ }
    }
    return { status: 200, body: { items: [...items.values()] } }
  } catch {
    return { status: 502, body: { error: 'GIF 검색에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.' } }
  }
}
