import { useEffect, useState } from 'react'

export function brandAsset(name: string) {
  return `${import.meta.env.BASE_URL}brand/${name}.svg`
}

export function BrandImage({ name, className, alt = '' }: { name: string; className?: string; alt?: string }) {
  return <img className={className} src={brandAsset(name)} alt={alt} draggable={false} />
}

const phases = ['boot', 'glitch', 'landing'] as const

export function JjalkkakSplash({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      onDone()
      return
    }
    const timers = [
      window.setTimeout(() => setStep(1), 800),
      window.setTimeout(() => setStep(2), 1300),
      window.setTimeout(onDone, 2050),
    ]
    return () => timers.forEach(window.clearTimeout)
  }, [onDone])

  const phase = phases[step]
  return (
    <main className="stage">
      <section className={`splash splash-${phase}`} aria-label="짤깍 시작 화면" data-phase={phase}>
        {step > 0 && <BrandImage name={`${phase}-gridtop`} className="splash-grid-top" />}
        <BrandImage name={`${phase}-grid`} className="splash-grid-bottom" />
        <div className="splash-clock">{['T+0.0s', 'T+0.8s', 'T+1.3s'][step]}</div>
        {step < 2 && <div className="splash-system">{step === 0 ? 'SYS: BORED_CHAT' : 'ERR_404: BORING'}</div>}
        <div className="splash-pixels" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
        {step < 2 && <div className="boot-window">
          <div className="boot-title"><span>JJALKKAK.EXE</span><span aria-hidden="true">×</span></div>
          <div className="boot-copy"><p>&gt; BOOTING JJALKKAK v0.1</p><p>&gt; Loading 1,024 Reactions...</p><p>&gt; chat.exe is too boring...</p></div>
        </div>}
        {step === 1 && <>
          <BrandImage name="glitch-logo" className="glitch-logo glitch-red" />
          <BrandImage name="glitch-1" className="glitch-logo glitch-cyan" />
          <BrandImage name="glitch-2" className="glitch-logo" alt="짤깍" />
          <div className="glitch-bars" aria-hidden="true"><i /><i /><i /></div>
          <div className="splash-error"><div className="boot-title">ERROR <span>×</span></div><p>too_funny.gif</p><small>ㅋㅋㅋ 과다 감지</small><span className="fake-ok">OK</span></div>
        </>}
        {step === 0 && <div className="boot-progress"><span /><small>LOADING</small></div>}
        {step === 2 && <>
          <BrandImage name="landing-2" className="landing-logo" alt="짤깍" />
          <p className="splash-tagline">검색하고, 클릭하고, ⌘V.</p>
          <div className="landing-keys" aria-hidden="true"><kbd>⌥</kbd><kbd>▭</kbd></div>
        </>}
        <BrandImage name={`${phase}-scanlines`} className="splash-scanlines" />
        <button className="skip-intro" onClick={onDone}>건너뛰기</button>
      </section>
    </main>
  )
}
