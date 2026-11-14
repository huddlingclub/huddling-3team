import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { DESKTOP_LIVE, recommendKeyword, searchGifs } from './gif-search'
import type { GifItem } from './gif-search'
import { BrandImage } from './jjalkkak-splash'
import { copyGifInBrowser, macGifCopyUrl, nativeGifClipboard } from './copy-gif'

const desktop = window.gifHost
const isMac = /Mac/i.test(navigator.platform)
const categories = ['추천', '최근 사용', '무한도전', '시험기간', '월요일', '출근', '퇴근']
const cardHeights = [150, 196, 196, 150, 140, 180]
const historyKey = 'jjalkkak-recent-gifs'
const tabKey = 'jjalkkak-klipy-key'

function readTabKey() {
  if (desktop) return ''
  try { return sessionStorage.getItem(tabKey) ?? '' } catch { return '' }
}

function readHistory(): GifItem[] {
  try {
    const entries: unknown = JSON.parse(localStorage.getItem(historyKey) ?? '[]')
    return Array.isArray(entries) ? entries.filter((item): item is GifItem =>
      Boolean(item && typeof item.id === 'string' && typeof item.description === 'string'
        && typeof item.gifUrl === 'string' && typeof item.previewUrl === 'string'
        && [item.gifUrl, item.previewUrl].every((url) => /^(https:\/\/|\.?\/fixtures\/)/.test(url)))) : []
  } catch { return [] }
}

