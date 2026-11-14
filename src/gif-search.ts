export type GifItem = {
  id: string
  description: string
  previewUrl: string
  gifUrl: string
}

export type GifHost = {
  copyWebGif?: () => Promise<boolean>
  onOpen: (listener: (sessionId: number) => void) => () => void
  onClose: (listener: () => void) => () => void
  ready: () => void
  onShortcutError: (listener: () => void) => () => void
  search: (query: string, customerId: string, sessionId: number) => Promise<unknown>
  recommend: (message: string, sessionId: number) => Promise<string>
  copyGif: (request: { id: string; gifUrl: string; sessionId: number }) => Promise<boolean>
  dragGif: (request: { id: string; gifUrl: string; sessionId: number }) => Promise<boolean>
  close: () => void
}

declare global {
  interface Window { gifHost?: GifHost }
}

const reactions = [
  ['laugh', '너무 웃겨', 'ㅋㅋ 웃김 하하 대박 comedy funny laughing lol'],
  ['thanks', '진짜 고마워', '감사 고마워 고마운 도움 thank gratitude'],
  ['clap', '박수 짝짝', '박수 잘했어 축하 최고 applause clap congratulations cheering'],
  ['party', '축하해!', '축하 파티 생일 합격 congratulations party celebration birthday shocked'],
  ['shocked', '진짜라고?', '헉 와 충격 놀람 surprise shocked'],
  ['yes', '완전 좋아', '좋아 오케이 알겠어 좋아요 최고 yes okay thanks cheering'],
  ['cheer', '파이팅!', '힘내 응원 파이팅 축하 congratulations cheering encouragement'],
  ['wow', '와, 대박', '헉 와 대박 놀라운 amazing shocked funny'],
  ['heart', '사랑을 담아', '사랑 감사 고마워 귀여워 thank love gratitude'],
  ['cry', '눈물이 난다', '눈물 슬픔 속상 ㅠ sad crying comfort'],
  ['hug', '꼭 안아줄게', '힘내 슬픔 속상 위로 응원 hug comfort encouragement'],
  ['tired', '녹아내리는 중', '지침 피곤 웃김 힘들 tired funny comfort'],
] as const

const categoryTerms: Record<string, string> = {
  무한도전: '놀람 웃김', 시험기간: '피곤 힘내', 월요일: '지침 속상', 출근: '지침 응원', 퇴근: '축하 좋아',
}

const samples = reactions.map(([id, description, keywords]) => ({
  id, description, keywords, previewUrl: `${import.meta.env.BASE_URL}fixtures/${id}.gif`, gifUrl: `/fixtures/${id}.gif`,
}))

export const DESKTOP_LIVE = Boolean(window.gifHost) && import.meta.env.VITE_GIF_MODE === 'live'
export const LOCAL_AI = Boolean(window.gifHost && import.meta.env.VITE_OLLAMA_MODEL)

export async function recommendKeyword(message: string, sessionId: number) {
  if (LOCAL_AI && window.gifHost) return window.gifHost.recommend(message, sessionId)
  if (/축하|생일|합격|성공|붙었|승진|congrats/i.test(message)) return 'congratulations'
  if (/고마|감사|덕분|thank/i.test(message)) return 'thank you'
  if (/힘들|슬프|슬펐|속상|위로|ㅠ|울었/i.test(message)) return 'comfort hug'
  if (/응원|힘내|파이팅|할 수 있어/i.test(message)) return 'cheering'
  if (/ㅋㅋ|ㅎㅎ|웃|lol/i.test(message)) return 'funny laughing'
  if (/헉|놀라|실화|대박|really/i.test(message)) return 'shocked reaction'
  return 'cheering reaction'
}

type Media = { gif?: { url?: string }; webp?: { url?: string } }
type KlipyResponse = {
  result?: boolean
  data?: {
    data?: {
      slug?: string
      title?: string
      type?: string
      file?: { hd?: Media; md?: Media; sm?: Media; xs?: Media }
    }[]
  }
}

function parseKlipy(raw: unknown): GifItem[] {
  const response = raw as KlipyResponse
  if (!response.result || !Array.isArray(response.data?.data)) {
    throw new Error('KLIPY 검색 결과를 읽지 못했어요.')
  }

  return Array.from(new Map(response.data.data.flatMap(({ slug, title, type, file }) => {
    const gifUrl = file?.hd?.gif?.url ?? file?.md?.gif?.url ?? file?.sm?.gif?.url ?? file?.xs?.gif?.url
    if (!slug || !gifUrl || (type && type !== 'gif')) return []
    const previewUrl = file?.sm?.webp?.url ?? file?.sm?.gif?.url ?? file?.xs?.gif?.url ?? gifUrl
    return [[slug, { id: slug, description: title || 'GIF', gifUrl, previewUrl }]]
  })).values())
}

function customerId() {
  try {
    const existing = localStorage.getItem('gifkey-customer-id')
    if (existing && /^[a-f\d-]{36}$/i.test(existing)) return existing
    const value = crypto.randomUUID()
    localStorage.setItem('gifkey-customer-id', value)
    return value
  } catch { return crypto.randomUUID() }
}

export async function searchGifs(query: string, signal: AbortSignal, sessionId: number) {
  if (window.gifHost && !DESKTOP_LIVE) {
    const terms = (categoryTerms[query] ?? query).toLocaleLowerCase().split(/\s+/).filter(Boolean)
    return terms.length ? samples.filter((item) => terms.some((term) => item.keywords.includes(term))) : samples
  }
  const customer = customerId()
  if (window.gifHost) return parseKlipy(await window.gifHost.search(query, customer, sessionId))
  const params = new URLSearchParams({ q: query, customer_id: customer })
  const response = await fetch(`/api/gifs?${params}`, { signal })
  if (response.status === 429) throw new Error('검색 한도에 도달했어요. 잠시 뒤 다시 시도해 주세요.')
  if (response.status === 503) throw new Error('GIF 검색 연결을 준비 중이에요. 잠시 뒤 다시 시도해 주세요.')
  if (!response.ok) throw new Error('GIF 검색에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
  const result = await response.json() as { items?: GifItem[] }
  if (!Array.isArray(result.items)) throw new Error('GIF 검색 결과를 읽지 못했어요.')
  return result.items
}