export function GifPicker() {
  const [open, setOpen] = useState(!desktop)
  const [browserKey, setBrowserKey] = useState(readTabKey)
  const [keySettingsOpen, setKeySettingsOpen] = useState(false)
  const [session, setSession] = useState(0)
  const [mode, setMode] = useState<'search' | 'recommend'>('search')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('추천')
  const [history, setHistory] = useState(readHistory)
  const [pending, setPending] = useState('')
  const [handoff, setHandoff] = useState<GifItem | null>(null)
  const [failed, setFailed] = useState<GifItem | null>(null)
  const [message, setMessage] = useState('')
  const [keyword, setKeyword] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [items, setItems] = useState<GifItem[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [retry, setRetry] = useState(0)
  const [shortcutFailed, setShortcutFailed] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const conversation = useRef<HTMLTextAreaElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const composing = useRef(false)
  const copying = useRef(false)
  const active = useRef(false)
  const currentSession = useRef(0)
  const recommendation = useRef(0)
  const recent = mode === 'search' && category === '최근 사용' && !query.trim()
  const searchTerm = mode === 'search' ? query.trim() || (category === '추천' || recent ? '' : category) : keyword
  const displayed = recent ? history : items
  const live = DESKTOP_LIVE || Boolean(browserKey)

  function updateBrowserKey(key: string) {
    setBrowserKey(key)
    try {
      if (key) sessionStorage.setItem(tabKey, key)
      else sessionStorage.removeItem(tabKey)
    } catch { /* The connection still works for this page. */ }
  }

  function dismiss() {
    active.current = false
    recommendation.current++
    setAnalyzing(false)
    if (desktop) desktop.close()
    setOpen(false)
  }

  function show(sessionId: number) {
    active.current = true
    currentSession.current = sessionId
    recommendation.current++
    setAnalyzing(false)
    setSession(sessionId)
    setStatus('')
    setFailed(null)
    setHandoff(null)
    setPending('')
    setOpen(true)
    window.requestAnimationFrame(() => {
      const field = input.current ?? conversation.current
      field?.focus()
    })
  }

  useEffect(() => {
    active.current = !desktop
    const offOpen = desktop?.onOpen(show)
    const offClose = desktop?.onClose(() => {
      active.current = false
      recommendation.current++
      setAnalyzing(false)
      setOpen(false)
    })
    const offError = desktop?.onShortcutError(() => setShortcutFailed(true))
    desktop?.ready()
    return () => { offOpen?.(); offClose?.(); offError?.() }
  }, [])

  useEffect(() => {
    if (desktop) return
    function onShortcut(event: KeyboardEvent) {
      if (event.altKey && event.code === 'Space' && !event.repeat) {
        event.preventDefault()
        if (open) dismiss()
        else show(session + 1)
      }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [open, session])

  useEffect(() => {
    if (!open) return
    if (mode === 'search') input.current?.focus()
    else conversation.current?.focus()
  }, [mode, open])

  useEffect(() => {
    const abort = new AbortController()
    setItems([])
    setIndex(0)
    setError('')
    const canSearch = open && !recent && (mode === 'search' || Boolean(keyword))
    setLoading(canSearch)
    if (!canSearch) return

    const timer = window.setTimeout(async () => {
      try {
        const results = await searchGifs(searchTerm, abort.signal, session, browserKey)
        if (!abort.signal.aborted) setItems(mode === 'recommend' ? results.slice(0, 3) : results)
      } catch (err) {
        if (!abort.signal.aborted) setError(err instanceof Error ? err.message : '검색할 수 없어요.')
      } finally {
        if (!abort.signal.aborted) setLoading(false)
      }
    }, live && searchTerm ? 280 : 0)
    return () => { abort.abort(); window.clearTimeout(timer) }
  }, [mode, open, session, keyword, searchTerm, retry, recent, live, browserKey])

  useEffect(() => {
    grid.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [index])

  function remember(item: GifItem) {
    const next = [item, ...history.filter(({ id }) => id !== item.id)].slice(0, 24)
    setHistory(next)
    try { localStorage.setItem(historyKey, JSON.stringify(next)) } catch { /* Session history remains available. */ }
  }

  async function useGif(item: GifItem) {
    if (copying.current) return
    setStatus('')
    setFailed(null)
    if (!desktop) {
      if (!nativeGifClipboard) {
        setHandoff(item)
        return
      }
      copying.current = true
      setPending(item.id)
      const startedIn = currentSession.current
      try {
        await copyGifInBrowser(item)
        if (!active.current || startedIn !== currentSession.current) return
        remember(item)
        const paste = isMac ? '⌘V' : 'Ctrl+V'
        setStatus(`GIF를 복사했어요. ${paste}로 붙여넣으세요.`)
      } catch {
        if (active.current && startedIn === currentSession.current) setFailed(item)
      } finally {
        copying.current = false
        setPending('')
      }
      return
    }

    copying.current = true
    setPending(item.id)
    const startedIn = session
    try {
      const copied = await desktop.copyGif({ id: item.id, gifUrl: item.gifUrl, sessionId: session })
      if (startedIn !== currentSession.current) return
      if (copied) remember(item)
      if (!active.current) return
      if (!copied) { setFailed(item); return }
      active.current = false
      setOpen(false)
    } catch {
      if (active.current && startedIn === currentSession.current) setFailed(item)
    } finally {
      copying.current = false
      setPending('')
    }
  }

  async function recommend() {
    if (!message.trim() || analyzing) return
    const request = ++recommendation.current
    setAnalyzing(true)
    setKeyword('')
    setStatus('')
    try {
      const suggested = await recommendKeyword(message.trim(), session)
      if (request === recommendation.current) setKeyword(suggested)
    } catch {
      if (request === recommendation.current) setStatus('대화를 분석하지 못했어요. 로컬 AI 연결을 확인하고 다시 시도해 주세요.')
    } finally {
      if (request === recommendation.current) setAnalyzing(false)
    }
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') {
      event.preventDefault()
      if (keySettingsOpen) setKeySettingsOpen(false)
      else if (handoff) setHandoff(null)
      else if (failed) setFailed(null)
      else dismiss()
      return
    }
    if (!displayed.length || event.target instanceof HTMLTextAreaElement) return

    const arrows = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 }
    const step = arrows[event.key as keyof typeof arrows]
    if (step !== undefined && (event.target === input.current || grid.current?.contains(event.target as Node))) {
      if (event.target === input.current && Math.abs(step) === 1) return
      event.preventDefault()
      const next = event.target === input.current ? index : Math.max(0, Math.min(displayed.length - 1, index + step))
      setIndex(next)
      grid.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
    } else if (event.key === 'Enter' && event.target === input.current && displayed[index]) {
      event.preventDefault()
      void useGif(displayed[index])
    }
  }

  const rowEnds = [1, 1]
  const heading = mode === 'recommend' ? '추천 GIF' : recent ? '최근 사용 GIF' : searchTerm ? '검색 결과' : '추천 GIF'
  return (
    <main className={desktop ? 'stage desktop' : 'stage'}>
      {open ? <section className="picker" aria-label="짤깍" onKeyDown={onKeyDown}
        onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}>
        <header className="title-bar">
          <span>&gt; JJALKKAK.EXE</span>
          <button className="window-close" type="button" aria-label="검색창 닫기" onClick={dismiss}>x</button>
        </header>
        <div className="hero">
          <BrandImage name="panel-grid" className="hero-grid" />
          <BrandImage name="panel-logo" className="hero-logo" alt="짤깍" />
          <div className="hero-pixels" aria-hidden="true"><i /><i /><i /><i /></div>
          <div className="hero-info">
            <strong>{mode === 'recommend' ? 'MODE: PASTE_MSG' : recent ? `HISTORY: ${history.length} FOUND` : 'SYSTEM READY_'}</strong>
            <span><kbd>⌥</kbd> <kbd>SPACE</kbd> <small>OPEN</small></span>
          </div>
          <BrandImage name="panel-scanlines" className="hero-scanlines" />
        </div>

        <div className="panel-content">
          <div className="mode-switch" aria-label="검색 방식">
            <button type="button" aria-pressed={mode === 'search'} onClick={() => setMode('search')}>[{mode === 'search' ? 'x' : ' '}] 키워드 검색</button>
            <button type="button" aria-pressed={mode === 'recommend'} onClick={() => setMode('recommend')}>[{mode === 'recommend' ? 'x' : ' '}] 문자 내용 붙여넣기</button>
          </div>
          {mode === 'search' ? <>
            <div className="search-box">
              <span className="prompt" aria-hidden="true">&gt; <i /></span>
              <input aria-label="GIF 검색어" ref={input} value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder="키워드 입력 ex) 박수, 축하, ㅋㅋ" maxLength={100} />
              {query && <button className="clear" type="button" aria-label="검색어 지우기" onClick={() => { setQuery(''); input.current?.focus() }}>x</button>}
            </div>
            <div className="quick-search" aria-label="GIF 분류">
              {categories.map((term) => <button type="button" aria-pressed={term === category} key={term} onClick={() => {
                setCategory(term); setQuery(''); setStatus(''); setIndex(0)
              }}>{term === category ? `[${term}]` : term}</button>)}
            </div>
          </> : <form className="conversation" onSubmit={(event) => { event.preventDefault(); void recommend() }}>
            <div className="message-box">
              <span className="prompt" aria-hidden="true">&gt; <i /></span>
              <textarea ref={conversation} aria-label="받은 메시지" placeholder="받은 메시지를 붙여넣어 주세요." value={message} maxLength={500}
                onChange={(event) => { recommendation.current++; setAnalyzing(false); setMessage(event.target.value); setKeyword(''); setStatus('') }} />
              <span className="paste-hint"><kbd>{isMac ? '⌘' : 'Ctrl'}</kbd> <kbd>V</kbd> 로 붙여넣기</span>
            </div>
            <button className="action-button" type="submit" disabled={!message.trim() || analyzing}>{analyzing ? '분석 중…' : 'GIF 추천받기 ↵'}</button>
          </form>}

          {!(recent && !history.length) && <div className="results-heading">
            <h1>{mode === 'recommend' && !keyword ? '// HOW IT WORKS' : `// ${heading}`}</h1>
            <span>{mode === 'recommend' ? (keyword || '3 PICKS') : `${String(displayed.length).padStart(2, '0')} GIFS · ↑ ↓ 이동`}</span>
          </div>}

          <div className="results-body" aria-busy={loading || analyzing} ref={grid}>
            {recent && !history.length ? <div className="history-empty">
              <div className="history-title"><span>&gt; NO_HISTORY.LOG</span><button className="window-close" aria-label="최근 사용 닫기" onClick={() => setCategory('추천')}>x</button></div>
              <div className="history-content"><strong>&gt; 0 GIFs found</strong><span>아직 최근 사용한 GIF가 없어요.</span><button className="action-button" onClick={() => setCategory('추천')}>추천 보러 가기 ↵</button></div>
            </div> : analyzing || loading ? <div className="result-feedback" role="status">{analyzing ? '메시지 분석 중…' : 'GIF 검색 중…'}</div>
              : error ? <div className="result-feedback"><strong>{error}</strong><button className="action-button" onClick={() => setRetry((value) => value + 1)}>다시 시도</button>
                {!desktop && <button className="action-button" onClick={() => setKeySettingsOpen(true)}>KLIPY 설정</button>}</div>
              : displayed.length ? <div className="results-grid" aria-label="GIF 목록">
                {displayed.map((item, position) => {
                  const column = position % 2
                  const height = cardHeights[position % cardHeights.length]
                  const start = rowEnds[column]
                  rowEnds[column] += height + 8
                  return <button key={item.id} className="gif-card" type="button" data-active={position === index}
                    style={{ gridColumn: column + 1, gridRow: `${start} / span ${height}` }}
                    onFocus={() => setIndex(position)} onClick={() => void useGif(item)}
                    aria-label={`${item.description} 복사`}
                    draggable={Boolean(desktop)}
                    onDragStart={(event) => {
                      event.preventDefault()
                      if (desktop) void desktop.dragGif({ id: item.id, gifUrl: item.gifUrl, sessionId: session })
                        .then((dragged) => { if (!dragged) setStatus('GIF 파일을 끌어놓을 수 없어요. 다시 시도해 주세요.') })
                        .catch(() => setStatus('GIF 파일을 끌어놓을 수 없어요.'))
                    }}>
                    <img src={item.previewUrl} alt="" draggable={false} />
                    <span className="card-action">{pending === item.id ? '복사 중…' : '복사 ↵'}</span>
                  </button>
                })}
              </div> : mode === 'recommend' && !keyword ? <ol className="how-it-works">
                <li><strong>01 PASTE</strong> 메시지를 붙여넣고</li>
                <li><strong>02 READ</strong> 감정과 맥락을 읽어서</li>
                <li><strong>03 PICK</strong> 어울리는 GIF 3개를 골라요</li>
              </ol> : <div className="result-feedback"><b className="not-found">404</b><strong>GIF NOT FOUND</strong><span>{live ? '다른 검색어로 다시 찾아보세요.' : '샘플에 없는 검색어예요.'}</span>
                {!live && !desktop && <button className="action-button" onClick={() => setKeySettingsOpen(true)}>KLIPY 실시간 검색 연결</button>}
                <button className="action-button" onClick={() => { setQuery(''); setCategory('추천'); setMode('search') }}>추천 보러 가기 ↵</button></div>}
          </div>
        </div>

        <footer className="panel-footer">
          <span>{live ? <a href="https://klipy.com/" target="_blank" rel="noreferrer">POWERED BY KLIPY</a> : 'SAMPLE MODE'}</span>
          {!desktop && <button type="button" className="klipy-settings" onClick={() => setKeySettingsOpen(true)}>KLIPY 설정</button>}
          <span>↵ COPY　 ESC CLOSE</span>
        </footer>
        {(status || shortcutFailed) && <div className="status" role="status">{status || '단축키를 등록할 수 없어요. 앱 메뉴에서 짤깍을 열 수 있어요.'}</div>}
        {keySettingsOpen && <div className="copy-overlay">
          <form role="dialog" aria-label="KLIPY 설정" aria-modal="true" className="history-empty" onSubmit={(event) => {
            event.preventDefault()
            const form = event.currentTarget
            const key = new FormData(form).get('klipy-key')?.toString().trim()
            if (!key) return
            form.reset()
            updateBrowserKey(key)
            setCategory('추천')
            setStatus('')
            setKeySettingsOpen(false)
          }}>
            <div className="history-title"><span>&gt; KLIPY SETTINGS</span><button type="button" className="window-close" aria-label="설정 닫기" onClick={() => setKeySettingsOpen(false)}>x</button></div>
            <div className="history-content klipy-form">
              <label htmlFor="klipy-key">KLIPY 웹 클라이언트용 앱 키</label>
              <input autoFocus id="klipy-key" name="klipy-key" type="password" autoComplete="off" maxLength={256} required />
              <small>이 탭에 저장되고 KLIPY로만 전송돼요. 공유 기기에서는 사용 후 샘플로 전환하세요.</small>
              <div><button type="submit" className="action-button">실시간 검색 켜기</button>
                {browserKey && <button type="button" className="action-button" onClick={() => { updateBrowserKey(''); setKeySettingsOpen(false) }}>샘플로 전환</button>}
              </div>
            </div>
          </form>
        </div>}
        {handoff && <div className="copy-overlay">
          <div role="dialog" aria-modal="true" aria-label="원본 GIF 복사" className="history-empty">
            <div className="history-title"><span>&gt; COPY GIF</span><button type="button" className="window-close" aria-label="복사 안내 닫기" onClick={() => setHandoff(null)}>x</button></div>
            <div className="history-content gif-handoff">
              {isMac ? <>
                <span>움직이는 GIF는 짤깍 맥 앱에서 복사할 수 있어요.</span>
                <a className="action-button" href={macGifCopyUrl(handoff)}>짤깍 앱에서 GIF 복사</a>
                <a href={`${import.meta.env.BASE_URL}Jjalkkak-macOS.zip`}>맥 앱 다운로드</a>
                <button type="button" className="action-button" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(handoff.gifUrl)
                    setHandoff(null)
                    setStatus('앱이 열리지 않으면 메뉴 막대의 짤깍 → 복사한 GIF 주소로 원본 복사를 누르세요.')
                  } catch { setStatus('GIF 주소를 복사할 수 없어요.'); setHandoff(null) }
                }}>앱이 열리지 않으면 GIF 주소 복사</button>
              </> : <>
                <span>이 브라우저에서는 GIF 파일을 직접 복사할 수 없어요.</span>
                <a className="action-button" href={handoff.gifUrl} target="_blank" rel="noreferrer">원본 GIF 열기</a>
              </>}
            </div>
          </div>
        </div>}
        {failed && <div className="copy-overlay">
          <div role="alertdialog" aria-label="GIF 복사 실패" className="history-empty">
            <div className="history-title"><span>&gt; ERROR</span><button className="window-close" aria-label="오류 닫기" onClick={() => setFailed(null)}>x</button></div>
            <div className="history-content"><span>GIF를 복사하지 못했어요.</span><button autoFocus className="action-button" onClick={() => void useGif(failed)}>다시 시도</button></div>
          </div>
        </div>}
      </section> : !desktop && <button className="action-button" type="button" onClick={() => show(session + 1)}>짤깍 열기 · ⌥ SPACE</button>}
    </main>
  )
}
